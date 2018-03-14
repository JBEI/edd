# coding: utf-8
"""
Tests used to validate the tutorial screencast functionality.
"""

from django.core.urlresolvers import reverse
from django.test import Client, TestCase
from requests import codes

from .. import models
from . import factory


class StudyViewTests(TestCase):
    """
    Tests for the behavior of the Study view(s).
    """

    def setUp(self):
        super(StudyViewTests, self).setUp()
        self.user = factory.UserFactory()
        self.target_study = factory.StudyFactory()
        self.target_kwargs = {'slug': self.target_study.slug}
        self.target_study.userpermission_set.update_or_create(
            permission_type=models.StudyPermission.WRITE,
            user=self.user,
        )
        self.fake_browser = Client()
        self.fake_browser.force_login(self.user)

    def test_empty_post(self):
        """ An empty POST request should just act like a GET. """
        response = self.fake_browser.post(
            reverse('main:lines', kwargs=self.target_kwargs),
            data={},
        )
        self.assertEqual(response.status_code, codes.ok)
