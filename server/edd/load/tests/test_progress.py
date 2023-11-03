import contextlib

import pytest
from asgiref.sync import sync_to_async
from channels.testing import WebsocketCommunicator

from edd import asgi

from ..broker import LoadRequest


@pytest.fixture
def edd_websocket(event_loop):
    return asgi.setup_application()


# wrap up session context manager in another fixture, as it's more complicated
# to make it an async context manager just for a few tests
@pytest.fixture
def async_lr(writable_session):
    with writable_session.start() as lr:
        yield lr


@sync_to_async
def transition(load_request: LoadRequest, status: LoadRequest.Status):
    load_request.transition(status)
    load_request.send_update()


@contextlib.asynccontextmanager
async def session(websocket, lr, *, is_open=True, user=None):
    path = f"/ws/load/{lr.request}/"
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
async def test_refuse_connection_for_anonymous_user(edd_websocket, async_lr):
    async with session(
        edd_websocket,
        async_lr,
        is_open=False,
        # omitting user on purpose to simulate anonymous request
    ) as communicator:
        # then as there is no user, and connection must be accepted to verify, disconnect
        assert await communicator.receive_nothing() is True


@pytest.mark.asyncio
async def test_receive_progress_on_connect(
    edd_websocket,
    writable_session,
    async_lr,
):
    async with session(
        edd_websocket,
        async_lr,
        user=writable_session.user,
    ) as communicator:
        # get progress on connect
        response = await communicator.receive_json_from()
        # test that progress content is there
        assert response["status"] == str(LoadRequest.Status.CREATED)


@pytest.mark.asyncio
async def test_receive_progress_on_update(
    edd_websocket,
    writable_session,
    async_lr,
):
    async with session(
        edd_websocket,
        async_lr,
        user=writable_session.user,
    ) as communicator:
        # get progress on connect
        await communicator.receive_json_from()
        # force a transition
        await transition(async_lr, LoadRequest.Status.FAILED)
        # websocket gets progress update
        response = await communicator.receive_json_from(timeout=10)
        assert response["status"] == str(LoadRequest.Status.FAILED)
