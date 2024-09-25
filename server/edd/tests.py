import http

import pytest
from allauth.account import models as allauth_models
from django.core import mail
from django.core.exceptions import ValidationError
from django.template import Context, Template
from django.test import override_settings
from django.urls import NoReverseMatch, reverse
from django.utils.translation import gettext_lazy as _
from pytest_django import asserts

from edd import SafeExceptionReporterFilter, utilities
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


def test_cleanse_setting_ignored_key(reporter_filter):
    # the MESSAGE_TAGS setting is a dict with enum keys, and is ignored explicitly
    original = {10: "secondary", 20: "warning"}
    cleansed = reporter_filter.cleanse_setting("MESSAGE_TAGS", original)
    assert original == cleansed


def test_cleanse_setting_subkey_not_a_string(reporter_filter):
    # while MESSAGE_TAGS is ignored, any other setting with non-str keys should warn
    original = {10: "secondary", 20: "warning"}
    cleansed = reporter_filter.cleanse_setting("SOME_SETTING", original)
    assert original == cleansed


def test_docs_loads_without_error(client):
    # no auth needed
    response = client.get(reverse("rest:docs"))
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


def do_account_signup(client, faker):
    from allauth.account.models import EmailAddress, EmailConfirmationHMAC

    # do the signup request
    user_info = UserFactory.build()
    signup_url = reverse("account_signup")
    password = faker.password()
    # signup
    signup_response = client.post(
        signup_url,
        {"email": user_info.email, "password1": password, "password2": password},
        follow=True,
    )
    assert signup_response.status_code == http.HTTPStatus.OK
    assert len(mail.outbox) == 1
    assert mail.outbox[0].to == [user_info.email]
    asserts.assertTemplateUsed(signup_response, "account/verification_sent.html")

    # reset the mail outbox
    mail.outbox = []

    # get the confirm email link
    email = EmailAddress.objects.get(email=user_info.email)
    conf = EmailConfirmationHMAC(email)
    return reverse("account_confirm_email", kwargs={"key": conf.key})


@override_settings(EDD_APPROVAL_CONTACT=None, EDD_ALLOW_SIGNUP=True)
def test_new_user_confirm_email(client, db, faker):
    url = do_account_signup(client, faker)
    # click the confirm email button
    response = client.post(url, follow=True)
    assert response.status_code == http.HTTPStatus.OK
    # no new email
    assert len(mail.outbox) == 0


@override_settings(EDD_APPROVAL_CONTACT="approver@example.net", EDD_ALLOW_SIGNUP=True)
def test_new_user_confirm_email_with_approver(client, db, faker):
    url = do_account_signup(client, faker)
    # click the confirm email button
    response = client.post(url, follow=True)
    assert response.status_code == http.HTTPStatus.OK
    # email sent to account approval contact
    assert len(mail.outbox) == 1
    assert mail.outbox[0].to == ["approver@example.net"]


def test_regular_mail_gets_wrapped(faker):
    mail.send_mail(
        "subject",
        faker.paragraph(nb_sentences=10),
        "from@example.com",
        ["to@example.com"],
        fail_silently=False,
    )
    assert len(mail.outbox) == 1
    # very long paragraph gets split into multiple lines
    for line in mail.outbox[0].body.splitlines():
        assert len(line) < 100


@override_settings(ADMINS=(("BOFH", "bofh@example.net"),))
def test_admin_mail_gets_wrapped(faker):
    mail.mail_admins(
        "subject",
        faker.paragraph(nb_sentences=10),
        fail_silently=False,
    )
    # one mail to the single admin
    assert len(mail.outbox) == 1
    # very long paragraph gets split into multiple lines
    for line in mail.outbox[0].body.splitlines():
        assert len(line) < 100


def test_json_encode_extra_types(faker):
    payload = {
        "date": faker.date_object(),
        "datetime": faker.date_time(),
        "decimal": faker.pydecimal(),
        "dict": {"subkey": 42},
        "list": [],
        "number": faker.pyfloat(),
        "set": {faker.word(), faker.word()},
        "string": faker.sentence(),
        "translation": _("Study Name"),
        "uuid": faker.uuid4(cast_to=None),
    }
    encoded = utilities.JSONEncoder.dumps(payload)
    # sanity check that the correct items are in the encoded JSON
    assert payload["string"] in encoded
    assert "Study Name" in encoded
    assert "__datetime__" in encoded


def test_json_encode_unknown_types():
    with pytest.raises(TypeError):
        utilities.JSONEncoder.dumps({"key": object()})


def test_json_decode_datetime():
    encoded = """
    {
        "string": "foobar",
        "date": {"__type__": "__datetime__", "value": "1999-12-31T23:59:59.999999"}
    }
    """
    decoded = utilities.JSONDecoder.loads(encoded)
    assert decoded["string"] == "foobar"
    assert decoded["date"].timestamp() == 946713599.999999


