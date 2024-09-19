from http import HTTPStatus
from unittest.mock import patch

from django.core import mail
from django.urls import reverse
from pytest import fixture
from pytest_django import asserts

from edd.utilities import JSONEncoder

from . import models, tasks
from .factory import UserFactory

AJAX_HEADER = {"X-Requested-With": "XMLHttpRequest"}


@fixture
def admin_client(client, db):
    user = UserFactory(is_superuser=True, is_staff=True)
    client.force_login(user)
    return client


@fixture
def basic_user(db):
    return UserFactory()


def test_User_monkey_patch_profile_property(db, basic_user):
    assert hasattr(basic_user, "profile")
    assert basic_user.profile is not None


def test_User_monkey_patch_initials_property(db):
    user = UserFactory(first_name="Jane", last_name="Smith")
    assert hasattr(user, "initials")
    assert user.initials == "JS"


def test_User_monkey_patch_institutions_property(db, basic_user):
    assert hasattr(basic_user, "institutions")
    assert len(basic_user.institutions) == 0


def test_User_json_keys(db, basic_user):
    expected = {"disabled", "email", "firstname", "id", "initials", "lastname", "name", "uid"}
    keys = basic_user.to_json().keys()
    assert expected.issubset(keys)


def test_User_solr_keys(db, basic_user):
    expected = {
        "date_joined",
        "email",
        "fullname",
        "group",
        "id",
        "initials",
        "institution",
        "is_active",
        "is_staff",
        "is_superuser",
        "last_login",
        "name",
        "username",
    }
    keys = basic_user.to_solr_json().keys()
    assert expected.issubset(keys)


def test_view_own_profile(client, db, basic_user):
    client.force_login(basic_user)

    response = client.get(reverse("profile:index"))

    asserts.assertTemplateUsed(response, "edd/profile/profile.html")
    asserts.assertContains(response, basic_user.username, status_code=HTTPStatus.OK)


def test_view_other_profile(client, db, basic_user):
    other = UserFactory()
    client.force_login(basic_user)

    response = client.get(reverse("profile:profile", kwargs={"username": other.username}))

    asserts.assertTemplateUsed(response, "edd/profile/profile.html")
    asserts.assertContains(response, other.username, status_code=HTTPStatus.OK)


def test_view_own_settings(client, db, basic_user):
    client.force_login(basic_user)

    response = client.get(reverse("profile:settings"))

    assert response.status_code == HTTPStatus.OK
    assert response.json() == {}


def test_view_update_own_settings(client, db, basic_user, faker):
    fake_settings = faker.pydict(value_types=(str, int))
    payload = {"data": JSONEncoder.dumps(fake_settings)}
    url = reverse("profile:settings")
    client.force_login(basic_user)

    response = client.post(url, data=payload)

    assert response.status_code == HTTPStatus.NO_CONTENT
    basic_user.refresh_from_db()
    assert basic_user.profile.preferences == fake_settings


def test_view_own_specific_setting(client, db, basic_user, faker):
    value = faker.catch_phrase()
    basic_user.profile.preferences = {"testkey": value}
    basic_user.profile.save()
    client.force_login(basic_user)

    response = client.get(reverse("profile:settings_key", kwargs={"key": "testkey"}))

    assert response.status_code == HTTPStatus.OK
    assert response.json() == value


def test_view_own_specific_setting_update(client, db, basic_user, faker):
    value = faker.catch_phrase()
    basic_user.profile.preferences = {"otherkey": faker.catch_phrase()}
    basic_user.profile.save()
    url = reverse("profile:settings_key", kwargs={"key": "testkey"})
    client.force_login(basic_user)

    # value is JSON-encoded, so strings must be enclosed in double-quotes
    response = client.post(url, data={"data": f'"{value}"'})

    assert response.status_code == HTTPStatus.NO_CONTENT
    basic_user.refresh_from_db()
    assert "otherkey" in basic_user.profile.preferences
    assert basic_user.profile.preferences["testkey"] == value


