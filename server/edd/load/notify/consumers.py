import logging

from asgiref.sync import sync_to_async
from channels.auth import get_user
from channels.generic.websocket import AsyncJsonWebsocketConsumer

from edd import utilities

from .backend import WsBroker

logger = logging.getLogger(__name__)


# Defining a collection of alias async functions;
# It looks nicer to call `await alias(arg1, arg2)`,
# than to call `sync_to_async(alias)(arg1, arg2)`.


async def group_names(broker):
    return await sync_to_async(broker.group_names)()


async def logger_debug(message, **kwargs):
    await sync_to_async(logger.debug)(message, **kwargs)


class SubscribeError(Exception):
    pass


class LoadNoticeConsumer(AsyncJsonWebsocketConsumer):
    """Forwards notifications directly to the client."""

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

    # command methods

    async def notification(self, event):
        """Handler for the 'notification' type event for this consumer's Group."""
        message = await self.decode_json(event["notice"])
        await self.send_json({"messages": [message], "unread": 1})

    # helper methods

    async def ensure_broker(self, user, raises=True):
        if not hasattr(self, "_broker"):
            if user and not user.is_anonymous:
                self._broker = WsBroker(user)
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


__all__ = [
    LoadNoticeConsumer,
    SubscribeError,
]
