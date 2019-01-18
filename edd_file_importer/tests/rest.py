# coding: utf-8

import copy
import json
import logging
import os
import uuid
from io import BytesIO
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.contrib.auth.models import Permission
from django.contrib.contenttypes.models import ContentType
from django.test import override_settings
from django.urls import reverse
from requests import codes
from rest_framework.test import APITestCase

from . import factory
from . test_utils import CONTEXT_PATH
from edd.rest.tests import EddApiTestCaseMixin
from edd.utilities import JSONDecoder
from main import models as edd_models
from main.tests import factory as main_factory


logger = logging.getLogger(__name__)

_TEST_FILES_DIR = os.path.join(os.path.dirname(
    os.path.abspath(__file__)), 'files', 'generic_import')

_FBA_UPLOAD_PAYLOAD = {
            'category': 4,  # OD600
            'file_format': 5,  # generic
            'protocol': 3,  # OD600
            'x_units': 2,  # hours
            'y_units': 1,  # n/a
            'compartment': edd_models.Measurement.Compartment.UNKNOWN,
            'mime_type': '',
            'uuid': '69827386-d5f9-41b9-81d2-8469d735ed56',
        }


def load_permissions(model, *codenames):
    ct = ContentType.objects.get_for_model(model)
    return list(Permission.objects.filter(content_type=ct, codename__in=codenames))


# use example files as the basis for DB records created by the fixture
@override_settings(MEDIA_ROOT=_TEST_FILES_DIR)
class ImportPatchTests(EddApiTestCaseMixin, APITestCase):
    fixtures = ['edd_file_importer/import_models']

    @classmethod
    def setUpTestData(cls):
        super().setUpTestData()

        # create a test user and give it permission to write to the study
        User = get_user_model()
        cls.write_user = User.objects.create(username='study.writer.user')
        cls.unprivileged_user = User.objects.create(username='unprivileged_user')

        cls.user_write_study = main_factory.StudyFactory(name='User-writeable study')
        permissions = cls.user_write_study.userpermission_set
        permissions.update_or_create(permission_type=edd_models.UserPermission.WRITE,
                                     user=cls.write_user)
        cls.url = reverse(
            'edd.rest:study-imports-detail',
            kwargs={
                'study_pk': cls.user_write_study.pk,
                'pk': 15
            }
        )

    def test_modify_privileges(self):
        # TODO: eventually add more detail to permissions checks here.  Requires a lot more
        # complexity in the fixture, and we should be covered by more rigorous checks on
        # uploads

        # send the submit request to actually perform the import
        self.client.force_login(ImportPatchTests.unprivileged_user)
        response = self.client.patch(
            ImportPatchTests.url,
            data={'status': 'Submitted'},
            format='json',
        )
        self.assertEqual(response.status_code, codes.not_found)

    def test_final_submit(self):
        """
        Does a simple test that submits a "Ready" import defined in the fixture
        """
        # load expected Redis context data from file
        with factory.load_test_file(CONTEXT_PATH) as file:
            context_str = file.read()

        # mock the notification broker
        with patch('edd_file_importer.tasks.RedisBroker') as MockNotify:
            notify = MockNotify.return_value

            # mock the import broker
            with patch('edd_file_importer.rest.views.ImportBroker') as MockBroker:
                broker = MockBroker.return_value
                broker.load_context.return_value = context_str

                # mock the method that determines whether Celery code is called synchronously or
                # asynchronously.  TODO: this is a stopgap for replacing the legacy import task,
                # after which we can just mock the backend task...ATM we're chaining together other
                # tasks that complicate the mocking

                # mock the method that executes the final celery chain to performs the import
                with patch('celery.chain.delay') as submit_import:

                    # send the request to actually submit the import
                    self.client.force_login(self.write_user)
                    response = self.client.patch(
                        ImportPatchTests.url,
                        data={'status': 'Submitted'},
                        format='json',
                    )

                    self.assertEqual(response.status_code, codes.accepted)

                    # test that the task was called
                    import_uuid = uuid.UUID('f464cca6-7370-4526-9718-be3ea55fea42')
                    submit_import.assert_called_once()

                    notify_msg = 'Your import for file "FBA-OD-generic.xlsx" is submitted'
                    notify.notify.assert_called_once_with(
                        notify_msg,
                        tags=['import-status-update'],
                        payload={
                            'status': 'Submitted',
                            'pk': 15,
                            'uuid': import_uuid
                        }
                    )
                broker.add_page.assert_not_called()


