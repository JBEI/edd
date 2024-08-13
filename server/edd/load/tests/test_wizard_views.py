from http import HTTPStatus
from unittest.mock import patch

from django.core import mail
from django.test import override_settings
from django.urls import reverse
from pytest import mark
from pytest_django import asserts

from main.models import Measurement, MeasurementType, MetadataType, StudyPermission
from main.tests import factory as main_factory

from .. import tasks
from ..broker import DatabaseWriter, LoadRequest
from ..forms import ResolveTokensForm, name_from_token
from . import factory

AJAX_HEADER = {"X-Requested-With": "XMLHttpRequest"}


def test_reactless_import_start_anonymous_user_redirects(client, readable_session):
    url = readable_session.url("main:load:start")
    response = client.get(url, follow=True)
    login_url = reverse("account_login")
    asserts.assertRedirects(response, f"{login_url}?next={url}")


def test_reactless_import_start_read_user(client, readable_session):
    client.force_login(readable_session.user)
    url = readable_session.url("main:load:start")
    response = client.get(url)
    assert response.status_code == HTTPStatus.FORBIDDEN


def test_reactless_import_start_write_user(client, writable_session):
    client.force_login(writable_session.user)
    url = writable_session.url("main:load:start")
    response = client.get(url)
    assert response.status_code == HTTPStatus.OK
    asserts.assertTemplateUsed(response, "edd/load/start.html")


def test_reactless_import_start_edit(client, writable_session):
    client.force_login(writable_session.user)
    with writable_session.start() as lr:
        url = writable_session.url("main:load:start_edit", uuid=lr.request_uuid)
        response = client.get(url)
    assert response.status_code == HTTPStatus.OK
    asserts.assertTemplateUsed(response, "edd/load/start.html")


def test_reactless_import_start_edit_invalid_id(client, writable_session):
    client.force_login(writable_session.user)
    url = writable_session.url("main:load:start_edit", uuid="invalid-uuid")
    response = client.get(url)
    link_url = writable_session.url("main:load:start")
    asserts.assertContains(response, link_url, status_code=HTTPStatus.FORBIDDEN)


def test_reactless_import_start_edit_wrong_study(client, writable_session):
    client.force_login(writable_session.user)
    other_session = factory.ImportSession(permission_type=StudyPermission.WRITE)
    with writable_session.start(), other_session.start() as other:
        url = writable_session.url("main:load:start_edit", uuid=other.request_uuid)
        response = client.get(url)
    link_url = writable_session.url("main:load:start")
    asserts.assertContains(response, link_url, status_code=HTTPStatus.FORBIDDEN)


def test_reactless_import_start_post(client, writable_session, start_payload):
    client.force_login(writable_session.user)
    url = writable_session.url("main:load:start")
    response = client.post(url, start_payload, follow=True)
    # would be nice to use asserts.assertRedirects(), but we won't know
    # the generated UUID ahead of time; see: test_reactless_import_upload_get
    asserts.assertTemplateUsed(response, "edd/load/upload.html")


def test_reactless_import_start_post_missing_data(client, writable_session):
    client.force_login(writable_session.user)
    url = writable_session.url("main:load:start")
    response = client.post(url, {}, follow=True)
    assert response.status_code == HTTPStatus.BAD_REQUEST
    asserts.assertTemplateUsed(response, "edd/load/start.html")


def test_reactless_import_upload_get(client, writable_session):
    client.force_login(writable_session.user)
    with writable_session.start() as lr:
        url = writable_session.url("main:load:upload", uuid=lr.request_uuid)
        response = client.get(url)
    assert response.status_code == HTTPStatus.OK
    asserts.assertTemplateUsed(response, "edd/load/upload.html")


def test_reactless_import_upload_get_when_already_uploaded(client, writable_session):
    client.force_login(writable_session.user)
    with writable_session.start() as lr:
        lr.upload({"file": writable_session.create_upload_file("somefile")})
        url = writable_session.url("main:load:upload", uuid=lr.request_uuid)
        response = client.get(url)
    asserts.assertTemplateUsed(response, "edd/load/upload.html")
    asserts.assertContains(response, "<h4>You already uploaded a file</h4>")


def test_reactless_import_upload_post_empty(client, writable_session):
    client.force_login(writable_session.user)
    with writable_session.start() as lr:
        url = writable_session.url("main:load:upload", uuid=lr.request_uuid)
        response = client.post(url)
    asserts.assertTemplateUsed(response, "edd/load/upload.html")
    asserts.assertContains(
        response,
        "EDD could not recognize an uploaded file",
        status_code=HTTPStatus.BAD_REQUEST,
    )


