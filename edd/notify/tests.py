# coding: utf-8

import time

from uuid import uuid4

from . import backend
from edd import TestCase
from main.tests import factory


class NotificationTests(TestCase):

    @classmethod
    def setUpTestData(cls):
        super().setUpTestData()
        cls.user = factory.UserFactory()

    def test_notification_equality(self):
        # simple message
        n1 = backend.Notification("Testing Notification")
        # preped for storage should be same
        n2 = n1.prepare()
        # another message
        n3 = backend.Notification("Testing Notification")
        self.assertEqual(len({n1, n2}), 1)
        self.assertEqual(len({n1, n2, n3}), 2)
        self.assertEqual(n1, n2)
        self.assertNotEqual(n1, n3)

    def test_basebroker(self):
        broker = backend.BaseBroker(self.user)
        # all these methods rely on undefined operations
        with self.assertRaises(NotImplementedError):
            broker.count()
        with self.assertRaises(NotImplementedError):
            {n for n in broker}
        with self.assertRaises(NotImplementedError):
            broker.mark_all_read()
        with self.assertRaises(NotImplementedError):
            broker.mark_read(None)
        with self.assertRaises(NotImplementedError):
            broker.notify("Dummy message")
        # these should work
        groups = broker.group_names()
        self.assertEqual(len(groups), 1)
        self.assertIn(self.user.username, groups[0])
        # TODO figure out how to properly mock broker.send_to_groups({})

    def test_redisbroker(self):
        broker = backend.RedisBroker(self.user)
        # initially empty
        self.assertEqual(broker.count(), 0)
        # count updates after adding message
        broker.notify("Dummy message")
        self.assertEqual(broker.count(), 1)
        # can iterate over messages
        ids = {n.uuid for n in broker}
        self.assertEqual(len(ids), 1)
        # can remove specific messages
        marker_uuid = uuid4()
        broker.notify("Dummy message 2")
        time.sleep(1)
        broker.notify("Dummy message 3", uuid=marker_uuid)
        time.sleep(1)
        broker.notify("Dummy message 4")
        self.assertEqual(broker.count(), 4)
        for uuid in ids:
            broker.mark_read(uuid)
        self.assertEqual(broker.count(), 3)
        # can remove older messages
        broker.mark_all_read(uuid=marker_uuid)
        self.assertEqual(broker.count(), 1)
        # can remove all messages
        broker.mark_all_read()
        self.assertEqual(broker.count(), 0)
