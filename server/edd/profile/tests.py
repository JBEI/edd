from django.contrib.auth import get_user_model
from django.urls import reverse
from requests import codes

from edd import TestCase
from main.tests.factory import UserFactory

from . import models

User = get_user_model()


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