def test_reactless_import_upload_post(client, writable_session):
    client.force_login(writable_session.user)
    with writable_session.start() as lr:
        url = writable_session.url("main:load:upload", uuid=lr.request_uuid)
        # patching to avoid actually submitting task
        with patch("edd.load.tasks.wizard_process") as task:
            response = client.post(
                url,
                {"file": writable_session.create_upload_file("somefile")},
                follow=True,
            )
        redirect_url = writable_session.url("main:load:interpret", uuid=lr.request_uuid)
    asserts.assertRedirects(response, redirect_url)
    asserts.assertTemplateUsed(response, "edd/load/interpret.html")
    task.delay.assert_called_once()


def test_reactless_import_upload_post_ajax(client, writable_session):
    client.force_login(writable_session.user)
    with writable_session.start() as lr:
        url = writable_session.url("main:load:upload", uuid=lr.request_uuid)
        # patching to avoid actually submitting task
        with patch("edd.load.tasks.wizard_process") as task:
            response = client.post(
                url,
                {"file": writable_session.create_upload_file("somefile")},
                follow=True,
                headers=AJAX_HEADER,
            )
        redirect_url = writable_session.url("main:load:interpret", uuid=lr.request_uuid)
    assert response.status_code == HTTPStatus.OK
    assert response.json()["url"] == redirect_url
    task.delay.assert_called_once()


def test_reactless_import_upload_post_error(client, writable_session):
    client.force_login(writable_session.user)
    with writable_session.start() as lr:
        url = writable_session.url("main:load:upload", uuid=lr.request_uuid)
        # patching to avoid actually submitting task, simulating an error
        with patch("edd.load.tasks.wizard_process") as task:
            task.delay.side_effect = Exception("Arbitrary Error")
            response = client.post(
                url,
                {"file": writable_session.create_upload_file("somefile")},
                follow=True,
            )
    asserts.assertTemplateUsed(response, "edd/load/upload.html")
    asserts.assertContains(
        response,
        "There was a problem processing your upload.",
        status_code=HTTPStatus.BAD_REQUEST,
    )
    task.delay.assert_called_once()


def test_reactless_import_upload_post_error_ajax(client, writable_session):
    client.force_login(writable_session.user)
    with writable_session.start() as lr:
        url = writable_session.url("main:load:upload", uuid=lr.request_uuid)
        # patching to avoid actually submitting task, simulating an error
        with patch("edd.load.tasks.wizard_process") as task:
            task.delay.side_effect = Exception("Arbitrary Error")
            response = client.post(
                url,
                {"file": writable_session.create_upload_file("somefile")},
                follow=True,
                headers=AJAX_HEADER,
            )
    assert response.status_code == HTTPStatus.BAD_REQUEST
    assert response.json() == {}
    task.delay.assert_called_once()


def test_task_process_with_invalid_id(writable_session):
    # task should "finish", as there's nothing to do with a bad ID
    tasks.wizard_process("bad_uuid", writable_session.user.pk)


def test_task_process_with_missing_upload(writable_session):
    with writable_session.start() as lr:
        tasks.submit_process(lr, writable_session.user, background=False)
        updated = LoadRequest.fetch(lr.request_uuid)
    assert updated.status == LoadRequest.Status.FAILED


def test_task_process_success(writable_session):
    with writable_session.start(layout_key="skyline") as lr:
        writable_session.simple_skyline_upload(lr)
        tasks.submit_process(lr, writable_session.user, background=False)
        progress = LoadRequest.fetch(lr.request_uuid).progress
    assert progress["resolved"] == 1
    assert progress["unresolved"] == 0


def test_task_process_with_error(writable_session):
    with writable_session.start(layout_key="skyline") as lr:
        writable_session.simple_skyline_upload(lr)
        with patch.object(LoadRequest, "resolve_batch") as stub_method:
            stub_method.side_effect = Exception("Oops, resolve error")
            tasks.submit_process(lr, writable_session.user, background=False)
        progress = LoadRequest.fetch(lr.request_uuid).progress
    assert progress["resolved"] == 0
    assert progress["unresolved"] == 0
    assert progress["status"] == str(LoadRequest.Status.FAILED)


def test_reactless_import_interpret_with_no_data(client, writable_session):
    client.force_login(writable_session.user)
    with writable_session.start() as lr:
        url = writable_session.url("main:load:interpret", uuid=lr.request_uuid)
        response = client.get(url)
    # shows progress bar, which when the task runs will update with error
    asserts.assertTemplateUsed(response, "edd/load/interpret.html")
    asserts.assertTemplateUsed(response, "edd/load/interpret-progress.html")
    assert response.status_code == HTTPStatus.OK


