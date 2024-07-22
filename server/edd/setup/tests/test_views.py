from http import HTTPStatus
from unittest.mock import patch

from django.test import override_settings
from django.urls import reverse
from pytest_django import asserts

from main.tests.factory import StudyFactory

AJAX_HEADER = {"X-Requested-With": "XMLHttpRequest"}


def test_upload_get_request_with_anonymous_user_redirects(client, readable_session):
    url = readable_session.url("main:setup:start")
    response = client.get(url, follow=True)
    login_url = reverse("account_login")
    asserts.assertRedirects(response, f"{login_url}?next={url}")


def test_upload_get_request_is_not_allowed(client, readable_session):
    client.force_login(readable_session.user)
    url = readable_session.url("main:setup:start")
    response = client.get(url, follow=True)
    assert response.status_code == HTTPStatus.METHOD_NOT_ALLOWED


def test_upload_post_without_write_permission(client, readable_session):
    client.force_login(readable_session.user)
    url = readable_session.url("main:setup:start")
    response = client.post(url, {}, follow=True)
    assert response.status_code == HTTPStatus.FORBIDDEN


def test_upload_post_without_file(client, writable_session):
    client.force_login(writable_session.user)
    url = writable_session.url("main:setup:start")
    response = client.post(url, {}, follow=True)

    study_url = writable_session.url("main:overview")
    asserts.assertRedirects(response, study_url)
    asserts.assertContains(response, "Problem uploading Experiment Setup file")


def test_upload_post_ajax_without_file(client, writable_session):
    client.force_login(writable_session.user)
    url = writable_session.url("main:setup:start")
    response = client.post(url, {}, follow=True, headers=AJAX_HEADER)
    assert response.status_code == HTTPStatus.BAD_REQUEST


def test_upload_post_with_file(client, writable_session):
    client.force_login(writable_session.user)
    url = writable_session.url("main:setup:start")
    payload = {"file": writable_session.create_upload_file("somefile.txt")}
    # patching to avoid actually submitting task
    with patch("edd.setup.tasks.setup_process") as task:
        response = client.post(url, payload, follow=True)

    task.delay.assert_called_once()
    asserts.assertTemplateUsed(response, "edd/setup/interpret.html")
    asserts.assertContains(response, "somefile.txt")


def test_upload_post_ajax_with_file(client, writable_session):
    client.force_login(writable_session.user)
    url = writable_session.url("main:setup:start")
    payload = {"file": writable_session.create_upload_file("somefile.txt")}
    # patching to avoid actually submitting task
    with patch("edd.setup.tasks.setup_process") as task:
        response = client.post(url, payload, follow=True, headers=AJAX_HEADER)

    task.delay.assert_called_once()
    assert response.status_code == HTTPStatus.OK
    json = response.json()
    assert json["status"] == "Ready"
    # test won't know the generated UUID, so make sure it's different from start URL
    assert json["url"].startswith(url)
    assert json["url"] != url


def test_interpret_get_with_unknown_id(client, writable_session):
    client.force_login(writable_session.user)
    # this ID will never be a valid experiment setup UUID
    url = writable_session.url("main:setup:interpret", uuid="badbeef")

    response = client.get(url, follow=True)
    assert response.status_code == HTTPStatus.FORBIDDEN


def test_interpret_get_with_other_study_id(client, writable_session):
    other_study = StudyFactory()
    client.force_login(writable_session.user)
    with writable_session.setup() as setup:
        # trying to open Experiment Setup URL from other study instead of session study
        url = writable_session.url(
            "main:setup:interpret",
            slug=other_study.slug,
            uuid=setup.request_uuid,
        )
        response = client.get(url, follow=True)

    assert response.status_code == HTTPStatus.NOT_FOUND


def test_interpret_get_with_resolved_records(client, writable_session):
    client.force_login(writable_session.user)
    filename = writable_session.path("simple.csv")
    with writable_session.setup(upload_file=filename) as setup:
        url = writable_session.url("main:setup:interpret", uuid=setup.request_uuid)
        response = client.get(url, follow=True)

    asserts.assertTemplateUsed(response, "edd/setup/interpret.html")
    asserts.assertTemplateUsed(response, "edd/setup/interpret-commit.html")
    assert response.status_code == HTTPStatus.OK


def test_interpret_get_with_unresolved_records(client, writable_session):
    client.force_login(writable_session.user)
    filename = writable_session.path("unmatched.csv")
    with writable_session.setup(upload_file=filename) as setup:
        url = writable_session.url("main:setup:interpret", uuid=setup.request_uuid)
        response = client.get(url, follow=True)

    asserts.assertTemplateUsed(response, "edd/setup/interpret.html")
    asserts.assertTemplateUsed(response, "edd/setup/interpret-form.html")
    assert response.status_code == HTTPStatus.OK


