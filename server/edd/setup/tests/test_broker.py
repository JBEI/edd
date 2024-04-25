from unittest.mock import patch

import pytest
from django.test import override_settings

from ..broker import DatabaseWriter, SetupRequest
from ..exceptions import SetupException
from ..parser import mime_excel


def test_SetupRequest_fetch_bad_id():
    with pytest.raises(SetupException):
        # made-up ID should not exist
        SetupRequest.fetch("1234")


@patch.object(SetupRequest, "_connect")
def test_SetupRequest_fetch_comms_error(stub_method):
    # simulate an error connecting
    stub_method.side_effect = Exception("Oops, couldn't connect")
    with pytest.raises(SetupException):
        SetupRequest.fetch("1234")


@patch.object(SetupRequest, "_connect")
def test_SetupRequest_store_comms_error(stub_method):
    setup = SetupRequest("1234")
    # simulate an error connecting
    stub_method.side_effect = Exception("Oops, couldn't connect")
    with pytest.raises(SetupException):
        setup.store()


def test_SetupRequest_store_and_fetch(writable_session):
    # fetching a stored experiment setup gives the same SetupRequest object
    with writable_session.setup_empty() as setup:
        result = SetupRequest.fetch(setup.request_uuid)
        assert result.request_uuid == setup.request_uuid


def test_SetupRequest_open_error():
    setup = SetupRequest("1234")
    # calling open without a path triggers error
    with pytest.raises(SetupException):
        setup.open()


@patch.object(SetupRequest, "_storage")
def test_SetupRequest_upload_storage_error(stub_method):
    setup = SetupRequest("1234")
    # simulate an error connecting
    stub_method.side_effect = Exception("Oops, couldn't access")
    assert setup.upload({"file": "fake file data"}) is False


# avoid writing "file" to disk and needing cleanup
@override_settings(EDD_LOAD_STORAGE="django.core.files.storage.InMemoryStorage")
def test_SetupRequest_upload_replacement_file(writable_session):
    with writable_session.setup_empty() as setup:
        # can upload one file ...
        assert setup.upload({"file": writable_session.create_upload_file("pixel.png")})
        # ... then replace it with another
        assert setup.upload({"file": writable_session.create_upload_file("data.csv")})
        assert setup.original_name == "data.csv"


# avoid writing "file" to disk and needing cleanup
@override_settings(EDD_LOAD_STORAGE="django.core.files.storage.InMemoryStorage")
def test_SetupRequest_process_with_bad_mime_type(writable_session):
    with writable_session.setup_empty() as setup:
        assert setup.upload({"file": writable_session.create_upload_file("pixel.png")})
        with pytest.raises(SetupException):
            setup.process_upload(writable_session.user)


# avoid writing "file" to disk and needing cleanup
@override_settings(EDD_LOAD_STORAGE="django.core.files.storage.InMemoryStorage")
def test_SetupRequest_process_csv(dir_of_test_files, writable_session):
    with writable_session.setup_empty() as setup:
        with open(dir_of_test_files / "simple.csv") as f:
            f.content_type = "text/csv"
            assert setup.upload({"file": f})
        setup.process_upload(writable_session.user)
        progress = setup.progress
    assert progress["resolved"] == 2
    assert progress["tokens"] == 0
    assert progress["unresolved"] == 0


# avoid writing "file" to disk and needing cleanup
@override_settings(EDD_LOAD_STORAGE="django.core.files.storage.InMemoryStorage")
def test_SetupRequest_process_excel(dir_of_test_files, writable_session):
    with writable_session.setup_empty() as setup:
        with open(dir_of_test_files / "simple.xlsx", "rb") as f:
            f.content_type = mime_excel
            assert setup.upload({"file": f})
        setup.process_upload(writable_session.user)
        progress = setup.progress
    assert progress["resolved"] == 2
    assert progress["tokens"] == 0
    assert progress["unresolved"] == 0


def test_SetupRequest_check_study_mismatch(writable_session):
    # no study_uuid is set
    setup = SetupRequest("1234")
    with pytest.raises(SetupException):
        setup.check_study(writable_session.study)


def test_SetupRequest_check_study_ok(writable_session):
    setup = SetupRequest(study_uuid=str(writable_session.study.uuid))
    setup.check_study(writable_session.study)


@patch.object(SetupRequest, "_connect")
def test_SetupRequest_progress_comms_error(stub_method):
    setup = SetupRequest("1234")
    # simulate an error connecting
    stub_method.side_effect = Exception("Oops, couldn't connect")
    with pytest.raises(SetupException):
        setup.progress


@patch.object(SetupRequest, "_connect")
def test_SetupRequest_transition_comms_error(stub_method):
    setup = SetupRequest("1234")
    # simulate an error connecting
    stub_method.side_effect = Exception("Oops, couldn't connect")
    assert not setup.transition(SetupRequest.Status.UPDATING)


@patch.object(SetupRequest, "_connect")
def test_SetupRequest_transition_comms_error_raise(stub_method):
    setup = SetupRequest("1234")
    # simulate an error connecting
    stub_method.side_effect = Exception("Oops, couldn't connect")
    with pytest.raises(SetupException):
        setup.transition(SetupRequest.Status.UPDATING, raise_errors=True)


def test_SetupRequest_transition_from_unexpected_state():
    setup = SetupRequest("1234")
    setup.store()
    with pytest.raises(SetupException):
        # brand-new object will start in CREATED state, not READY
        setup.transition(SetupRequest.Status.UPDATING, expect=SetupRequest.Status.READY)


def test_SetupRequest_double_transition():
    setup = SetupRequest("1234")
    setup.store()
    # simulate someone else interacting before transition
    other = SetupRequest.fetch(setup.request_uuid)
    # original transition works
    assert setup.transition(SetupRequest.Status.UPDATING)
    # other session still has original status, transition should fail
    assert not other.transition(SetupRequest.Status.UPDATING)


@patch.object(SetupRequest, "_connect")
def test_SetupRequest_form_payload_fetch_comms_error(stub_method):
    setup = SetupRequest("1234")
    # simulate an error connecting
    stub_method.side_effect = Exception("Oops, couldn't connect")
    with pytest.raises(SetupException):
        setup.form_payload_fetch("random key")


@patch.object(SetupRequest, "_connect")
def test_SetupRequest_form_payload_stash_comms_error(stub_method):
    setup = SetupRequest("1234")
    # simulate an error connecting
    stub_method.side_effect = Exception("Oops, couldn't connect")
    with pytest.raises(SetupException):
        setup.form_payload_stash({"fake": "data"})


# avoid writing "file" to disk and needing cleanup
@override_settings(EDD_LOAD_STORAGE="django.core.files.storage.InMemoryStorage")
@patch.object(DatabaseWriter, "persist_batch")
def test_SetupRequest_commit_database_error(
    stub_method,
    dir_of_test_files,
    writable_session,
):
    # initializing with simple records
    setup = SetupRequest(writable_session.study.uuid)
    with open(dir_of_test_files / "simple.csv") as f:
        f.content_type = "text/csv"
        assert setup.upload({"file": f})
    setup.process_upload(writable_session.user)
    # simulate a database error
    stub_method.side_effect = Exception("Oops, database b0rk'd")

    with pytest.raises(SetupException):
        setup.commit(writable_session.user)
