# coding: utf-8

"""
Unit tests for the ImportExecutor class that does the heavy lifting to complete an import
"""

import json
import os

from django.contrib.auth import get_user_model
from django.core.exceptions import PermissionDenied
from django.test import override_settings

import edd_file_importer.importer.table as table
from edd.tests import TestCase
from edd_file_importer.exceptions import (
    IllegalTransitionError,
    MissingAssayTimeError,
    UnplannedOverwriteError,
)
from main import models as edd_models
from main.importer.table import ImportBroker

from ...models import Import
from .. import factory
from ..test_utils import GENERIC_XLS_REDIS_SERIES_PATH
from .utils import CacheEntries, add_assay_time_metadata

User = get_user_model()

_PARENT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
_TEST_FILES_DIR = os.path.join(_PARENT_DIR, "files")
_GENERIC_FILES_DIR = os.path.join(_TEST_FILES_DIR, "generic_import")
_SKYLINE_FILES_DIR = os.path.join(_TEST_FILES_DIR, "skyline")


def _verify_fba_od_data(test, study_pk):
    """
    Verifies study content after a successful import of the FBA OD data
    """
    # verify correct number of assays created (1 per line)
    bw1_as = edd_models.Assay.objects.filter(line__name="BW1", study_id=study_pk)
    arcA_as = edd_models.Assay.objects.filter(line__name="arcA", study_id=study_pk)
    test.assertEqual(bw1_as.count(), 1)
    test.assertEqual(arcA_as.count(), 1)

    # verify that the right number of measurements were created
    bw1_ms = edd_models.Measurement.objects.filter(
        assay__line__name="BW1", assay__line__study_id=study_pk
    )
    arcA_ms = edd_models.Measurement.objects.filter(
        assay__line__name="arcA", assay__line__study_id=study_pk
    )
    test.assertEqual(len(bw1_ms), 1)
    test.assertEqual(len(arcA_ms), 1)

    # verify the right number of values were created
    bw1_vals = edd_models.MeasurementValue.objects.filter(
        measurement_id=bw1_ms.get().pk
    ).count()

    arcA_vals = edd_models.MeasurementValue.objects.filter(
        measurement_id=arcA_ms.get().pk
    ).count()

    test.assertEqual(bw1_vals, 7)
    test.assertEqual(arcA_vals, 7)


class ImportExecutorTests(TestCase):
    fixtures = ["edd_file_importer/generic_fba_imports"]

    @classmethod
    def setUpTestData(cls):
        super().setUpTestData()

        cls.write_user = User.objects.get(username="study.writer.user")

    def test_standard_additive_import(self):
        """
        Uses FBA OD tutorial data to test execution of a standard import, where all of the data
        for the import comes directly from the file.  Note that at this final stage of the import,
        this is essentially the same thing that happens when users choose to duplicate data in the
        study.  There's currently no proactive check in the executor for duplication since
        that's done upstream by ImportResolver.
        """
        import_ = Import.objects.get(pk=22)

        # load expected Redis content from file.
        # this simulates what would happen in a real import, where ImportResolver would generate
        # the Redis cache entries after successful parsing / resolution. No need to involve Redis
        # here.
        context_path = os.path.join(
            "generic_import", "FBA-OD-generic.xlsx.cache.context-submitted.json"
        )
        cache = CacheEntries(context_path, GENERIC_XLS_REDIS_SERIES_PATH, 1)

        # set up the importer
        executor = table.ImportExecutor(import_, self.write_user)
        executor.parse_context(json.loads(cache.context_str))

        # process cache one page at a time
        for index, page_str in enumerate(cache.series_pages):
            page = json.loads(page_str)
            executor.import_series_data(page)

            if index == 0:
                # verify that executor updates import status to PROCESSING after the first page is
                # processed (should be first step in that method, but we can't test that here)
                import_ = Import.objects.get(pk=import_.pk)
                self.assertEqual(import_.status, Import.Status.PROCESSING)

        # complete the import
        added, updated = executor.finish_import()

        # verify return values
        self.assertEqual(added, 14)
        self.assertEqual(updated, 0)

        # verify that import is marked as COMPLETED in the database
        import_ = Import.objects.get(pk=import_.pk)
        self.assertEqual(import_.status, Import.Status.COMPLETED)

        # verify database insertions
        _verify_fba_od_data(self, import_.study_id)

    def test_status_check(self):
        # grab an arbitrary import
        import_ = Import.objects.get(pk=15)

        user = factory.UserFactory.build()

        # cycle through all the import states except SUBMITTED, verifying that no other can be
        # used as a starting point to execute the import
        for status in (
            Import.Status.CREATED,
            Import.Status.RESOLVED,
            Import.Status.READY,
            Import.Status.PROCESSING,
            Import.Status.COMPLETED,
            Import.Status.ABORTED,
            Import.Status.FAILED,
        ):
            import_.status = status
            import_.save()  # save in case the executor decides to refresh it (currently doesn't)
            with self.assertRaises(IllegalTransitionError):
                table.ImportExecutor(import_, user)

            # verify that attempt had no impact on import status
            self.assertEqual(import_.status, status)

    def test_permissions_recheck(self):
        # grab an arbitrary import
        import_ = Import.objects.get(pk=15)

        # bypass the status check to avoid fixture bloat.  we aren't actually going to do
        # anything with this import anyway
        import_.status = Import.Status.SUBMITTED
        import_.save()

        # invent a user who doesn't have write permission
        user = factory.UserFactory.build()

        # verify no permission
        with self.assertRaises(PermissionDenied):
            table.ImportExecutor(import_, user)

        # verify that the call to __init__() didn't cause the import to transition to FAILED
        import_ = Import.objects.get(pk=import_.pk)
        self.assertEqual(import_.status, Import.Status.SUBMITTED)

        # verify that user with permission does get through. no database records were harmed in
        # the creation of this test.
        table.ImportExecutor(import_, self.write_user)


