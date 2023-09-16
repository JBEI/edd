import http

import pytest
from django.test import override_settings
from django.urls import reverse
from pytest_django import asserts

from edd import SafeExceptionReporterFilter
from edd.profile.factory import UserFactory


@pytest.fixture
def reporter_filter():
    return SafeExceptionReporterFilter()


def test_cleanse_setting_benign_value_not_obfuscated(reporter_filter):
    # regular settings are unchanged
    original = "Some valid value"
    cleansed = reporter_filter.cleanse_setting("BENIGN", original)
    assert original == cleansed


def test_cleanse_setting_replace_url_password(reporter_filter):
    # settings with keys matching URL or BACKEND are parsed, then
    # re-assembled with any password field obfuscated
    original = "http://user:12345@example.com/some/path/"
    cleansed = reporter_filter.cleanse_setting("SOME_URL", original)
    assert original != cleansed
    assert "12345" not in cleansed


def test_cleanse_setting_unchanged_non_url_key(reporter_filter):
    # when setting key does not contain URL or BACKEND,
    # no attempt to parse and obfuscate occurs
    original = "http://user:12345@example.com/some/path/"
    cleansed = reporter_filter.cleanse_setting("NOT_REPLACED", original)
    assert original == cleansed


def test_cleanse_setting_unchanged_non_string(reporter_filter):
    # when setting value is not a string, no attempt to parse happens
    original = 42
    cleansed = reporter_filter.cleanse_setting("BACKEND_COUNT", original)
    assert original == cleansed


def test_cleanse_setting_invalid_url_unchanged(reporter_filter):
    # adding an unmatched square bracket will trigger exception handling
    original = "http://user:12345@ex[ample.com/"
    cleansed = reporter_filter.cleanse_setting("SOME_URL", original)
    assert original == cleansed


def test_docs_loads_without_error(client):
    # no auth needed
    response = client.get(reverse("rest:docs"))
    assert response.status_code == http.HTTPStatus.OK


@pytest.mark.django_db
def test_graphiql_loads_without_error(client):
    client.force_login(UserFactory())
    response = client.get(reverse("graphiql"), HTTP_ACCEPT="text/html")
    assert response.status_code == http.HTTPStatus.OK


def test_wsgi_application_loads():
    from edd import wsgi

    assert callable(wsgi.application)


def test_not_running_with_debug_enabled():
    from django.conf import settings

    assert settings.DEBUG is False
    assert "debug_toolbar" not in settings.INSTALLED_APPS


@override_settings(EDD_ALLOW_SIGNUP=False)
def test_signup_page_when_signup_is_disabled(client):
    response = client.get(reverse("account_signup"))
    asserts.assertTemplateUsed(response, "account/signup_closed.html")


@override_settings(EDD_ALLOW_SIGNUP=lambda request: False)
def test_signup_page_when_signup_is_a_function(client):
    response = client.get(reverse("account_signup"))
    asserts.assertTemplateUsed(response, "account/signup_closed.html")


@override_settings(EDD_ALLOW_SIGNUP=True)
def test_signup_page_when_signup_is_enabled(client, db):
    response = client.get(reverse("account_signup"))
    # note: something in the signup view requires a database request
    asserts.assertTemplateUsed(response, "account/signup.html")


@override_settings(EDD_ALLOW_SIGNUP=None)
def test_signup_page_when_signup_is_none(client, db):
    response = client.get(reverse("account_signup"))
    # note: something in the signup view requires a database request
    asserts.assertTemplateUsed(response, "account/signup.html")


@override_settings(EDD_ALLOW_SIGNUP="edd.account.deny_signup")
def test_signup_page_when_signup_is_module_string(client):
    response = client.get(reverse("account_signup"))
    asserts.assertTemplateUsed(response, "account/signup_closed.html")


@override_settings(EDD_ALLOW_SIGNUP=42)
def test_signup_page_when_signup_is_number(client, db):
    # numbers are not a valid setting, but setting one shows default open behavior
    response = client.get(reverse("account_signup"))
    # note: something in the signup view requires a database request
    asserts.assertTemplateUsed(response, "account/signup.html")


def test_reset_password_with_unknown_email(client, db):
    url = reverse("account_reset_password")
    response = client.post(url, {"email": "invalid-email@example.net"}, follow=True)
    asserts.assertRedirects(response, reverse("account_reset_password_done"))
    asserts.assertTemplateUsed(response, "account/password_reset_done.html")


def test_a11y_added_to_email_page(client, db):
    url = reverse("account_email")
    client.force_login(UserFactory())
    response = client.get(url)
    asserts.assertTemplateUsed(response, "account/email.html")
    # check the a11y attributes are there
    asserts.assertContains(response, "aria-invalid")


def test_a11y_added_to_password_change_page(client, db):
    url = reverse("account_change_password")
    client.force_login(UserFactory())
    response = client.get(url)
    asserts.assertTemplateUsed(response, "account/password_change.html")
    # check the a11y attributes are there
    asserts.assertContains(response, "aria-invalid")


def test_a11y_added_to_password_set_page(client, db):
    url = reverse("account_set_password")
    # make password unusable
    user = UserFactory(password="!")
    client.force_login(user)
    response = client.get(url, follow=True)
    asserts.assertTemplateUsed(response, "account/password_set.html")
    # check the a11y attributes are there
    asserts.assertContains(response, "aria-invalid")


@override_settings(
    EDD_APPROVAL_CONTACT="approver@example.net",
    EDD_ALLOW_SIGNUP=True,
)
def test_new_user_confirm_email_with_approver(client, db):
    from allauth.account.models import EmailAddress, EmailConfirmationHMAC

    user_info = UserFactory.build()
    signup_url = reverse("account_signup")
    password = "Super1Secure.Password"
    # signup
    signup_response = client.post(
        signup_url,
        {"email": user_info.email, "password1": password, "password2": password},
        follow=True,
    )
    assert signup_response.status_code == http.HTTPStatus.OK
    asserts.assertTemplateUsed(
        signup_response,
        "account/verification_sent.html",
    )
    # simulate clicking link from email
    email = EmailAddress.objects.get(email=user_info.email)
    conf = EmailConfirmationHMAC(email)
    url = reverse("account_confirm_email", kwargs={"key": conf.key})
    response = client.post(url)
    # email sent to account approval contact
    asserts.assertTemplateUsed(response, "account/email/approval_requested_subject.txt")
