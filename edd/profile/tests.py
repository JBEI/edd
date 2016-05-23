from __future__ import unicode_literals

from django.contrib.auth.models import User
from django.test import TestCase
from Main import constants


class UserProfileTest(TestCase):
    def setUp(self):
        TestCase.setUp(self)
        # create test users
        User.objects.create_user(
            username=constants.USERNAME,
            email=constants.EMAIL,
            password=constants.PASSWORD,
            first_name=constants.FIRST_NAME,
            last_name=constants.LAST_NAME
            )
        User.objects.create_user(
            username=constants.USERNAME2,
            email=constants.EMAIL2,
            password=constants.PASSWORD)

    def test_profile(self):
        """ Ensure user profile has appropriate fields"""
        # Load objects
        user1 = User.objects.get(email=constants.EMAIL)
        user2 = User.objects.get(email="jdoe@localhost")
        # Asserts
        self.assertTrue(user1.profile is not None)
        self.assertTrue(user1.profile.initials == "JS")
        self.assertTrue(user2.profile.initials == '')