def test_reactless_import_interpret_ajax(client, writable_session):
    client.force_login(writable_session.user)
    with writable_session.start() as lr:
        url = writable_session.url("main:load:interpret", uuid=lr.request_uuid)
        response = client.get(url, headers=AJAX_HEADER)
    # shows progress bar, which when the task runs will update with error
    asserts.assertTemplateNotUsed(response, "edd/load/interpret.html")
    asserts.assertTemplateUsed(response, "edd/load/interpret-progress.html")
    assert response.status_code == HTTPStatus.OK


def test_reactless_import_interpret_aborted(client, writable_session):
    client.force_login(writable_session.user)
    with writable_session.start() as lr:
        url = writable_session.url("main:load:interpret", uuid=lr.request_uuid)
        lr.transition(lr.Status.ABORTED)
        response = client.get(url)
    asserts.assertTemplateUsed(response, "edd/load/interpret.html")
    asserts.assertTemplateUsed(response, "edd/load/interpret-error.html")
    assert response.status_code == HTTPStatus.OK


def test_reactless_import_interpret_with_tokens_to_resolve(client, writable_session):
    client.force_login(writable_session.user)
    with writable_session.start() as lr:
        locator_name = writable_session.create_unresolved_record(lr)
        url = writable_session.url("main:load:interpret", uuid=lr.request_uuid)
        response = client.get(url)
    asserts.assertTemplateUsed(response, "edd/load/interpret.html")
    asserts.assertTemplateUsed(response, "edd/load/interpret-resolve.html")
    asserts.assertContains(response, locator_name)


def test_reactless_import_interpret_with_tokens_to_resolve_and_overflow_page(
    client,
    writable_session,
):
    client.force_login(writable_session.user)
    with writable_session.start() as lr:
        writable_session.create_unresolved_record(lr)
        url = writable_session.url(
            "main:load:interpret-page",
            uuid=lr.request_uuid,
            # this page is well beyond the total tokens
            page=10,
        )
        response = client.get(url, headers=AJAX_HEADER)
    asserts.assertTemplateNotUsed(response, "edd/load/interpret.html")
    asserts.assertTemplateUsed(response, "edd/load/interpret-resolve.html")


@override_settings(EDD_WIZARD_TOKENS_PER_PAGE=1)
def test_reactless_import_interpret_with_tokens_to_resolve_later_page(
    client,
    writable_session,
):
    client.force_login(writable_session.user)
    with writable_session.start() as lr:
        writable_session.create_unresolved_record(lr)
        first_url = writable_session.url("main:load:interpret", uuid=lr.request_uuid)
        next_url = writable_session.url(
            "main:load:interpret-page",
            uuid=lr.request_uuid,
            page=1,
        )
        prev_url = writable_session.url(
            "main:load:interpret-page",
            uuid=lr.request_uuid,
            page=0,
        )
        # making sure next/previous buttons show up
        first_response = client.get(first_url, headers=AJAX_HEADER)
        next_response = client.get(next_url, headers=AJAX_HEADER)
    asserts.assertTemplateNotUsed(first_response, "edd/load/interpret.html")
    asserts.assertTemplateNotUsed(next_response, "edd/load/interpret.html")
    asserts.assertTemplateUsed(first_response, "edd/load/interpret-resolve.html")
    asserts.assertTemplateUsed(next_response, "edd/load/interpret-resolve.html")
    asserts.assertContains(first_response, next_url)
    asserts.assertContains(next_response, prev_url)


@override_settings(EDD_ALLOW_IMPORT_ANONYMOUS_LINES=False)
@override_settings(EDD_ALLOW_IMPORT_PROVISIONAL_TYPES=False)
def test_reactless_import_interpret_with_tokens_to_resolve_without_bulk_create(
    client,
    writable_session,
):
    client.force_login(writable_session.user)
    with writable_session.start() as lr:
        writable_session.create_unresolved_record(lr)
        url = writable_session.url("main:load:interpret", uuid=lr.request_uuid)
        response = client.get(url)
    asserts.assertTemplateUsed(response, "edd/load/interpret.html")
    asserts.assertTemplateUsed(response, "edd/load/interpret-resolve.html")
    asserts.assertNotContains(response, "Bulk create missing Lines")
    asserts.assertNotContains(response, "Bulk create missing Measurement Types")


