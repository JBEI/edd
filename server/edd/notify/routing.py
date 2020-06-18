from channels.routing import ProtocolTypeRouter, URLRouter
from django.conf.urls import url

from . import consumers

urls = [url(r"", consumers.NotifySubscribeConsumer)]

application = ProtocolTypeRouter({"websocket": URLRouter(urls)})
