from channels.auth import AuthMiddlewareStack
from channels.routing import ProtocolTypeRouter, URLRouter
from django.conf import settings
from django.conf.urls import url

from edd.load.notify.routing import application as load_notify
from edd.notify.routing import application as edd_notify

urls = [
    url(r"^ws/notify/", edd_notify),
    url(r"^ws/load/", load_notify),
]

# only include the edd_file_importer WS when the import prototype is configured
if getattr(settings, "EDD_USE_PROTOTYPE_IMPORT", False):
    from edd_file_importer.notify.routing import application as edd_import

    urls.append(url(r"^ws/import/", edd_import))

application = ProtocolTypeRouter({"websocket": AuthMiddlewareStack(URLRouter(urls))})
