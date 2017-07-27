# coding: utf-8
from __future__ import absolute_import, unicode_literals

"""
Tests used to validate the tutorial screencast functionality.
"""

import environ
import json

from django.contrib.auth import get_user_model
from django.core.urlresolvers import reverse
from django.http import QueryDict
from io import BytesIO
from mock import MagicMock, patch
from requests import codes

from .. import models, tasks
from . import factory, TestCase


def _load_test_file(name):
    "Opens test files saved in the `files` directory."
    cwd = environ.Path(__file__) - 1
    filepath = cwd('files', name)
    return open(filepath, 'rb')


class ExperimentDescriptionTests(TestCase):
    """
    Sets of tests to exercise the Experiment Description view.
    """

    @classmethod
    def setUpTestData(cls):
        cls.user = factory.UserFactory()
        cls.target_study = factory.StudyFactory()
        cls.target_kwargs = {'slug': cls.target_study.slug}
        cls.target_study.userpermission_set.update_or_create(
            permission_type=models.StudyPermission.WRITE,
            user=cls.user,
        )

    def setUp(self):
        super(ExperimentDescriptionTests, self).setUp()
        self.client.force_login(self.user)

    def _run_upload(self, name):
        with _load_test_file(name) as fp:
            response = self.client.post(
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
            self.client.get(reverse('main:describe', kwargs=self.target_kwargs))

    def test_invalid_filetype(self):
        response = self.client.post(
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
    """
    Sets of tests to exercise Import Data views.
    """

    fixtures = ['main/tutorial_fba']

    def setUp(self):
        super(ImportDataTests, self).setUp()
        self.user = get_user_model().objects.get(pk=2)
        self.target_study = models.Study.objects.get(pk=7)
        self.target_kwargs = {'slug': self.target_study.slug}
        self.client.force_login(self.user)

    def _assay_count(self):
        return models.Assay.objects.filter(line__study=self.target_study).count()

    def _measurement_count(self):
        return models.Measurement.objects.filter(assay__line__study=self.target_study).count()

    def _value_count(self):
        return models.MeasurementValue.objects.filter(
            measurement__assay__line__study=self.target_study
        ).count()

    def _run_import_view(self, postfile):
        with _load_test_file(postfile) as poststring:
            POST = QueryDict(poststring.read())
        # mocking redis and celery task, to only test the view itself
        with patch('main.views.redis.ScratchStorage') as MockStorage:
            with patch('main.views.import_table_task.delay') as mock_task:
                storage = MockStorage.return_value
                storage.save.return_value = 'randomkey'
                result = MagicMock()
                result.id = '00000000-0000-0000-0000-000000000001'
                mock_task.return_value = result
                # fake the request
                response = self.client.post(
                    reverse('main:table-import', kwargs=self.target_kwargs),
                    data=POST,
                )
                # assert calls to redis and celery
                storage.save.assert_called()
                mock_task.assert_called_with(self.target_study.pk, self.user.pk, 'randomkey')
        return response

    def _run_parse_view(self, filename, filetype, mode):
        with _load_test_file(filename) as fp:
            response = self.client.post(
                reverse('main:import_parse'),
                data=fp.read(),
                content_type='application/octet-stream',
                HTTP_X_EDD_FILE_TYPE=filetype,
                HTTP_X_EDD_IMPORT_MODE=mode,
                HTTP_X_FILE_NAME=filename,
            )
        self.assertEqual(response.status_code, codes.ok)
        with _load_test_file(filename + '.json') as fp:
            target = json.load(fp)
        # check that objects are the same when re-serialized with sorted keys
        self.assertEqual(
            json.dumps(target, sort_keys=True),
            json.dumps(response.json(), sort_keys=True),
        )
        return response

    def _run_task(self, filename):
        storage_key = 'randomkey'
        with _load_test_file(filename + '.post') as post:
            data = post.read()
        # mocking redis, so test provides the data instead of real redis
        with patch('main.tasks.ScratchStorage') as MockStorage:
            storage = MockStorage.return_value
            storage.load.return_value = data
            tasks.import_table_task(self.target_study.pk, self.user.pk, storage_key)
            # assertions
            storage.load.assert_called_with(storage_key)
            storage.delete.assert_called_with(storage_key)

    def test_hplc_import_parse(self):
        name = 'ImportData_FBA_HPLC.xlsx'
        response = self._run_parse_view(name, 'xlsx', 'std')
        self.assertEqual(response.status_code, codes.ok)

    def test_hplc_import_task(self):
        self._run_task('ImportData_FBA_HPLC.xlsx')
        self.assertEqual(self._assay_count(), 2)
        self.assertEqual(self._measurement_count(), 4)
        self.assertEqual(self._value_count(), 28)

    def test_hplc_import_view(self):
        response = self._run_import_view('ImportData_FBA_HPLC.xlsx.post')
        self.assertEqual(self._assay_count(), 0)  # view does not change assays
        self.assertRedirects(
            response,
            reverse('main:detail', kwargs=self.target_kwargs),
            # because no assays exist yet, there is another redirect to the lines view
            target_status_code=codes.found,
        )

    def test_od_import_parse(self):
        name = 'ImportData_FBA_OD.xlsx'
        response = self._run_parse_view(name, 'xlsx', 'std')
        self.assertEqual(response.status_code, codes.ok)

    def test_od_import_task(self):
        self._run_task('ImportData_FBA_OD.xlsx')
        self.assertEqual(self._assay_count(), 2)
        self.assertEqual(self._measurement_count(), 2)
        self.assertEqual(self._value_count(), 14)

    def test_od_import_view(self):
        response = self._run_import_view('ImportData_FBA_OD.xlsx.post')
        self.assertEqual(self._assay_count(), 0)  # view does not change assays
        self.assertRedirects(
            response,
            reverse('main:detail', kwargs=self.target_kwargs),
            # because no assays exist yet, there is another redirect to the lines view
            target_status_code=codes.found,
        )


class ExportDataTests(TestCase):
    """
    Sets of tests to exercise the SBML and Table export views.
    """

    fixtures = ['main/tutorial_fba', 'main/tutorial_fba_loaded']

    def setUp(self):
        super(ExportDataTests, self).setUp()
        self.user = get_user_model().objects.get(pk=2)
        self.target_study = models.Study.objects.get(pk=7)
        self.target_kwargs = {'slug': self.target_study.slug}
        self.client.force_login(self.user)

    def test_step1_export(self):
        "First step loads the SBML export page, and has some warnings."
        response = self.client.get(
            reverse('main:sbml'),
            data={'lineId': 8},
        )
        self.assertEqual(response.status_code, codes.ok)
        self.assertEqual(len(response.context['sbml_warnings']), 5)

    def test_step2_export(self):
        "Second step selects an SBML Template."
        with _load_test_file('ExportData_FBA_step2.post') as fp:
            POST = QueryDict(fp.read())
        response = self.client.post(
            reverse('main:sbml'),
            data=POST,
        )
        self.assertEqual(response.status_code, codes.ok)
        self.assertEqual(len(response.context['sbml_warnings']), 4)

    def test_step3_export(self):
        "Third step maps metabolites to species/reactions, and selects an export timepoint."
        with _load_test_file('ExportData_FBA_step3.post') as fp:
            POST = QueryDict(fp.read())
        response = self.client.post(
            reverse('main:sbml'),
            data=POST,
        )
        self.assertEqual(response.status_code, codes.ok)
        # TODO figure out how to test content of chunked responses
