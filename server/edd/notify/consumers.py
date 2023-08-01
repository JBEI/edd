import logging
from itertools import islice

from asgiref.sync import sync_to_async
from channels.generic.websocket import AsyncJsonWebsocketConsumer

from edd import utilities

from .backend import RedisBroker

logger = logging.getLogger(__name__)


# Defining a collection of alias async functions;
# It looks nicer to call `await alias(arg1, arg2)`,
# than to call `sync_to_async(alias)(arg1, arg2)`.


@sync_to_async
def broker_count(broker):
    return broker.count()


@sync_to_async
def create_broker(user):
    # wrap in sync_to_async because init makes a network call
    return RedisBroker(user)


@sync_to_async
def group_names(broker):
    return broker.group_names()


@sync_to_async
def logger_debug(message, **kwargs):
    logger.debug(message, **kwargs)


@sync_to_async
def top_messages(broker):
    return list(islice(broker, 10))


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
        try:
            user = await self._get_user()
            if user is None or user.is_anonymous:
                await self.close()
            else:
                await self.accept()
                # add to the notificaiton groups
                await self.add_user_groups()
                # send any notifications in the queue
                await self.send_notifications()
        except Exception as e:
            await logger_debug(
                f"Unexpected error during connection setup {e!r}",
                exc_info=e,
            )

    async def disconnect(self, code):
        try:
            broker = await self.ensure_broker(raises=False)
            if broker:
                groups = await group_names(broker)
                for group in groups:
                    await self.channel_layer.group_discard(group, self.channel_name)
            else:
                await logger_debug("Disconnected without a broker")
        except Exception as e:
            await logger_debug(f"Unexpected error during disconnect {e!r}", exc_info=e)

    async def receive_json(self, content):
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
        except Exception as e:
            await logger_debug(f"Unexpected error on receive {e!r}", exc_info=e)

    # command methods

    async def notification(self, event):
        """
        Handler for the 'notification' type event for this consumer's Group.
        """
        broker = await self.ensure_broker()
        message = await self.decode_json(event["notice"])
        count = await broker_count(broker)
        await self.send_json({"messages": [message], "unread": count})

    async def notification_dismiss(self, event):
        """
        Handler for the 'notification.dismiss' type event for this consumer's Group.
        """
        broker = await self.ensure_broker()
        uuid = await self.decode_json(event["uuid"])
        count = await broker_count(broker)
        await self.send_json({"dismiss": uuid, "unread": count})

    async def notification_reset(self, event):
        """
        Handler for the 'notification.reset' type event for this consumer's Group.
        """
        await self.send_json({"reset": True})

    # helper methods

    async def ensure_broker(self, raises=True):
        if not hasattr(self, "_broker"):
            user = await self._get_user()
            if user and not user.is_anonymous:
                self._broker = await create_broker(user)
            elif raises:
                raise SubscribeError()
            else:
                return None
        return self._broker

    async def add_user_groups(self):
        broker = await self.ensure_broker()
        groups = await group_names(broker)
        for group in groups:
            await self.channel_layer.group_add(group, self.channel_name)

    async def send_notifications(self):
        broker = await self.ensure_broker()
        messages = await top_messages(broker)
        count = await broker_count(broker)
        await self.send_json({"messages": messages, "unread": count})

    async def _get_user(self):
        return self.scope.get("user", None)


__all__ = [
    NotifySubscribeConsumer,
    SubscribeError,
]