def test_storage_hash_handles_missing_files():
    storage = utilities.StaticFilesStorage()
    with pytest.warns(UserWarning):
        assert storage.hashed_name("bs5/bootstrap.min.css.map") == "bs5/bootstrap.min.css.map"


def test_LBL_password_validator(faker):
    validator = utilities.LBNLTemplate2Validator()
    with pytest.raises(ValidationError):
        validator.validate(faker.password(special_chars=False))
    with pytest.raises(ValidationError):
        validator.validate(faker.password(digits=False))
    with pytest.raises(ValidationError):
        validator.validate(faker.password(upper_case=False))
    with pytest.raises(ValidationError):
        validator.validate(faker.password(lower_case=False))


@override_settings(AUTHENTICATION_BACKENDS=("edd.auth_backend.AllauthLDAPBackend",))
def test_login_with_mock_ldap(client, db):
    user_email = "developer.one@ldapmock.local"

    success = client.login(username=user_email, password="password")

    assert success
    created_email = allauth_models.EmailAddress.objects.filter(email=user_email)
    assert created_email.exists()


@override_settings(AUTHENTICATION_BACKENDS=("edd.auth_backend.AllauthLDAPBackend",))
def test_login_with_mock_ldap_matching_email(client, db):
    existing_user = UserFactory()
    existing_email = allauth_models.EmailAddress(
        email="developer.two@ldapmock.local",
        user=existing_user,
        verified=True,
    )
    existing_email.save()

    success = client.login(username="developer.two@ldapmock.local", password="password")

    assert success


@override_settings(AUTHENTICATION_BACKENDS=("edd.auth_backend.AllauthLDAPBackend",))
def test_login_with_mock_ldap_wrong_password(client, db):
    user_email = "developer.one@ldapmock.local"

    success = client.login(username=user_email, password="banana")

    assert not success
    created_email = allauth_models.EmailAddress.objects.filter(email=user_email)
    assert not created_email.exists()


@override_settings(AUTHENTICATION_BACKENDS=("edd.auth_backend.AllauthLDAPBackend",))
def test_mock_ldap_password_reset(client, db):
    user_email = "developer.one@ldapmock.local"
    # login to run through user setup in database
    client.login(username=user_email, password="password")
    client.logout()

    url = reverse("account_reset_password")
    response = client.post(url, {"email": user_email}, follow=True)

    asserts.assertRedirects(response, reverse("account_reset_password_done"))
    asserts.assertTemplateUsed(response, "account/password_reset_done.html")
    # only one email sent, not two
    assert len(mail.outbox) == 1
    # email directs user to password.lbl.gov to reset LBL password
    # NOTE: this will definitely break if the ldap_reset_requested_message.txt changes :)
    assert "password.lbl.gov" in mail.outbox[0].body


@override_settings(AUTHENTICATION_BACKENDS=("edd.auth_backend.AllauthLDAPBackend",))
def test_mock_ldap_password_reset_user_does_not_exist(client, db):
    user_email = "no-reply@ldapmock.local"

    url = reverse("account_reset_password")
    response = client.post(url, {"email": user_email}, follow=True)

    # pretend the reset actually happened
    asserts.assertRedirects(response, reverse("account_reset_password_done"))
    asserts.assertTemplateUsed(response, "account/password_reset_done.html")
    # email target that they don't have an account
    assert len(mail.outbox) == 1
    assert "we do not have any record" in mail.outbox[0].body


@override_settings(AUTHENTICATION_BACKENDS=("edd.auth_backend.LocalTestBackend",))
def test_login_with_local_test_backend(client, db):
    existing_user = UserFactory()
    success = client.login(username=existing_user.username, password="password")

    assert success


@override_settings(AUTHENTICATION_BACKENDS=("edd.auth_backend.LocalTestBackend",))
def test_login_with_local_test_backend_user_does_not_exist(client, db):
    success = client.login(username="lorem ipsum", password="password")

    assert not success


@override_settings(
    AUTHENTICATION_BACKENDS=("edd.auth_backend.ManualVerificationModelBackend",),
    EDD_APPROVAL_CONTACT="admin@example.org",
)
def test_login_with_manual_account_verification(client, db):
    existing_user = UserFactory()
    existing_user.set_password("password")
    existing_user.save()

    # account is not verified
    with pytest.raises(ValidationError):
        client.login(username=existing_user.username, password="password")


