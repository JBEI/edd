from django.contrib.auth import get_user_model
from django.urls import reverse
from requests import codes

from edd import TestCase

from . import models
from .factory import UserFactory

User = get_user_model()


class UserTests(TestCase):
    JSON_KEYS = [
        "disabled",
        "email",
        "firstname",
        "id",
        "initials",
        "lastname",
        "name",
        "uid",
    ]
    SOLR_KEYS = [
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
    ]

    # create test users
    @classmethod
    def setUpTestData(cls):
        cls.user1 = UserFactory(
            email="jsmith@localhost", first_name="Jane", last_name="Smith"
        )
        cls.user2 = UserFactory(email="jdoe@localhost", first_name="", last_name="")
        cls.admin = UserFactory(
            email="ssue@localhost",
            is_staff=True,
            is_superuser=True,
            first_name="Sally",
            last_name="Sue",
        )

    def test_monkey_patches(self):
        """ Checking the properties monkey-patched on to the User model. """
        # Asserts
        self.assertIsNotNone(self.user1.profile)
        self.assertEqual(self.user1.initials, "JS")
        self.assertEqual(self.user1.profile.initials, "JS")
        self.assertEqual(len(self.user1.institutions), 0)
        self.assertIsNotNone(self.user2.profile)
        self.assertEqual(self.user2.initials, "")
        self.assertEqual(self.user2.profile.initials, "")
        # ensure keys exist in JSON and Solr dict repr
        user_json = self.user1.to_json()
        for key in self.JSON_KEYS:
            self.assertIn(key, user_json)
        user_solr = self.user1.to_solr_json()
        for key in self.SOLR_KEYS:
            self.assertIn(key, user_solr)

    def test_initial_permissions(self):
        """ Checking initial class-based permissions for normal vs admin user. """
        # Asserts
        self.assertFalse(self.user1.has_perm("main.change.protocol"))
        self.assertTrue(self.admin.has_perm("main.change.protocol"))


class UserProfileTest(TestCase):
    @classmethod
    def setUpTestData(cls):
        super().setUpTestData()
        cls.user1 = UserFactory()

    def setUp(self):
        super().setUp()
        self.client.force_login(self.user1)

    def _update_profile(self, **kwargs):
        self.user1.profile.preferences = kwargs
        self.user1.profile.save()

    def test_self_profile(self):
        response = self.client.get(reverse("profile:index"))
        self.assertEqual(response.status_code, codes.ok)

    def test_other_profile(self):
        user2 = UserFactory(first_name="", last_name="")
        target_kwargs = {"username": user2.username}
        response = self.client.get(reverse("profile:profile", kwargs=target_kwargs))
        self.assertEqual(response.status_code, codes.ok)

    def test_settings_view_get_ok(self):
        # OK response getting all settings
        response = self.client.get(reverse("profile:settings"))
        self.assertEqual(response.status_code, codes.ok)
        self.assertEqual(response.json(), {})

    def test_settings_view_post(self):
        # No Content response posting settings with full dictionary
        response = self.client.post(
            reverse("profile:settings"),
            data={"data": '{"testkey": "testvalue", "otherkey": true}'},
        )
        self.assertEqual(response.status_code, codes.no_content)
        self.user1.refresh_from_db()
        self.assertEqual(
            self.user1.profile.preferences, {"testkey": "testvalue", "otherkey": True}
        )

    def test_settings_view_get_with_values(self):
        # OK response containing correct value getting specific setting
        self._update_profile(testkey="testvalue")
        target_kwargs = {"key": "testkey"}
        response = self.client.get(
            reverse("profile:settings_key", kwargs=target_kwargs)
        )
        self.assertEqual(response.json(), "testvalue")

    def test_settings_view_post_partial(self):
        # No Content response posting updated settings
        self._update_profile(testkey="testvalue", otherkey=True)
        target_kwargs = {"key": "testkey"}
        response = self.client.post(
            reverse("profile:settings_key", kwargs=target_kwargs),
            # value is JSON-encoded, so strings must be enclosed in double-quotes
            data={"data": '"updatedvalue"'},
        )
        self.assertEqual(response.status_code, codes.no_content)
        self.user1.refresh_from_db()
        self.assertEqual(
            self.user1.profile.preferences,
            {"testkey": "updatedvalue", "otherkey": True},
        )

    def test_settings_view_delete_partial(self):
        # No Content response deleting a specific setting
        self._update_profile(testkey="testvalue", otherkey=True)
        target_kwargs = {"key": "testkey"}
        response = self.client.delete(
            reverse("profile:settings_key", kwargs=target_kwargs)
        )
        self.assertEqual(response.status_code, codes.no_content)
        self.user1.profile.refresh_from_db()
        self.assertEqual(self.user1.profile.preferences, {"otherkey": True})

    def test_settings_view_delete_all(self):
        # No Content response deleting all settings
        self._update_profile(testkey="testvalue", otherkey=True)
        response = self.client.delete(reverse("profile:settings"))
        self.assertEqual(response.status_code, codes.no_content)
        self.user1.profile.refresh_from_db()
        self.assertEqual(self.user1.profile.preferences, {})

    def test_string_repr(self):
        inst = models.Institution(institution_name="JBEI")
        self.assertEqual(self.user1.username, str(self.user1.profile))
        self.assertEqual(str(inst), "JBEI")


