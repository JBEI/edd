# coding: utf-8

import pytest
from channels.testing import WebsocketCommunicator

from edd import asgi

from ..tests import factory
from . import backend


@pytest.mark.asyncio
async def test_notification_incoming(settings):
    # make sure the WS URL gets published.  Note this solves the problem when this test is run,
    # but not when all tests are run for the whole repo
    settings.EDD_USE_PROTOTYPE_IMPORT = True

    communicator = WebsocketCommunicator(asgi.application, "/ws/import/")
    try:
        # force login with fake user
        user = factory.UserFactory.build()
        communicator.scope["user"] = user

        # set up back-end broker for sending messages
        ws = backend.ImportWsBroker(user)

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
