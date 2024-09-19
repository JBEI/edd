import pytest
from django.core.files.uploadedfile import SimpleUploadedFile

from .. import tasks
from ..broker import SetupRequest
from ..exceptions import SetupException


def test_task_process_with_invalid_uuid(writable_session):
    with pytest.raises(SetupException):
        tasks.setup_process("bad_uuid", writable_session.user.pk)


def test_task_process_with_missing_upload(writable_session):
    setup = SetupRequest(writable_session.study.uuid)
    setup.store()

    with pytest.raises(SetupException):
        setup.process_upload(writable_session.user)


def test_task_process_success(writable_session):
    setup = SetupRequest(writable_session.study.uuid)
    file = SimpleUploadedFile(
        "example.txt",
        b"Line Name,\nA,\n",
        content_type="text/csv",
    )
    setup.upload({"file": file})

    # submitting directly, instead of queueing for Celery, with background arg
    tasks.submit_process(setup, writable_session.user, background=False)

    updated = SetupRequest.fetch(setup.request_uuid)
    progress = updated.progress
    assert progress["resolved"] == 1


def test_task_update_with_invalid_uuid(writable_session):
    with pytest.raises(SetupException):
        tasks.setup_update("bad_uuid", "bad_key", writable_session.user.pk)


def test_task_update_with_empty_form(writable_session):
    setup = SetupRequest(writable_session.study.uuid)
    file = SimpleUploadedFile(
        "example.txt",
        b"Line Name,Strain\nA,JBx_1234\n",
        content_type="text/csv",
    )
    setup.upload({"file": file})
    setup.process_upload(writable_session.user)
    key = setup.form_payload_stash({})

    # submitting directly, instead of queueing for Celery, with background arg
    tasks.submit_update(setup, key, writable_session.user, background=False)

    updated = SetupRequest.fetch(setup.request_uuid)
    progress = updated.progress
    assert progress["unresolved"] == 1


def test_task_update(writable_session_ice, ice_strains):
    setup = SetupRequest(writable_session_ice.study.uuid)
    file = SimpleUploadedFile(
        "example.txt",
        b"Line Name,Strain\nA,JBx_1234\n",
        content_type="text/csv",
    )
    setup.upload({"file": file})
    setup.process_upload(writable_session_ice.user)
    # "c3RyYWluOkpCeF8xMjM0" is encoded form of "strain:JBx_1234"
    payload = {"c3RyYWluOkpCeF8xMjM0": [{"part_id": ice_strains[0]["partId"]}]}
    key = setup.form_payload_stash(payload)

    # submitting directly, instead of queueing for Celery, with background arg
    tasks.submit_update(setup, key, writable_session_ice.user, background=False)

    updated = SetupRequest.fetch(setup.request_uuid)
    progress = updated.progress
    assert progress["resolved"] == 1
    assert progress["unresolved"] == 0


def test_task_commit_without_records_to_save(writable_session):
    setup = SetupRequest(writable_session.study.uuid)
    setup.store()
    setup.transition(SetupRequest.Status.READY)

    # submitting directly, instead of queueing for Celery, with background arg
    tasks.submit_commit(setup, writable_session.user, background=False)

    updated = SetupRequest.fetch(setup.request_uuid)
    assert updated.status == SetupRequest.Status.DONE
    assert writable_session.study.line_set.count() == 0


def test_task_commit_success(writable_session):
    setup = SetupRequest(writable_session.study.uuid)
    content = b"Line Name,Starting OD,Replicate\nA,0.1,3\n"
    file = SimpleUploadedFile(
        "example.txt",
        content,
        content_type="text/csv",
    )
    setup.upload({"file": file})
    setup.process_upload(writable_session.user)

    tasks.setup_commit(setup.request_uuid, writable_session.user.pk)

    updated = SetupRequest.fetch(setup.request_uuid)
    progress = updated.progress
    assert progress["saved"]["lines"] == 3
    assert writable_session.study.line_set.count() == 3
    assert updated.status == SetupRequest.Status.DONE


def test_task_commit_partial_resolved_lines(writable_session_ice, ice_strains):
    setup = SetupRequest(writable_session_ice.study.uuid)
    file = SimpleUploadedFile(
        "example.txt",
        b"Line Name,Strain\nA,JBx_1234\nB,JBx_5678",
        content_type="text/csv",
    )
    setup.upload({"file": file})
    setup.process_upload(writable_session_ice.user)

    # "c3RyYWluOkpCeF8xMjM0" is encoded form of "strain:JBx_1234"
    payload = {"c3RyYWluOkpCeF8xMjM0": [{"part_id": ice_strains[0]["partId"]}]}
    key = setup.form_payload_stash(payload)
    # update from "form", then commit
    tasks.submit_update(setup, key, writable_session_ice.user, background=False)
    tasks.submit_commit(setup, writable_session_ice.user, background=False)

    updated = SetupRequest.fetch(setup.request_uuid)
    progress = updated.progress
    assert progress["saved"]["lines"] == 1
    assert progress["unresolved"] == 1
    assert writable_session_ice.study.line_set.count() == 1
    assert updated.status == SetupRequest.Status.READY