def test_view_own_specific_setting_delete(client, db, basic_user, faker):
    basic_user.profile.preferences = {"testkey": faker.catch_phrase()}
    basic_user.profile.save()
    client.force_login(basic_user)

    response = client.delete(reverse("profile:settings_key", kwargs={"key": "testkey"}))

    assert response.status_code == HTTPStatus.NO_CONTENT
    basic_user.refresh_from_db()
    assert basic_user.profile.preferences == {}


def test_view_update_own_settings_clear(client, db, basic_user, faker):
    basic_user.profile.preferences = faker.pydict(value_types=(str, int))
    basic_user.profile.save()
    client.force_login(basic_user)

    response = client.delete(reverse("profile:settings"))

    assert response.status_code == HTTPStatus.NO_CONTENT
    basic_user.refresh_from_db()
    assert basic_user.profile.preferences == {}


def test_view_edit_own_profile_start(client, db, basic_user):
    client.force_login(basic_user)

    response = client.get(reverse("profile:edit"))

    assert response.status_code == HTTPStatus.OK
    asserts.assertTemplateUsed(response, "edd/profile/profile-edit.html")


def test_view_edit_own_profile_start_inline(client, db, basic_user):
    client.force_login(basic_user)

    response = client.get(reverse("profile:edit"), headers=AJAX_HEADER)

    assert response.status_code == HTTPStatus.OK
    asserts.assertTemplateNotUsed(response, "edd/profile/profile-edit.html")
    asserts.assertTemplateUsed(response, "edd/profile/profile-edit-inline.html")


def test_view_edit_own_profile_update(client, db, basic_user, faker):
    new_name = faker.catch_phrase()
    payload = {"display_name": new_name}
    client.force_login(basic_user)

    response = client.post(reverse("profile:edit"), data=payload, follow=True)

    asserts.assertTemplateUsed(response, "edd/profile/profile.html")
    asserts.assertTemplateNotUsed(response, "edd/profile/profile-edit.html")
    asserts.assertContains(response, new_name, status_code=HTTPStatus.OK)


def test_view_edit_own_profile_update_inline(client, db, basic_user, faker):
    new_name = faker.catch_phrase()
    payload = {"display_name": new_name}
    client.force_login(basic_user)

    response = client.post(reverse("profile:edit"), data=payload, headers=AJAX_HEADER)

    asserts.assertTemplateNotUsed(response, "edd/profile/profile.html")
    asserts.assertTemplateNotUsed(response, "edd/profile/profile-edit.html")
    asserts.assertTemplateUsed(response, "edd/profile/profile-userinfo.html")
    asserts.assertContains(response, new_name, status_code=HTTPStatus.OK)


def test_view_edit_own_profile_update_rejects_huge_name(client, db, basic_user, faker):
    # generate an extremely long "name" that will get rejected
    new_name = faker.paragraph(nb_sentences=20, variable_nb_sentences=False)
    payload = {"display_name": new_name}
    client.force_login(basic_user)

    response = client.post(reverse("profile:edit"), data=payload, follow=True)

    asserts.assertTemplateUsed(response, "edd/profile/profile.html")
    asserts.assertTemplateNotUsed(response, "edd/profile/profile-edit.html")
    asserts.assertContains(
        response,
        "There was a problem updating the profile.",
        status_code=HTTPStatus.OK,
    )


def test_view_edit_own_profile_update_rejects_huge_name_inline(client, db, basic_user, faker):
    # generate an extremely long "name" that will get rejected
    new_name = faker.paragraph(nb_sentences=20, variable_nb_sentences=False)
    payload = {"display_name": new_name}
    client.force_login(basic_user)

    response = client.post(reverse("profile:edit"), data=payload, headers=AJAX_HEADER)

    assert response.status_code == HTTPStatus.BAD_REQUEST
    asserts.assertTemplateNotUsed(response, "edd/profile/profile.html")
    asserts.assertTemplateNotUsed(response, "edd/profile/profile-edit.html")
    asserts.assertTemplateUsed(response, "edd/profile/profile-edit-inline.html")


