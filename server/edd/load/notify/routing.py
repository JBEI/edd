from django.urls import path

from . import consumers

url_patterns = [
    path("ws/load/", consumers.LoadNoticeConsumer),
]

__all__ = [url_patterns]