class UserProfileAdminTest(TestCase):
    @classmethod
    def setUpTestData(cls):
        super().setUpTestData()
        cls.user = UserFactory(is_superuser=True, is_staff=True)

    def setUp(self):
        super().setUp()
        self.client.force_login(self.user)

    def test_admin_create(self):
        response = self.client.get(reverse("admin:profile_userprofile_add"))
        self.assertEqual(response.status_code, codes.ok)
        self.assertTemplateUsed("admin/change_form.html")

    def test_admin_detail(self):
        new_user = UserFactory()
        new_user.profile.approved = False
        new_user.profile.save()
        qs = models.UserProfile.objects.filter(user=new_user)
        response = self.client.get(
            reverse(
                "admin:profile_userprofile_change", kwargs={"object_id": qs.get().pk},
            )
        )
        self.assertEqual(response.status_code, codes.ok)
        self.assertTemplateUsed("admin/change_form.html")

    def test_admin_listing(self):
        response = self.client.get(reverse("admin:profile_userprofile_changelist"))
        self.assertEqual(response.status_code, codes.ok)
        self.assertTemplateUsed("admin/change_list.html")

    def test_admin_approval(self):
        new_user = UserFactory()
        new_user.profile.approved = False
        new_user.profile.save()
        qs = models.UserProfile.objects.filter(user=new_user)
        payload = {
            "action": "enable_account_action",
            "_selected_action": qs.values_list("pk", flat=True),
        }

        # include follow for POST-REDIRECT-GET
        response = self.client.post(
            reverse("admin:profile_userprofile_changelist"), data=payload, follow=True,
        )

        new_user.refresh_from_db()
        self.assertEqual(response.status_code, codes.ok)
        self.assertTemplateUsed("admin/change_list.html")
        self.assertTrue(new_user.profile.approved)

    def test_admin_unapprove(self):
        new_user = UserFactory()
        new_user.profile.approved = True
        new_user.profile.save()
        qs = models.UserProfile.objects.filter(user=new_user)
        payload = {
            "action": "disable_account_action",
            "_selected_action": qs.values_list("pk", flat=True),
        }

        # include follow for POST-REDIRECT-GET
        response = self.client.post(
            reverse("admin:profile_userprofile_changelist"), data=payload, follow=True,
        )

        new_user.refresh_from_db()
        self.assertEqual(response.status_code, codes.ok)
        self.assertTemplateUsed("admin/change_list.html")
        self.assertFalse(new_user.profile.approved)
