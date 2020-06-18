import logging
from itertools import islice

from asgiref.sync import sync_to_async
from channels.generic.websocket import AsyncJsonWebsocketConsumer

from edd import utilities

from .backend import RedisBroker

logger = logging.getLogger(__name__)


class SubscribeError(Exception):
    pass


class NotifySubscribeConsumer(AsyncJsonWebsocketConsumer):
    """
    Consumer only adds the reply_channel to a Group for the user notifications, and sends any
    active messages.
    """

    # Websocket consumer methods

    @classmethod
    async def decode_json(cls, text):
        return utilities.JSONDecoder.loads(text)

    @classmethod
    async def encode_json(cls, content):
        return utilities.JSONEncoder.dumps(content)

    async def connect(self):
        if "user" not in self.scope or self.scope["user"].is_anonymous:
            await self.close()
        else:
            await self.accept()
            try:
                # add to the notificaiton groups
                await self.add_user_groups()
                # send any notifications in the queue
                await self.send_notifications()
            except SubscribeError as e:
                await self.logger_debug(
                    f"Unexpected error during connection setup {e!r}"
                )

    async def disconnect(self, code):
        try:
            broker = await self.ensure_broker()
            groups = await sync_to_async(broker.group_names)()
            for group in groups:
                await self.channel_layer.group_discard(group, self.channel_name)
        except SubscribeError as e:
            await self.logger_debug(f"Unexpected error during disconnect {e!r}")

    async def receive_json(self, content):
        await self.logger_debug(f"Got json {content}")
        try:
            broker = await self.ensure_broker()
            if "dismiss" in content:
                await broker.async_mark_read(uuid=content["dismiss"])
            elif "dismiss_older" in content:
                await broker.async_mark_all_read(uuid=content["dismiss_older"])
            elif "reset" in content:
                await broker.async_mark_all_read()
            elif "fetch" in content:
                await self.send_notifications()
        except SubscribeError as e:
            await self.logger_debug(f"Unexpected error on receive {e!r}")

    # command methods

    async def notification(self, event):
        """
        Handler for the 'notification' type event for this consumer's Group.
        """
        await self.logger_debug(f"Got notification {event}")
        broker = await self.ensure_broker()
        message = await self.decode_json(event["notice"])
        count = await sync_to_async(broker.count)()
        await self.send_json({"messages": [message], "unread": count})

    async def notification_dismiss(self, event):
        """
        Handler for the 'notification.dismiss' type event for this consumer's Group.
        """
        await self.logger_debug(f"Got notification dismiss {event}")
        broker = await self.ensure_broker()
        uuid = await self.decode_json(event["uuid"])
        count = await sync_to_async(broker.count)()
        await self.send_json({"dismiss": uuid, "unread": count})

    async def notification_reset(self, event):
        """
        Handler for the 'notification.reset' type event for this consumer's Group.
        """
        await self.logger_debug(f"Got notification reset {event}")
        await self.send_json({"reset": True})

    # helper methods

    def _slice_messages(self, broker):
        # it's too awkward to wrap just the iter() call to broker, so wrap the whole thing
        return list(islice(broker, 10))

    async def logger_debug(self, message):
        # looks nicer to call `await self.logger_debug("some message")`
        # than to call `await sync_to_async(logger.debug)("some message")`
        await sync_to_async(logger.debug)(message)

    async def ensure_broker(self, raises=True):
        if not hasattr(self, "_broker"):
            user = self.scope.get("user", None)
            if user and not user.is_anonymous:
                # wrap in sync_to_async because init makes a network call
                self._broker = await sync_to_async(RedisBroker)(user)
            elif raises:
                raise SubscribeError()
            else:
                return None
        return self._broker

    async def add_user_groups(self):
        broker = await self.ensure_broker()
        groups = await sync_to_async(broker.group_names)()
        for group in groups:
            await self.channel_layer.group_add(group, self.channel_name)

    async def send_notifications(self):
        broker = await self.ensure_broker()
        messages = await sync_to_async(self._slice_messages)(broker)
        count = await sync_to_async(broker.count)()
        await self.send_json({"messages": messages, "unread": count})
