import time
from uuid import uuid4

import faker
import pytest
from channels.testing import WebsocketCommunicator

from edd import asgi
from edd.profile.factory import UserFactory

from . import backend

fake = faker.Faker()


@pytest.fixture
def fake_user(db):
    return UserFactory()


@pytest.fixture
def unsaved_user():
    return UserFactory.build(pk=fake.pyint())


def test_prepared_notification_equal_to_source():
    n1 = backend.Notification(fake.sentence())
    n2 = n1.prepare()
    assert n1 == n2
    assert len({n1, n2}) == 1


def test_notification_with_identical_message_is_not_equal():
    message = fake.sentence()
    n1 = backend.Notification(message)
    n2 = backend.Notification(message)
    assert n1 != n2
    assert len({n1, n2}) == 2


def test_basebroker_count_is_not_implemented(unsaved_user):
    broker = backend.BaseBroker(unsaved_user)
    with pytest.raises(NotImplementedError):
        broker.count()


def test_basebroker_iter_is_not_implemented(unsaved_user):
    broker = backend.BaseBroker(unsaved_user)
    with pytest.raises(NotImplementedError):
        iter(broker)


def test_basebroker_mark_all_read_is_not_implemented(unsaved_user):
    broker = backend.BaseBroker(unsaved_user)
    with pytest.raises(NotImplementedError):
        broker.mark_all_read()


def test_basebroker_mark_read_is_not_implemented(unsaved_user):
    broker = backend.BaseBroker(unsaved_user)
    with pytest.raises(NotImplementedError):
        broker.mark_read(None)


def test_basebroker_notify_is_not_implemented(unsaved_user):
    broker = backend.BaseBroker(unsaved_user)
    with pytest.raises(NotImplementedError):
        broker.notify(fake.sentence())


def test_basebroker_groups_has_single_name(unsaved_user):
    broker = backend.BaseBroker(unsaved_user)
    groups = broker.group_names()
    assert len(groups) == 1
    assert f"{unsaved_user.pk}" in groups[0]


def test_redisbroker_is_initially_empty(fake_user):
    broker = backend.RedisBroker(fake_user)
    assert broker.count() == 0


def test_redisbroker_has_one_message_after_adding_one_message(fake_user):
    broker = backend.RedisBroker(fake_user)
    broker.notify(fake.sentence())
    assert broker.count() == 1


def test_redisbroker_is_iterable(fake_user):
    broker = backend.RedisBroker(fake_user)
    broker.notify(fake.sentence())
    ids = {n.uuid for n in broker}
    assert len(ids) == 1


def test_redisbroker_can_remove_specific_messages(fake_user):
    broker = backend.RedisBroker(fake_user)
    marker_uuid = uuid4()
    marker_text = fake.sentence()
    broker.notify(fake.sentence())
    broker.notify(marker_text, uuid=marker_uuid)
    broker.notify(fake.sentence())
    broker.mark_read(marker_uuid)
    assert broker.count() == 2
    assert marker_uuid not in {n.uuid for n in broker}
    assert marker_text not in {n.message for n in broker}


def test_redisbroker_can_remove_older_messages(fake_user):
    broker = backend.RedisBroker(fake_user)
    marker_uuid = uuid4()
    expected_text = fake.sentence()
    broker.notify(fake.sentence())
    broker.notify(fake.sentence(), uuid=marker_uuid)
    # add sleep so next notify gets a distinct timestamp from marker
    time.sleep(1)
    broker.notify(expected_text)
    broker.mark_all_read(uuid=marker_uuid)
    assert broker.count() == 1
    assert marker_uuid not in {n.uuid for n in broker}
    assert expected_text in {n.message for n in broker}


@pytest.mark.asyncio
async def test_notification_subscribe_no_user():
    communicator = WebsocketCommunicator(asgi.application, "/ws/notify/")
    try:
        connected, subprotocol = await communicator.connect()
        # websocket should initially accept the connection
        assert not connected
        # then as there is no user, and connection must be accepted to verify, disconnect
        assert await communicator.receive_nothing() is True
    finally:
        await communicator.disconnect()


@pytest.mark.asyncio
async def test_notification_subscribe_empty(fake_user):
    communicator = WebsocketCommunicator(asgi.application, "/ws/notify/")
    communicator.scope["user"] = fake_user
    try:
        # websocket will allow connection
        connected, subprotocol = await communicator.connect()
        assert connected
        # initial message will have messages and unread count
        response = await communicator.receive_json_from(timeout=5)
        assert "messages" in response
        assert "unread" in response
        assert response["messages"] == []
        assert response["unread"] == 0
    finally:
        await communicator.disconnect()


@pytest.mark.asyncio
async def test_notification_subscribe_with_messages(fake_user):
    communicator = WebsocketCommunicator(asgi.application, "/ws/notify/")
    communicator.scope["user"] = fake_user
    # joe is going to help us send some messages to the fake user
    joe = backend.RedisBroker(fake_user)
    try:
        await joe.async_notify("Hello, world!")
        # websocket will allow connection
        connected, subprotocol = await communicator.connect()
        assert connected
        # initial message will have messages and unread count
        response = await communicator.receive_json_from(timeout=5)
        assert "messages" in response
        assert "unread" in response
        assert len(response["messages"][0]) == 5
        assert response["messages"][0][0] == "Hello, world!"
        assert response["unread"] == 1
    finally:
        await communicator.disconnect()


