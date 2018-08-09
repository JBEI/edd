# coding: utf-8


import json
import os
import uuid
from io import BytesIO
from unittest.mock import patch

from django.contrib.contenttypes.models import ContentType
from django.contrib.auth import get_user_model
from django.contrib.auth.models import Permission
from django.test import override_settings
from django.urls import reverse
from requests import codes
from rest_framework.test import APITestCase

from . import factory
from edd.rest.tests import EddApiTestCaseMixin
from main import models as edd_models
from main.importer.table import ImportBroker
from main.tasks import import_table_task
from main.tests import factory as main_factory


def load_permissions(model, *codenames):
    ct = ContentType.objects.get_for_model(model)
    return list(Permission.objects.filter(content_type=ct, codename__in=codenames))


class ImportTests(EddApiTestCaseMixin, APITestCase):
    """
    Sets of tests to exercise the Experiment Description view.
    """
    fixtures = [
        'bootstrap.json',
        'edd_file_importer/basic.json',
        'edd/rest/study_permissions.json'
    ]

    @classmethod
    def setUpTestData(cls):
        super(ImportTests, cls).setUpTestData()

        User = get_user_model()

        cls.grp_read_study = edd_models.Study.objects.get(pk=23)  # "Group read study"
        cls.superuser = User.objects.get(username='superuser')
        cls.staffuser = User.objects.get(username='staff.user')

        # not doing this in fixture because it requires knowing the IDs, which can vary per deploy
        cls.staffuser.user_permissions.add(
            *load_permissions(edd_models.Study, 'add_study', 'change_study', 'delete_study')
        )
        cls.unprivileged_user = User.objects.get(username='unprivileged_user')
        cls.readonly_user = User.objects.get(username='study.reader.user')
        cls.write_user = User.objects.get(username='study.writer.user')
        cls.write_group_user = User.objects.get(username='study.writer.group.user')

        # create a study only writeable by a single user
        cls.user_write_study = main_factory.StudyFactory(name='User-writeable study')
        permissions = cls.user_write_study.userpermission_set
        permissions.update_or_create(permission_type=edd_models.UserPermission.WRITE,
                                     user=cls.write_user)
        edd_models.Line.objects.create(name='A', study=cls.user_write_study)
        edd_models.Line.objects.create(name='B', study=cls.user_write_study)

        # get or create some commonly-used measurement types referenced in the test,
        # but not included in the bootstrap fixture.
        edd_models.Metabolite.objects.get_or_create(type_name='R-Mevalonate', type_group='m',
                                                    molecular_formula='C6H11O4', molar_mass=0,
                                                    charge=0, pubchem_cid=5288798)
        edd_models.Metabolite.objects.get_or_create(type_name='Limonene', type_group='m',
                                                    molecular_formula='C10H16',
                                                    molar_mass=136.24000, charge=0,
                                                    pubchem_cid=440917)

        # TODO: copied same as the paged context file
        cls.import_id = '3f775231-e380-42eb-a693-cf0d88e133ba'

    def setUp(self):
        super(ImportTests, self).setUp()
        self.client.force_login(ImportTests.unprivileged_user)
        # self.client.force_login(ImportTests.write_user)

    def _create_import(self, file_path, form_data):
        upload = self._build_file_upload(file_path)

        response = self.client.post(
            reverse('edd.rest:study-imports-list', kwargs={'study_pk': self.user_write_study.pk}),
            data={'file': upload, **form_data},
            format='multipart',
        )

        return response

    def _build_file_upload(self, file_path):
        with open(file_path, 'rb') as fp:
            upload = BytesIO(fp.read())
        upload.name = os.path.basename(file_path)  # get file name from path
        upload.content_type = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        return upload

    # future proof the test against local settings changes, and ensure its redis data gets
    # deleted promptly
    @override_settings(EDD_IMPORT_PAGE_SIZE=3, EDD_IMPORT_PAGE_LIMIT=1000,
                       EDD_IMPORT_CACHE_LENGTH=5)
    def test_fba_celery_integration(self):
        """
        A high-level integration test that compares tutorial FBA OD data from the legacy import
        process against the WIP new import backend.  This test should help mitigate risk for
        continuing development of the new import without too much reliance on the internal code
        structure, which is likely to evolve.  The test will likely be superceded by finer-grained
        unit tests when the pipeline is more mature.
        """

        # create lines to match the FBA tutorial study
        edd_models.Line.objects.create(name='arcA', study=self.user_write_study)
        edd_models.Line.objects.create(name='BW1', study=self.user_write_study)

        # build the Import 2.0 payload
        request_payload = {
            'category': 7,  # OD600
            'file_format': 2,  # generic
            'protocol': 3,  # OD600
            'x_units': 2,  # hours
            'y_units': 1,  # n/a
            'compartment': edd_models.Measurement.Compartment.UNKNOWN,
            'mime_type': ''
        }

        # load & process a generic-format version of the tutorial FBA OD data
        file_path = factory.test_file_path('generic_import', 'FBA-OD-generic.xlsx')
        response = self._create_import(file_path, request_payload)

        # get the assigned ID for the newly-created import
        response_json = json.loads(response.content)
        import_uuid = uuid.UUID(response_json['uuid'])

        study_pk = self.user_write_study.pk
        user_pk = self.write_user.pk

        # manually run the legacy Celery task to verify that JSON from the new import pipeline
        # can be used by the existing Celery code. Note we run it synchronously so it's subject
        # to the same DB transaction as this test
        import_table_task(study_pk, user_pk, import_uuid)

        # verify correct number of assays created (1 per line)
        bw1_as = edd_models.Assay.objects.filter(line__name='BW1',
                                                 line__study_id=study_pk).count()
        arcA_as = edd_models.Assay.objects.filter(line__name='arcA',
                                                  line__study_id=study_pk).count()
        self.assertEquals(bw1_as, 1)
        self.assertEquals(arcA_as, 1)

        # verify that the right number of measurements were created
        bw1_ms = edd_models.Measurement.objects.filter(
            assay__line__name='BW1', assay__line__study_id=study_pk)
        arcA_ms = edd_models.Measurement.objects.filter(assay__line__name='arcA',
                                                        assay__line__study_id=study_pk)
        self.assertEquals(len(bw1_ms), 1)
        self.assertEquals(len(arcA_ms), 1)

        # verify the right number of values were created
        bw1_vals = edd_models.MeasurementValue.objects.filter(
            measurement_id=bw1_ms.get().pk).count()

        arcA_vals = edd_models.MeasurementValue.objects.filter(
            measurement_id=arcA_ms.get().pk).count()

        self.assertEquals(bw1_vals, 7)
        self.assertEquals(arcA_vals, 7)
        self.assertEqual(response.status_code, codes.ok)

        # extract cache entries generated during the import to support manual comparison of JSON
        # generated for the UI to to the data generated by s/{\x}/measurements/ view used in the
        #  study-data page...it should be more-or-less identical to enable use of the same front
        #  end code.  Turns similarity is "less" and not worth auto-comparing.
        _PRINT_RESULTS = True
        if not _PRINT_RESULTS:
            return

        broker = ImportBroker()
        context = broker.load_context(import_uuid)
        series_data = broker.load_pages(import_uuid)

        print('CONTEXT CACHE')
        print(context)

        print('SERIES CACHE')
        page_num = 1
        for page in series_data:
            print(f'PAGE {page_num}')
            print(page)
            page_num += 1

        print('UI PAYLOAD:')
        print(response.content)

    def test_parse_err_propagation(self):
        """"
        Tests parse error propagation through the view by checking for the same errors as the
        parser test. Note that this test is dependent on correct operation of the parser, but
        it's simpler not to mock the parser for functionality that's already unit tested.
        """

        # build the Import 2.0 payload
        request_payload = {
            'category': 7,  # OD600
            'file_format': 2,  # generic
            'protocol': 3,  # OD600
            'x_units': 2,  # hours
            'y_units': 1,  # n/a
            'compartment': edd_models.Measurement.Compartment.UNKNOWN,
            'mime_type': ''
        }

        # upload & process the erroneous input
        file_path = factory.test_file_path('generic_import', 'generic_import_parse_errs.xlsx')
        response = self._create_import(file_path, request_payload)

        # assert that all the expected errors were found and communicated
        self.assertEqual(response.status_code, codes.bad_request)
        response_json = json.loads(response.content)
        exp_response = factory.load_test_json('generic_import/exp_parse_errors.json')
        self.assertEqual(exp_response, response_json)

    def manual_upload_test(self):
        """
        A test method for use in manually executing step 2 of the new import.
        :return:
        """

        json_data = {
            'category': 6,  # metabolomics
            'file_format': 2,  # generic
            'protocol': 2,  # HPLC (concentrations)
            'x_units': 2,  # hours
            'y_units': 3,  # g/L
            'compartment': edd_models.Measurement.Compartment.UNKNOWN,
            'mime_type': ''
        }

        # response = self._run_upload('generic_import/', json_data)
        file_path = factory.test_file_path('generic_import', 'generic_import.xlsx')

        response = self._run_manual_test_upload(file_path, json_data)
        self.assertEqual(response.status_code, codes.ok)

    def _run_manual_test_upload(self, file_path, form_data, redis_cache_page_count=0):
        upload = self._build_file_upload(file_path)

        # TODO: restore mocking below, then resolve impact on JSON build process
        # Mock Metabolite._load_pubchem so testing doesn't inadvertently query PubChem, esp during
        # initial development
        # with patch('main.models.measurement_type.Metabolite') as MockMetabolite:
        #     metabolite = MockMetabolite.return_value
        #     metabolite._load_pubchem.side_effect = ValidationError('Unit test coding error.
        # Test '
        #                                                            'code should not be querying '
        #                                                            'PubChem')

        # mock Redis so we're only testing the view itself
        with patch('main.views.redis.ScratchStorage') as MockStorage:
            storage = MockStorage.return_value
            storage.page_count.return_value = 0
            storage.save.return_value = self.import_id  # TODO: doesn't make sense....copied
            storage.append.side_effect = ((self.import_id, i + 1) for i in
                                          range(0, redis_cache_page_count))
            storage.append.assert_called_once_with()
        response = self.client.post(
            reverse('edd.rest:study-imports-list', kwargs={'study_pk': self.user_write_study.pk}),
            data={'file': upload, **form_data},
            format='multipart',
        )
        return response

    def test_categories(self):
        url = reverse('edd.rest:import_categories-list')
        response = self.client.get(url,
                                   data={'ordering': 'display_order'})
        self.assertEqual(response.status_code, codes.ok)
        with factory.load_test_file('import_categories.json') as file:
            self.assertEqual(json.loads(file.read()), json.loads(response.content))