class OverwriteTest(TestCase):
    """
    Tests executor behavior re: overwrites during the import.
    """

    fixtures = [
        "edd_file_importer/generic_fba_imports",
        "edd_file_importer/generic_fba_imported",
    ]

    @classmethod
    def setUpTestData(cls):
        super().setUpTestData()
        cls.write_user = User.objects.get(username="study.writer.user")

    @override_settings(EDD_IMPORT_PAGE_SIZE=14, EDD_IMPORT_CACHE_LENGTH=5)
    def test_overwrite_detection(self):
        """
        Tests that ImportExecutor detects and prevents unplanned overwrites
        """
        # Gather inputs for the test
        import_pk = 22
        import_ = Import.objects.get(pk=import_pk)

        # load expected Redis content from file.
        # this simulates what would happen in a real import, where ImportResolver would generate
        # the Redis cache entries after successful parsing / resolution. No need to involve Redis
        # here.
        context_path = os.path.join(
            "generic_import", "FBA-OD-generic.xlsx.cache.context-submitted-assays.json"
        )
        series_path = os.path.join(
            "generic_import", "FBA-OD-generic.xlsx.cache.series-assays.json"
        )
        cache = CacheEntries(context_path, series_path, 1)
        cache.create_cache_entries(ImportBroker())

        # set up the importer
        executor = table.ImportExecutor(import_, self.write_user)
        executor.parse_context(json.loads(cache.context_str))

        # process cache one page at a time
        for page_str in cache.series_pages:
            page = json.loads(page_str)
            executor.import_series_data(page)

        # verify error detected at the end (with a summary message, which is why we defer failing)
        with self.assertRaises(UnplannedOverwriteError):
            executor.finish_import()

        # verify the executor updated the import status in the database
        import_ = Import.objects.get(pk=import_.pk)
        self.assertEqual(import_.status, Import.Status.FAILED)

    @override_settings(EDD_IMPORT_PAGE_SIZE=14, EDD_IMPORT_CACHE_LENGTH=5)
    def test_overwrite(self):
        """
        Tests that ImportExecutor detects and executes planned overwrites. Essentially the same
        test as test_overwrite_detection(), except in this case we flip the switch to allow an
        overwrite.
        """

        # Gather inputs for the test
        import_pk = 22
        import_ = Import.objects.get(pk=import_pk)

        # set the flag that indicates user has chosen to overwrite data
        import_.allow_overwrite = True
        import_.save()

        # load expected Redis content from file.
        # this simulates what would happen in a real import, where ImportResolver would generate
        # the Redis cache entries after successful parsing / resolution. No need to involve Redis
        # here.
        context_path = self._file_path(
            "FBA-OD-generic.xlsx.cache.context-submitted-assays.json"
        )
        series_path = self._file_path("FBA-OD-generic.xlsx.cache.series-assays.json")
        cache = CacheEntries(context_path, series_path, 1)

        # set up the importer
        executor = table.ImportExecutor(import_, self.write_user)
        executor.parse_context(json.loads(cache.context_str))

        # process cache one page at a time
        for page_str in cache.series_pages:
            page = json.loads(page_str)
            executor.import_series_data(page)

        # complete the import
        added, updated = executor.finish_import()

        # verify return values
        self.assertEqual(added, 0)
        self.assertEqual(updated, 14)

        # verify study contains only one copy of the data
        _verify_fba_od_data(self, import_.study_id)

    def _file_path(self, filename):
        return os.path.join("generic_import", filename)