@pytest.mark.asyncio
async def test_notification_dismiss(fake_user):
    communicator = WebsocketCommunicator(asgi.application, "/ws/notify/")
    communicator.scope["user"] = fake_user
    # joe is going to help us send some messages to the fake user
    joe = backend.RedisBroker(fake_user)
    try:
        marker_uuid = uuid4()
        await joe.async_notify("Hello, world!", uuid=marker_uuid)
        # websocket will allow connection
        connected, subprotocol = await communicator.connect()
        assert connected
        # initial message will have messages and unread count
        response = await communicator.receive_json_from(timeout=5)
        assert "messages" in response
        assert "unread" in response
        assert response["unread"] == 1
        # joe is now going to dismiss the message sent earlier
        await joe.async_mark_read(marker_uuid)
        response = await communicator.receive_json_from(timeout=5)
        assert "dismiss" in response
        assert "unread" in response
        assert response["dismiss"] == str(marker_uuid)
        assert response["unread"] == 0
    finally:
        await communicator.disconnect()


@pytest.mark.asyncio
async def test_notification_dismiss_all(fake_user):
    communicator = WebsocketCommunicator(asgi.application, "/ws/notify/")
    communicator.scope["user"] = fake_user
    # joe is going to help us send some messages to the fake user
    joe = backend.RedisBroker(fake_user)
    try:
        await joe.async_notify("Hello, world!")
        # websocket will allow connection
        connected, subprotocol = await communicator.connect()
        assert connected
        # initial message will have messages and unread count
        response = await communicator.receive_json_from(timeout=5)
        assert "messages" in response
        assert "unread" in response
        assert response["unread"] == 1
        # joe is now going to dismiss the message sent earlier
        await joe.async_mark_all_read()
        response = await communicator.receive_json_from(timeout=5)
        assert "dismiss" in response
        assert "unread" in response
        assert response["unread"] == 0
    finally:
        await communicator.disconnect()


@pytest.mark.asyncio
async def test_notification_incoming(fake_user):
    communicator = WebsocketCommunicator(asgi.application, "/ws/notify/")
    communicator.scope["user"] = fake_user
    # joe is going to help us send some messages to the fake user
    joe = backend.RedisBroker(fake_user)
    try:
        # websocket will allow connection
        connected, subprotocol = await communicator.connect()
        assert connected
        # nothing in inbox to start
        response = await communicator.receive_json_from(timeout=5)
        assert "messages" in response
        assert "unread" in response
        assert response["unread"] == 0
        # joe is now going to send a message
        await joe.async_notify("Hello, world!")
        response = await communicator.receive_json_from(timeout=5)
        assert "messages" in response
        assert "unread" in response
        assert response["messages"][0][0] == "Hello, world!"
        assert response["unread"] == 1
    finally:
        await communicator.disconnect()


@pytest.mark.asyncio
async def test_notification_send_dismiss(fake_user):
    communicator = WebsocketCommunicator(asgi.application, "/ws/notify/")
    communicator.scope["user"] = fake_user
    # joe is going to help us send some messages to the fake user
    joe = backend.RedisBroker(fake_user)
    try:
        marker_uuid = uuid4()
        await joe.async_notify("Hello, world!", uuid=marker_uuid)
        # websocket will allow connection
        connected, subprotocol = await communicator.connect()
        assert connected
        # initial message will have messages and unread count
        response = await communicator.receive_json_from(timeout=5)
        assert "messages" in response
        assert "unread" in response
        assert response["unread"] == 1
        # now dismiss the message via our own channel
        await communicator.send_json_to({"dismiss": str(marker_uuid)})
        response = await communicator.receive_json_from(timeout=5)
        assert "dismiss" in response
        assert "unread" in response
        assert response["dismiss"] == str(marker_uuid)
        assert response["unread"] == 0
    finally:
        await communicator.disconnect()


@pytest.mark.asyncio
async def test_notification_send_dismiss_older(fake_user):
    communicator = WebsocketCommunicator(asgi.application, "/ws/notify/")
    communicator.scope["user"] = fake_user
    # joe is going to help us send some messages to the fake user
    joe = backend.RedisBroker(fake_user)
    try:
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
        response = await communicator.receive_json_from(timeout=5)
        assert "messages" in response
        assert "unread" in response
        assert response["unread"] == 10
        # now dismiss the message via our own channel
        await communicator.send_json_to({"dismiss_older": str(marker_uuid)})
        response = await communicator.receive_json_from(timeout=5)
        assert "dismiss" in response
        assert "unread" in response
        assert response["dismiss"] == str(marker_uuid)
        assert response["unread"] == 2
    finally:
        await communicator.disconnect()


@pytest.mark.asyncio
async def test_notification_send_reset(fake_user):
    communicator = WebsocketCommunicator(asgi.application, "/ws/notify/")
    communicator.scope["user"] = fake_user
    try:
        # websocket will allow connection
        connected, subprotocol = await communicator.connect()
        assert connected
        # initial message will have messages and unread count
        response = await communicator.receive_json_from(timeout=5)
        assert "messages" in response
        assert "unread" in response
        assert response["messages"] == []
        assert response["unread"] == 0
        # now reset via our own channel
        await communicator.send_json_to({"reset": True})
        response = await communicator.receive_json_from(timeout=5)
        assert "reset" in response
    finally:
        await communicator.disconnect()


@pytest.mark.asyncio
async def test_notification_send_fetch(fake_user):
    communicator = WebsocketCommunicator(asgi.application, "/ws/notify/")
    communicator.scope["user"] = fake_user
    try:
        # websocket will allow connection
        connected, subprotocol = await communicator.connect()
        assert connected
        # initial message will have messages and unread count
        response = await communicator.receive_json_from(timeout=5)
        assert "messages" in response
        assert "unread" in response
        assert response["messages"] == []
        assert response["unread"] == 0
        # now reset via our own channel
        await communicator.send_json_to({"fetch": True})
        response = await communicator.receive_json_from(timeout=5)
        assert "messages" in response
        assert "unread" in response
        assert response["messages"] == []
        assert response["unread"] == 0
    finally:
        await communicator.disconnect()
