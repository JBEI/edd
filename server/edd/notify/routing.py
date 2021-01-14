from channels.routing import ProtocolTypeRouter, URLRouter
from django.urls import path

from . import consumers

application = ProtocolTypeRouter(
    {"websocket": URLRouter([path("", consumers.NotifySubscribeConsumer)])}
)

__all__ = [application]
