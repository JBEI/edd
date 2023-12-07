from decimal import Decimal
from http import HTTPStatus
from unittest.mock import patch

from django.test import override_settings
from django.urls import reverse
from pytest import mark
from pytest_django import asserts

from main.models import Measurement, StudyPermission
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


# avoid writing "file" to disk and needing cleanup
@override_settings(EDD_LOAD_STORAGE="django.core.files.storage.InMemoryStorage")
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


@override_settings(EDD_LOAD_STORAGE="django.core.files.storage.InMemoryStorage")
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


# avoid writing "file" to disk and needing cleanup
@override_settings(EDD_LOAD_STORAGE="django.core.files.storage.InMemoryStorage")
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


# avoid writing "file" to disk and needing cleanup
@override_settings(EDD_LOAD_STORAGE="django.core.files.storage.InMemoryStorage")
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
        updated = LoadRequest.fetch(lr.request)
    assert updated.status == LoadRequest.Status.FAILED


def test_task_process_success(writable_session):
    with writable_session.start(layout_key="skyline") as lr:
        writable_session.simple_skyline_upload(lr)
        tasks.submit_process(lr, writable_session.user, background=False)
        progress = LoadRequest.fetch(lr.request).progress
    assert progress["resolved"] == 1
    assert progress["unresolved"] == 0


def test_task_process_with_error(writable_session):
    with writable_session.start(layout_key="skyline") as lr:
        writable_session.simple_skyline_upload(lr)
        with patch.object(LoadRequest, "resolve_batch") as stub_method:
            stub_method.side_effect = Exception("Oops, resolve error")
            tasks.submit_process(lr, writable_session.user, background=False)
        progress = LoadRequest.fetch(lr.request).progress
    assert progress["resolved"] == 0
    assert progress["unresolved"] == 0
    assert progress["status"] == "Failed"


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
    locator_name, records = writable_session.create_unresolved_records()
    with writable_session.start() as lr:
        assert lr.ok_to_process()
        lr.process(records, writable_session.user)
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
    locator_name, records = writable_session.create_unresolved_records()
    with writable_session.start() as lr:
        assert lr.ok_to_process()
        lr.process(records, writable_session.user)
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
    locator_name, records = writable_session.create_unresolved_records()
    with writable_session.start() as lr:
        assert lr.ok_to_process()
        lr.process(records, writable_session.user)
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


def test_reactless_import_interpret_post_with_errors(client, writable_session):
    client.force_login(writable_session.user)
    locator_name, records = writable_session.create_unresolved_records()
    with writable_session.start() as lr:
        assert lr.ok_to_process()
        lr.process(records, writable_session.user)
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
    locator_name, records = writable_session.create_unresolved_records()
    with writable_session.start() as lr:
        assert lr.ok_to_process()
        lr.process(records, writable_session.user)
        lr.store()
        line = main_factory.LineFactory(study=writable_session.study)
        url = writable_session.url("main:load:interpret", uuid=lr.request_uuid)
        field_name = name_from_token(f"locator:{locator_name}".encode())
        # patching to avoid actually submitting task
        with patch("edd.load.tasks.wizard_update") as task:
            response = client.post(url, {field_name: line.id}, follow=True)
    assert response.status_code == HTTPStatus.OK
    asserts.assertTemplateUsed(response, "edd/load/interpret.html")
    # real task isn't called yet, so we get the progress bar view
    asserts.assertTemplateUsed(response, "edd/load/interpret-progress.html")
    task.delay.assert_called_once()


def test_reactless_import_interpret_post_abort(client, writable_session):
    client.force_login(writable_session.user)
    locator_name, records = writable_session.create_unresolved_records()
    with writable_session.start() as lr:
        assert lr.ok_to_process()
        lr.process(records, writable_session.user)
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
    locator_name, records = writable_session.create_unresolved_records()
    with writable_session.start() as lr:
        assert lr.ok_to_process()
        lr.process(records, writable_session.user)
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


def test_reactless_import_interpret_post_save_on_aborted(client, writable_session):
    client.force_login(writable_session.user)
    locator_name, records = writable_session.create_unresolved_records()
    with writable_session.start() as lr:
        assert lr.ok_to_process()
        lr.process(records, writable_session.user)
        lr.transition(lr.Status.ABORTED)
        url = writable_session.url("main:load:interpret", uuid=lr.request_uuid)
        save_task = patch("edd.load.tasks.wizard_save")
        # patching to avoid actually submitting task
        with save_task as save_task:
            response = client.post(
                url,
                {"save": "1"},
                follow=True,
            )
    asserts.assertContains(
        response,
        "EDD detected an inconsistent state",
        status_code=HTTPStatus.CONFLICT,
    )
    save_task.delay.assert_not_called()


def test_reactless_import_interpret_all_resolved(client, writable_session):
    client.force_login(writable_session.user)
    records = writable_session.create_resolved_records()
    with writable_session.start() as lr:
        assert lr.ok_to_process()
        lr.process(records, writable_session.user)
        url = writable_session.url("main:load:interpret", uuid=lr.request_uuid)
        response = client.get(url)
    asserts.assertTemplateUsed(response, "edd/load/interpret.html")
    asserts.assertTemplateUsed(response, "edd/load/interpret-commit.html")
    assert response.status_code == HTTPStatus.OK