def test_view_cannot_edit_others_profile(client, db, basic_user):
    other = UserFactory()
    client.force_login(basic_user)
    response = client.get(reverse("profile:pedit", kwargs={"username": other.username}))
    assert response.status_code == HTTPStatus.NOT_FOUND


def test_view_add_applink_valid(client, db, basic_user):
    client.force_login(basic_user)
    token = "some long string of api key"
    payload = {
        "apptype": "1",  # migration auto-creates ICE apptype at index 1
        "comment": "hello world",
        "secret_id": "some client",
        "secret": token,
        "url": "https://example.com/api/",
    }
    response = client.post(reverse("profile:applink"), data=payload, follow=True)

    asserts.assertRedirects(response, reverse("profile:index"))
    asserts.assertContains(response, "Saved link to https://example.com/api/")
    assert basic_user.profile.applinks.count() == 1
    assert basic_user.profile.applinks.first().api_token == token


def test_view_add_applink_invalid(client, db, basic_user):
    client.force_login(basic_user)
    token = "some long string of api key"
    payload = {
        "apptype": "1",  # migration auto-creates ICE apptype at index 1
        "comment": "hello world",
        "secret_id": "some client",
        "secret": token,
        "url": "not a url",
    }
    response = client.post(reverse("profile:applink"), data=payload, follow=True)

    asserts.assertRedirects(response, reverse("profile:index"))
    asserts.assertContains(
        response,
        "There was a problem adding your application link.",
        status_code=HTTPStatus.OK,
    )
    assert basic_user.profile.applinks.count() == 0


def test_view_add_applink_inline_and_valid(client, db, basic_user):
    client.force_login(basic_user)
    token = "some long string of api key"
    payload = {
        "apptype": "1",  # migration auto-creates ICE apptype at index 1
        "comment": "hello world",
        "secret_id": "some client",
        "secret": token,
        "url": "https://example.com/api/",
    }
    response = client.post(reverse("profile:applink"), data=payload, headers=AJAX_HEADER)

    asserts.assertTemplateNotUsed(response, "edd/profile/profile.html")
    asserts.assertTemplateUsed(response, "edd/profile/profile-applinks.html")
    assert basic_user.profile.applinks.count() == 1
    assert basic_user.profile.applinks.first().api_token == token


def test_view_add_applink_inline_and_invalid(client, db, basic_user):
    client.force_login(basic_user)
    token = "some long string of api key"
    payload = {
        "apptype": "1",  # migration auto-creates ICE apptype at index 1
        "comment": "hello world",
        "secret_id": "some client",
        "secret": token,
        "url": "not a url",
    }
    response = client.post(reverse("profile:applink"), data=payload, headers=AJAX_HEADER)

    asserts.assertTemplateNotUsed(response, "edd/profile/profile.html")
    asserts.assertTemplateUsed(response, "edd/profile/profile-applinks.html")
    assert basic_user.profile.applinks.count() == 0


def create_user_ice_applink(user, faker):
    return models.AppLink.objects.create(
        apptype_id=1,
        comment=faker.sentence(),
        profile=user.profile,
        secret_id=faker.catch_phrase(),
        secret=faker.paragraph(),
        url=faker.url(),
    )


def test_view_get_single_applink_method_not_allowed(client, db, basic_user, faker):
    link = create_user_ice_applink(basic_user, faker)
    client.force_login(basic_user)

    response = client.get(reverse("profile:applink_edit", kwargs={"pk": link.pk}))
    assert response.status_code == HTTPStatus.METHOD_NOT_ALLOWED


def test_view_post_single_applink_order_up(client, db, basic_user, faker):
    first = create_user_ice_applink(basic_user, faker)
    second = create_user_ice_applink(basic_user, faker)
    third = create_user_ice_applink(basic_user, faker)
    url = reverse("profile:applink_edit", kwargs={"pk": third.pk})
    client.force_login(basic_user)

    response = client.post(url, data={"up": 1}, headers=AJAX_HEADER)
    asserts.assertTemplateNotUsed(response, "edd/profile/profile.html")
    asserts.assertTemplateUsed(response, "edd/profile/profile-applinks.html")
    assert list(basic_user.profile.get_applink_order()) == [first.pk, third.pk, second.pk]


