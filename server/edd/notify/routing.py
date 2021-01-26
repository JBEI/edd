from django.urls import path

from . import consumers

url_patterns = [
    path("ws/notify/", consumers.NotifySubscribeConsumer),
]

__all__ = [url_patterns]