class SkylineTests(TestCase):
    """
    Tests ImportExecutor features specific to the Skyline workflow, where assay time metadata are
    used to supplement content read from the import file.
    """

    fixtures = ["edd_file_importer/skyline_imports", "edd_file_importer/test_proteins"]

    @classmethod
    def setUpTestData(cls):
        super().setUpTestData()
        cls.write_user = User.objects.get(username="study.writer.user")
        # get assay time metadata type, whose pk will vary between deployments
        assay_context = edd_models.MetadataType.ASSAY
        cls.assay_time_metatype = edd_models.MetadataType.objects.get(
            type_name="Time", for_context=assay_context
        )

    def test_missing_assay_time(self):
        import_ = Import.objects.get(pk=23)

        add_assay_time_metadata(self.assay_time_metatype, omit="arcA")

        # load expected Redis content from file.
        # this simulates what would happen in a real import, where ImportResolver would generate
        # the Redis cache entries after successful parsing / resolution.
        # No need to involve Redis here.
        context_path = self._file_path("skyline.xlsx-context-submitted.json")
        series_path = self._file_path("skyline.xlsx-cache.series.json")
        cache = CacheEntries(context_path, series_path, 1)

        # set up the importer
        executor = table.ImportExecutor(import_, self.write_user)
        executor.parse_context(json.loads(cache.context_str))

        # verify expected error
        with self.assertRaises(MissingAssayTimeError) as cm:
            # process cache one page at a time
            for page_str in cache.series_pages:
                page = json.loads(page_str)
                executor.import_series_data(page)

        self.assertEquals(cm.exception.details, ["arcA"])

        # verify the executor updated the import status in the database
        import_ = Import.objects.get(pk=import_.pk)
        self.assertEqual(import_.status, Import.Status.FAILED)

    def test_skyline_workflow(self):
        """
        Tests that ImportExecutor correctly applies assay time metadata to import skyline files
        """
        import_ = Import.objects.get(pk=23)
        add_assay_time_metadata(self.assay_time_metatype)

        # load expected Redis content from file.
        # this simulates what would happen in a real import, where ImportResolver would generate
        # the Redis cache entries after successful parsing / resolution.
        # No need to involve Redis here.
        context_path = self._file_path("skyline.xlsx-context-submitted.json")
        series_path = self._file_path("skyline.xslx-assay-times-series.json")
        cache = CacheEntries(context_path, series_path, 1)

        # set up the importer
        executor = table.ImportExecutor(import_, self.write_user)
        executor.parse_context(json.loads(cache.context_str))

        # process cache one page at a time
        for page_str in cache.series_pages:
            page = json.loads(page_str)
            executor.import_series_data(page)

        # complete the import
        added, updated = executor.finish_import()

        # verify return values
        self.assertEqual(added, 7)
        self.assertEqual(updated, 0)

        # get proteins from the fixture
        a = edd_models.ProteinIdentifier.objects.get(
            uuid="fac87ee9-6450-443a-b9e5-132bad4d3432"
        )
        b = edd_models.ProteinIdentifier.objects.get(
            uuid="1ff91ba0-21fa-438d-9da5-2221f03b8e6b"
        )
        c = edd_models.ProteinIdentifier.objects.get(
            uuid="de88ad37-93b5-4958-9f52-7090dd3398e3"
        )
        d = edd_models.ProteinIdentifier.objects.get(
            uuid="aa2f1099-8e8e-40ee-8220-604b0a81c27c"
        )

        # use QuerySet.get() to verify that import used the existing assays from the fixture
        # instead of creating new ones
        arcA = edd_models.Assay.objects.get(
            study_id=import_.study_id, line__name="arcA"
        )
        bw1 = edd_models.Assay.objects.get(study_id=import_.study_id, line__name="BW1")

        # use QuerySet.get() to verify that one measurement / MeasurementValue was created per
        # protein/assay combination read from the file
        arcA_meas_a = edd_models.Measurement.objects.get(assay=arcA, measurement_type=a)
        arcA_meas_b = edd_models.Measurement.objects.get(assay=arcA, measurement_type=b)
        arcA_meas_c = edd_models.Measurement.objects.get(assay=arcA, measurement_type=c)
        arcA_meas_d = edd_models.Measurement.objects.get(assay=arcA, measurement_type=d)

        bw1_meas_a = edd_models.Measurement.objects.get(assay=bw1, measurement_type=a)
        bw1_meas_b = edd_models.Measurement.objects.get(assay=bw1, measurement_type=b)
        bw1_meas_c = edd_models.Measurement.objects.get(assay=bw1, measurement_type=c)
        bw1_meas_d = edd_models.Measurement.objects.filter(
            assay=bw1, measurement_type=d
        )
        self.assertEqual(bw1_meas_d.count(), 0)

        # verify one MeasurementValue created per assay, using time from the assay metadata
        for m in (arcA_meas_a, arcA_meas_b, arcA_meas_c, arcA_meas_d):
            vals_qs = edd_models.MeasurementValue.objects.filter(measurement_id=m.pk)
            self.assertEqual(len(vals_qs), 1)
            val = vals_qs[0]
            self.assertEqual(val.x, [4])

        for m in (bw1_meas_a, bw1_meas_b, bw1_meas_c):
            vals_qs = edd_models.MeasurementValue.objects.filter(measurement_id=m.pk)
            self.assertEqual(len(vals_qs), 1)
            val = vals_qs[0]
            self.assertEqual(val.x, [5])
        self.assertEqual(bw1_meas_d.count(), 0)

    def _file_path(self, filename):
        return os.path.join("skyline", filename)