def test_reactless_import_interpret_post_with_errors(client, writable_session):
    client.force_login(writable_session.user)
    with writable_session.start() as lr:
        locator_name = writable_session.create_unresolved_record(lr)
        url = writable_session.url("main:load:interpret", uuid=lr.request_uuid)
        field_name = name_from_token(f"locator:{locator_name}".encode())
        # patching to avoid actually submitting task
        with patch("edd.load.tasks.wizard_update") as task:
            response = client.post(url, {field_name: "invalid value"})
    asserts.assertTemplateUsed(response, "edd/load/interpret.html")
    asserts.assertTemplateUsed(response, "edd/load/interpret-resolve.html")
    asserts.assertContains(
        response,
        locator_name,
        status_code=HTTPStatus.BAD_REQUEST,
    )
    task.delay.assert_not_called()


def test_reactless_import_interpret_post_partial(client, writable_session):
    client.force_login(writable_session.user)
    with writable_session.start() as lr:
        locator_name = writable_session.create_unresolved_record(lr)
        line = main_factory.LineFactory(study=writable_session.study)
        url = writable_session.url("main:load:interpret", uuid=lr.request_uuid)
        field_name = name_from_token(f"locator:{locator_name}".encode())
        # patching to avoid actually submitting task
        with patch("edd.load.tasks.wizard_update") as task:
            response = client.post(url, {field_name: line.id}, follow=True)
    assert response.status_code == HTTPStatus.OK
    asserts.assertTemplateUsed(response, "edd/load/interpret.html")
    # cache is still in state before progress bar and partial POST updates
    asserts.assertTemplateUsed(response, "edd/load/interpret-resolve.html")
    # have 5 "unknown values" for: locator, type, x-unit, y-unit, x-value
    # also have two more for auto-create on "all locator" and "all type"
    asserts.assertContains(response, "Found 7 unknown values.")
    task.delay.assert_called_once()


def test_reactless_import_interpret_post_abort(client, writable_session):
    client.force_login(writable_session.user)
    with writable_session.start() as lr:
        writable_session.create_unresolved_record(lr)
        url = writable_session.url("main:load:interpret", uuid=lr.request_uuid)
        # patching to avoid actually submitting task
        with patch("edd.load.tasks.wizard_update") as task:
            response = client.post(url, {"abort": "1"}, follow=True)
    assert response.status_code == HTTPStatus.OK
    asserts.assertTemplateUsed(response, "edd/load/start.html")
    asserts.assertContains(response, "Import is cancelled")
    task.delay.assert_not_called()


def test_reactless_import_interpret_post_save(client, writable_session):
    client.force_login(writable_session.user)
    with writable_session.start() as lr:
        locator_name = writable_session.create_unresolved_record(lr)
        line = main_factory.LineFactory(study=writable_session.study)
        url = writable_session.url("main:load:interpret", uuid=lr.request_uuid)
        field_name = name_from_token(f"locator:{locator_name}".encode())
        update_task = patch("edd.load.tasks.wizard_update")
        save_task = patch("edd.load.tasks.wizard_save")
        # patching to avoid actually submitting task
        with update_task as update_task, save_task as save_task:
            response = client.post(
                url,
                {field_name: line.id, "save": "1"},
                follow=True,
            )
    assert response.status_code == HTTPStatus.OK
    asserts.assertTemplateUsed(response, "edd/load/save.html")
    update_task.delay.assert_not_called()
    save_task.delay.assert_called_once()


def test_reactless_import_interpret_all_resolved(client, writable_session):
    client.force_login(writable_session.user)
    with writable_session.start() as lr:
        writable_session.create_resolved_record(lr)
        url = writable_session.url("main:load:interpret", uuid=lr.request_uuid)
        response = client.get(url)
    asserts.assertTemplateUsed(response, "edd/load/interpret.html")
    asserts.assertTemplateUsed(response, "edd/load/interpret-commit.html")
    assert response.status_code == HTTPStatus.OK


def test_task_update_with_invalid_id(writable_session):
    # task should "finish", as there's nothing to do with bad IDs
    tasks.wizard_update("bad_uuid", "invalid_uuid_payload", writable_session.user.pk)


def test_task_update_with_invalid_form(writable_session):
    with writable_session.start() as lr:
        locator_name = writable_session.create_unresolved_record(lr)
        field_name = name_from_token(f"locator:{locator_name}".encode())
        # passing invalid JSON to trigger invalid form
        payload_key = lr.form_payload_save({field_name: "{"})
        tasks.wizard_update(lr.request_uuid, payload_key, writable_session.user.pk)
        progress = LoadRequest.fetch(lr.request_uuid).progress
    # overall status doesn't change from Processed, no change in (un)resolved
    assert progress["status"] == str(LoadRequest.Status.PROCESSED)
    assert progress["resolved"] == 0
    assert progress["unresolved"] == 1


