from __future__ import unicode_literals
from django.test import TestCase
from django.contrib.auth import get_user_model
User = get_user_model()



class UserProfileTest(TestCase):
    USERNAME = "Jane Smith"
    EMAIL = "jsmith@localhost"
    PASSWORD = 'password'
    FIRST_NAME = "Jane"
    LAST_NAME = "Smith"

    USERNAME2 = "John Doe"
    EMAIL2 = "jdoe@localhost"

    # create test users
    def setUp(self):
        super(UserProfileTest, self).setUp()
        User.objects.create_user(
            username=self.USERNAME,
            email=self.EMAIL,
            password=self.PASSWORD,
            first_name=self.FIRST_NAME,
            last_name=self.LAST_NAME
            )
        User.objects.create_user(
            username=self.USERNAME2,
            email=self.EMAIL2,
            password=self.PASSWORD)

    def test_profile(self):
        """ Ensure user profile has appropriate fields"""
        # Load objects
        user1 = User.objects.get(email=self.EMAIL)
        user2 = User.objects.get(email="jdoe@localhost")
        # Asserts
        self.assertTrue(user1.profile is not None)
        self.assertTrue(user1.profile.initials == "JS")
        self.assertTrue(user2.profile.initials == '')
