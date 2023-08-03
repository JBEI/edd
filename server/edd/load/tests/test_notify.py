import contextlib

import pytest
from channels.testing import WebsocketCommunicator

from edd import asgi
from edd.profile.factory import UserFactory

from ..notify import WsBroker


@pytest.fixture
def edd_websocket(event_loop):
    return asgi.setup_application()


@pytest.fixture
def fake_user(db):
    return UserFactory()


@contextlib.asynccontextmanager
async def session(websocket, *, is_open=True, path="/ws/load/", user=None):
    communicator = WebsocketCommunicator(websocket, path)
    if user:
        communicator.scope["user"] = user
    try:
        connected, subprotocol = await communicator.connect()
        assert connected == is_open
        yield communicator
    finally:
        await communicator.disconnect()


@pytest.mark.asyncio
async def test_refuse_connection_for_anonymous_user(edd_websocket):
    async with session(edd_websocket, is_open=False) as communicator:
        # then as there is no user, and connection must be accepted to verify, disconnect
        assert await communicator.receive_nothing() is True


@pytest.mark.asyncio
async def test_accept_connection_for_authenticated_user(edd_websocket, fake_user):
    async with session(edd_websocket, user=fake_user) as communicator:
        assert await communicator.receive_nothing() is True


@pytest.mark.asyncio
async def test_receive_notification(edd_websocket, fake_user):
    async with session(edd_websocket, user=fake_user) as communicator:
        # set up back-end broker for sending messages
        ws = WsBroker(fake_user)
        # send a message from the back end
        await ws.async_notify(
            "Test message",
            tags=["import-status-update"],
            payload={"key": 12345},
        )

        # receive the message from the websocket
        response = await communicator.receive_json_from()
        # test that content is in there
        assert "messages" in response