@mark.parametrize("save", (True, False))
def test_task_update(writable_session, save):
    line = main_factory.LineFactory(study=writable_session.study)
    a_type = main_factory.GenericTypeFactory()
    a_unit = main_factory.UnitFactory()
    with writable_session.start() as lr:
        locator_name = writable_session.create_unresolved_record(lr)
        locator_field = name_from_token(f"locator:{locator_name}".encode())
        type_field = name_from_token(b"type:unknown type")
        value_field = name_from_token(b"x:")
        x_field = name_from_token(b"unit:unknown unit x")
        y_field = name_from_token(b"unit:unknown unit y")
        payload_key = lr.form_payload_save(
            {
                locator_field: f'{{"type": "Line", "id": {line.id}}}',
                type_field: a_type.id,
                value_field: "42",
                x_field: a_unit.id,
                y_field: '{"new": true}',
                "some_input_id": "",
            }
        )
        # patching to avoid actually submitting task
        with patch("edd.load.tasks.wizard_save") as save_task:
            tasks.wizard_update(
                lr.request_uuid,
                payload_key,
                writable_session.user.pk,
                save_when_done=save,
            )
        progress = LoadRequest.fetch(lr.request_uuid).progress
    assert progress["resolved"] == 1
    assert progress["unresolved"] == 0
    assert save_task.delay.called == save
    assert progress["status"] == str(LoadRequest.Status.PROCESSED)
    assert save_task.delay.call_count == int(save)


def test_task_update_using_new_items(writable_session):
    with writable_session.start() as lr:
        locator_name = writable_session.create_unresolved_record(lr)
        locator_field = name_from_token(f"locator:{locator_name}".encode())
        type_field = name_from_token(b"type:unknown type")
        value_field = name_from_token(b"x:")
        x_field = name_from_token(b"unit:unknown unit x")
        y_field = name_from_token(b"unit:unknown unit y")
        payload_key = lr.form_payload_save(
            {
                locator_field: '{"new": true}',
                type_field: '{"new": true}',
                value_field: "42",
                x_field: '{"new": true}',
                y_field: '{"new": true}',
                "some_input_id": "",
            }
        )
        # patching to avoid actually submitting task
        with patch("edd.load.tasks.send_bulk_abuse_email") as email_task:
            tasks.wizard_update(
                lr.request_uuid,
                payload_key,
                writable_session.user.pk,
                save_when_done=False,
            )
        progress = LoadRequest.fetch(lr.request_uuid).progress
    # email task is not called
    assert email_task.delay.called is False
    # progress is as expected
    assert progress["resolved"] == 1
    assert progress["unresolved"] == 0
    assert progress["status"] == str(LoadRequest.Status.PROCESSED)
    # created a new line entry
    assert writable_session.study.line_set.filter(name=locator_name).count() == 1
    # and a new provisional measurement type
    found = MeasurementType.objects.filter(provisional=True, type_name="unknown type")
    assert found.count() == 1


def test_task_update_using_bulk_create(writable_session):
    with writable_session.start() as lr:
        locator_name = writable_session.create_unresolved_record(lr)
        payload_key = lr.form_payload_save(
            {
                name_from_token(b"form:locator"): True,
                name_from_token(b"form:type"): True,
            }
        )
        # patching to avoid actually submitting task
        with patch("edd.load.tasks.send_bulk_abuse_email") as email_task:
            tasks.wizard_update(
                lr.request_uuid,
                payload_key,
                writable_session.user.pk,
                save_when_done=False,
            )
        progress = LoadRequest.fetch(lr.request_uuid).progress
    # email task gets called
    assert email_task.delay.called is True
    # progress is as expected
    assert progress["resolved"] == 0
    assert progress["unresolved"] == 1
    assert progress["status"] == str(LoadRequest.Status.PROCESSED)
    # created a new line entry
    assert writable_session.study.line_set.filter(name=locator_name).count() == 1
    # and a new provisional measurement type
    found = MeasurementType.objects.filter(provisional=True, type_name="unknown type")
    assert found.count() == 1


