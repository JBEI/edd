# -*- coding: utf-8 -*-

import logging

from asgiref.sync import async_to_sync
from channels.generic.websocket import JsonWebsocketConsumer
from itertools import islice

from edd import utilities
from .backend import RedisBroker


logger = logging.getLogger(__name__)


class NotifySubscribeConsumer(JsonWebsocketConsumer):
    """
    Consumer only adds the reply_channel to a Group for the user notifications, and sends any
    active messages.
    """

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        # extract the user from Channels scope dict
        user = self.scope['user']
        logger.info(f'Init NotifySubscribeConsumer w/ {user}')
        # create a broker to use for this consumer
        self.broker = RedisBroker(user)
        # define the channel groups
        self.groups = tuple(self.broker.group_names())

    @classmethod
    def decode_json(cls, text):
        return utilities.JSONDecoder.loads(text)

    @classmethod
    def encode_json(cls, content):
        return utilities.JSONEncoder.dumps(content)

    def connect(self):
        # Override parent connect()
        super().connect()
        # get current notifications and send to reply_channel
        self.send_json({
            'messages': list(islice(self.broker, 10)),
            'unread': self.broker.count(),
        })
        # TODO: remove this loop after upgrading to channels>2.0.2
        # this is not handled automatically in channels==2.0.2 but is in master (since 98d0011b74)
        # manually add to group(s)
        for group in self.groups:
            async_to_sync(self.channel_layer.group_add)(group, self.channel_name)

    def disconnect(self, close_code):
        # TODO: remove this loop after upgrading to channels>2.0.2
        # this is not handled automatically in channels==2.0.2 but is in master (since 98d0011b74)
        # manually remove from group(s)
        for group in self.groups:
            async_to_sync(self.channel_layer.group_discard)(group, self.channel_name)
        super().disconnect(close_code)

    def notification(self, event):
        """
        Handler for the 'notification' type event for this consumer's Group.
        """
        logger.debug(f'Got notification {event}')
        message = self.decode_json(event['notice'])
        self.send_json({
            'messages': [message],
            'unread': self.broker.count(),
        })

    def notification_dismiss(self, event):
        """
        Handler for the 'notification.dismiss' type event for this consumer's Group.
        """
        logger.debug(f'Got notification dismiss {event}')
        uuid = self.decode_json(event['uuid'])
        self.send_json({
            'dismiss': uuid,
            'unread': self.broker.count(),
        })

    def notification_reset(self, event):
        """
        Handler for the notification.reset' type event for this consumer's Group.
        """
        logger.debug(f'Got notification reset {event}')
        self.send_json({
            'reset': True,
        })

    def receive_json(self, content, **kwargs):
        logger.debug(f'Got json {content}')
        # get message ID, mark as read
        if 'dismiss' in content:
            self.broker.mark_read(uuid=content['dismiss'])
        elif 'reset' in content:
            self.broker.mark_all_read()
