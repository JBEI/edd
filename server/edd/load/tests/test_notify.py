import pytest
from channels.testing import WebsocketCommunicator

from edd import asgi
from edd.profile.factory import UserFactory

from ..notify import WsBroker


@pytest.fixture
def fake_user(db):
    return UserFactory()


@pytest.mark.asyncio
async def test_refuse_connection_for_anonymous_user():
    communicator = WebsocketCommunicator(asgi.application, "/ws/load/")
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
async def test_accept_connection_for_authenticated_user(fake_user):
    communicator = WebsocketCommunicator(asgi.application, "/ws/load/")
    communicator.scope["user"] = fake_user
    try:
        # websocket will allow connection
        connected, subprotocol = await communicator.connect()
        assert connected
    except Exception as e:
        raise AssertionError() from e
    finally:
        await communicator.disconnect()


@pytest.mark.asyncio
async def test_receive_notification(fake_user):
    communicator = WebsocketCommunicator(asgi.application, "/ws/load/")
    communicator.scope["user"] = fake_user
    try:
        connected, subprotocol = await communicator.connect()

        # set up back-end broker for sending messages
        ws = WsBroker(fake_user)
        # send a message from the back end
        await ws.async_notify(
            "Test message",
            tags=["import-status-update"],
            payload={"key": 12345},
        )

        # receive the message from the websocket
        response = await communicator.receive_json_from(timeout=5)
        # test that content is in there
        assert "messages" in response
    finally:
        await communicator.disconnect()
