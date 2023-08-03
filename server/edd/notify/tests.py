import asyncio
import contextlib
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
def edd_websocket(event_loop):
    return asgi.setup_application()


@pytest.fixture
def fake_user(db):
    return UserFactory()


@pytest.fixture
def edd_broker(fake_user):
    broker = backend.RedisBroker(fake_user)
    # if previous test happened to use same username, clear out before returning
    broker.mark_all_read()
    return broker


@pytest.fixture
def unsaved_user():
    return UserFactory.build(pk=fake.pyint())


@contextlib.asynccontextmanager
async def session(websocket, *, is_open=True, path="/ws/notify/", user=None):
    communicator = WebsocketCommunicator(websocket, path)
    if user:
        communicator.scope["user"] = user
    try:
        connected, subprotocol = await communicator.connect()
        assert connected == is_open
        yield communicator
    finally:
        await communicator.disconnect()


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


def test_redisbroker_is_initially_empty(edd_broker):
    assert edd_broker.count() == 0


def test_redisbroker_has_one_message_after_adding_one_message(edd_broker):
    edd_broker.notify(fake.sentence())
    assert edd_broker.count() == 1


def test_redisbroker_is_iterable(edd_broker):
    edd_broker.notify(fake.sentence())
    ids = {n.uuid for n in edd_broker}
    assert len(ids) == 1


def test_redisbroker_can_remove_specific_messages(edd_broker):
    marker_uuid = uuid4()
    marker_text = fake.sentence()
    edd_broker.notify(fake.sentence())
    edd_broker.notify(marker_text, uuid=marker_uuid)
    edd_broker.notify(fake.sentence())
    edd_broker.mark_read(marker_uuid)
    assert edd_broker.count() == 2
    assert marker_uuid not in {n.uuid for n in edd_broker}
    assert marker_text not in {n.message for n in edd_broker}


def test_redisbroker_can_remove_older_messages(edd_broker):
    marker_uuid = uuid4()
    expected_text = fake.sentence()
    edd_broker.notify(fake.sentence())
    edd_broker.notify(fake.sentence(), uuid=marker_uuid)
    # add sleep so next notify gets a distinct timestamp from marker
    time.sleep(1)
    edd_broker.notify(expected_text)
    edd_broker.mark_all_read(uuid=marker_uuid)
    assert edd_broker.count() == 1
    assert marker_uuid not in {n.uuid for n in edd_broker}
    assert expected_text in {n.message for n in edd_broker}


@pytest.mark.asyncio
async def test_notification_subscribe_no_user(edd_websocket):
    async with session(edd_websocket, is_open=False) as communicator:
        # as there is no user, and connection must be accepted to verify, disconnect
        assert await communicator.receive_nothing() is True


class DismissUpdate:
    """Helper class to verify dismissal updates coming from the websocket."""

    def __init__(self, response):
        assert "dismiss" in response
        assert "unread" in response
        self.message_id = response["dismiss"]
        self.unread = response["unread"]


class InboxUpdate:
    """Helper class to verify notification inbox coming from the websocket."""

    def __init__(self, response):
        assert "messages" in response
        assert "unread" in response
        self.messages = response["messages"]
        self.unread = response["unread"]

    def is_empty(self):
        assert self.messages == []
        assert self.unread == 0
        return True

    def __getitem__(self, index):
        return backend.Notification(*self.messages[index])


@pytest.mark.asyncio
async def test_notification_subscribe_empty(edd_websocket, fake_user):
    async with session(edd_websocket, user=fake_user) as communicator:
        # initial update will have messages and unread count
        response = await communicator.receive_json_from()
        inbox = InboxUpdate(response)
        assert inbox.is_empty()


@pytest.mark.asyncio
async def test_notification_subscribe_with_messages(
    edd_websocket, edd_broker, fake_user
):
    await edd_broker.async_notify("Hello, world!")
    async with session(edd_websocket, user=fake_user) as communicator:
        # initial message will have messages and unread count
        response = await communicator.receive_json_from()
        inbox = InboxUpdate(response)
        assert inbox.unread == 1
        assert inbox[0].message == "Hello, world!"


