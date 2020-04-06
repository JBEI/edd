import pytest
from channels.testing import WebsocketCommunicator

from edd import asgi
from main.tests import factory

from ..notify import WsBroker


@pytest.mark.asyncio
async def test_notification_incoming(settings):
    communicator = WebsocketCommunicator(asgi.application, "/ws/load/")
    try:
        # force login with fake user
        user = factory.UserFactory.build()
        communicator.scope["user"] = user

        # set up back-end broker for sending messages
        ws = WsBroker(user)

        # websocket will allow connection
        connected, subprotocol = await communicator.connect()
        assert connected

        # send a message from the back end
        await ws.async_notify(
            "Test message", tags=["import-status-update"], payload={"key": 12345}
        )

        # receive the message from the websocket
        response = await communicator.receive_json_from()

        # test that content is in there
        assert "message" in response
    finally:
        await communicator.disconnect()
