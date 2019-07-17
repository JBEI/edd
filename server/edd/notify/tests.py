# coding: utf-8

import time
from uuid import uuid4

import pytest
from channels.testing import WebsocketCommunicator

from edd import TestCase, asgi
from main.tests import factory

from . import backend


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
            iter(broker)
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


@pytest.mark.asyncio
async def test_notification_subscribe_no_user():
    communicator = WebsocketCommunicator(asgi.application, "/ws/notify/")
    try:
        connected, subprotocol = await communicator.connect()
        # websocket should initially accept the connection
        assert not connected
        # then as there is no user, and connection must be accepted to verify, disconnect
        assert await communicator.receive_nothing() is True
    except Exception as e:
        raise AssertionError() from e
    finally:
        await communicator.disconnect()


@pytest.mark.asyncio
async def test_notification_subscribe_empty():
    communicator = WebsocketCommunicator(asgi.application, "/ws/notify/")
    try:
        # force login with fake user
        user = factory.UserFactory.build()
        communicator.scope["user"] = user
        # websocket will allow connection
        connected, subprotocol = await communicator.connect()
        assert connected
        # initial message will have messages and unread count
        response = await communicator.receive_json_from()
        assert "messages" in response
        assert "unread" in response
        assert response["messages"] == []
        assert response["unread"] == 0
    except Exception as e:
        raise AssertionError() from e
    finally:
        await communicator.disconnect()


@pytest.mark.asyncio
async def test_notification_subscribe_with_messages():
    communicator = WebsocketCommunicator(asgi.application, "/ws/notify/")
    try:
        # force login with fake user
        user = factory.UserFactory.build()
        communicator.scope["user"] = user
        # joe is going to help us send some messages to the fake user
        joe = backend.RedisBroker(user)
        await joe.async_notify("Hello, world!")
        # websocket will allow connection
        connected, subprotocol = await communicator.connect()
        assert connected
        # initial message will have messages and unread count
        response = await communicator.receive_json_from()
        assert "messages" in response
        assert "unread" in response
        assert len(response["messages"][0]) == 5
        assert response["messages"][0][0] == "Hello, world!"
        assert response["unread"] == 1
    except Exception as e:
        raise AssertionError() from e
    finally:
        await communicator.disconnect()


@pytest.mark.asyncio
async def test_notification_dismiss():
    communicator = WebsocketCommunicator(asgi.application, "/ws/notify/")
    try:
        # force login with fake user
        user = factory.UserFactory.build()
        communicator.scope["user"] = user
        # joe is going to help us send some messages to the fake user
        joe = backend.RedisBroker(user)
        marker_uuid = uuid4()
        await joe.async_notify("Hello, world!", uuid=marker_uuid)
        # websocket will allow connection
        connected, subprotocol = await communicator.connect()
        assert connected
        # initial message will have messages and unread count
        response = await communicator.receive_json_from()
        assert "messages" in response
        assert "unread" in response
        assert response["unread"] == 1
        # joe is now going to dismiss the message sent earlier
        await joe.async_mark_read(marker_uuid)
        response = await communicator.receive_json_from()
        assert "dismiss" in response
        assert "unread" in response
        assert response["dismiss"] == str(marker_uuid)
        assert response["unread"] == 0
    except Exception as e:
        raise AssertionError() from e
    finally:
        await communicator.disconnect()


@pytest.mark.asyncio
async def test_notification_dismiss_all():
    communicator = WebsocketCommunicator(asgi.application, "/ws/notify/")
    try:
        # force login with fake user
        user = factory.UserFactory.build()
        communicator.scope["user"] = user
        # joe is going to help us send some messages to the fake user
        joe = backend.RedisBroker(user)
        await joe.async_notify("Hello, world!")
        # websocket will allow connection
        connected, subprotocol = await communicator.connect()
        assert connected
        # initial message will have messages and unread count
        response = await communicator.receive_json_from()
        assert "messages" in response
        assert "unread" in response
        assert response["unread"] == 1
        # joe is now going to dismiss the message sent earlier
        await joe.async_mark_all_read()
        response = await communicator.receive_json_from()
        assert "dismiss" in response
        assert "unread" in response
        assert response["unread"] == 0
    except Exception as e:
        raise AssertionError() from e
    finally:
        await communicator.disconnect()