@override_settings(EDD_ALLOW_IMPORT_ANONYMOUS_LINES=False)
@override_settings(EDD_ALLOW_IMPORT_PROVISIONAL_TYPES=False)
def test_task_update_using_bulk_create_when_disabled(writable_session):
    with writable_session.start() as lr:
        locator_name = writable_session.create_unresolved_record(lr)
        payload_key = lr.form_payload_save(
            {
                name_from_token(f"locator:{locator_name}".encode()): "",
                name_from_token(b"form:locator"): True,
                name_from_token(b"form:type"): True,
            }
        )
        tasks.wizard_update(
            lr.request_uuid,
            payload_key,
            writable_session.user.pk,
            save_when_done=False,
        )
        progress = LoadRequest.fetch(lr.request_uuid).progress
    assert progress["resolved"] == 0
    assert progress["unresolved"] == 1
    assert progress["status"] == str(LoadRequest.Status.PROCESSED)
    # NOT created a new line entry
    assert writable_session.study.line_set.filter(name=locator_name).count() == 0
    # and NOT a new provisional measurement type
    found = MeasurementType.objects.filter(provisional=True, type_name="unknown type")
    assert found.count() == 0


def test_task_update_partial_then_full(writable_session):
    with writable_session.start() as lr:
        writable_session.create_resolved_record(lr)
        locator_name = writable_session.create_unresolved_record(lr)
        payload_key = lr.form_payload_save({name_from_token(b"form:type"): False})
        tasks.wizard_update(
            lr.request_uuid,
            payload_key,
            writable_session.user.pk,
            save_when_done=False,
        )
        # reload to get new status after task run
        lr = LoadRequest.fetch(lr.request_uuid)

        # partial update state checks out
        assert lr.progress["resolved"] == 1
        assert lr.progress["unresolved"] == 1
        assert lr.progress["status"] == str(LoadRequest.Status.PROCESSED)

        # saving will save the resolved one
        tasks.wizard_save(lr.request_uuid, writable_session.user.pk)
        # reload to get new status after task run
        lr = LoadRequest.fetch(lr.request_uuid)

        assert lr.progress["resolved"] == 0
        assert lr.progress["unresolved"] == 1
        assert lr.progress["status"] == str(LoadRequest.Status.PROCESSED)

        # updating the remaining record will work
        locator_field = name_from_token(f"locator:{locator_name}".encode())
        type_field = name_from_token(b"type:unknown type")
        value_field = name_from_token(b"x:")
        x_field = name_from_token(b"unit:unknown unit x")
        y_field = name_from_token(b"unit:unknown unit y")
        payload_key = lr.form_payload_save(
            {
                locator_field: '{"new": true}',
                type_field: '{"new": true}',
                value_field: "42",
                x_field: '{"new": true}',
                y_field: '{"new": true}',
                "some_input_id": "",
            }
        )
        tasks.wizard_update(
            lr.request_uuid,
            payload_key,
            writable_session.user.pk,
            save_when_done=False,
        )
        # reload to get new status after task run
        lr = LoadRequest.fetch(lr.request_uuid)

        assert lr.progress["resolved"] == 1
        assert lr.progress["unresolved"] == 0
        assert lr.progress["status"] == str(LoadRequest.Status.PROCESSED)

        # saving again will complete the import
        tasks.wizard_save(lr.request_uuid, writable_session.user.pk)
        # reload to get new status after task run
        lr = LoadRequest.fetch(lr.request_uuid)

        assert lr.progress["resolved"] == 0
        assert lr.progress["unresolved"] == 0
        assert lr.progress["status"] == str(LoadRequest.Status.COMPLETED)


@override_settings(EDD_IMPORT_BULK_ABUSE_CONTACTS=["abuse@example.org"])
def test_task_email_bulk_abuse(writable_session):
    with writable_session.start() as lr:
        tasks.send_bulk_abuse_email(writable_session.user.pk, lr.study_uuid)
        assert len(mail.outbox) == 1
        sent = mail.outbox[0]
        assert "abuse@example.org" in sent.to
        assert lr.study.name in sent.body


@override_settings(EDD_IMPORT_BULK_ABUSE_CONTACTS=[])
def test_task_email_bulk_abuse_with_no_recipients(writable_session):
    with writable_session.start() as lr:
        tasks.send_bulk_abuse_email(writable_session.user.pk, lr.study_uuid)
        assert len(mail.outbox) == 0


def test_form_resolve_locator_to_assay(writable_session):
    assay = main_factory.AssayFactory(study=writable_session.study)
    with writable_session.start() as lr:
        locator_field = name_from_token(b"locator:assay name")
        locator_value = f'{{"type": "Assay", "id": {assay.id}}}'
        form = ResolveTokensForm(
            load_request=lr,
            data={locator_field: locator_value},
        )
    assert form.is_valid()
    assay_id, line_id = form.locator_ids("assay name")
    assert assay_id == assay.id
    assert line_id is not None


