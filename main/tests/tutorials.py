# coding: utf-8
from __future__ import absolute_import, unicode_literals

"""
Tests used to validate the tutorial screencast functionality.
"""

import environ
import factory
import json

from django.core.urlresolvers import reverse
from django.test import Client, TestCase
from io import BytesIO
from mock import MagicMock, patch
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


def _load_test_file(name):
    cwd = environ.Path(__file__) - 1
    filepath = cwd('files', name)
    return open(filepath, 'rb')


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

    def _run_upload(self, name):
        with _load_test_file(name) as fp:
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


class ImportDataTests(TestCase):
    fixtures = ['main/tutorial_fba']

    def setUp(self):
        super(ImportDataTests, self).setUp()
        self.user = models.User.objects.get(pk=2)
        self.target_study = models.Study.objects.get(pk=7)
        self.target_kwargs = {'slug': self.target_study.slug}
        self.fake_browser = Client()
        self.fake_browser.force_login(self.user)

    def _run_import_view(self):
        # TODO open the ImportData_*.post file, load into QueryDict, pass through data kwarg
        response = self.fake_browser.post(
            reverse('main:table-import', kwargs=self.target_kwargs),
            data={},
        )
        return response

    def test_hplc_import_parse(self):
        name = 'ImportData_FBA_HPLC.xlsx'
        with _load_test_file(name) as fp:
            response = self.fake_browser.post(
                reverse('main:import_parse'),
                data=fp.read(),
                content_type='application/octet-stream',
                HTTP_X_EDD_FILE_TYPE='xlsx',
                HTTP_X_EDD_IMPORT_MODE='std',
                HTTP_X_FILE_NAME=name,
            )
        self.assertEqual(response.status_code, codes.ok)
        with _load_test_file('ImportData_FBA_HPLC.json') as fp:
            target = json.load(fp)
        # check that objects are the same when re-serialized with sorted keys
        self.assertEqual(
            json.dumps(target, sort_keys=True),
            json.dumps(response.json(), sort_keys=True),
        )

    def test_hplc_import_task(self):
        pass

    def test_hplc_import_view(self):
        with patch('main.views.redis.ScratchStorage') as MockStorage:
            with patch('main.views.import_table_task.delay') as mock_task:
                storage = MockStorage.return_value
                storage.save.return_value = 'randomkey'
                result = MagicMock()
                result.id = '00000000-aafa-420e-a582-575753b24feb'
                mock_task.return_value = result
                self._run_import_view()
                storage.save.assert_called()
                mock_task.assert_called_with(self.target_study.pk, self.user.pk, 'randomkey')

    def test_od_import_parse(self):
        pass

    def test_od_import_task(self):
        pass

    def test_od_import_view(self):
        pass
