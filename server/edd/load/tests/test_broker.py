from unittest.mock import patch

import pytest

from .. import exceptions
from ..broker import LoadRequest


def test_LoadRequest_initial_state():
    lr = LoadRequest()
    assert lr.request
    assert lr.status == LoadRequest.Status.CREATED


def test_LoadRequest_fetch_bad_id():
    with pytest.raises(exceptions.InvalidLoadRequestError):
        # made-up ID should not exist
        LoadRequest.fetch("1234")


@patch.object(LoadRequest, "_connect")
def test_LoadRequest_fetch_comms_error(stub_method):
    # simulate an error connecting
    stub_method.side_effect = Exception("Oops, couldn't connect")
    with pytest.raises(exceptions.CommunicationError):
        LoadRequest.fetch("1234")


@patch.object(LoadRequest, "_connect")
def test_LoadRequest_store_comms_error(stub_method):
    lr = LoadRequest()
    # simulate an error connecting
    stub_method.side_effect = Exception("Oops, couldn't connect")
    with pytest.raises(exceptions.CommunicationError):
        lr.store()


@patch.object(LoadRequest, "_connect")
def test_LoadRequest_retire_comms_error(stub_method):
    lr = LoadRequest()
    # simulate an error connecting
    stub_method.side_effect = Exception("Oops, couldn't connect")
    with pytest.raises(exceptions.CommunicationError):
        lr.retire()


@patch.object(LoadRequest, "_storage")
def test_LoadRequest_retire_storage_error(stub_method):
    lr = LoadRequest()
    lr.path = lr._create_path()
    # simulate an error accessing storage
    stub_method.side_effect = Exception("Oops, couldn't access")
    # no Exception, message logged
    lr.retire()
    assert lr.path is None


@patch.object(LoadRequest, "_connect")
def test_LoadRequest_transition_comms_error(stub_method):
    lr = LoadRequest()
    # simulate an error connecting
    stub_method.side_effect = Exception("Oops, couldn't connect")
    # default does not raise exception
    result = lr.transition(LoadRequest.Status.ABORTED)
    assert result is False


@patch.object(LoadRequest, "_connect")
def test_LoadRequest_transition_comms_error_with_raise(stub_method):
    lr = LoadRequest()
    # simulate an error connecting
    stub_method.side_effect = Exception("Oops, couldn't connect")
    with pytest.raises(exceptions.FailedTransitionError):
        lr.transition(LoadRequest.Status.ABORTED, raise_errors=True)


@patch.object(LoadRequest, "_connect")
def test_LoadRequest_is_interpret_ready_comms_error(stub_method):
    lr = LoadRequest()
    # simulate an error connecting
    stub_method.side_effect = Exception("Oops, couldn't connect")
    assert lr.is_interpret_ready is False


@patch.object(LoadRequest, "_connect")
def test_LoadRequest_progress_comms_error(stub_method):
    lr = LoadRequest()
    # simulate an error connecting
    stub_method.side_effect = Exception("Oops, couldn't connect")
    with pytest.raises(exceptions.CommunicationError):
        lr.progress


@patch.object(LoadRequest, "_connect")
def test_LoadRequest_form_payload_restore_comms_error(stub_method):
    lr = LoadRequest()
    # simulate an error connecting
    stub_method.side_effect = Exception("Oops, couldn't connect")
    with pytest.raises(exceptions.CommunicationError):
        lr.form_payload_restore("fake id")


@patch.object(LoadRequest, "_connect")
def test_LoadRequest_form_payload_save_comms_error(stub_method):
    lr = LoadRequest()
    # simulate an error connecting
    stub_method.side_effect = Exception("Oops, couldn't connect")
    with pytest.raises(exceptions.CommunicationError):
        lr.form_payload_save({"fake": "data"})


def test_LoadRequest_open_error():
    lr = LoadRequest()
    # calling open without a path triggers error
    with pytest.raises(exceptions.CommunicationError):
        lr.open()


def test_LoadRequest_commit_wrong_state_error():
    lr = LoadRequest()
    # calling commit while not in SAVING state triggers error
    with pytest.raises(exceptions.ResolveError):
        lr.commit(None)


def test_LoadRequest_double_transition():
    lr = LoadRequest()
    lr.store()
    # simulate someone else interacting before transition
    other = LoadRequest.fetch(lr.request)
    # have original transition
    assert lr.transition(LoadRequest.Status.PROCESSED)
    # other session still has original status, transition should fail
    assert not other.transition(LoadRequest.Status.PROCESSED)


@patch.object(LoadRequest, "_connect")
def test_LoadRequest_resolve_tokens_comms_error(stub_method):
    lr = LoadRequest()
    # simulate an error connecting
    stub_method.side_effect = Exception("Oops, couldn't connect")
    with pytest.raises(exceptions.CommunicationError):
        lr.resolve_tokens(None)


@patch.object(LoadRequest, "_connect")
def test_LoadRequest_unresolved_tokens_comms_error(stub_method):
    lr = LoadRequest()
    # simulate an error connecting
    stub_method.side_effect = Exception("Oops, couldn't connect")
    with pytest.raises(exceptions.CommunicationError):
        lr.unresolved_tokens(0, 10)


@patch.object(LoadRequest, "_storage")
def test_LoadRequest_upload_storage_error(stub_method):
    lr = LoadRequest()
    # simulate an error connecting
    stub_method.side_effect = Exception("Oops, couldn't access")
    assert lr.upload({"file": "fake file data"}) is False
