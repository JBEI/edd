# coding: utf-8

import json
import os
import uuid
from unittest.mock import call, patch

from django.conf import settings
from django.contrib.contenttypes.models import ContentType
from django.contrib.auth import get_user_model
from django.contrib.auth.models import Permission
from django.test import override_settings
from rest_framework.test import APITestCase

from . import factory
from . test_utils import CONTEXT_PATH, ImportTestsMixin, SERIES_PATH
from .. import tasks as tasks
from ..models import Import
from edd.rest.tests import EddApiTestCaseMixin
from edd.utilities import JSONEncoder
from main import models as edd_models
from main.tasks import import_table_task


def load_permissions(model, *codenames):
    ct = ContentType.objects.get_for_model(model)
    return list(Permission.objects.filter(content_type=ct, codename__in=codenames))


_TEST_FILES_DIR = os.path.join(os.path.dirname(
    os.path.abspath(__file__)), 'files', 'generic_import')


# use example files as the basis for DB records created by the fixture
@override_settings(MEDIA_ROOT=_TEST_FILES_DIR)
class FileProcessingTests(EddApiTestCaseMixin, ImportTestsMixin, APITestCase):
    """
    Tests the file processing step of the import (step 2), as well as single-request imports
    """
    fixtures = [
        'edd_file_importer/import_models',
    ]

    @classmethod
    def setUpTestData(cls):
        super().setUpTestData()

        # create a test user and give it permission to write to the study
        User = get_user_model()
        cls.write_user = User.objects.create(username='study.writer.user')

        # create a study only writeable by a single user
        cls.user_write_study = edd_models.Study.objects.get(pk=10)
        permissions = cls.user_write_study.userpermission_set
        permissions.update_or_create(permission_type=edd_models.UserPermission.WRITE,
                                     user=cls.write_user)

    # future proof the test against local settings changes
    @override_settings(EDD_IMPORT_PAGE_SIZE=1, EDD_IMPORT_CACHE_LENGTH=5)
    def test_process_import_file(self):
        """
        Tests successful processing of the generic-format FBA OD tutorial data, corresponding
        to Import Step 2.
        :return:
        """
        notify_path = 'generic_import/FBA-OD-generic.xlsx.ws-ready-payload.json'
        ready_msg = 'Your file "FBA-OD-generic.xlsx" is ready to import'
        self._test_successful_processing(13, CONTEXT_PATH, SERIES_PATH, notify_path,
                                         ready_msg, page_count=2)

    def _test_successful_processing(self, import_pk, context_path, series_path,
                                    ready_payload_path, ready_msg, page_count, submitted_msg=None):
        # mock notifications so we can tests for required ones, as well as avoid actually
        # sending any
        with patch('edd_file_importer.tasks.RedisBroker') as MockNotification:
            notify = MockNotification.return_value

            # mock the Redis broker so we can test cache entries created by the task
            with patch('edd_file_importer.importer.table.ImportBroker') as MockBroker:
                broker = MockBroker.return_value

                # process the "Created" import included in the fixture...corresponds to DB
                # state when the Celery task is submitted to process the new upload
                write_user = FileProcessingTests.write_user
                requested_status = Import.Status.SUBMITTED if submitted_msg else None

                # celery chain, which may be called to invoke the legacy import task
                with patch('celery.chain.apply') as mock_apply:

                    # process the file synchronously to stay within this DB transaction
                    tasks.process_import_file(import_pk, write_user.pk, requested_status, True)

                    # load expected context and series cache data from file
                    import_uuid, context_str = self._load_context_file(context_path)
                    series_pages = self._slice_series_pages(series_path, page_count,
                                                            settings.EDD_IMPORT_PAGE_SIZE)

                    # test that expected cache entries were made
                    broker.clear_pages.assert_not_called()
                    broker.set_context.assert_called_once_with(import_uuid, context_str)
                    broker.add_page.assert_has_calls([call(import_uuid, page) for page in
                                                      series_pages])

                    self._test_success_notification(import_pk, import_uuid, notify,
                                                    mock_apply, ready_payload_path, submitted_msg,
                                                    ready_msg)

    def _test_success_notification(self, import_pk, import_uuid, notify, mock_apply,
                                   ready_payload_path, submitted_msg, ready_msg):
        """
        Tests for expected notifications from successfully processing a user-uploaded file. Note
        that this may include fully processing the import, if requested.
        """
        # load expected notification payload from file
        ready_payload_json = self._load_ready_payload_json(ready_payload_path)

        # test expected notification payloads, depending on whether the import was
        # submitted, or just uploaded and initially processed
        if not submitted_msg:
            # ready notification
            notify.notify.assert_called_once_with(
                ready_msg,
                tags=['import-status-update'],
                payload=ready_payload_json,
            )
            mock_apply.assert_not_called()
        else:
            # manually deconstruct test args and test those...for some reason just using
            # assert_has_calls() doesn't seem to work here...possible dict order, but other case
            # above works with the same data & apparent same code path...??

            # test ready notification
            # call(
            #     ready_msg,
            #     tags=['import-status-update'],
            #     payload=ready_payload_json
            # ),
            args, kwargs = notify.notify.call_args_list[0]
            self.assertEqual(args[0], ready_msg)
            self.assertEqual(kwargs['tags'], ['import-status-update'])
            self.assertDictEqual(kwargs['payload'], ready_payload_json)
            self.assertEqual(kwargs['payload'], ready_payload_json)
            self.assertEqual(len(args), 1)
            self.assertEqual(len(kwargs), 2)

            # test submitted notification
            # call(
            #     submitted_msg,
            #     tags=['import-status-update'],
            #     payload={
            #         'status': 'Submitted',
            #         'pk': import_pk,
            #         'uuid': import_uuid
            #     }
            # ),
            args, kwargs = notify.notify.call_args_list[1]
            self.assertEqual(args[0], submitted_msg)
            self.assertEqual(kwargs['tags'], ['import-status-update'])
            self.assertDictEqual(kwargs['payload'], {
                        'status': 'Submitted',
                        'pk': import_pk,
                        'uuid': import_uuid
                    })
            self.assertEqual(kwargs['payload'], {
                'status': 'Submitted',
                'pk': import_pk,
                'uuid': import_uuid
            })
            self.assertEqual(len(args), 1)
            self.assertEqual(len(kwargs), 2)

            self.assertEqual(len(notify.notify.call_args_list), 2)

            # TODO: after replacing the legacy background task, also check for
            # processing/completion
            # notifications. For now, because of the way we're wrapping the legacy task,
            # the submission notification doesn't get generated during the test.  It should be
            # integrated into the replacement task, and then tested here
            mock_apply.assert_called_once()

    def _load_ready_payload_json(self, notify_path):
        ready_payload_json = factory.load_test_json(notify_path)

        # convert UUID's stored as strings into UUID's for comparison with actual cache method
        # calls
        ready_payload_json['uuid'] = uuid.UUID(ready_payload_json['uuid'])
        for type in ready_payload_json['types'].values():
            type['uuid'] = uuid.UUID(type['uuid'])
        return ready_payload_json

    def _load_context_file(self, context_path):
        with factory.load_test_file(context_path, 'rt') as context_file:
            context_str = context_file.read()
            import_uuid = uuid.UUID(json.loads(context_str)['importId'])
        return import_uuid, context_str

    # future proof the test against local settings changes
    @override_settings(EDD_IMPORT_PAGE_SIZE=1, EDD_IMPORT_CACHE_LENGTH=5)
    def test_single_request_submit(self):
        """
        Tests the correct task behavior for a single request import.  This test is very similar to
        _test_successful_processing(), except that we also expect the import to be submitted for
        final processing.
        """
        ready_msg = 'Your file "FBA-OD-generic.xlsx" is ready to import'
        submitted_msg = 'Your import for file "FBA-OD-generic.xlsx" is submitted'
        notify_path = 'generic_import/FBA-OD-generic.xlsx.ws-ready-payload.json'
        self._test_successful_processing(13, CONTEXT_PATH, SERIES_PATH, notify_path,
                                         ready_msg, page_count=2, submitted_msg=submitted_msg)

    # future proof the test against local settings changes
    @override_settings(EDD_IMPORT_PAGE_SIZE=1, EDD_IMPORT_CACHE_LENGTH=5)
    def test_duplicate_active_line_names(self):
        """
        Tests that an otherwise valid import fails with a helpful message if the study contains
        duplicate lines named for one or more line names included in the file.
        """
        # create a line that duplicates an existing one in the FBA tutorial study fixture...
        # the overloaded line name should cause the import to fail
        edd_models.Line.objects.create(name='arcA', study=self.user_write_study)

        # process the file and look for failure
        msg = 'Processing for your import file "FBA-OD-generic.xlsx" has failed'
        payload_file = factory.test_file_path(
            'generic_import', 'FBA-OD-generic.xlsx.ws-failed-duplicate-payload.json')
        self._run_failed_fba_od_import(msg, payload_file)

    def _run_failed_fba_od_import(self, msg, payload_file, tags=None):
        tags = tags if tags is not None else ['import-status-update']

        # mock notifications so we can tests for required ones, as well as avoid actually
        # sending any
        with patch('edd_file_importer.tasks.RedisBroker') as MockNotification:
            notify = MockNotification.return_value

            # mock the Redis broker so that stored data is just cached in memory during the
            # test
            with patch('edd_file_importer.importer.table.ImportBroker') as MockBroker:
                broker = MockBroker.return_value

                # process the "Created" import included in the fixture...corresponds to DB
                # state when the Celery task is submitted to process the new upload
                user_pk = FileProcessingTests.write_user.pk
                tasks.process_import_file(13, user_pk, None, True)

                payload_json = factory.load_test_json(payload_file)
                payload_json['uuid'] = uuid.UUID(payload_json['uuid'])

                notify.notify.assert_called_once_with(
                    msg,
                    payload=payload_json,
                    tags=tags)
                broker.clear_pages.assert_not_called()
                broker.set_context.assert_not_called()
                broker.add_page.assert_not_called()

    def test_duplicate_inactive_line_names(self):
        """
        Tests that inactive lines don't influence the outcome of a valid import, even if they
        use names referenced in the input file
        """

        # create *disabled* lines that duplicate existing ones in the FBA tutorial study fixture...
        # the overloaded line names should be overlooked by the import
        edd_models.Line.objects.create(name='arcA', study=self.user_write_study,
                                       active=False)
        edd_models.Line.objects.create(name='BW1', study=self.user_write_study, active=False)

        # run the FBA OD processing test (should succeed)
        self.test_process_import_file()

    def test_missing_line_name(self):
        # delete a line from the fixture
        result = edd_models.Line.objects.filter(name='arcA', study=self.user_write_study).delete()
        self.assertEqual(result[1]['main.Line'], 1)  # verify the line was deleted

        # re-run the (normally successful) import with the line missing
        err_msg = 'Processing for your import file "FBA-OD-generic.xlsx" has failed'
        err_payload_file = 'FBA-OD-generic.xlsx.ws-missing-line-name-payload.json'
        self._test_failed_upload(13, err_msg, err_payload_file)

    def test_parse_err_propagation(self):
        """"
        Tests parse error propagation through the view by checking for the same errors as the
        parser test. Note that this test is dependent on correct operation of the parser, but
        it's simpler not to mock the parser for functionality that's already unit tested.
        """

        err_msg = ('Processing for your import file "generic_import_parse_errs.xlsx" has '
                   'failed')
        err_payload_file = 'generic_import_parse_errs.xlsx.ws-failed-payload.json'
        self._test_failed_upload(16, err_msg, err_payload_file)

    def test_processing_err_detection(self):
        """"
        Tests file processing error detection
        """
        err_msg = ('Processing for your import file "FBA-OD-generic-processing-errs.xlsx" has '
                   'failed')
        err_payload_file = 'generic_import_processing_errs.xlsx.ws-failed-payload.json'
        self._test_failed_upload(18, err_msg, err_payload_file)

    def _test_failed_upload(self, import_pk, err_msg, err_payload_file):
        # mock notifications so we can tests for required ones, as well as avoid actually
        # sending any
        with patch('edd_file_importer.tasks.RedisBroker') as MockNotification:
            notify = MockNotification.return_value

            # mock the Redis broker so that stored data is just cached in memory during the
            # test
            with patch('edd_file_importer.importer.table.ImportBroker') as MockBroker:
                broker = MockBroker.return_value

                # process the "Created" import included in the fixture...corresponds to DB
                # state when the Celery task is submitted to process the new upload
                tasks.process_import_file(import_pk, 1, None, True)

                broker.clear_pages.assert_not_called()
                broker.set_context.assert_not_called()
                broker.add_page.assert_not_called()

                # test expected notification payload
                payload_file = factory.test_file_path(
                    'generic_import', err_payload_file)

                payload_json = factory.load_test_json(payload_file)
                payload_json['uuid'] = uuid.UUID(payload_json['uuid'])

                notify.notify.assert_called_once_with(
                    err_msg,
                    tags=['import-status-update'],
                    payload=payload_json,
                )