@override_settings(
    AUTHENTICATION_BACKENDS=("edd.auth_backend.ManualVerificationModelBackend",),
    EDD_APPROVAL_CONTACT="admin@example.org",
)
def test_login_with_manual_account_verification_invalid_password(client, db):
    existing_user = UserFactory()
    existing_user.set_password("password")
    existing_user.save()

    # login with wrong password, no ValidationError
    success = client.login(username=existing_user.username, password="banana")

    assert not success


def test_reset_password_email(client, db):
    existing_user = UserFactory()

    # send the reset request
    url = reverse("account_reset_password")
    response = client.post(url, {"email": existing_user.email}, follow=True)

    # get the proper reset response
    asserts.assertRedirects(response, reverse("account_reset_password_done"))
    asserts.assertTemplateUsed(response, "account/password_reset_done.html")
    # email contains link to complete reset
    assert len(mail.outbox) == 1
    assert mail.outbox[0].to == [existing_user.email]
    urls = [line for line in mail.outbox[0].body.splitlines() if line.startswith("http")]
    assert len(urls) == 1

    # request the reset page
    reset_url = urls[0]
    # find the base path
    base_url = reverse("account_reset_password")
    # get the URL *only* from the base
    reset_url = reset_url[reset_url.index(base_url) :]
    reset = client.get(reset_url, follow=True)
    asserts.assertTemplateUsed(reset, "account/password_reset_from_key.html")


@pytest.fixture
def user_with_email(db):
    user = UserFactory()
    address = allauth_models.EmailAddress.objects.create(
        email=user.email,
        primary=True,
        user=user,
        verified=True,
    )
    return user, address


@override_settings(
    ACCOUNT_ADAPTER="allauth.account.adapter.DefaultAccountAdapter",
    ACCOUNT_EMAIL_REQUIRED=True,
)
def test_stock_account_adapter_allows_deleting_primary_email(client, user_with_email):
    # if this test ever starts to fail,
    # can remove `can_delete_email` override on EDDAccountAdapter
    user, address = user_with_email
    client.force_login(user)
    url = reverse("account_email")
    payload = {"action_remove": "", "email": user.email}

    response = client.post(url, data=payload, follow=True)

    assert response.status_code == http.HTTPStatus.OK
    qs = allauth_models.EmailAddress.objects.filter(pk=address.pk)
    assert not qs.exists()


@override_settings(
    ACCOUNT_ADAPTER="edd.account.EDDAccountAdapter",
    ACCOUNT_EMAIL_REQUIRED=True,
)
def test_our_account_adapter_prevents_deleting_primary_email(client, user_with_email):
    user, address = user_with_email
    client.force_login(user)
    url = reverse("account_email")
    payload = {"action_remove": "", "email": user.email}

    response = client.post(url, data=payload, follow=True)

    qs = allauth_models.EmailAddress.objects.filter(pk=address.pk)
    assert qs.exists()
    asserts.assertContains(response, "You cannot remove your primary e-mail address")


@override_settings(
    ACCOUNT_ADAPTER="edd.account.EDDAccountAdapter",
    ACCOUNT_EMAIL_REQUIRED=False,
)
def test_our_account_adapter_allows_deleting_non_required_email(client, user_with_email):
    user, address = user_with_email
    client.force_login(user)
    url = reverse("account_email")
    payload = {"action_remove": "", "email": user.email}

    response = client.post(url, data=payload, follow=True)

    assert response.status_code == http.HTTPStatus.OK
    qs = allauth_models.EmailAddress.objects.filter(pk=address.pk)
    assert not qs.exists()


def test_admin_login_uses_base_login_form_and_template(client, db):
    response = client.get(reverse("admin:login"))
    asserts.assertTemplateUsed(response, "account/login.html")


def test_ws_reverse_on_known_websocket_name():
    path = utilities.ws_reverse("notify:messages")
    assert path == "/ws/notify/"


@override_settings(WEBSOCKET_DOMAIN="wss://example.com/")
def test_ws_reverse_with_websocket_domain():
    path = utilities.ws_reverse("notify:messages")
    assert path == "wss://example.com/ws/notify/"


def test_ws_reverse_unknown_websocket_name_is_an_error():
    with pytest.raises(NoReverseMatch):
        utilities.ws_reverse("not a websocket name")


def test_ws_url_template_on_known_websocket_name():
    template = Template(r"{% load asgi %}{% ws_url 'notify:messages' %}")
    result = template.render(Context())
    assert result == "/ws/notify/"


def test_ws_url_template_unknown_websocket_name_is_an_error():
    template = Template(r"{% load asgi %}{% ws_url 'not a websocket' %}")
    with pytest.raises(NoReverseMatch):
        template.render(Context())


def test_ws_url_template_unknown_websocket_name_with_asvar():
    template = Template(r"{% load asgi %}{% ws_url 'not a websocket' as test_url %}")
    result = template.render(Context())
    assert result == ""
