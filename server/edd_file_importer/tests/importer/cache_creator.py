"""
Unit tests for the ImportCacheCreator class
"""

import json
import os
from itertools import zip_longest
from typing import Tuple

from django.contrib.auth import get_user_model
from django.test import override_settings

from edd import TestCase
from main import models as edd_models
from main.importer.table import ImportBroker

from ...exceptions import (
    MetaboliteNotFoundError,
    MissingAssayTimeError,
    add_errors,
    track_msgs,
)
from ...importer import table
from ...models import Import
from .. import factory
from ..test_utils import (
    GENERIC_XLS_CREATED_CONTEXT_PATH,
    GENERIC_XLS_REDIS_SERIES_PATH,
    clear_import_cache,
)
from .utils import CacheEntries, load_fba_od_parse_result

User = get_user_model()

_PARENT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
_TEST_FILES_DIR = os.path.join(_PARENT_DIR, "files")
_GENERIC_FILES_DIR = os.path.join(_TEST_FILES_DIR, "generic_import")

# TODO: as a lower priority, also test for ImportTooLargeError
@override_settings(EDD_USE_PROTOTYPE_IMPORT=True, MEDIA_ROOT=_GENERIC_FILES_DIR)
class ImportCacheCreatorTests(TestCase):
    """
    Note some features of ImportCacheCreator are already tested as part of ImportResolver.resolve()
    results.  They aren't retested here.
    """

    fixtures = ["edd_file_importer/generic_fba_imports"]

    @clear_import_cache(import_uuid="ec2e3a30-3f35-4219-88a8-cf78fb100a98")
    @override_settings(EDD_IMPORT_PAGE_SIZE=14, EDD_IMPORT_CACHE_LENGTH=5)
    def test_record_merge(self):
        """
        Tests that ImportCacheCreator correctly merges MeasurementParseRecords for the same
        (MeasurementType + line/assay) combination into a single record.  Since this impacts
        the amount of information stored in a single page of the import cache, we should
        eventually impose some additional limit on the number of records that can be merged.
        For now, test the current behavior.  See
        edd_file_importer.importer.table.ImportCacheCreator._build_import_records().
        """

        # build up state for the test
        import_, cacher, initial_upload = self._build_resolved_fba_od()

        # run the cacher
        summary = cacher.save_resolved_import_records(initial_upload)

        # test that summary dict is computed correctly
        exp_summary_path = self._file_path(
            "FBA-OD-generic.xlsx.cache.context-created.json"
        )
        exp_summary = factory.load_test_json(exp_summary_path)
        self.assertEqual(exp_summary, summary)

        # compare actual Redis cache content to what was expected.
        # "1" here causes test code to lump expected results into a single page.
        # actual cacher code should do the same since we overrode EDD_IMPORT_PAGE_SIZE=14
        # above (matches the number of rows in the Excel file)
        exp_cache = CacheEntries(
            GENERIC_XLS_CREATED_CONTEXT_PATH, GENERIC_XLS_REDIS_SERIES_PATH, 1
        )

        self._compare_cache_entries(import_, summary, exp_cache)

    def _compare_cache_entries(self, import_, summary, exp_cache: CacheEntries):
        # compare actual summary data returned from the ImportCacheCreator
        exp_context = json.loads(exp_cache.context_str)
        self.assertEqual(exp_context, summary)

        # verify that the summary data was actually saved to Redis
        redis = ImportBroker()
        redis_summary = redis.load_context(import_.uuid)
        self.assertEqual(json.loads(redis_summary), exp_context)

        # compare individual pages in the cache
        exp_pages = exp_cache.series_pages
        actual_pages = redis.load_pages(import_.uuid)
        exp_pages_iter = iter(exp_pages)
        page_count = 0

        for exp_page, actual_page in zip_longest(
            exp_pages_iter, actual_pages, fillvalue=None
        ):
            # compare pages, loading JSON to avoid brittle string comparison
            records_list = json.loads(actual_page)
            self.assertEqual(json.loads(exp_page), records_list)
            page_count += 1

        # do a double-check on the final page count.
        # CacheEntries should process the file into the correct number of pages
        self.assertEqual(page_count, exp_cache.page_count)

    def _build_resolved_fba_od(self) -> Tuple[Import, table.ImportCacheCreator, bool]:
        """
        Utility method that builds up state to simulate results of a successfully resolved FBA
        OD import.  This work is normally done by ImportResolver, but hard-coding it here gives
        some test isolation.
        """
        # gather inputs for the test (FBA-OD-generic.xlsx)
        import_ = Import.objects.get(pk=13)
        initial_upload = True

        # look up built-in MeasurementTypes and units needed to interpret the file
        od_mtype = edd_models.MeasurementType.objects.get(
            uuid="d7510207-5beb-4d56-a54d-76afedcf14d0"
        )
        na_unit = edd_models.MeasurementUnit.objects.get(unit_name="n/a")
        hrs_unit = edd_models.MeasurementUnit.objects.get(unit_name="hours")

        # create the cacher, simulating successful results normally queried by the ImportResolver.
        # In this canned example, they're fairly simple.
        cacher = table.ImportCacheCreator(import_)
        cacher.assay_time_err = False
        cacher.matched_assays = False
        cacher.parsed = load_fba_od_parse_result()
        cacher.loa_name_to_pk = {"arcA": 11, "BW1": 12}
        cacher.assay_pk_to_time = {}
        cacher.mtype_name_to_type = {od_mtype.type_name: od_mtype}
        cacher.unit_name_to_unit = {
            na_unit.unit_name: na_unit,
            hrs_unit.unit_name: hrs_unit,
        }
        return import_, cacher, initial_upload

    @clear_import_cache(import_uuid="ec2e3a30-3f35-4219-88a8-cf78fb100a98")
    @override_settings(EDD_IMPORT_PAGE_SIZE=1, EDD_IMPORT_CACHE_LENGTH=5)
    def test_series_pagination(self):
        """
        Tests that ImportCacheCreator correctly breaks import records up into pages as specified by
        EDD_IMPORT_PAGE_SIZE.  Note it's overridden to 1 in this test, unlike most others.

        Note: only major differences between this test and test_record_merge() is the setting,
        and the "2" parameter to CacheEntries()
        """

        # build up state for the test
        import_, cacher, initial_upload = self._build_resolved_fba_od()

        # run the cacher
        summary = cacher.save_resolved_import_records(initial_upload)

        # test that summary dict is computed correctly
        exp_summary_path = self._file_path(
            "FBA-OD-generic.xlsx.cache.context-created-paged.json"
        )
        exp_summary = factory.load_test_json(exp_summary_path)
        self.assertEqual(exp_summary, summary)

        # compare actual Redis cache content to what was expected.
        # "2" here causes test code to lump expected results into two pages instead of one
        # actual cacher code should do the same since we overrode EDD_IMPORT_PAGE_SIZE=1 and
        # there should be two import records after they're merged by the cacher
        exp_cache = CacheEntries(exp_summary_path, GENERIC_XLS_REDIS_SERIES_PATH, 2)

        self._compare_cache_entries(import_, summary, exp_cache)

    @clear_import_cache(import_uuid="ec2e3a30-3f35-4219-88a8-cf78fb100a98")
    @override_settings(EDD_IMPORT_PAGE_SIZE=14, EDD_IMPORT_CACHE_LENGTH=5)
    def test_assay_time_err(self):
        """
        Tests that ImportCacheResolver correctly caches a resolved import to Redis, even when the
        import can't be completed yet because required assay time isn't specified. This is
        different than all other resolution errors, which indicate the import can't proceed based
        on its existing content and shouldn't be cached.  See also test_other_resolve_error() which
        enforces that other resolve errors should cause the import to fail and not be cached.
        """
        # build up state for the test. just reuse the same state that successfully cached in
        # other tests
        import_, cacher, initial_upload = self._build_resolved_fba_od()

        # turn on stateful exception tracking that's used in the production pipeline
        track_msgs(import_.uuid)

        try:
            # simulate an assay time error having occurred earlier during the resolution process.
            # caching the resolved data to Redis should still succeed.
            cacher.assay_time_err = True
            add_errors(import_.uuid, MissingAssayTimeError(details="arcA"))

            # run the cacher
            summary = cacher.save_resolved_import_records(initial_upload)

            # test that summary dict is computed correctly
            exp_summary_path = self._file_path(
                "FBA-OD-generic.xlsx.cache.context-created.json"
            )
            exp_summary = factory.load_test_json(exp_summary_path)
            self.assertEqual(exp_summary, summary)

            # compare actual Redis cache content to what was expected.
            # "1" here causes test code to lump expected results into a single page.
            # actual cacher code should do the same since we overrode EDD_IMPORT_PAGE_SIZE=14
            # above (matches the number of rows in the Excel file)
            exp_cache = CacheEntries(
                GENERIC_XLS_CREATED_CONTEXT_PATH, GENERIC_XLS_REDIS_SERIES_PATH, 1
            )

            self._compare_cache_entries(import_, summary, exp_cache)
        finally:
            # clear state and disable message tracking to maintain test isolation
            track_msgs(import_.uuid, False)

    @clear_import_cache(import_uuid="ec2e3a30-3f35-4219-88a8-cf78fb100a98")
    @override_settings(EDD_IMPORT_PAGE_SIZE=14, EDD_IMPORT_CACHE_LENGTH=5)
    def test_other_resolve_err(self):
        """
        Tests that ImportCacheResolver raises an error instead of creating the cache when any
        resolution error occurs other than, or in addition to, a MissingAssayTimeError.  The
        only difference here in the setup relative to test_assay_time_error() is the addition
        of a second error report.
        """
        # build up state for the test. just reuse the same state that successfully cached in
        # other tests
        import_, cacher, initial_upload = self._build_resolved_fba_od()

        # switch on stateful message tracking to simulate what happens in the production pipeline
        track_msgs(import_.uuid)

        try:

            # simulate an assay time error having occurred earlier during the resolution process.
            # caching the resolved data to redis should still succeed.
            cacher.assay_time_err = True
            add_errors(import_.uuid, MissingAssayTimeError(details="arcA"))
            add_errors(
                import_.uuid,
                MetaboliteNotFoundError(details="MetaboliteNotactuallyInfile"),
            )

            # run the cacher, verifying that the error gets raised
            with self.assertRaises(MetaboliteNotFoundError):
                cacher.save_resolved_import_records(initial_upload)

            # test that redis content doesn't get added
            redis = ImportBroker()
            context = redis.load_context(import_.uuid)
            self.assertEqual(context, None)
            actual_pages = redis.load_pages(import_.uuid)

            for _page in actual_pages:
                self.fail("Expected zero pages of cache data")
        finally:
            # clear state and disable stateful tracking to preserve test isolation
            track_msgs(import_.uuid, False)

    def _file_path(self, filename):
        return os.path.join("generic_import", filename)
