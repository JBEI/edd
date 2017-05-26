# coding: utf-8
from __future__ import absolute_import, unicode_literals

"""
Tests used to validate the tutorial screencast functionality.
"""

import factory

from django.core.urlresolvers import reverse
from django.test import RequestFactory, TestCase

from .. import models, views


class StudyFactory(factory.django.DjangoModelFactory):
    class Meta:
        model = models.Study
    name = factory.Faker('catch_phrase')
    description = factory.Faker('text', max_nb_chars=300)


class UserFactory(factory.django.DjangoModelFactory):
    class Meta:
        model = models.User
    username = factory.Sequence(lambda n: 'user%03d' % n)  # username is unique


class ExperimentDescriptionTests(TestCase):

    def setUp(self):
        super(ExperimentDescriptionTests, self).setUp()
        self.fake_browser = RequestFactory()
        self.user = UserFactory()
        self.target_study = StudyFactory()
        self.target_kwargs = {'slug': self.target_study.slug}
        self.target_study.userpermission_set.update_or_create(
            permission_type=models.StudyPermission.WRITE,
            user=self.user,
        )

    def test_get_request(self):
        request = self.fake_browser.get(reverse('main:describe', kwargs=self.target_kwargs))
        request.user = self.user
        with self.assertRaises(Exception):
            views.study_describe_experiment(request, pk=self.target_study.pk)

    def test_invalid_filetype(self):
        pass

    def test_simple_file(self):
        pass

    def test_missing_strain(self):
        pass

    def test_bad_headers(self):
        pass