def test_interpret_get_ajax(client, writable_session):
    client.force_login(writable_session.user)
    filename = writable_session.path("simple.csv")
    with writable_session.setup(upload_file=filename) as setup:
        url = writable_session.url("main:setup:interpret", uuid=setup.request_uuid)
        response = client.get(url, follow=True, headers=AJAX_HEADER)

    asserts.assertTemplateNotUsed(response, "edd/setup/interpret.html")
    asserts.assertTemplateUsed(response, "edd/setup/interpret-commit.html")
    assert response.status_code == HTTPStatus.OK


@override_settings(EDD_WIZARD_TOKENS_PER_PAGE=1)
def test_interpret_get_has_prev_and_next_buttons(client, writable_session):
    client.force_login(writable_session.user)
    filename = writable_session.path("unmatched.csv")
    with writable_session.setup(upload_file=filename) as setup:
        url = writable_session.url("main:setup:interpret", uuid=setup.request_uuid)
        next_url = writable_session.url(
            "main:setup:interpret-page",
            uuid=setup.request_uuid,
            page=2,
        )
        prev_url = writable_session.url(
            "main:setup:interpret-page",
            uuid=setup.request_uuid,
            page=1,
        )
        first_response = client.get(url, headers=AJAX_HEADER)
        next_response = client.get(next_url, headers=AJAX_HEADER)

    asserts.assertTemplateNotUsed(first_response, "edd/setup/interpret.html")
    asserts.assertTemplateNotUsed(next_response, "edd/setup/interpret.html")
    asserts.assertTemplateUsed(first_response, "edd/setup/interpret-form.html")
    asserts.assertTemplateUsed(next_response, "edd/setup/interpret-form.html")
    asserts.assertContains(first_response, next_url)
    asserts.assertContains(next_response, prev_url)


def test_interpret_get_showing_progress_bar(client, writable_session):
    client.force_login(writable_session.user)
    filename = writable_session.path("unmatched.csv")
    with writable_session.setup(upload_file=filename) as setup:
        url = writable_session.url("main:setup:interpret", uuid=setup.request_uuid)
        # put into UPDATING status like it would be if still processing file
        setup.transition(setup.Status.UPDATING)
        response = client.get(url, headers=AJAX_HEADER)

    asserts.assertTemplateUsed(response, "edd/setup/interpret-progress.html")
    assert response.status_code == HTTPStatus.OK


def test_interpret_post_abort(client, writable_session):
    client.force_login(writable_session.user)
    filename = writable_session.path("simple.csv")
    with writable_session.setup(upload_file=filename) as setup:
        url = writable_session.url("main:setup:interpret", uuid=setup.request_uuid)
        # patching to confirm task isn't submitted
        with patch("edd.setup.tasks.setup_update") as task:
            response = client.post(url, {"abort": "1"}, follow=True)

    asserts.assertContains(response, "Experiment Setup cancelled.")
    task.delay.assert_not_called()


def test_interpret_post_form_with_errors(client, writable_session):
    client.force_login(writable_session.user)
    filename = writable_session.path("unmatched.csv")
    with writable_session.setup(upload_file=filename) as setup:
        url = writable_session.url("main:setup:interpret", uuid=setup.request_uuid)
        # patching to confirm task isn't submitted
        with patch("edd.setup.tasks.setup_update") as task:
            # a POST without names for form fields will not validate
            response = client.post(url, {"random_field": "foobar"}, follow=True)

    assert response.status_code == HTTPStatus.BAD_REQUEST
    task.delay.assert_not_called()
    asserts.assertTemplateUsed(response, "edd/setup/interpret-form.html")


def test_interpret_post_form_success(client, writable_session):
    client.force_login(writable_session.user)
    filename = writable_session.path("unmatched.csv")
    with writable_session.setup(upload_file=filename) as setup:
        url = writable_session.url("main:setup:interpret", uuid=setup.request_uuid)
        # patching to avoid actually submitting task
        with patch("edd.setup.tasks.setup_update") as task:
            # one of the unresolved metadata types will get name "bWV0YTpXb3JsZA"
            response = client.post(url, {"bWV0YTpXb3JsZA": '{"new":1}'}, follow=True)

    task.delay.assert_called_once()
    asserts.assertTemplateUsed(response, "edd/setup/interpret-form.html")
    asserts.assertContains(response, "Updating Experiment Setup")


def test_interpret_post_save(client, writable_session):
    client.force_login(writable_session.user)
    filename = writable_session.path("simple.csv")
    with writable_session.setup(upload_file=filename) as setup:
        url = writable_session.url("main:setup:interpret", uuid=setup.request_uuid)
        # patching to avoid actually submitting task
        with patch("edd.setup.tasks.setup_commit") as task:
            response = client.post(url, {"save": "1"}, follow=True)

    task.delay.assert_called_once()
    asserts.assertTemplateUsed(response, "edd/setup/save.html")
