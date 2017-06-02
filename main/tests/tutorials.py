# coding: utf-8
from __future__ import absolute_import, unicode_literals

"""
Tests used to validate the tutorial screencast functionality.
"""

import environ
import factory

from django.core.urlresolvers import reverse
from django.test import Client, TestCase
from io import BytesIO
from requests import codes

from .. import models


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
        self.user = UserFactory()
        self.target_study = StudyFactory()
        self.target_kwargs = {'slug': self.target_study.slug}
        self.target_study.userpermission_set.update_or_create(
            permission_type=models.StudyPermission.WRITE,
            user=self.user,
        )
        self.fake_browser = Client()
        self.fake_browser.force_login(self.user)

    def _load_test_file(self, name):
        cwd = environ.Path(__file__) - 1
        filepath = cwd('files', name)
        return open(filepath, 'rb')

    def _run_upload(self, name):
        with self._load_test_file(name) as fp:
            response = self.fake_browser.post(
                reverse('main:describe', kwargs=self.target_kwargs),
                data=fp.read(),
                content_type='application/octet-stream',
                HTTP_X_EDD_FILE_TYPE='xlsx',
                HTTP_X_FILE_NAME=name,
            )
        return response

    def test_get_request(self):
        # TODO current behavior raises DRF exception, but not using DRF and result is 500 error
        with self.assertRaises(Exception):
            self.fake_browser.get(reverse('main:describe', kwargs=self.target_kwargs))

    def test_invalid_filetype(self):
        response = self.fake_browser.post(
            reverse('main:describe', kwargs=self.target_kwargs),
            data=BytesIO(b''),
            content_type='application/octet-stream',
            # front-end returns one of: xlsx, csv, xml, txt; view requires xlsx
            HTTP_X_EDD_FILE_TYPE='txt',
            HTTP_X_FILE_NAME='testfile.docx',
        )
        self.assertEqual(response.status_code, codes.bad_request)

    def test_simple_file(self):
        name = 'ExperimentDescription_simple.xlsx'
        response = self._run_upload(name)
        self.assertEqual(response.status_code, codes.ok)
        self.assertEqual(self.target_study.line_set.count(), 2)

    def test_missing_strain(self):
        name = 'ExperimentDescription_missing_strain.xlsx'
        response = self._run_upload(name)
        self.assertEqual(response.status_code, codes.server_error)
        self.assertEqual(self.target_study.line_set.count(), 0)
        messages = response.json()
        self.assertIn('errors', messages)
        self.assertEqual(len(messages['errors']), 1)
        self.assertEqual(messages['errors'][0]['category'], 'ICE part access problem')

    def test_double_import(self):
        # Start the same as test_simple_file
        name = 'ExperimentDescription_simple.xlsx'
        response = self._run_upload(name)
        self.assertEqual(self.target_study.line_set.count(), 2)
        # Then do it again
        response = self._run_upload(name)
        self.assertEqual(self.target_study.line_set.count(), 2)
        self.assertEqual(response.status_code, codes.bad_request)
        messages = response.json()
        self.assertIn('errors', messages)
        self.assertEqual(len(messages['errors']), 1)
        self.assertEqual(messages['errors'][0]['category'], 'Naming overlap')

    def test_bad_headers(self):
        name = 'ExperimentDescription_bad_headers.xlsx'
        response = self._run_upload(name)
        self.assertEqual(response.status_code, codes.ok)
        self.assertEqual(self.target_study.line_set.count(), 2)
        messages = response.json()
        self.assertNotIn('errors', messages)
        self.assertIn('warnings', messages)
        self.assertEqual(messages['warnings'][0]['category'], 'User input ignored')

    def test_bad_values(self):
        name = 'ExperimentDescription_bad_values.xlsx'
        response = self._run_upload(name)
        self.assertEqual(response.status_code, codes.bad_request)
        self.assertEqual(self.target_study.line_set.count(), 0)
        messages = response.json()
        self.assertIn('errors', messages)
        self.assertIn('warnings', messages)
        self.assertEqual(len(messages['errors']), 2)
        self.assertItemsEqual(
            {'Incorrect file', 'Invalid values'},
            {err['category'] for err in messages['errors']}
        )