def test_view_post_single_applink_order_down(client, db, basic_user, faker):
    first = create_user_ice_applink(basic_user, faker)
    second = create_user_ice_applink(basic_user, faker)
    third = create_user_ice_applink(basic_user, faker)
    url = reverse("profile:applink_edit", kwargs={"pk": second.pk})
    client.force_login(basic_user)

    response = client.post(url, data={"down": 1}, headers=AJAX_HEADER)
    asserts.assertTemplateNotUsed(response, "edd/profile/profile.html")
    asserts.assertTemplateUsed(response, "edd/profile/profile-applinks.html")
    assert list(basic_user.profile.get_applink_order()) == [first.pk, third.pk, second.pk]


def test_view_post_single_applink_remove(client, db, basic_user, faker):
    link = create_user_ice_applink(basic_user, faker)
    url = reverse("profile:applink_edit", kwargs={"pk": link.pk})
    client.force_login(basic_user)

    response = client.post(url, data={"remove": True}, follow=True)
    asserts.assertRedirects(response, reverse("profile:index"))
    assert basic_user.profile.applinks.count() == 0


def test_view_post_single_applink_remove_ajax(client, db, basic_user, faker):
    link = create_user_ice_applink(basic_user, faker)
    url = reverse("profile:applink_edit", kwargs={"pk": link.pk})
    client.force_login(basic_user)

    response = client.post(url, data={"remove": True}, headers=AJAX_HEADER)
    asserts.assertTemplateNotUsed(response, "edd/profile/profile.html")
    asserts.assertTemplateUsed(response, "edd/profile/profile-applinks.html")
    assert basic_user.profile.applinks.count() == 0


def test_view_post_single_applink_unknown_command(client, db, basic_user, faker):
    link = create_user_ice_applink(basic_user, faker)
    url = reverse("profile:applink_edit", kwargs={"pk": link.pk})
    client.force_login(basic_user)

    response = client.post(url, data={"foobar": True}, follow=True)
    asserts.assertRedirects(response, reverse("profile:index"))
    assert basic_user.profile.applinks.count() == 1


def test_view_post_single_applink_unknown_command_ajax(client, db, basic_user, faker):
    link = create_user_ice_applink(basic_user, faker)
    url = reverse("profile:applink_edit", kwargs={"pk": link.pk})
    client.force_login(basic_user)

    response = client.post(url, data={"foobar": True}, headers=AJAX_HEADER)
    asserts.assertTemplateNotUsed(response, "edd/profile/profile.html")
    asserts.assertTemplateUsed(response, "edd/profile/profile-applinks.html")
    assert basic_user.profile.applinks.count() == 1


def test_view_admin_update_others_profile(admin_client, db, basic_user, faker):
    new_name = faker.catch_phrase()
    payload = {"display_name": new_name}
    url = reverse("profile:pedit", kwargs={"username": basic_user.username})

    response = admin_client.post(url, data=payload, follow=True)

    asserts.assertTemplateUsed(response, "edd/profile/profile.html")
    asserts.assertTemplateNotUsed(response, "edd/profile/profile-edit.html")
    asserts.assertContains(response, new_name, status_code=HTTPStatus.OK)


def test_profile_string_cast(db, basic_user):
    assert str(basic_user.profile) == basic_user.username


def test_institution_string_cast(faker):
    name = faker.catch_phrase()
    institution = models.Institution(institution_name=name)
    assert str(institution) == name


def test_admin_profile_create_start(admin_client):
    response = admin_client.get(reverse("admin:profile_userprofile_add"))

    assert response.status_code == HTTPStatus.OK
    asserts.assertTemplateUsed("admin/change_form.html")


def test_admin_profile_change_start(admin_client, basic_user):
    url = reverse("admin:profile_userprofile_change", kwargs={"object_id": basic_user.profile.pk})
    response = admin_client.get(url)

    assert response.status_code == HTTPStatus.OK
    asserts.assertTemplateUsed("admin/change_form.html")


