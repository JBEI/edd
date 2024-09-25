import contextlib

import pytest
from asgiref.sync import sync_to_async
from channels.testing import WebsocketCommunicator

from edd import asgi
from edd.utilities import ws_reverse

from ..broker import SetupRequest


@pytest.fixture
def edd_websocket(event_loop):
    return asgi.setup_application()


@pytest.fixture
def async_setup(writable_session):
    setup = SetupRequest(writable_session.study.uuid)
    setup.store()
    yield setup


@sync_to_async
def transition(setup: SetupRequest, status: SetupRequest.Status):
    setup.transition(status)
    setup.send_update()


@contextlib.asynccontextmanager
async def session(websocket, setup, *, is_open=True, user=None):
    path = ws_reverse("setup:progress", kwargs={"uuid": setup.request_uuid})
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
async def test_refuse_connection_for_anonymous_user(edd_websocket, async_setup):
    async with session(
        edd_websocket,
        async_setup,
        is_open=False,
        # omitting user on purpose to simulate anonymous request
    ) as communicator:
        # then as there is no user, and connection must be accepted to verify, disconnect
        assert await communicator.receive_nothing() is True


@pytest.mark.asyncio
async def test_receive_progress_on_connect(
    edd_websocket,
    writable_session,
    async_setup,
):
    async with session(
        edd_websocket,
        async_setup,
        user=writable_session.user,
    ) as communicator:
        # get progress on connect
        response = await communicator.receive_json_from()
        # test that progress content is there
        assert response["status"] == str(SetupRequest.Status.CREATED)


@pytest.mark.asyncio
async def test_receive_progress_on_update(
    edd_websocket,
    writable_session,
    async_setup,
):
    async with session(
        edd_websocket,
        async_setup,
        user=writable_session.user,
    ) as communicator:
        # get progress on connect
        await communicator.receive_json_from()
        # force a transition
        await transition(async_setup, SetupRequest.Status.DONE)
        # websocket gets progress update
        response = await communicator.receive_json_from(timeout=10)
        assert response["status"] == str(SetupRequest.Status.DONE)
