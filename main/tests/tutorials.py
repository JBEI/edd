# coding: utf-8
"""
Tests used to validate the tutorial screencast functionality.
"""

import codecs
import json
import math

from django.conf import settings
from django.contrib.auth import get_user_model
from django.http import QueryDict
from django.urls import reverse
from django.test import override_settings
from io import BytesIO
from requests import codes
from unittest.mock import patch

from .. import models, tasks
from . import factory, TestCase

_CONTEXT_FILENAME = '%s.post.context.json'
_PAGED_CONTEXT_FILENAME = '%s.post.paged.context.json'
_SERIES_FILENAME = '%s.post.series.json'


class ExperimentDescriptionTests(TestCase):
    """
    Sets of tests to exercise the Experiment Description view.
    """

    @classmethod
    def setUpTestData(cls):
        super(ExperimentDescriptionTests, cls).setUpTestData()
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
        with factory.load_test_file(name) as fp:
            upload = BytesIO(fp.read())
        upload.name = name
        upload.content_type = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        response = self.client.post(
            reverse('main:describe', kwargs=self.target_kwargs),
            data={"file": upload},
        )
        return response

    def test_get_request(self):
        # TODO current behavior raises DRF exception, but not using DRF and result is 500 error
        with self.assertRaises(Exception):
            self.client.get(reverse('main:describe', kwargs=self.target_kwargs))

    def test_invalid_filetype(self):
        upload = BytesIO(b'')
        upload.name = 'testfile.docx'
        upload.content_type = 'application/octet-stream'
        response = self.client.post(
            reverse('main:describe', kwargs=self.target_kwargs),
            data={'file': upload},
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
        self.assertEqual(response.status_code, codes.bad_request)
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
        self.assertEqual(messages['errors'][0]['category'], 'Non-unique line names')

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
        self.assertEqual(
            {'Incorrect file format', 'Invalid values'},
            {err['category'] for err in messages['errors']}
        )


class ImportDataTestsMixin(object):
    """
    Common code for tests of import data. Expects following attributes on self:
        + `target_study` set to a Study model
        + `user` set to a User model
    """

    def _assay_count(self):
        return models.Assay.objects.filter(line__study=self.target_study).count()

    def _measurement_count(self):
        return models.Measurement.objects.filter(assay__line__study=self.target_study).count()

    def _value_count(self):
        return models.MeasurementValue.objects.filter(
            measurement__assay__line__study=self.target_study
        ).count()

    def _import_url(self):
        return reverse('main:table-import', kwargs={'slug': self.target_study.slug})

    def _view_url(self):
        return reverse('main:detail', kwargs={'slug': self.target_study.slug})

    # future proof the test against local changes to settings that control its behavior
    @override_settings(EDD_IMPORT_CACHE_LENGTH=1, EDD_IMPORT_PAGE_LIMIT=1000,
                       EDD_IMPORT_PAGE_SIZE=1000)
    def _run_import_view(self, file, import_id):
        return self._run_paged_import_view(file, import_id, page_count=1)

    def _run_paged_import_view(self, file, import_id, page_count=1):
        # load post data broken up across multiple files
        context_file_name = _CONTEXT_FILENAME % file
        if page_count > 1:
            context_file_name = _PAGED_CONTEXT_FILENAME % file
        with factory.load_test_file(context_file_name, 'rt') as context_file:
            context_str = context_file.read()

        # load series data, slicing it up into pages if requested
        with factory.load_test_file(_SERIES_FILENAME % file, 'rt') as series_file:
            series_pages = self._slice_series_pages(series_file, page_count)

        # mocking redis and celery task, to only test the view itself
        with patch('main.redis.ScratchStorage') as MockStorage:
            with patch('main.tasks.import_table_task.delay') as mock_task:
                storage = MockStorage.return_value
                storage.page_count.return_value = 0
                storage.save.return_value = import_id
                storage.append.side_effect = ((import_id, i+1) for i in range(0, page_count))

                with patch('celery.result.AsyncResult') as MockResult:
                    mock_result = MockResult.return_value
                    mock_result.id = '00000000-0000-0000-0000-000000000001'
                    mock_task.return_value = mock_result

                    # fake the request(s)
                    for i, page in enumerate(series_pages):
                        # stitch POST data together for simulating a client request. The first
                        # request has both context and series data. Subsequent requests will
                        # only contain series data.
                        if i == 0:
                            post_data = context_str.strip()[0:-1]  # strip off the closing bracket
                            post_data = f'{post_data}, "series": {series_pages[0]} }}'
                        else:
                            post_data = (f'{{ "importId": "{import_id}", "page": {i+1}, '
                                         f'"totalPages": {page_count}, "series": {page}}}')
                        response = self.client.post(self._import_url(), data=post_data,
                                                    content_type='application/json')
                        self.assertEqual(response.status_code, codes.accepted)

                    # assert calls to celery
                    mock_task.assert_called_once_with(self.target_study.pk, self.user.pk,
                                                      import_id)
        self.assertEquals(self._assay_count(), 0)  # view does not change assays
        return response

    def _run_parse_view(self, filename, filetype, mode):
        with factory.load_test_file(filename) as fp:
            upload = BytesIO(fp.read())
        upload.name = filename
        response = self.client.post(
            reverse('main:import_parse'),
            data={
                "file": upload,
                "X_EDD_FILE_TYPE": filetype,
                "X_EDD_IMPORT_MODE": mode,
            },
        )
        self.assertEqual(response.status_code, codes.ok)
        with factory.load_test_file(filename + '.json') as fp:
            reader = codecs.getreader('utf-8')
            target = json.load(reader(fp))
        # check that objects are the same when re-serialized with sorted keys
        self.assertEqual(
            json.dumps(target, sort_keys=True),
            json.dumps(response.json(), sort_keys=True),
        )
        return response

    def _run_task(self, base_filename, import_id, page_count=1):
        # load post data broken up across multiple files
        filename = ((_CONTEXT_FILENAME if page_count == 1 else _PAGED_CONTEXT_FILENAME) %
                    base_filename)
        with factory.load_test_file(filename, 'rt') as context_file:
            context_str = context_file.read()

        with factory.load_test_file(_SERIES_FILENAME % base_filename) as series_file:
            series_pages = self._slice_series_pages(series_file, page_count)

        # mocking redis, so test provides the data instead of real redis
        with patch('main.redis.ScratchStorage') as MockStorage:
            storage = MockStorage.return_value
            storage.load.return_value = context_str
            storage.load_pages.return_value = series_pages
            tasks.import_table_task(self.target_study.pk, self.user.pk, import_id)

            storage.load.assert_called_once()
            storage.load_pages.assert_called_once()

    def _slice_series_pages(self, series_file, page_count):
        """ Read the aggregated series data from file and if configured to test multiple pages,
            break it up into chunks for insertion into the simulated cache. Clients of this
            method must override EDD_IMPORT_PAGE_SIZE to get predictable results.
        """

        # if import can be completed in a single page, just return the series data directly from
        # file
        series_str = series_file.read()
        if page_count == 1:
            return [series_str]

        # since we have to page the data, parse the json and break it up into pages of the
        # requested size
        series = json.loads(series_str)
        item_count = len(series)
        page_size = settings.EDD_IMPORT_PAGE_SIZE

        pages = []
        for i in range(0, int(math.ceil(item_count / page_size))):
            end_index = min((i+1) * page_size, item_count)
            page_series = series[i * page_size:end_index]
            pages.append(json.dumps(page_series))
            self.assertTrue(page_series)

        self.assertEquals(len(pages), page_count)  # verify that data file content matches

        return pages


def derive_cache_values(post_str):
    """
    Extracts parts from the post request to be inserted into or extracted from the import cache.
    This requires parsing the request multiple times during the test, but it should be the
    succinct way to avoid duplicating the post data in test inputs, or breaking it up into even
    more files.
    """
    parsed_json = json.loads(post_str)

    # extract series data first.  everything else is context
    series = parsed_json['series']

    del parsed_json['series']
    context = json.dumps(parsed_json)
    series = json.dumps(series)
    return context, series


class FBAImportDataTests(ImportDataTestsMixin, TestCase):
    """
    Sets of tests to exercise Import Data views used in Tutorial #4 (Flux Balance Analysis).
    """

    fixtures = ['main/tutorial_fba']

    def setUp(self):
        super(FBAImportDataTests, self).setUp()
        self.user = get_user_model().objects.get(pk=2)
        self.target_study = models.Study.objects.get(pk=7)
        self.client.force_login(self.user)

    def test_hplc_import_parse(self):
        response = self._run_parse_view('ImportData_FBA_HPLC.xlsx', 'xlsx', 'std')
        self.assertEqual(response.status_code, codes.ok)

    def test_hplc_import_task(self):
        self._run_task('ImportData_FBA_HPLC.xlsx', 'random_key')
        self.assertEqual(self._assay_count(), 2)
        self.assertEqual(self._measurement_count(), 4)
        self.assertEqual(self._value_count(), 28)

    def test_hplc_import_view(self):
        response = self._run_import_view('ImportData_FBA_HPLC.xlsx', 'random_key')
        self.assertEqual(response.status_code, codes.accepted)

    def test_od_import_parse(self):
        name = 'ImportData_FBA_OD.xlsx'
        response = self._run_parse_view(name, 'xlsx', 'std')
        self.assertEqual(response.status_code, codes.ok)

    def test_od_import_task(self):
        self._run_task('ImportData_FBA_OD.xlsx', 'random_key')
        self.assertEqual(self._assay_count(), 2)
        self.assertEqual(self._measurement_count(), 2)
        self.assertEqual(self._value_count(), 14)

    def test_od_import_view(self):
        response = self._run_import_view('ImportData_FBA_OD.xlsx', 'randomkey')
        self.assertEqual(response.status_code, codes.accepted)


class PagedImportTests(ImportDataTestsMixin, TestCase):
    """
    Executes a set of tests that verify multi-page import using a subset of data from Tutorial
    #5 (Principal Component Analysis of Proteomics).
    """
    fixtures = ['main/tutorial_pcap']

    def setUp(self):
        super(PagedImportTests, self).setUp()
        self.user = get_user_model().objects.get(pk=2)
        self.target_study = models.Study.objects.get(pk=20)
        self.client.force_login(self.user)
        self.import_id = '3f775231-e380-42eb-a693-cf0d88e133ba'  # same as the paged context file

    # override settings to force the import to be multi-paged, and also to future proof the
    # test against local settings changes. Otherwise, exactly the same test here as in
    # PCAPImportDataTests
    @override_settings(EDD_IMPORT_PAGE_SIZE=3, EDD_IMPORT_PAGE_LIMIT=1000,
                       EDD_IMPORT_CACHE_LENGTH=1)
    def test_od_import_view(self):
        response = self._run_paged_import_view('ImportData_PCAP_OD.xlsx', self.import_id,
                                               page_count=10)
        self.assertEqual(response.status_code, codes.accepted)

    # override settings to force the import to be multi-paged, and also to future proof the
    # test against local settings changes. Otherwise, exactly the same test here as in
    # PCAPImportDataTests
    @override_settings(EDD_IMPORT_PAGE_SIZE=3, EDD_IMPORT_PAGE_LIMIT=1000,
                       EDD_IMPORT_CACHE_LENGTH=1)
    def test_od_import_task(self):
        self._run_task('ImportData_PCAP_OD.xlsx', self.import_id, page_count=10)
        self.assertEqual(self._assay_count(), 30)
        self.assertEqual(self._measurement_count(), 30)
        self.assertEqual(self._value_count(), 30)

    # override settings to force the import to be multi-paged, and also to future proof the
    # test against local settings changes. Otherwise, exactly the same test here as in
    # PCAPImportDataTests
    @override_settings(EDD_IMPORT_PAGE_SIZE=3, EDD_IMPORT_PAGE_LIMIT=1000,
                       EDD_IMPORT_CACHE_LENGTH=1)
    def test_import_retry_view(self):
        """
        Tests the HTTP DELETE functionality that enables the import retry feature.
        """
        # mocking redis and celery task, to only test the view itself
        with patch('main.redis.ScratchStorage') as MockStorage:
            # get a mock redis cache...ordinarily it'd have data in it to delete, but no need
            # for it here
            storage = MockStorage.return_value

            # test attempted cache deletion with a non-uuid import key. this must always fail,
            # or else we've exposed the capability for users to delete arbitrary pages from
            # our redis cache
            response = self.client.delete(self._import_url(),
                                          data=bytes('non-uuid-import-id', encoding='UTF-8'),
                                          content_type='application/json')
            self.assertEquals(response.status_code, codes.bad_request)
            storage.delete.assert_not_called()

            # fake a valid DELETE request
            response = self.client.delete(self._import_url(),
                                          data=bytes(self.import_id, encoding='UTF-8'),
                                          content_type='application/json')
            self.assertEquals(response.status_code, codes.ok)
            storage.delete.assert_called_once()

        self.assertEquals(self._assay_count(), 0)  # view does not change assays
        return response


class PCAPImportDataTests(ImportDataTestsMixin, TestCase):
    """
    Sets of tests to exercise Import Data views used in Tutorial #5 (Principal Component Analysis
    of Proteomics).
    """

    fixtures = ['main/tutorial_pcap']

    def setUp(self):
        super(PCAPImportDataTests, self).setUp()
        self.user = get_user_model().objects.get(pk=2)
        self.target_study = models.Study.objects.get(pk=20)
        self.client.force_login(self.user)

    def test_gcms_import_parse(self):
        response = self._run_parse_view('ImportData_PCAP_GCMS.csv', 'csv', 'std')
        self.assertEqual(response.status_code, codes.ok)

    def test_gcms_import_task(self):
        self._run_task('ImportData_PCAP_GCMS.csv', 'random_key')
        self.assertEqual(self._assay_count(), 30)
        self.assertEqual(self._measurement_count(), 30)
        self.assertEqual(self._value_count(), 30)

    def test_gcms_import_view(self):
        response = self._run_import_view('ImportData_PCAP_GCMS.csv', 'randomkey')
        self.assertEqual(response.status_code, codes.accepted)

    def test_od_import_parse(self):
        response = self._run_parse_view('ImportData_PCAP_OD.xlsx', 'xlsx', 'std')
        self.assertEqual(response.status_code, codes.ok)

    def test_od_import_task(self):
        self._run_task('ImportData_PCAP_OD.xlsx', 'random_key')
        self.assertEqual(self._assay_count(), 30)
        self.assertEqual(self._measurement_count(), 30)
        self.assertEqual(self._value_count(), 30)

    def test_od_import_view(self):
        response = self._run_import_view('ImportData_PCAP_OD.xlsx', 'randomkey')
        self.assertEqual(response.status_code, codes.accepted)

    def test_proteomics_import_parse(self):
        response = self._run_parse_view('ImportData_PCAP_Proteomics.csv', 'csv', 'std')
        self.assertEqual(response.status_code, codes.ok)

    def test_proteomics_import_task(self):
        self._run_task('ImportData_PCAP_Proteomics.csv', 'random_key')
        self.assertEqual(self._assay_count(), 30)
        self.assertEqual(self._measurement_count(), 270)
        self.assertEqual(self._value_count(), 270)

    def test_proteomics_import_view(self):
        response = self._run_import_view('ImportData_PCAP_Proteomics.csv', 'randomkey')
        self.assertEqual(response.status_code, codes.accepted)


class FBAExportDataTests(TestCase):
    """
    Sets of tests to exercise the SBML and Table export views used in Tutorial #4 (Flux
    Balance Analysis).
    """

    fixtures = ['main/tutorial_fba', 'main/tutorial_fba_loaded']

    def setUp(self):
        super(FBAExportDataTests, self).setUp()
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
        with factory.load_test_file('ExportData_FBA_step2.post') as fp:
            POST = QueryDict(fp.read())
        response = self.client.post(
            reverse('main:sbml'),
            data=POST,
        )
        self.assertEqual(response.status_code, codes.ok)
        self.assertEqual(len(response.context['sbml_warnings']), 4)

    def test_step3_export(self):
        "Third step maps metabolites to species/reactions, and selects an export timepoint."
        with factory.load_test_file('ExportData_FBA_step3.post') as fp:
            POST = QueryDict(fp.read())
        response = self.client.post(
            reverse('main:sbml'),
            data=POST,
        )
        self.assertEqual(response.status_code, codes.ok)
        # TODO figure out how to test content of chunked responses


class PCAPExportDataTests(TestCase):
    """
    """

    fixtures = ['main/tutorial_pcap', 'main/tutorial_pcap_loaded']

    def setUp(self):
        super(PCAPExportDataTests, self).setUp()
