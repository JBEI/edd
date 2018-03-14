# -*- coding: utf-8 -*-

import logging

from channels import Group
from channels.generic.websockets import JsonWebsocketConsumer

from edd import utilities


logger = logging.getLogger(__name__)


def client_register(message):
    # log that we got the connection
    logger.info('WebSocket connection received')
    # accept connection
    message.reply_channel.send({'accept': True})
    # join the reply channel to the group
    Group('EDD').add(message.reply_channel)


def client_notify(message):
    # log that we got the message
    logger.info('WebSocket message received: %s', message.content)
    # forward to the group
    Group('EDD').send({
        'text': '[EDD] %s' % message.content['text'],
    })


def client_deregister(message):
    # log the disconnect
    logger.info('WebSocket connection disconnected')
    # depart the group
    Group('EDD').discard(message.reply_channel)


class DemoConsumer(JsonWebsocketConsumer):
    channel_session = True
    http_user_and_session = True

    @classmethod
    def decode_json(cls, text):
        return utilities.JSONDecoder.loads(text)

    @classmethod
    def encode_json(cls, content):
        return utilities.JSONEncoder.dumps(content)

    def connection_groups(self, **kwargs):
        return ['demo']

    def connect(self, message, **kwargs):
        super(DemoConsumer, self).connect(message, **kwargs)
        logger.info('Connected to DemoConsumer')

    def disconnect(self, message, **kwargs):
        super(DemoConsumer, self).disconnect(message, **kwargs)
        logger.info('Disconnected from DemoConsumer')

    def receive(self, content, **kwargs):
        super(DemoConsumer, self).receive(content, **kwargs)
        content['user'] = self.message.user.username
        # echo back content to all groups
        for group in self.connection_groups():
            self.group_send(group, content)
