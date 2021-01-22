import pytest
from channels.testing import WebsocketCommunicator
from django.test import Client

from edd import asgi
from edd.profile.factory import UserFactory

from ..notify import WsBroker


@pytest.fixture
def anonymous_client():
    return Client()


@pytest.fixture
def fake_user():
    return UserFactory()


@pytest.fixture
def logged_in_client(fake_user):
    client = Client()
    client.force_login(fake_user)
    return client


def headers_from_client(client):
    """Builds headers to send with WebSocket requests from a HTTP client."""
    return [
        (b"origin", b"..."),
        (b"cookie", client.cookies.output(header="", sep="; ").encode()),
    ]


@pytest.mark.django_db(transaction=True)
@pytest.mark.asyncio
async def test_refuse_connection_for_anonymous_user(anonymous_client):
    communicator = WebsocketCommunicator(
        asgi.application, "/ws/load/", headers_from_client(anonymous_client),
    )
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


@pytest.mark.django_db(transaction=True)
@pytest.mark.asyncio
async def test_accept_connection_for_authenticated_user(logged_in_client):
    communicator = WebsocketCommunicator(
        asgi.application, "/ws/load/", headers_from_client(logged_in_client),
    )
    try:
        # websocket will allow connection
        connected, subprotocol = await communicator.connect()
        assert connected
    except Exception as e:
        raise AssertionError() from e
    finally:
        await communicator.disconnect()


@pytest.mark.django_db(transaction=True)
@pytest.mark.asyncio
async def test_receive_notification(logged_in_client, fake_user):
    communicator = WebsocketCommunicator(
        asgi.application, "/ws/load/", headers_from_client(logged_in_client),
    )
    try:
        connected, subprotocol = await communicator.connect()

        # set up back-end broker for sending messages
        ws = WsBroker(fake_user)
        # send a message from the back end
        await ws.async_notify(
            "Test message", tags=["import-status-update"], payload={"key": 12345}
        )

        # receive the message from the websocket
        response = await communicator.receive_json_from()
        # test that content is in there
        assert "messages" in response
    finally:
        await communicator.disconnect()
