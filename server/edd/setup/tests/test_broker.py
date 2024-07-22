from unittest.mock import patch

import pytest
from django.test import override_settings

from main import models as edd_models
from main.tests.factory import ProtocolFactory, StrainFactory

from ..broker import DatabaseWriter, SetupRequest
from ..exceptions import SetupException
from ..forms import ResolveTokensForm
from ..parser import mime_excel


def test_SetupRequest_fetch_bad_id():
    with pytest.raises(SetupException):
        # made-up ID should not exist
        SetupRequest.fetch("1234")


def test_SetupRequest_fetch_comms_error():
    # disable Redis to simulate connection errors
    with override_settings(CACHES={}), pytest.raises(SetupException):
        SetupRequest.fetch("1234")


def test_SetupRequest_store_comms_error():
    setup = SetupRequest("1234")
    # disable Redis to simulate connection errors
    with override_settings(CACHES={}), pytest.raises(SetupException):
        setup.store()


def test_SetupRequest_store_and_fetch(writable_session):
    # fetching a stored experiment setup gives the same SetupRequest object
    with writable_session.setup() as setup:
        result = SetupRequest.fetch(setup.request_uuid)
        assert result.request_uuid == setup.request_uuid


def test_SetupRequest_open_error():
    setup = SetupRequest("1234")
    # calling open without a path triggers error
    with pytest.raises(SetupException):
        setup.open()


def test_SetupRequest_upload_storage_error():
    setup = SetupRequest("1234")
    # disable storage backend to simulate storage errors
    with override_settings(STORAGES={}):
        assert setup.upload({"file": "fake file data"}) is False


def test_SetupRequest_upload_replacement_file(writable_session):
    with writable_session.setup() as setup:
        # can upload one file ...
        assert setup.upload({"file": writable_session.create_upload_file("pixel.png")})
        # ... then replace it with another
        assert setup.upload({"file": writable_session.create_upload_file("data.csv")})
        assert setup.original_name == "data.csv"


def test_SetupRequest_process_with_bad_mime_type(writable_session):
    with writable_session.setup() as setup:
        assert setup.upload({"file": writable_session.create_upload_file("pixel.png")})
        with pytest.raises(SetupException):
            setup.process_upload(writable_session.user)


def test_SetupRequest_process_csv(dir_of_test_files, writable_session):
    with writable_session.setup() as setup:
        with open(dir_of_test_files / "simple.csv") as f:
            f.content_type = "text/csv"
            assert setup.upload({"file": f})
        setup.process_upload(writable_session.user)
        progress = setup.progress
    assert progress["resolved"] == 2
    assert progress["tokens"] == 0
    assert progress["unresolved"] == 0


def test_SetupRequest_process_excel(dir_of_test_files, writable_session):
    with writable_session.setup() as setup:
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


def test_SetupRequest_progress_comms_error():
    setup = SetupRequest("1234")
    # disable Redis to simulate connection errors
    with override_settings(CACHES={}), pytest.raises(SetupException):
        setup.progress


def test_SetupRequest_transition_comms_error():
    setup = SetupRequest("1234")
    # disable Redis to simulate connection errors
    with override_settings(CACHES={}):
        assert not setup.transition(SetupRequest.Status.UPDATING)


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


def test_SetupRequest_form_payload_fetch_comms_error():
    setup = SetupRequest("1234")
    # disable Redis to simulate connection errors
    with override_settings(CACHES={}), pytest.raises(SetupException):
        setup.form_payload_fetch("random key")


def test_SetupRequest_form_payload_stash_comms_error():
    setup = SetupRequest("1234")
    # disable Redis to simulate connection errors
    with override_settings(CACHES={}), pytest.raises(SetupException):
        setup.form_payload_stash({"fake": "data"})


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


def test_SetupRequest_get_unresolved_tokens_comms_error():
    setup = SetupRequest("1234")
    # disable Redis to simulate connection errors
    with override_settings(CACHES={}), pytest.raises(SetupException):
        setup.get_unresolved_tokens_range(0, 10)


def test_SetupRequest_retire_comms_error():
    setup = SetupRequest("1234")
    # disable Redis to simulate connection errors
    with override_settings(CACHES={}), pytest.raises(SetupException):
        setup.retire()
    setup.retire()


def test_SetupRequest_retire_storage_error(dir_of_test_files):
    setup = SetupRequest("1234")
    # add upload to try removing
    with open(dir_of_test_files / "simple.csv") as f:
        f.content_type = "text/csv"
        assert setup.upload({"file": f})
    # disable storage backend to simulate storage errors
    with override_settings(STORAGES={}):
        # No exception raised, only error logged
        setup.retire()
    setup.retire()


def test_SetupRequest_process_form_comms_error():
    setup = SetupRequest("1234")
    # disable Redis to simulate connection errors
    with override_settings(CACHES={}), pytest.raises(SetupException):
        setup.process_form(None)


def test_SetupRequest_commit_with_assay_metadata(client, writable_session):
    client.force_login(writable_session.user)
    filename = writable_session.path("assay.csv")
    with writable_session.setup(upload_file=filename) as setup:
        # update assay metadata with protocol, field is "cHJvdG9jb2w6QXNzYXkgTmFtZQ"
        payload = {"cHJvdG9jb2w6QXNzYXkgTmFtZQ": ProtocolFactory().pk}
        form = ResolveTokensForm(setup_request=setup, data=payload)
        setup.process_form(form)
        # save
        setup.commit(writable_session.user)

    study_id = writable_session.study.pk
    assert edd_models.Line.objects.filter(study_id=study_id).count() == 4
    assert edd_models.Assay.objects.filter(study_id=study_id).count() == 4


def test_SetupRequest_commit_with_strains(client, writable_session):
    client.force_login(writable_session.user)
    filename = writable_session.path("strain.csv")
    with writable_session.setup(upload_file=filename) as setup:
        # update fields with strain references, each a single item list of new strain
        payload = {
            "c3RyYWluOkpCeF8wMDAwMQ": [StrainFactory().registry_id],
            "c3RyYWluOkpCeF8wMDAwMg": [StrainFactory().registry_id],
            "c3RyYWluOkpCeF8wMDAwMw": [StrainFactory().registry_id],
            "c3RyYWluOkpCeF8wMDAwNA": [StrainFactory().registry_id],
        }
        form = ResolveTokensForm(setup_request=setup, data=payload)
        setup.process_form(form)
        # save
        setup.commit(writable_session.user)

    study_id = writable_session.study.pk
    assert edd_models.Line.objects.filter(study_id=study_id).count() == 4
    assert edd_models.Strain.objects.filter(line__study_id=study_id).count() == 4
