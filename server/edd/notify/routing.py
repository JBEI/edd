from django.urls import path

from . import consumers

url_patterns = [
    path("ws/notify/", consumers.NotifySubscribeConsumer.as_asgi()),
]

__all__ = [url_patterns]