def test_admin_profile_change_approve_sends_email(admin_client, basic_user):
    payload = {
        # this is the actual thing we're changing
        "approved": True,
        # these are needed to validate the inline forms
        "institutionid_set-TOTAL_FORMS": 0,
        "institutionid_set-INITIAL_FORMS": 0,
    }
    url = reverse("admin:profile_userprofile_change", kwargs={"object_id": basic_user.profile.pk})

    with patch("edd.profile.tasks.send_approved_account_email") as task:
        response = admin_client.post(url, data=payload, follow=True)

    assert response.status_code == HTTPStatus.OK
    asserts.assertTemplateNotUsed("admin/change_form.html")
    # task sending an email would have been called
    task.delay.assert_called_once()
    # verify the email itself
    tasks.send_approved_account_email(*task.delay.call_args.args)
    assert len(mail.outbox) == 1
    assert mail.outbox[0].to == [basic_user.email]


def test_admin_profile_change_name_sends_no_email(admin_client, basic_user):
    payload = {
        # this is the actual thing we're changing
        "display_name": "name",
        # these are needed to validate the inline forms
        "institutionid_set-TOTAL_FORMS": 0,
        "institutionid_set-INITIAL_FORMS": 0,
    }
    url = reverse("admin:profile_userprofile_change", kwargs={"object_id": basic_user.profile.pk})

    with patch("edd.profile.tasks.send_approved_account_email") as task:
        response = admin_client.post(url, data=payload, follow=True)

    assert response.status_code == HTTPStatus.OK
    asserts.assertTemplateNotUsed("admin/change_form.html")
    # task sending an email not called
    task.delay.assert_not_called()
    # name is updated
    basic_user.refresh_from_db()
    assert basic_user.profile.display_name == "name"


def test_admin_profile_view_list(admin_client):
    response = admin_client.get(reverse("admin:profile_userprofile_changelist"))

    assert response.status_code == HTTPStatus.OK
    asserts.assertTemplateUsed("admin/change_list.html")


def test_admin_profile_approval_action(admin_client, basic_user):
    assert not basic_user.profile.approved
    payload = {"action": "enable_account_action", "_selected_action": [basic_user.profile.pk]}
    url = reverse("admin:profile_userprofile_changelist")

    with patch("edd.profile.tasks.send_approved_account_email") as task:
        response = admin_client.post(url, data=payload, follow=True)

    assert response.status_code == HTTPStatus.OK
    asserts.assertTemplateUsed("admin/change_list.html")
    # user account is now approved
    basic_user.refresh_from_db()
    assert basic_user.profile.approved
    # task sending an email would have been called
    task.delay.assert_called_once()
    # verify the email itself
    tasks.send_approved_account_email(*task.delay.call_args.args)
    assert len(mail.outbox) == 1
    assert mail.outbox[0].to == [basic_user.email]


def test_admin_profile_ban_action(admin_client, basic_user):
    basic_user.profile.approved = True
    basic_user.profile.save()
    payload = {"action": "disable_account_action", "_selected_action": [basic_user.profile.pk]}
    url = reverse("admin:profile_userprofile_changelist")

    response = admin_client.post(url, data=payload, follow=True)

    assert response.status_code == HTTPStatus.OK
    asserts.assertTemplateUsed("admin/change_list.html")
    basic_user.refresh_from_db()
    assert not basic_user.profile.approved


def test_admin_profile_reset_display_name_action(admin_client, basic_user, faker):
    original_name = basic_user.profile.display_name
    basic_user.profile.display_name = faker.catch_phrase()
    basic_user.profile.save()
    payload = {"action": "reset_display_name", "_selected_action": [basic_user.profile.pk]}
    url = reverse("admin:profile_userprofile_changelist")

    response = admin_client.post(url, data=payload, follow=True)

    assert response.status_code == HTTPStatus.OK
    asserts.assertTemplateUsed("admin/change_list.html")
    basic_user.refresh_from_db()
    assert basic_user.profile.display_name == original_name
