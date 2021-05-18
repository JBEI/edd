"""
Counterpart to wsgi.py configuring ASGI for the edd project.

It exposes the ASGI channel layer object as a module-level variable named ``channel_layer``.

For more information on this file, see
https://channels.readthedocs.io/en/stable/deploying.html
"""

import os

from django.core.asgi import get_asgi_application

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "edd.settings")
django_asgi_app = get_asgi_application()


def setup_application():
    """
    Must have setup in a function call, so that AppRegistry has time to load
    before importing channels modules and our code.
    """
    from channels.auth import AuthMiddlewareStack
    from channels.routing import ProtocolTypeRouter, URLRouter

    from edd.load.notify.routing import url_patterns as load_notify
    from edd.notify.routing import url_patterns as edd_notify

    application = ProtocolTypeRouter(
        {
            "http": django_asgi_app,
            "websocket": AuthMiddlewareStack(URLRouter([] + load_notify + edd_notify)),
        }
    )

    return application


application = setup_application()


__all__ = [application]