@pytest.mark.asyncio
async def test_notification_incoming():
    communicator = WebsocketCommunicator(asgi.application, "/ws/notify/")
    try:
        # force login with fake user
        user = factory.UserFactory.build()
        communicator.scope["user"] = user
        # joe is going to help us send some messages to the fake user
        joe = backend.RedisBroker(user)
        # websocket will allow connection
        connected, subprotocol = await communicator.connect()
        assert connected
        # nothing in inbox to start
        response = await communicator.receive_json_from()
        assert "messages" in response
        assert "unread" in response
        assert response["unread"] == 0
        # joe is now going to send a message
        await joe.async_notify("Hello, world!")
        response = await communicator.receive_json_from()
        assert "messages" in response
        assert "unread" in response
        assert response["messages"][0][0] == "Hello, world!"
        assert response["unread"] == 1
    except Exception as e:
        raise AssertionError() from e
    finally:
        await communicator.disconnect()


@pytest.mark.asyncio
async def test_notification_send_dismiss():
    communicator = WebsocketCommunicator(asgi.application, "/ws/notify/")
    try:
        # force login with fake user
        user = factory.UserFactory.build()
        communicator.scope["user"] = user
        # joe is going to help us send some messages to the fake user
        joe = backend.RedisBroker(user)
        marker_uuid = uuid4()
        await joe.async_notify("Hello, world!", uuid=marker_uuid)
        # websocket will allow connection
        connected, subprotocol = await communicator.connect()
        assert connected
        # initial message will have messages and unread count
        response = await communicator.receive_json_from()
        assert "messages" in response
        assert "unread" in response
        assert response["unread"] == 1
        # now dismiss the message via our own channel
        await communicator.send_json_to({"dismiss": str(marker_uuid)})
        response = await communicator.receive_json_from()
        assert "dismiss" in response
        assert "unread" in response
        assert response["dismiss"] == str(marker_uuid)
        assert response["unread"] == 0
    except Exception as e:
        raise AssertionError() from e
    finally:
        await communicator.disconnect()


@pytest.mark.asyncio
async def test_notification_send_dismiss_older():
    communicator = WebsocketCommunicator(asgi.application, "/ws/notify/")
    try:
        # force login with fake user
        user = factory.UserFactory.build()
        communicator.scope["user"] = user
        # joe is going to help us send some messages to the fake user
        joe = backend.RedisBroker(user)
        # manually create a bunch of Notification objects so we can control the time
        messages = [
            backend.Notification(f"{i}", None, None, i, uuid4()) for i in range(10)
        ]
        for m in messages:
            joe._store(m)
        # arbitrarily pick out the seventh as the one to submit for dismissal
        marker_uuid = messages[7].uuid
        # websocket will allow connection
        connected, subprotocol = await communicator.connect()
        assert connected
        # initial message will have messages and unread count
        response = await communicator.receive_json_from()
        assert "messages" in response
        assert "unread" in response
        assert response["unread"] == 10
        # now dismiss the message via our own channel
        await communicator.send_json_to({"dismiss_older": str(marker_uuid)})
        response = await communicator.receive_json_from()
        assert "dismiss" in response
        assert "unread" in response
        assert response["dismiss"] == str(marker_uuid)
        assert response["unread"] == 2
    except Exception as e:
        raise AssertionError() from e
    finally:
        await communicator.disconnect()


@pytest.mark.asyncio
async def test_notification_send_reset():
    communicator = WebsocketCommunicator(asgi.application, "/ws/notify/")
    try:
        # force login with fake user
        user = factory.UserFactory.build()
        communicator.scope["user"] = user
        # websocket will allow connection
        connected, subprotocol = await communicator.connect()
        assert connected
        # initial message will have messages and unread count
        response = await communicator.receive_json_from()
        assert "messages" in response
        assert "unread" in response
        assert response["messages"] == []
        assert response["unread"] == 0
        # now reset via our own channel
        await communicator.send_json_to({"reset": True})
        response = await communicator.receive_json_from()
        assert "reset" in response
    except Exception as e:
        raise AssertionError() from e
    finally:
        await communicator.disconnect()


@pytest.mark.asyncio
async def test_notification_send_fetch():
    communicator = WebsocketCommunicator(asgi.application, "/ws/notify/")
    try:
        # force login with fake user
        user = factory.UserFactory.build()
        communicator.scope["user"] = user
        # websocket will allow connection
        connected, subprotocol = await communicator.connect()
        assert connected
        # initial message will have messages and unread count
        response = await communicator.receive_json_from()
        assert "messages" in response
        assert "unread" in response
        assert response["messages"] == []
        assert response["unread"] == 0
        # now reset via our own channel
        await communicator.send_json_to({"fetch": True})
        response = await communicator.receive_json_from()
        assert "messages" in response
        assert "unread" in response
        assert response["messages"] == []
        assert response["unread"] == 0
    except Exception as e:
        raise AssertionError() from e
    finally:
        await communicator.disconnect()
