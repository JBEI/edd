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

    @classmethod
    def decode_json(cls, text):
        return utilities.JSONDecoder.loads(text)

    @classmethod
    def encode_json(cls, content):
        return utilities.JSONEncoder.dumps(content)

    @property
    def broker(self):
        if not hasattr(self, "_broker"):
            self._broker = RedisBroker(self.scope["user"])
        return self._broker

    def connect(self):
        # Call parent connect()
        super().connect()
        # cannot use parent to add groups
        # self.scope['user'] is not accessible before parent call of connect
        # self.broker depends on self.scope['user'] to generate group names
        # must manually duplicate the group add here in the child class
        for group in self.broker.group_names():
            async_to_sync(self.channel_layer.group_add)(group, self.channel_name)
        # get current notifications and send to reply_channel
        self.send_json(
            {"messages": list(islice(self.broker, 10)), "unread": self.broker.count()}
        )

    def disconnect(self, close_code):
        # since cannot use self.groups in connect(), must also group_discard in disconnect()
        for group in self.broker.group_names():
            async_to_sync(self.channel_layer.group_discard)(group, self.channel_name)
        # Call parent disconnect()
        super().disconnect(close_code)

    def notification(self, event):
        """
        Handler for the 'notification' type event for this consumer's Group.
        """
        logger.debug(f"Got notification {event}")
        message = self.decode_json(event["notice"])
        self.send_json({"messages": [message], "unread": self.broker.count()})

    def notification_dismiss(self, event):
        """
        Handler for the 'notification.dismiss' type event for this consumer's Group.
        """
        logger.debug(f"Got notification dismiss {event}")
        uuid = self.decode_json(event["uuid"])
        self.send_json({"dismiss": uuid, "unread": self.broker.count()})

    def notification_reset(self, event):
        """
        Handler for the notification.reset' type event for this consumer's Group.
        """
        logger.debug(f"Got notification reset {event}")
        self.send_json({"reset": True})

    def receive_json(self, content, **kwargs):
        logger.debug(f"Got json {content}")
        # get message ID, mark as read
        if "dismiss" in content:
            self.broker.mark_read(uuid=content["dismiss"])
        elif "reset" in content:
            self.broker.mark_all_read()