def test_form_resolve_locator_to_assay_on_another_study(writable_session):
    assay = main_factory.AssayFactory()
    with writable_session.start() as lr:
        locator_field = name_from_token(b"locator:assay name")
        locator_value = f'{{"type": "Assay", "id": {assay.id}}}'
        form = ResolveTokensForm(
            load_request=lr,
            data={locator_field: locator_value},
        )
    assert form.is_valid()
    assay_id, line_id = form.locator_ids("assay name")
    assert assay_id is None
    assert line_id is None


def test_form_resolve_locator_to_line(writable_session):
    line = main_factory.LineFactory(study=writable_session.study)
    with writable_session.start() as lr:
        locator_field = name_from_token(b"locator:line name")
        locator_value = f'{{"type": "Line", "id": {line.id}}}'
        form = ResolveTokensForm(
            load_request=lr,
            data={locator_field: locator_value},
        )
    assert form.is_valid()
    assay_id, line_id = form.locator_ids("line name")
    assert assay_id is not None
    assert line_id == line.id


def test_form_resolve_locator_to_line_on_another_study(writable_session):
    line = main_factory.LineFactory()
    with writable_session.start() as lr:
        locator_field = name_from_token(b"locator:line name")
        locator_value = f'{{"type": "Line", "id": {line.id}}}'
        form = ResolveTokensForm(
            load_request=lr,
            data={locator_field: locator_value},
        )
    assert form.is_valid()
    assay_id, line_id = form.locator_ids("line name")
    assert assay_id is None
    assert line_id is None


def test_form_resolve_locator_failure(writable_session):
    with writable_session.start() as lr:
        locator_field = name_from_token(b"locator:line name")
        locator_value = '{"type": "Other"}'
        form = ResolveTokensForm(
            load_request=lr,
            data={locator_field: locator_value},
        )
    assert form.is_valid()
    assay_id, line_id = form.locator_ids("line name")
    assert assay_id is None
    assert line_id is None


def test_form_resolve_type(writable_session):
    a_type = main_factory.GenericTypeFactory()
    with writable_session.start() as lr:
        type_field = name_from_token(b"type:type name")
        form = ResolveTokensForm(
            load_request=lr,
            data={type_field: a_type.id},
        )
    assert form.is_valid()
    assert form.type_id("type name") == a_type.id


def test_form_resolve_type_failure(writable_session):
    with writable_session.start() as lr:
        type_field = name_from_token(b"type:type name")
        form = ResolveTokensForm(
            load_request=lr,
            data={type_field: "{}"},
        )
    assert form.is_valid()
    assert form.type_id("type name") is None


def test_form_resolve_unit(writable_session):
    a_unit = main_factory.UnitFactory()
    with writable_session.start() as lr:
        unit_field = name_from_token(b"unit:unit name")
        form = ResolveTokensForm(
            load_request=lr,
            data={unit_field: a_unit.id},
        )
    assert form.is_valid()
    assert form.unit_id("unit name") == a_unit.id
    assert form.get_count_created_units() == 0


def test_form_resolve_unit_to_new_unit(writable_session):
    with writable_session.start() as lr:
        unit_field = name_from_token(b"unit:unit name")
        form = ResolveTokensForm(
            load_request=lr,
            data={unit_field: '{"new": true}'},
        )
    assert form.is_valid()
    assert form.unit_id("unit name") is not None
    assert form.get_count_created_units() == 1


def test_form_resolve_unit_failure(writable_session):
    with writable_session.start() as lr:
        unit_field = name_from_token(b"unit:unit name")
        form = ResolveTokensForm(
            load_request=lr,
            data={unit_field: "{}"},
        )
    assert form.is_valid()
    assert form.unit_id("unit name") is None
    assert form.get_count_created_units() == 0


def test_form_resolve_value_blank(writable_session):
    with writable_session.start() as lr:
        writable_session.create_unresolved_record(lr)
        tasks.submit_process(lr, writable_session.user, background=False)
        value_field = name_from_token(b"x:")
        form = ResolveTokensForm(load_request=lr, data={value_field: ""})
    # form still validates when it has no data
    assert form.is_valid()


def test_form_resolve_value_from_form(writable_session):
    with writable_session.start() as lr:
        writable_session.create_unresolved_record(lr)
        tasks.submit_process(lr, writable_session.user, background=False)
        value_field = name_from_token(b"x:")
        form = ResolveTokensForm(load_request=lr, data={value_field: "12.34"})
    assert form.is_valid()


