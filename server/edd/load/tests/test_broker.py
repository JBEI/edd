import pytest
from django.test import override_settings

from .. import exceptions
from ..broker import LoadRequest


def test_LoadRequest_initial_state():
    lr = LoadRequest()
    assert lr.request_uuid
    assert lr.status == LoadRequest.Status.CREATED


def test_LoadRequest_fetch_bad_id():
    with pytest.raises(exceptions.InvalidLoadRequestError):
        # made-up ID should not exist
        LoadRequest.fetch("1234")


def test_LoadRequest_fetch_comms_error():
    # simulate an error connecting
    with override_settings(CACHES={}), pytest.raises(exceptions.CommunicationError):
        LoadRequest.fetch("1234")


def test_LoadRequest_store_comms_error():
    lr = LoadRequest()
    # simulate an error connecting
    with override_settings(CACHES={}), pytest.raises(exceptions.CommunicationError):
        lr.store()


def test_LoadRequest_retire_comms_error():
    lr = LoadRequest()
    # simulate an error connecting
    with override_settings(CACHES={}), pytest.raises(exceptions.CommunicationError):
        lr.retire()


def test_LoadRequest_retire_storage_error():
    lr = LoadRequest()
    # set fake path
    lr.path = lr._create_path()
    # simulate an error accessing storage
    with override_settings(STORAGES={}):
        lr.retire()
    # no Exception, message logged
    assert lr.path is None


def test_LoadRequest_transition_from_unexpected_state():
    lr = LoadRequest()
    with pytest.raises(exceptions.FailedTransitionError):
        # brand-new object will start in CREATED state, not PROCESSED
        lr.transition(lr.Status.UPDATING, expect=lr.Status.PROCESSED)


def test_LoadRequest_transition_comms_error():
    lr = LoadRequest()
    # simulate an error connecting
    with override_settings(CACHES={}):
        # default does not raise exception
        result = lr.transition(LoadRequest.Status.ABORTED)
    assert result is False


def test_LoadRequest_is_interpret_ready_comms_error():
    lr = LoadRequest()
    # simulate an error connecting
    with override_settings(CACHES={}):
        assert lr.is_interpret_ready is False


def test_LoadRequest_progress_comms_error():
    lr = LoadRequest()
    # simulate an error connecting
    with override_settings(CACHES={}), pytest.raises(exceptions.CommunicationError):
        lr.progress


def test_LoadRequest_form_payload_restore_comms_error():
    lr = LoadRequest()
    # simulate an error connecting
    with override_settings(CACHES={}), pytest.raises(exceptions.CommunicationError):
        lr.form_payload_restore("fake id")


def test_LoadRequest_form_payload_save_comms_error():
    lr = LoadRequest()
    # simulate an error connecting
    with override_settings(CACHES={}), pytest.raises(exceptions.CommunicationError):
        lr.form_payload_save({"fake": "data"})


def test_LoadRequest_open_error():
    lr = LoadRequest()
    # calling open without a path triggers error
    with pytest.raises(exceptions.CommunicationError):
        lr.open()


def test_LoadRequest_double_transition():
    lr = LoadRequest()
    lr.store()
    # simulate someone else interacting before transition
    other = LoadRequest.fetch(lr.request_uuid)
    # have original transition
    assert lr.transition(LoadRequest.Status.PROCESSED)
    # other session still has original status, transition should fail
    assert not other.transition(LoadRequest.Status.PROCESSED)


def test_LoadRequest_resolve_tokens_comms_error():
    lr = LoadRequest()
    # simulate an error connecting
    with override_settings(CACHES={}), pytest.raises(exceptions.CommunicationError):
        lr.resolve_tokens(None)


def test_LoadRequest_upload_storage_error():
    lr = LoadRequest()
    # simulate an error accessing storage
    with override_settings(STORAGES={}):
        assert lr.upload({"file": "fake file data"}) is False


def test_LoadRequest_commit_update(writable_session):
    with writable_session.start() as lr:
        writable_session.create_ready_records(lr, 10)
        # copy the ready records
        records = list(lr.request.resolved())
        # save once
        lr.commit(writable_session.user)
        progress = lr.progress
        assert progress["added"] == 10
        assert progress["updated"] == 0
        # load tweaked records again, one will be a new value with different x
        records[3].x = [42]
        lr.request.resolved_add(*records)
        # save again
        lr.commit(writable_session.user)
        progress = lr.progress
        assert progress["added"] == 11
        assert progress["updated"] == 9
