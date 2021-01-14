from channels.auth import AuthMiddlewareStack
from channels.routing import ProtocolTypeRouter, URLRouter
from django.urls import path

from edd.load.notify.routing import application as load_notify
from edd.notify.routing import application as edd_notify

application = ProtocolTypeRouter(
    {
        "websocket": AuthMiddlewareStack(
            URLRouter(
                [
                    # Main app notifications
                    path("ws/notify/", edd_notify),
                    # Import notifications, with custom data payloads
                    path("ws/load/", load_notify),
                ]
            )
        )
    }
)

__all__ = [application]
