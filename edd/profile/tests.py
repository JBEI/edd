from __future__ import unicode_literals

from django.contrib.auth.models import User
from django.test import TestCase

from edd.profile.models import UserProfile



class UserProfileTest(TestCase):
    def setUp(self):
        TestCase.setUp(self)
        User.objects.create_user(
            username='Jane Smith',
            email="jsmith@localhost",
            password='password',
            first_name="Jane",
            last_name="Smith")
        User.objects.create_user(
            username="John Doe",
            email="jdoe@localhost",
            password='password')


    def test_profile(self):
        user1 = User.objects.get(email="jsmith@localhost")
        user2 = User.objects.get(email="jdoe@localhost")
        self.assertTrue(user1.profile is not None)
        self.assertTrue(user1.profile.initials == "JS")
        self.assertTrue(user2.profile.initials == '')
