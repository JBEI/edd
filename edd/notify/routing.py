# -*- coding: utf-8 -*-

from channels.routing import route

from . import consumers

channel_routing = [
    consumers.NotifySubscribeConsumer.as_route(path=r'^/notify/'),
]
