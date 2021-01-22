import logging
from itertools import islice

from asgiref.sync import sync_to_async
from channels.auth import get_user
from channels.generic.websocket import AsyncJsonWebsocketConsumer

from edd import utilities

from .backend import RedisBroker

logger = logging.getLogger(__name__)


# Defining a collection of alias async functions;
# It looks nicer to call `await alias(arg1, arg2)`,
# than to call `sync_to_async(alias)(arg1, arg2)`.


async def broker_count(broker):
    return await sync_to_async(broker.count)()


async def create_broker(user):
    # wrap in sync_to_async because init makes a network call
    return await sync_to_async(RedisBroker)(user)


async def group_names(broker):
    return await sync_to_async(broker.group_names)()


async def logger_debug(message, **kwargs):
    await sync_to_async(logger.debug)(message, **kwargs)


async def top_messages(broker):
    def _slice():
        return list(islice(broker, 10))

    # it's too awkward to wrap just the iter() call to broker,
    # so wrap the whole thing because iterating makes network call(s)
    return await sync_to_async(_slice)()


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
            user = await get_user(self.scope)
            if user is None or user.is_anonymous:
                await self.close()
            else:
                await self.accept()
                # add to the notificaiton groups
                await self.add_user_groups(user)
                # send any notifications in the queue
                await self.send_notifications(user)
        except Exception as e:
            await logger_debug(
                f"Unexpected error during connection setup {e!r}", exc_info=e,
            )

    async def disconnect(self, code):
        try:
            user = await get_user(self.scope)
            broker = await self.ensure_broker(user, raises=False)
            if broker:
                groups = await group_names(broker)
                for group in groups:
                    await self.channel_layer.group_discard(group, self.channel_name)
            else:
                await logger_debug("Disconnected without a broker")
        except Exception as e:
            await logger_debug(
                f"Unexpected error during disconnect {e!r}", exc_info=e,
            )

    async def receive_json(self, content):
        await logger_debug(f"Got json {content}")
        try:
            user = await get_user(self.scope)
            broker = await self.ensure_broker(user)
            if "dismiss" in content:
                await broker.async_mark_read(uuid=content["dismiss"])
            elif "dismiss_older" in content:
                await broker.async_mark_all_read(uuid=content["dismiss_older"])
            elif "reset" in content:
                await broker.async_mark_all_read()
            elif "fetch" in content:
                await self.send_notifications(user)
        except Exception as e:
            await logger_debug(f"Unexpected error on receive {e!r}", exc_info=e)

    # command methods

    async def notification(self, event):
        """
        Handler for the 'notification' type event for this consumer's Group.
        """
        await logger_debug(f"Got notification {event}")
        user = await get_user(self.scope)
        broker = await self.ensure_broker(user)
        message = await self.decode_json(event["notice"])
        count = await broker_count(broker)
        await self.send_json({"messages": [message], "unread": count})

    async def notification_dismiss(self, event):
        """
        Handler for the 'notification.dismiss' type event for this consumer's Group.
        """
        await logger_debug(f"Got notification dismiss {event}")
        user = await get_user(self.scope)
        broker = await self.ensure_broker(user)
        uuid = await self.decode_json(event["uuid"])
        count = await broker_count(broker)
        await self.send_json({"dismiss": uuid, "unread": count})

    async def notification_reset(self, event):
        """
        Handler for the 'notification.reset' type event for this consumer's Group.
        """
        await logger_debug(f"Got notification reset {event}")
        await self.send_json({"reset": True})

    # helper methods

    async def ensure_broker(self, user, raises=True):
        if not hasattr(self, "_broker"):
            if user and not user.is_anonymous:
                self._broker = await create_broker(user)
            elif raises:
                raise SubscribeError()
            else:
                return None
        return self._broker

    async def add_user_groups(self, user):
        broker = await self.ensure_broker(user)
        groups = await group_names(broker)
        for group in groups:
            await self.channel_layer.group_add(group, self.channel_name)

    async def send_notifications(self, user):
        broker = await self.ensure_broker(user)
        messages = await top_messages(broker)
        count = await broker_count(broker)
        await self.send_json({"messages": messages, "unread": count})


__all__ = [
    NotifySubscribeConsumer,
    SubscribeError,
]