def test_form_resolve_value_from_time(writable_session):
    with writable_session.start() as lr:
        locator = writable_session.create_unresolved_record(lr)
        record = next(lr.request.unresolved())
        time = MetadataType.system("Time")
        assay = main_factory.AssayFactory(
            name=locator,
            protocol=lr.protocol,
            study=lr.study,
        )
        assay.metadata_add(time, 12)
        assay.save()
        record.assay_id = assay.id
        form = ResolveTokensForm(load_request=lr, data={})
    assert form.is_valid()
    assert form.values(record) == [12]


def test_task_save_with_ready_records(writable_session):
    with writable_session.start() as lr:
        writable_session.create_ready_records(lr, 10)
        tasks.submit_save(lr, writable_session.user, background=False)

    saved_measurements = Measurement.objects.filter(study_id=writable_session.study.id)
    assert saved_measurements.count() == 10


def test_task_save_multiple_imports(writable_session):
    with writable_session.start() as lr:
        # save one set of measurements
        writable_session.create_ready_records(lr, 10)
        tasks.submit_save(lr, writable_session.user, background=False)
        # save another set of measurements
        lr = LoadRequest.fetch(lr.request_uuid)
        writable_session.create_ready_records(lr, 10)
        tasks.submit_save(lr, writable_session.user, background=False)

    saved_measurements = Measurement.objects.filter(study_id=writable_session.study.id)
    assert saved_measurements.count() == 20


def test_task_save_with_transaction_error(writable_session):
    with writable_session.start() as lr:
        writable_session.create_ready_records(lr, 10)
        with patch.object(DatabaseWriter, "persist_batch") as stub_method:
            stub_method.side_effect = Exception("Oops, transaction error")
            tasks.submit_save(lr, writable_session.user, background=False)
        updated_lr = LoadRequest.fetch(lr.request_uuid)

    saved_measurements = Measurement.objects.filter(study_id=writable_session.study.id)
    assert saved_measurements.count() == 0
    assert updated_lr.status == LoadRequest.Status.FAILED


def test_full_import_flow_generic(writable_session):
    csv = "text/csv"
    with writable_session.start(layout_key="generic") as lr:
        main_factory.LineFactory(name="A", study=lr.study)
        main_factory.LineFactory(name="B", study=lr.study)
        with factory.load_test_file("generic_import.csv") as file:
            file.content_type = csv
            lr.upload({"file": file})
        tasks.submit_process(lr, writable_session.user, background=False)
        # need to refresh
        lr = LoadRequest.fetch(lr.request_uuid)
        tasks.submit_save(lr, writable_session.user, background=False)

    saved_measurements = Measurement.objects.filter(study_id=writable_session.study.id)
    assert saved_measurements.count() == 2


def test_full_import_flow_skyline(writable_session):
    csv = "text/csv"
    with writable_session.start(layout_key="skyline") as lr:
        main_factory.LineFactory(name="arcA", study=lr.study)
        main_factory.LineFactory(name="BW1", study=lr.study)
        with factory.load_test_file("skyline.csv") as file:
            file.content_type = csv
            lr.upload({"file": file})
        tasks.submit_process(lr, writable_session.user, background=False)
        # need to refresh
        lr = LoadRequest.fetch(lr.request_uuid)
        # assigning A B C D "proteins" to generated types
        # and setting time to 24
        form_payload = {
            "dHlwZTpB": main_factory.ProteinFactory().pk,
            "dHlwZTpC": main_factory.ProteinFactory().pk,
            "dHlwZTpD": main_factory.ProteinFactory().pk,
            "dHlwZTpE": main_factory.ProteinFactory().pk,
            "eDo": "24",
        }
        payload_key = lr.form_payload_save(form_payload)
        tasks.submit_update(lr, payload_key, writable_session.user, background=False)
        # need to refresh
        lr = LoadRequest.fetch(lr.request_uuid)
        # now can save
        tasks.submit_save(lr, writable_session.user, background=False)

    saved_measurements = Measurement.objects.filter(study_id=writable_session.study.id)
    assert saved_measurements.count() == 7


def test_full_import_task_flow_ambr(writable_session):
    excel = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    with writable_session.start(layout_key="ambr") as lr:
        main_factory.LineFactory(name="HT1", study=lr.study)
        main_factory.LineFactory(name="HT2", study=lr.study)
        with factory.load_test_file("ambr_test_data.xlsx") as file:
            file.content_type = excel
            lr.upload({"file": file})
        tasks.submit_process(lr, writable_session.user, background=False)
        # need to refresh
        lr = LoadRequest.fetch(lr.request_uuid)
        tasks.submit_save(lr, writable_session.user, background=False)

    saved_measurements = Measurement.objects.filter(study_id=writable_session.study.id)
    assert saved_measurements.count() == 10