@pytest.mark.asyncio
async def test_notification_dismiss(edd_websocket, edd_broker, fake_user):
    marker_uuid = uuid4()
    await edd_broker.async_notify("Hello, world!", uuid=marker_uuid)
    async with session(edd_websocket, user=fake_user) as communicator:
        # initial message will have messages and unread count
        response = await communicator.receive_json_from()
        inbox = InboxUpdate(response)
        assert inbox.unread == 1
        assert inbox[0].message == "Hello, world!"
        # edd_broker is now going to dismiss the message sent earlier
        await edd_broker.async_mark_read(marker_uuid)
        response = await communicator.receive_json_from()
        dismiss = DismissUpdate(response)
        assert dismiss.message_id == str(marker_uuid)
        assert dismiss.unread == 0


@pytest.mark.asyncio
async def test_notification_dismiss_all(edd_websocket, edd_broker, fake_user):
    await edd_broker.async_notify("Hello, world!")
    async with session(edd_websocket, user=fake_user) as communicator:
        # initial message will have messages and unread count
        response = await communicator.receive_json_from()
        inbox = InboxUpdate(response)
        assert inbox.unread == 1
        assert inbox[0].message == "Hello, world!"
        # edd_broker is now going to dismiss the message sent earlier
        await edd_broker.async_mark_all_read()
        # first we're told to dismiss the message
        response = await communicator.receive_json_from()
        assert "dismiss" in response
        # then we're told to reset
        response = await communicator.receive_json_from()
        assert "reset" in response
        # connecting again will have empty messages
        await communicator.send_json_to({"fetch": True})
        response = await communicator.receive_json_from()
        inbox = InboxUpdate(response)
        assert inbox.is_empty()


@pytest.mark.asyncio
async def test_notification_incoming(edd_websocket, edd_broker, fake_user):
    async with session(edd_websocket, user=fake_user) as communicator:
        # nothing in inbox to start
        response = await communicator.receive_json_from()
        inbox = InboxUpdate(response)
        assert inbox.is_empty()
        # edd_broker is now going to send a message
        text = fake.catch_phrase()
        await edd_broker.async_notify(text)
        response = await communicator.receive_json_from()
        inbox = InboxUpdate(response)
        assert inbox.unread == 1
        assert inbox[0].message == text


@pytest.mark.asyncio
async def test_notification_send_dismiss(edd_websocket, edd_broker, fake_user):
    async with session(edd_websocket, user=fake_user) as communicator:
        marker_uuid = uuid4()
        await edd_broker.async_notify("Hello, world!", uuid=marker_uuid)
        # initial message will have messages and unread count
        response = await communicator.receive_json_from()
        inbox = InboxUpdate(response)
        assert inbox.unread == 1
        # now dismiss the message via our own channel
        await communicator.send_json_to({"dismiss": inbox[0].uuid})
        response = await communicator.receive_json_from()
        dismiss = DismissUpdate(response)
        assert dismiss.message_id == str(marker_uuid)
        assert dismiss.unread == 0


@pytest.mark.asyncio
async def test_notification_send_dismiss_older(edd_websocket, edd_broker, fake_user):
    async with session(edd_websocket, user=fake_user) as communicator:
        # manually create a bunch of Notification objects so we can control the time
        messages = [
            backend.Notification(f"{i}", None, None, i, uuid4()) for i in range(10)
        ]
        for m in messages:
            edd_broker._store(m)
        # arbitrarily pick out the seventh as the one to submit for dismissal
        marker_uuid = messages[7].uuid
        # initial message will have messages and unread count
        response = await communicator.receive_json_from()
        inbox = InboxUpdate(response)
        assert inbox.unread == 10
        # now dismiss the message via our own channel
        await communicator.send_json_to({"dismiss_older": str(marker_uuid)})
        response = await communicator.receive_json_from()
        dismiss = DismissUpdate(response)
        assert dismiss.message_id == str(marker_uuid)
        assert dismiss.unread == 2


@pytest.mark.asyncio
async def test_notification_send_reset(edd_websocket, fake_user):
    async with session(edd_websocket, user=fake_user) as communicator:
        # reset via our own channel
        await communicator.send_json_to({"reset": True})
        response = await communicator.receive_json_from()
        inbox = InboxUpdate(response)
        assert inbox.is_empty()


@pytest.mark.asyncio
async def test_notification_send_fetch(edd_websocket, fake_user):
    async with session(edd_websocket, user=fake_user) as communicator:
        # initial update
        response = await communicator.receive_json_from()
        inbox = InboxUpdate(response)
        assert inbox.is_empty()
        # wait a bit …
        await asyncio.sleep(0.1)
        # explicitly fetch inbox
        await communicator.send_json_to({"fetch": True})
        response = await communicator.receive_json_from()
        inbox = InboxUpdate(response)
        assert inbox.is_empty()
