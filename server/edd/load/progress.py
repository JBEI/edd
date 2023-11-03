from asgiref.sync import sync_to_async
from channels.generic.websocket import AsyncJsonWebsocketConsumer
from django.urls import path

from edd import utilities

from .broker import LoadRequest


@sync_to_async
def fetch_progress(uuid):
    load_request = LoadRequest.fetch(uuid)
    return load_request.progress


class ProgressConsumer(AsyncJsonWebsocketConsumer):
    """Sends updates on a LoadRequest progress to the client."""

    @classmethod
    async def encode_json(cls, content):
        return utilities.JSONEncoder.dumps(content)

    async def connect(self):
        user = await self._get_user()
        if user is None or user.is_anonymous:
            await self.close()
        else:
            await self.accept()
            uuid = await self._get_uuid()
            await self.channel_layer.group_add(
                f"edd.load.{uuid}",
                self.channel_name,
            )
            progress = await fetch_progress(uuid)
            await self.send_json(progress)

    async def disconnect(self, code):
        uuid = await self._get_uuid()
        await self.channel_layer.group_discard(
            f"edd.load.{uuid}",
            self.channel_name,
        )

    async def update(self, event):
        del event["type"]
        await self.send_json(event)

    async def _get_user(self):
        return self.scope.get("user", None)

    async def _get_uuid(self):
        return self.scope.get("url_route", {}).get("kwargs", {}).get("uuid", "")


url_patterns = [
    path("ws/load/<slug:uuid>/", ProgressConsumer.as_asgi()),
]


__all__ = [
    ProgressConsumer,
    url_patterns,
]
