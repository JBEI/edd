# -*- coding: utf-8 -*-

import logging

from channels import Group
from channels.generic.websockets import JsonWebsocketConsumer
from django.contrib import messages

from edd import utilities
from .backend import DefaultBroker


logger = logging.getLogger(__name__)


class NotifySubscribeConsumer(JsonWebsocketConsumer):
    """
    Consumer only adds the reply_channel to a Group for the user notifications, and sends any
    active messages.
    """
    channel_session = True
    http_user_and_session = True

    def __init__(self, message, **kwargs):
        super(NotifySubscribeConsumer, self).__init__(message, **kwargs)
        # parent __init__ will add user to message
        self.broker = DefaultBroker(message.user)

    @classmethod
    def decode_json(cls, text):
        return utilities.JSONDecoder.loads(text)

    @classmethod
    def encode_json(cls, content):
        return utilities.JSONEncoder.dumps(content)

    def connection_groups(self, **kwargs):
        return self.broker.group_names()

    def connect(self, message, **kwargs):
        super(NotifySubscribeConsumer, self).connect(message, **kwargs)
        # get all current notifications and send to reply_channel
        message.reply_channel.send(list(self.broker))

    def receive(self, content, **kwargs):
        super(NotifySubscribeConsumer, self).receive(content, **kwargs)
        # get message ID, mark as read
        #if content['action'] == 'dismiss':
        logger.info(content)
