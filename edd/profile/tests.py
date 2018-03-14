# coding: utf-8

from django.contrib.auth import get_user_model
from django.core.urlresolvers import reverse
from django.test import TestCase
from requests import codes

from main.tests.factory import UserFactory


User = get_user_model()


class UserProfileTest(TestCase):

    @classmethod
    def setUpTestData(cls):
        super(UserProfileTest, cls).setUpTestData()
        cls.user1 = UserFactory()
        cls.user2 = UserFactory(first_name='', last_name='')

    def setUp(self):
        super(UserProfileTest, self).setUp()
        self.client.force_login(self.user1)

    def test_self_profile(self):
        response = self.client.get(reverse('profile:index'))
        self.assertEqual(response.status_code, codes.ok)

    def test_other_profile(self):
        target_kwargs = {'username': self.user2.username}
        response = self.client.get(reverse('profile:profile', kwargs=target_kwargs))
        self.assertEqual(response.status_code, codes.ok)

    def test_settings(self):
        response = self.client.get(reverse('profile:settings'))
        self.assertEqual(response.status_code, codes.ok)
        response = self.client.post(
            reverse('profile:settings'),
            data={'data': '{"testkey": "testvalue"}'},
        )
        self.assertEqual(response.status_code, codes.no_content)
        target_kwargs = {'key': 'testkey'}
        response = self.client.get(reverse('profile:settings_key', kwargs=target_kwargs))
        self.assertEqual(response.json(), 'testvalue')

