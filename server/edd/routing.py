from channels.auth import AuthMiddlewareStack
from channels.routing import ProtocolTypeRouter, URLRouter

from edd.load.notify.routing import url_patterns as load_notify
from edd.notify.routing import url_patterns as edd_notify

application = ProtocolTypeRouter(
    {
        # Channels 2.x adds "http" automatically
        # Channels 3.x requires explicitly adding
        # "http": AsgiHandler(),
        "websocket": AuthMiddlewareStack(URLRouter([] + load_notify + edd_notify)),
    }
)

__all__ = [application]