@override_settings(MEDIA_ROOT=_TEST_FILES_DIR)
class LegacyIntegrationTests(EddApiTestCaseMixin, ImportTestsMixin, APITestCase):
    """
    Sets of tests to exercise the Experiment Description view.
    """
    fixtures = [
        'edd_file_importer/import_models',
    ]

    @classmethod
    def setUpTestData(cls):
        super(LegacyIntegrationTests, cls).setUpTestData()

        # get the study from the fixture
        cls.user_write_study = edd_models.Study.objects.get(pk=10)

        # create a user with write permissions on the study
        User = get_user_model()
        cls.write_user = User.objects.create(username='study.writer.user')
        permissions = cls.user_write_study.userpermission_set
        permissions.update_or_create(permission_type=edd_models.UserPermission.WRITE,
                                     user=cls.write_user)

    # future proof the test against local settings changes, and ensure its redis data gets
    # deleted promptly
    @override_settings(EDD_IMPORT_PAGE_SIZE=1, EDD_IMPORT_CACHE_LENGTH=5)
    def test_legacy_task_integration(self):
        """
        Tests integration of the new import with the legacy celery task that supports final
        submission. Uses the FBA tutorial data to perform an import using the legacy celery task,
        then verifies the results.
        """

        # get DB model created by the fixture...corresponds to an import that's uploaded and
        # cached in the database, but not yet processed by the Celery task.  This is the second
        # step of the upload process.
        import_ = Import.objects.get(pk=15)

        # TODO: after replacing the legacy import task, verify Submitted, Processing, and Success
        # notifications...ATM, they aren't easily testable bc of the Celery chain used to
        # wrap the legacy task
        # notify_path = 'generic_import/FBA-OD-generic.xlsx.ws-ready-payload.json'

        with patch('edd.notify.backend.RedisBroker'):

            # mock the redis broker used by the legacy task to consume cache entries
            with patch('main.tasks.ImportBroker') as MockStorage:
                cache_consumer = MockStorage.return_value
                context_str, series_pages = self._configure_cache_consumer(cache_consumer, import_)

                # mock the celery chain used to execute the legacy import task
                def call_tasks(*args, **kwargs):
                    import_table_task(import_.study_id, self.write_user.pk, import_.pk)

                # run the celery task synchronously in the test so there's no need to have Celery
                # itself running
                with patch('celery.chain.apply', new=call_tasks):
                    with patch('edd_file_importer.importer.table.ImportBroker') as ProducerBroker:
                        cache_producer = ProducerBroker.return_value

                        # run new task.  with chain.apply mock configured above, it'll run the
                        # legacy task synchronously
                        tasks.process_import_file(import_.pk, LegacyIntegrationTests.write_user.pk,
                                                  Import.Status.SUBMITTED, True)

                        # check that new import code produced the expected Redis cache entries
                        # for consumption by the legacy import task
                        cache_producer.set_context.assert_called_once_with(import_.uuid,
                                                                           context_str)
                        exp_calls = [call(import_.uuid, page) for page in series_pages]
                        cache_producer.add_page.assert_has_calls(exp_calls)

                # verify that the data was successfully added to the database
                self._verify_fba_od_data(import_.study_id)

    def _configure_cache_consumer(self, cache_consumer, import_):
        cache_consumer.page_count.return_value = 0
        cache_consumer.save.return_value = import_.uuid
        cache_page_count = 2
        cache_consumer.add_page.side_effect = ((import_.uuid, i + 1)
                                               for i in range(0, cache_page_count))

        # load expected Redis cache content from files and compare with actual calls.
        # Note that these roughly parallel, but are distinct from, similar files in the
        # main tutorial tests...these ones have a lot of the cruft removed from the
        # legacy import, and are generated on the back end rather than by the UI
        context_str = factory.load_test_file(CONTEXT_PATH).read()
        context_json = json.loads(context_str)

        # replace UUID from the file...it's the same content, but a different UUID
        # for this import so it's in the Ready state
        context_json['importId'] = import_.uuid
        context_str = json.dumps(context_json, cls=JSONEncoder)

        # load series data, slicing it up into pages if requested
        series_pages = self._slice_series_pages(SERIES_PATH, cache_page_count,
                                                settings.EDD_IMPORT_PAGE_SIZE)

        cache_consumer.load_context.return_value = context_str
        cache_consumer.load_pages.return_value = [page for page in series_pages]

        return context_str, series_pages

    def _verify_fba_od_data(self, study_pk):
        # verify correct number of assays created (1 per line)
        bw1_as = edd_models.Assay.objects.filter(line__name='BW1',
                                                 line__study_id=study_pk).count()
        arcA_as = edd_models.Assay.objects.filter(line__name='arcA',
                                                  line__study_id=study_pk).count()
        self.assertEquals(bw1_as, 1)
        self.assertEquals(arcA_as, 1)

        # verify that the right number of measurements were created
        bw1_ms = edd_models.Measurement.objects.filter(assay__line__name='BW1',
                                                       assay__line__study_id=study_pk)
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