class ImportUploadTests(EddApiTestCaseMixin, APITestCase):
    """
    Sets of tests to exercise the import upload step
    """
    fixtures = ['edd/rest/study_permissions']

    @classmethod
    def setUpTestData(cls):
        super().setUpTestData()

        # get models from the fixture for studies with varying permission levels
        User = get_user_model()
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

        # create another study with write permissions by only a single user
        cls.user_write_study = main_factory.StudyFactory(name='User-writeable study')
        permissions = cls.user_write_study.userpermission_set
        permissions.update_or_create(permission_type=edd_models.UserPermission.WRITE,
                                     user=cls.write_user)

    def setUp(self):
        super().setUp()

    def _upload_import_file(self, study_pk, file_path, form_data, user, exp_status=codes.accepted,
                            initial_upload=True):
        upload = self._build_file_upload(file_path)

        if user:
            self.client.force_login(user)
        else:
            self.client.logout()

        # mock the celery task so we're testing just the view
        with patch('edd_file_importer.tasks.process_import_file.delay') as mock_task:

            # mock the cache so we can test writes to it
            with patch('edd_file_importer.tasks.RedisBroker') as MockNotify:
                notify = MockNotify.return_value
                url = reverse('edd.rest:study-imports-list',
                              kwargs={'study_pk': study_pk})
                response = self.client.post(
                    url,
                    data={'file': upload, **form_data},
                    format='multipart',
                )

                # test the results of the synchronous upload request
                self.assertEqual(response.status_code, exp_status)
                response_json = json.loads(response.content, cls=JSONDecoder)

                # if upload was accepted, test that the file processing task was called as
                # expected
                if response.status_code == codes.accepted:
                    self.assertEqual(response_json['uuid'], form_data['uuid'])
                    import_pk = response_json['pk']
                    requested_status = form_data.get('status', None)
                    mock_task.assert_called_with(import_pk, user.pk, requested_status,
                                                 initial_upload=initial_upload)
                else:
                    mock_task.assert_not_called()
                notify.notify.assert_not_called()
        return response_json

    def _build_file_upload(self, file_path):
        with open(file_path, 'rb') as fp:
            upload = BytesIO(fp.read())
        upload.name = os.path.basename(file_path)  # get file name from path
        upload.content_type = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        return upload

    def test_upload_failure(self):
        """
        Tests that disallowed users aren't able to create an import on others' studies
        """
        file_path = factory.test_file_path('generic_import', 'FBA-OD-generic.xlsx')
        study_pk = self.user_write_study.pk

        # use an unprivileged account to upload a file (should fail)
        disallowed_users = {
            None: study_pk,
            ImportUploadTests.unprivileged_user: study_pk,
            ImportUploadTests.readonly_user: study_pk,
            ImportUploadTests.staffuser: study_pk,
        }
        for user, study_pk in disallowed_users.items():
            exp_status = codes.not_found if user else codes.forbidden
            self._upload_import_file(study_pk, file_path, _FBA_UPLOAD_PAYLOAD, user, exp_status)

    def test_upload_success(self):
        """
        Tests that allowed users are able to create an import on studies they have access to
        """
        file_path = factory.test_file_path('generic_import', 'FBA-OD-generic.xlsx')
        allowed_users = {
            ImportUploadTests.write_group_user: 22,  # group write study
            ImportUploadTests.write_user: ImportUploadTests.user_write_study.pk,
            ImportUploadTests.superuser: ImportUploadTests.user_write_study.pk,
            ImportUploadTests.unprivileged_user: 21,  # everyone write study
        }

        for user, study_pk in allowed_users.items():
            # create a new UUID for each import so they don't conflict
            payload = copy.copy(_FBA_UPLOAD_PAYLOAD)
            payload['uuid'] = str(uuid.uuid4())

            self._upload_import_file(study_pk, file_path, payload, user, codes.accepted)

    def test_categories(self):
        """
        Tests the categories returned by the rest back end
        """
        url = reverse('edd.rest:import_categories-list')
        self.client.force_login(ImportUploadTests.unprivileged_user)
        response = self.client.get(url, data={'ordering': 'display_order'})
        self.assertEqual(response.status_code, codes.ok)
        actual = json.loads(response.content)
        with factory.load_test_file('import_categories.json') as file:
            expected = json.loads(file.read())
        self.assertEqual(expected, actual)
