# -*- coding: utf-8 -*-

import logging

from asgiref.sync import sync_to_async
from channels.generic.websocket import AsyncJsonWebsocketConsumer

from edd import utilities

from .backend import ImportWsBroker

logger = logging.getLogger(__name__)


class SubscribeError(Exception):
    pass


class ImportConsumer(AsyncJsonWebsocketConsumer):
    """
    Forwards channel notifications directly to the client for transient message delivery.
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
                # add to the notification groups
                await self.add_user_groups()
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

    async def notification(self, event):
        """
        Handler for the 'notification' type event for this consumer's Group.
        """
        await self.logger_debug(f"Got notification {event}")
        await self.ensure_broker()
        message = await self.decode_json(event["notice"])
        await self.send_json({"message": message})

    # helper methods

    async def ensure_broker(self, raises=True):
        if not hasattr(self, "_broker"):
            user = self.scope.get("user", None)
            if user and not user.is_anonymous:
                # wrap in sync_to_async because init makes a network call
                self._broker = await sync_to_async(ImportWsBroker)(user)
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

    async def logger_debug(self, message):
        # looks nicer to call `await self.logger_debug("some message")`
        # than to call `await sync_to_async(logger.debug)("some message")`
        await sync_to_async(logger.debug)(message)