def test_task_update_with_invalid_id(writable_session):
    # task should "finish", as there's nothing to do with bad IDs
    tasks.wizard_update("bad_uuid", "invalid_uuid_payload", writable_session.user.pk)


def test_task_update_with_invalid_form(writable_session):
    locator_name, records = writable_session.create_unresolved_records()
    with writable_session.start() as lr:
        assert lr.ok_to_process()
        lr.process(records, writable_session.user)
        field_name = name_from_token(f"locator:{locator_name}".encode())
        # passing invalid JSON to trigger invalid form
        payload_key = lr.form_payload_save({field_name: "{"})
        tasks.wizard_update(lr.request, payload_key, writable_session.user.pk)
        progress = LoadRequest.fetch(lr.request).progress
    # overall status doesn't change from Processed, no change in (un)resolved
    assert progress["status"] == str(LoadRequest.Status.PROCESSED)
    assert progress["resolved"] == 0
    assert progress["unresolved"] == 1


@mark.parametrize("save", (True, False))
def test_task_update(writable_session, save):
    locator_name, records = writable_session.create_unresolved_records()
    line = main_factory.LineFactory(study=writable_session.study)
    a_type = main_factory.GenericTypeFactory()
    a_unit = main_factory.UnitFactory()
    with writable_session.start() as lr:
        assert lr.ok_to_process()
        lr.process(records, writable_session.user)
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
            assert lr.ok_to_process()
            tasks.wizard_update(
                lr.request,
                payload_key,
                writable_session.user.pk,
                save_when_done=save,
            )
        progress = LoadRequest.fetch(lr.request).progress
    assert progress["resolved"] == 1
    assert progress["unresolved"] == 0
    assert save_task.delay.called == save
    # overall status doesn't change from Processed when not saving
    # but does change to Saving when flag is set
    expected_status = "Saving" if save else "Processed"
    assert progress["status"] == expected_status
    assert save_task.delay.call_count == int(save)


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


def test_form_resolve_unit_to_new_unit(writable_session):
    with writable_session.start() as lr:
        unit_field = name_from_token(b"unit:unit name")
        form = ResolveTokensForm(
            load_request=lr,
            data={unit_field: '{"new": true}'},
        )
    assert form.is_valid()
    assert form.unit_id("unit name") is not None


def test_form_resolve_unit_failure(writable_session):
    with writable_session.start() as lr:
        unit_field = name_from_token(b"unit:unit name")
        form = ResolveTokensForm(
            load_request=lr,
            data={unit_field: "{}"},
        )
    assert form.is_valid()
    assert form.unit_id("unit name") is None


def test_form_resolve_value_blank(writable_session):
    with writable_session.start() as lr:
        locator_name, records = writable_session.create_unresolved_records()
        assert lr.ok_to_process()
        lr.process(records, writable_session.user)
        value_field = name_from_token(b"x:")
        form = ResolveTokensForm(load_request=lr, data={value_field: ""})
    # form still validates when it has no data
    assert form.is_valid()
    assert form.values(records[0]) == []


def test_form_resolve_value_from_form(writable_session):
    with writable_session.start() as lr:
        locator_name, records = writable_session.create_unresolved_records()
        assert lr.ok_to_process()
        lr.process(records, writable_session.user)
        value_field = name_from_token(b"x:")
        form = ResolveTokensForm(load_request=lr, data={value_field: "12.34"})
    assert form.is_valid()
    assert form.values(records[0]) == [Decimal("12.34")]


def test_task_save_with_ready_records(writable_session):
    with writable_session.start() as lr:
        records = list(writable_session.create_ready_records(10))
        assert lr.ok_to_process()
        lr.process(records, writable_session.user)
        tasks.submit_save(lr, writable_session.user, background=False)

    saved_measurements = Measurement.objects.filter(study_id=writable_session.study.id)
    assert saved_measurements.count() == 10


def test_task_save_multiple_imports(writable_session):
    with writable_session.start() as lr:
        # save one set of measurements
        records = list(writable_session.create_ready_records(10))
        assert lr.ok_to_process()
        lr.process(records, writable_session.user)
        tasks.submit_save(lr, writable_session.user, background=False)
        # transition back to allow adding more
        lr = lr.fetch(lr.request_uuid)
        lr.transition(lr.Status.PROCESSED)
        # save another set of measurements
        records = list(writable_session.create_ready_records(10))
        assert lr.ok_to_process()
        lr.process(records, writable_session.user)
        tasks.submit_save(lr, writable_session.user, background=False)

    saved_measurements = Measurement.objects.filter(study_id=writable_session.study.id)
    assert saved_measurements.count() == 20


def test_task_save_with_transaction_error(writable_session):
    with writable_session.start() as lr:
        records = list(writable_session.create_ready_records(10))
        assert lr.ok_to_process()
        lr.process(records, writable_session.user)
        with patch.object(DatabaseWriter, "persist_batch") as stub_method:
            stub_method.side_effect = Exception("Oops, transaction error")
            tasks.submit_save(lr, writable_session.user, background=False)
        updated_lr = LoadRequest.fetch(lr.request)

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
        lr = LoadRequest.fetch(lr.request)
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
        lr = LoadRequest.fetch(lr.request)
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
        lr = LoadRequest.fetch(lr.request)
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
        lr = LoadRequest.fetch(lr.request)
        tasks.submit_save(lr, writable_session.user, background=False)

    saved_measurements = Measurement.objects.filter(study_id=writable_session.study.id)
    assert saved_measurements.count() == 10
