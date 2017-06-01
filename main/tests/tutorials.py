# coding: utf-8
from __future__ import absolute_import, unicode_literals

"""
Tests used to validate the tutorial screencast functionality.
"""

import environ
import factory

from django.core.urlresolvers import reverse
from django.test import RequestFactory, TestCase
from io import BytesIO
from requests import codes

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
        # TODO current behavior raises DRF exception, but not using DRF and result is 500 error
        with self.assertRaises(Exception):
            views.study_describe_experiment(request, pk=self.target_study.pk)

    def test_invalid_filetype(self):
        request = self.fake_browser.post(
            reverse('main:describe', kwargs=self.target_kwargs),
            data=BytesIO(b''),
            content_type='application/octet-stream',
            # front-end returns one of: xlsx, csv, xml, txt; view requires xlsx
            HTTP_X_EDD_FILE_TYPE='txt',
            HTTP_X_FILE_NAME='testfile.docx',
        )
        request.user = self.user
        # simulate request
        response = views.study_describe_experiment(request, pk=self.target_study.pk)
        self.assertEqual(response.status_code, codes.bad_request)

    def test_simple_file(self):
        cwd = environ.Path(__file__) - 1
        name = 'ExperimentDescription_simple.xlsx'
        simple = cwd('files', name)
        with open(simple, 'rb') as fp:
            request = self.fake_browser.post(
                reverse('main:describe', kwargs=self.target_kwargs),
                data=fp.read(),
                content_type='application/octet-stream',
                HTTP_X_EDD_FILE_TYPE='xlsx',
                HTTP_X_FILE_NAME=name,
            )
            request.user = self.user
            # simulate request
            response = views.study_describe_experiment(request, pk=self.target_study.pk)
        self.assertEqual(response.status_code, codes.ok)
        self.assertEqual(self.target_study.line_set.count(), 2)

    def test_missing_strain(self):
        pass

    def test_bad_headers(self):
        pass
