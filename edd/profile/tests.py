# coding: utf-8

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
        super(UserProfileTest, cls).setUpTestData()
        cls.user1 = UserFactory()
        cls.user2 = UserFactory(first_name="", last_name="")

    def setUp(self):
        super(UserProfileTest, self).setUp()
        self.client.force_login(self.user1)

    def test_self_profile(self):
        response = self.client.get(reverse("profile:index"))
        self.assertEqual(response.status_code, codes.ok)

    def test_other_profile(self):
        target_kwargs = {"username": self.user2.username}
        response = self.client.get(reverse("profile:profile", kwargs=target_kwargs))
        self.assertEqual(response.status_code, codes.ok)

    def test_settings(self):
        # OK response getting all settings
        response = self.client.get(reverse("profile:settings"))
        self.assertEqual(response.status_code, codes.ok)
        self.assertEqual(response.json(), {})
        # No Content response posting settings
        response = self.client.post(
            reverse("profile:settings"),
            data={"data": '{"testkey": "testvalue", "otherkey": true}'},
        )
        self.assertEqual(response.status_code, codes.no_content)
        # OK response containing correct value getting specific setting
        target_kwargs = {"key": "testkey"}
        response = self.client.get(
            reverse("profile:settings_key", kwargs=target_kwargs)
        )
        self.assertEqual(response.json(), "testvalue")
        # No Content response posting updated settings
        response = self.client.post(
            reverse("profile:settings_key", kwargs=target_kwargs),
            # value is JSON-encoded, so strings must be enclosed in double-quotes
            data={"data": '"updatedvalue"'},
        )
        self.assertEqual(response.status_code, codes.no_content)
        # OK response containing updated value on getting specific setting
        response = self.client.get(
            reverse("profile:settings_key", kwargs=target_kwargs)
        )
        self.assertEqual(response.status_code, codes.ok)
        self.assertEqual(response.json(), "updatedvalue")
        # No Content response deleting a specific setting
        response = self.client.delete(
            reverse("profile:settings_key", kwargs=target_kwargs)
        )
        self.assertEqual(response.status_code, codes.no_content)
        # OK response and correct remaining settings
        response = self.client.get(reverse("profile:settings"))
        self.assertEqual(response.status_code, codes.ok)
        self.assertEqual(response.json(), {"otherkey": True})
        # No Content response deleting all settings
        response = self.client.delete(reverse("profile:settings"))
        self.assertEqual(response.status_code, codes.no_content)
        # OK response getting all settings
        response = self.client.get(reverse("profile:settings"))
        self.assertEqual(response.status_code, codes.ok)
        self.assertEqual(response.json(), {})

    def test_string_repr(self):
        inst = models.Institution(institution_name="JBEI")
        self.assertEqual(self.user1.username, str(self.user1.profile))
        self.assertEqual(str(inst), "JBEI")
