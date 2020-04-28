import logging

from asgiref.sync import sync_to_async
from channels.generic.websocket import AsyncJsonWebsocketConsumer

from edd import utilities

from .backend import WsBroker

logger = logging.getLogger(__name__)


class SubscribeError(Exception):
    pass


async def decode_json(text):
    return utilities.JSONDecoder.loads(text)


class LoadNoticeConsumer(AsyncJsonWebsocketConsumer):
    """Forwards notifications directly to the client."""

    # Websocket consumer methods

    async def connect(self):
        if "user" not in self.scope or self.scope["user"].is_anonymous:
            await self.close()
        else:
            await self.accept()
            try:
                # add to the notification groups
                await self.add_user_groups()
            except SubscribeError as e:
                await sync_to_async(logger.warning)(
                    f"Unexpected error during connection setup {e!r}"
                )

    async def disconnect(self, code):
        try:
            broker = await self.ensure_broker()
            groups = await sync_to_async(broker.group_names)()
            for group in groups:
                await self.channel_layer.group_discard(group, self.channel_name)
        except SubscribeError:
            # don't care if backend unreachable during disconnect
            pass

    async def notification(self, event):
        """Handler for the 'notification' type event for this consumer's Group."""
        await self.ensure_broker()
        message = await decode_json(event["notice"])
        await self.send_json({"messages": [message], "unread": 1})

    # helper methods

    async def ensure_broker(self, raises=True):
        if not hasattr(self, "_broker"):
            user = self.scope.get("user", None)
            if user and not user.is_anonymous:
                # wrap in sync_to_async because init makes a network call
                self._broker = await sync_to_async(WsBroker)(user)
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
