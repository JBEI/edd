"""
Counterpart to wsgi.py configuring ASGI for the edd project.

It exposes the ASGI channel layer object as a module-level variable named ``channel_layer``.

For more information on this file, see
https://channels.readthedocs.io/en/stable/deploying.html
"""

import functools
import os

from django.core.asgi import get_asgi_application
from django.template import Library, defaulttags
from django.urls import include, path

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "edd.settings")
django_asgi_app = get_asgi_application()
register = Library()


@functools.cache
def build_paths():
    # Django URLResolver and Channels URLRouter are very similar, but mutually incompatible
    # so "define" the paths/routes here, and use them to build both
    return {
        "ws/load/": include("edd.load.progress"),
        "ws/notify/": include("edd.notify.routing"),
        "ws/setup/": include("edd.setup.progress"),
    }


def build_urls():
    paths = build_paths()
    # this is for ws_reverse
    return [path(k, v) for k, v in paths.items()]


def setup_application():
    """
    Must have setup in a function call, so that AppRegistry has time to load
    before importing channels modules and our code.
    """
    from channels.auth import AuthMiddlewareStack
    from channels.routing import ProtocolTypeRouter, URLRouter

    paths = build_paths()
    # this is for actual routing, as URLRouter doesn't support include()
    # first item of the path values is the module
    # then need to get the urlpatterns attribute for URLRouter
    router = URLRouter([path(k, URLRouter(v[0].urlpatterns)) for k, v in paths.items()])
    application = ProtocolTypeRouter(
        {
            "http": django_asgi_app,
            "websocket": AuthMiddlewareStack(router),
        }
    )

    return application


class WSNode(defaulttags.URLNode):
    """
    Override of the Django {% url %} template tag node, to instead look up a
    reverse URL for a websocket pattern with {% ws_url %}.
    """

    def render(self, context):
        from django.urls import NoReverseMatch

        from edd.utilities import ws_reverse

        args = [arg.resolve(context) for arg in self.args]
        kwargs = {k: v.resolve(context) for k, v in self.kwargs.items()}
        view_name = self.view_name.resolve(context)

        url = ""
        try:
            url = ws_reverse(view_name, args=args, kwargs=kwargs)
        except NoReverseMatch:
            if self.asvar is None:
                raise

        if self.asvar:
            context[self.asvar] = url
            return ""
        return defaulttags.conditional_escape(url)


@register.tag
def ws_url(parser, token):
    # the defaulttags.url() function gets all the bits we want,
    # but returns a URLNode, which we want to modify to use websocket patterns
    node = defaulttags.url(parser, token)
    return WSNode(node.view_name, node.args, node.kwargs, node.asvar)


urlpatterns = build_urls()
application = setup_application()
