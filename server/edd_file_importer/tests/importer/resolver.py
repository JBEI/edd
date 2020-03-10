import json
import os

from django.contrib.auth import get_user_model
from django.test import override_settings

import edd_file_importer.importer.table as table
from edd.tests import TestCase
from edd_file_importer.exceptions import (
    DuplicateAssayError,
    DuplicateLineError,
    MeasurementCollisionError,
    MissingAssayTimeError,
    TimeNotProvidedError,
    TimeUnresolvableError,
    UnmatchedAssayError,
    UnmatchedLineError,
    UnmatchedMtypeError,
    UnsupportedUnitsError,
    track_msgs,
)
from main import models as edd_models
from main.tests import factory as main_factory

from ...models import Import
from ...parsers import FileParseResult
from .. import factory
from ..test_utils import clear_import_cache
from .utils import add_assay_time_metadata, load_fba_od_parse_result, load_parse_record

User = get_user_model()

_PARENT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
_TEST_FILES_DIR = os.path.join(_PARENT_DIR, "files")
_GENERIC_FILES_DIR = os.path.join(_TEST_FILES_DIR, "generic_import")
_SKYLINE_FILES_DIR = os.path.join(_TEST_FILES_DIR, "skyline")


class GenericFBAResolveMixin:
    def _file_path(self, filename):
        return os.path.join("generic_import", filename)

    def verify_generic_od_xlsx_resolve_success(self, matched_lines=True):
        """
        Workhorse method that verifies successful resolution of the FBA OD xlsx file.
        """
        # Gather inputs for the test
        import_pk = 13
        import_ = Import.objects.get(pk=import_pk)
        user = factory.UserFactory.build()

        # load simulated parse input from JSON
        parse_result: FileParseResult = load_fba_od_parse_result()

        # create and run the resolver
        resolver = table.ImportResolver(import_, parse_result, user)
        import_, result = resolver.resolve(initial_upload=True, requested_status="")

        # load expected summary results from the resolve process
        filename = (
            "FBA-OD-generic.xlsx.cache.context-created.json"
            if matched_lines
            else "FBA-OD-generic.xlsx.cache.context-created-assays.json"
        )
        exp_summary_path = self._file_path(filename)
        exp_summary = factory.load_test_json(exp_summary_path)

        # test that resolution summary JSON is computed correctly (e.g. in this example,
        # MeasurementParseRecords get merged correctly to simplify downstream processing)
        self.assertEqual(exp_summary, result)

        # test that import is returned with READY status
        self.assertEqual(import_.status, Import.Status.READY)

        # test that import is actually marked as READY in the database
        import_ = Import.objects.get(pk=import_pk)
        self.assertEqual(import_.status, Import.Status.READY)


@override_settings(MEDIA_ROOT=_GENERIC_FILES_DIR)
class SimpleImportTests(GenericFBAResolveMixin, TestCase):
    """
    Tests basic functionality of the ImportResolver for resolving import file data against a study
    """

    fixtures = ["edd_file_importer/generic_fba_imports"]

    @clear_import_cache(import_uuid="ec2e3a30-3f35-4219-88a8-cf78fb100a98")
    @override_settings(EDD_IMPORT_PAGE_SIZE=14, EDD_IMPORT_CACHE_LENGTH=5)
    def test_resolve_result_lines_match(self):
        """
        Tests a typical, initial import use case: that ImportResolver correctly matches a parsed
        file against line names in an otherwise empty study. Correctly resolving the OD
        MeasurementType is also a side effect of the test since we have to have at least one
        MeasurementType
        """
        self.verify_generic_od_xlsx_resolve_success()

    @clear_import_cache(import_uuid="ec2e3a30-3f35-4219-88a8-cf78fb100a98")
    @override_settings(EDD_IMPORT_PAGE_SIZE=14, EDD_IMPORT_CACHE_LENGTH=5)
    def test_duplicate_inactive_line_names(self):
        """
        Tests that inactive lines don't influence the outcome of a valid import, even if they
        use the names referenced in the input file
        """

        # create *disabled* lines that duplicate existing ones in the FBA tutorial study fixture...
        # the overloaded line names should be overlooked by the import
        edd_models.Line.objects.create(name="arcA", study_id=10, active=False)
        edd_models.Line.objects.create(name="BW1", study_id=10, active=False)

        self.verify_generic_od_xlsx_resolve_success()

    @clear_import_cache(import_uuid="ec2e3a30-3f35-4219-88a8-cf78fb100a98")
    def test_duplicate_active_line_names(self):
        """
        Tests that an otherwise valid import fails with a helpful message if the study
        contains duplicate *active* lines matching names included in the file.
        """

        # gather inputs for the test
        import_pk = 13
        import_ = Import.objects.get(pk=import_pk)
        parse_result: FileParseResult = load_fba_od_parse_result()
        user = factory.UserFactory.build()

        # create a line that duplicates an existing one in the FBA tutorial study fixture...
        # the overloaded line name should cause the import to fail
        edd_models.Line.objects.create(name="arcA", study_id=10)

        with self.assertRaises(DuplicateLineError) as cm:
            resolver = table.ImportResolver(import_, parse_result, user)
            resolver.resolve(initial_upload=True, requested_status="")

        self.assertEqual(cm.exception.details, ["arcA"])

        # verify the resolver updated the import status in the database
        import_ = Import.objects.get(pk=import_pk)
        self.assertEqual(import_.status, Import.Status.FAILED)

    @clear_import_cache(import_uuid="ec2e3a30-3f35-4219-88a8-cf78fb100a98")
    def test_missing_assay_name(self):
        """
        Tests that an otherwise valid import fails with a helpful message if the study
        contains duplicate lines for one or more names in the import file
        """

        # gather inputs for the test
        import_ = Import.objects.get(pk=13)
        parse_result: FileParseResult = load_fba_od_parse_result()
        # create and run the resolver
        user = factory.UserFactory.build()

        # create an assay with the same name as one of the lines in the study. to support
        # re-uploads, the resolver matches against assay names first.  It should detect that the
        # file matches the assay we just created, but then fail when the other assay is missing.
        # we may eventually relax this bit at the cost of code complexity and fall back instead to
        # mixed line / assay matching with a warning
        edd_models.Assay.objects.create(
            name="arcA", protocol_id=import_.protocol_id, study_id=10, line_id=11
        )

        with self.assertRaises(UnmatchedAssayError) as cm:
            resolver = table.ImportResolver(import_, parse_result, user)
            resolver.resolve(initial_upload=True, requested_status="")

        self.assertEqual(cm.exception.details, ["BW1"])

        # verify the resolver updated the import status in the database
        import_ = Import.objects.get(pk=import_.pk)
        self.assertEqual(import_.status, Import.Status.FAILED)

    @clear_import_cache(import_uuid="ec2e3a30-3f35-4219-88a8-cf78fb100a98")
    def test_duplicate_active_assay_names(self):
        """
        Tests that ImportResolver correctly detects duplicate active assays in the study,
        then rejects the import since it can't be uniquely resolved to assays by name
        """
        # gather inputs for the test
        import_ = Import.objects.get(pk=13)
        parse_result: FileParseResult = load_fba_od_parse_result()

        # create and run the resolver
        user = factory.UserFactory.build()

        # create assays with the same names as lines in the study, simulating what would happen
        # if this same import has already been processed
        edd_models.Assay.objects.create(
            name="arcA", protocol_id=import_.protocol_id, study_id=10, line_id=11
        )
        edd_models.Assay.objects.create(
            name="BW1", protocol_id=import_.protocol_id, study_id=10, line_id=12
        )

        # create one duplicate assay
        edd_models.Assay.objects.create(
            name="BW1", protocol_id=import_.protocol_id, study_id=10, line_id=12
        )

        with self.assertRaises(DuplicateAssayError) as cm:
            resolver = table.ImportResolver(import_, parse_result, user)
            resolver.resolve(initial_upload=True, requested_status="")

        # verify the duplicate assay was detected
        self.assertEqual(cm.exception.details, ["BW1"])

        # verify the resolver updated the import status in the database
        import_ = Import.objects.get(pk=import_.pk)
        self.assertEqual(import_.status, Import.Status.FAILED)

    @clear_import_cache(import_uuid="a2d7ea2a-08b1-4fd9-87d1-d21810f9b5e5")
    def test_measurement_collision(self):
        """
        Tests that the resolver correctly detects duplicate simultaneous measurements of the same
        (MeasurementType + line).  This is a real cut-and-paste level error that's been observed!
        """

        # gather inputs for the test. file contains colliding measurements
        # (more than one simultaneous measurement of the same MeasurementType)
        import_ = Import.objects.get(pk=18)
        parse_result: FileParseResult = self.load_collision_parse_result()
        user = factory.UserFactory.build()

        # verify that exception is thrown
        with self.assertRaises(MeasurementCollisionError) as cm:
            resolver = table.ImportResolver(import_, parse_result, user)
            resolver.resolve(initial_upload=True, requested_status="")

        # verify content of the exception that's intended for eventual user display.
        # note that this is only the first error of this type in the file, since stateful message
        # tracking is turned off
        exc = cm.exception
        self.assertEqual(exc.subcategory, "(arcA, Optical Density @ 7.5h)")
        self.assertEqual(exc.details, ["row 3-4, 6"])

        # verify the resolver updated the import status in the database
        import_ = Import.objects.get(pk=import_.pk)
        self.assertEqual(import_.status, Import.Status.FAILED)

    @staticmethod
    def load_collision_parse_result():
        """
        Loads a FileParseResult object with simulated data from a successfully parsed file that
        contains duplicate measurements of the same line id + measurement type combination.
        """
        test_file = os.path.join(
            "generic_import", "FBA-OD-generic-processing-errs.xlsx.parse-result.json"
        )
        with factory.load_test_file(test_file) as json_file:
            series = json.loads(json_file.read(), object_hook=load_parse_record)
        return FileParseResult(series, "row", True, True)

    @clear_import_cache(import_uuid="ec2e3a30-3f35-4219-88a8-cf78fb100a98")
    def test_missing_line_name(self):
        """
        Tests that ImportResolver fails with a helpful error when one of the line/assay names
        from the file doesn't match anything in the study
        """
        # delete a line from the fixture
        result = edd_models.Line.objects.filter(name="arcA", study_id=10).delete()
        self.assertEqual(result[1]["main.Line"], 1)  # verify the line was deleted

        # gather inputs for the test
        import_ = Import.objects.get(pk=13)
        parse_result: FileParseResult = load_fba_od_parse_result()
        # create and run the resolver
        user = factory.UserFactory.build()

        with self.assertRaises(UnmatchedLineError) as cm:
            resolver = table.ImportResolver(import_, parse_result, user)
            resolver.resolve(initial_upload=True, requested_status="")

        self.assertEqual(cm.exception.details, ["arcA"])

        # verify the resolver updated the import status in the database
        import_ = Import.objects.get(pk=import_.pk)
        self.assertEqual(import_.status, Import.Status.FAILED)

    @clear_import_cache(import_uuid="ec2e3a30-3f35-4219-88a8-cf78fb100a98")
    def test_resolve_mtype_err(self):
        # gather inputs for the test.  since we expect the resolve to fail before it compares
        # the parsed content to the study, and since it doesn't directly access the file,
        # just re-purpose existing fixture data that isn't really used in this test
        import_ = Import.objects.get(pk=13)
        parse_result: FileParseResult = load_mtype_resolve_err_parse_result()
        user = factory.UserFactory.build()

        # create and run the resolver
        with self.assertRaises(UnmatchedMtypeError) as cm:
            resolver = table.ImportResolver(import_, parse_result, user)
            resolver.resolve(initial_upload=True, requested_status="")
        self.assertEqual(cm.exception.details, ["UnknownMeasurementType"])

        # verify the resolver updated the import status in the database
        import_ = Import.objects.get(pk=import_.pk)
        self.assertEqual(import_.status, Import.Status.FAILED)

    @clear_import_cache(import_uuid="ec2e3a30-3f35-4219-88a8-cf78fb100a98")
    def test_resolve_unit_err(self):
        # gather inputs for the test.  since we expect the resolve to fail before it compares
        # the parsed content to the study, and since it doesn't directly access the file,
        # just re-purpose existing fixture data that isn't really used in this test
        import_ = Import.objects.get(pk=13)
        parse_result: FileParseResult = load_unit_resolve_err_parse_result()
        user = factory.UserFactory.build()

        # create and run the resolver
        with self.assertRaises(UnsupportedUnitsError) as cm:
            resolver = table.ImportResolver(import_, parse_result, user)
            resolver.resolve(initial_upload=True, requested_status="")
        self.assertEqual(cm.exception.details, ["rods/hogshead"])

        # verify the resolver updated the import status in the database
        import_ = Import.objects.get(pk=import_.pk)
        self.assertEqual(import_.status, Import.Status.FAILED)


@override_settings(MEDIA_ROOT=_SKYLINE_FILES_DIR)
class SkylineTests(TestCase):
    """
    Tests ImportResolver features specific to the Skyline workflow
    """

    fixtures = ["edd_file_importer/skyline_imports"]

    @classmethod
    def setUpTestData(cls):
        super().setUpTestData()
        # get assay time metadata type, whose pk will vary between deployments
        cls.assay_time_metatype = edd_models.MetadataType.objects.get(
            type_name="Time", for_context=edd_models.MetadataType.ASSAY
        )
        # create test proteins
        main_factory.ProteinFactory(type_name="Test protein A", accession_code="A")
        main_factory.ProteinFactory(type_name="Test protein B", accession_code="B")
        main_factory.ProteinFactory(type_name="Test protein C", accession_code="C")
        main_factory.ProteinFactory(type_name="Test protein D", accession_code="D")

    @staticmethod
    def load_skyline_parse_result() -> FileParseResult:
        """
        Read expected file parse results from file into a FileParseResult object
        """
        test_file = os.path.join("skyline", "skyline.xslx-parse-result.json")
        with factory.load_test_file(test_file) as json_file:
            series = json.loads(json_file.read(), object_hook=load_parse_record)
        return FileParseResult(series, "row", False, False)

    def _file_path(self, filename):
        return os.path.join("skyline", filename)

    @clear_import_cache(import_uuid="61b7c373-7fef-41e9-a045-6b16f72787a4")
    def test_time_unresolvable(self):
        """
        Verifies the expected result when users consistently omit time from their ED file.
        In this case, no assays or assay times are present in the study, but lines do match the
        import file. There's no automated way to recover the missing time without user
        intervention and reprocessing the import against the study, so fail the import.
        """

        # delete assays from the fixture so the import will match lines
        edd_models.Assay.objects.filter(study_id=1000).delete()

        # gather inputs for the test. file contains colliding measurements
        # (more than one simultaneous measurement of the same MeasurementType)
        import_pk = 20
        import_ = Import.objects.get(pk=import_pk)
        parse_result: FileParseResult = self.load_skyline_parse_result()
        user = factory.UserFactory.build()

        # verify that exception is thrown indicating no time values at all were provided.
        # note that unlike some other tests in this class, this error should be raised regardless
        # of whether the client requested a submit since user intervention is absolutely required
        # and the import has to be reprocessed from the ground up to match assays (it matched
        # lines)
        with self.assertRaises(TimeUnresolvableError):
            resolver = table.ImportResolver(import_, parse_result, user)
            resolver.resolve(initial_upload=True, requested_status="")

        # verify the resolver updated the import status in the database
        import_ = Import.objects.get(pk=import_.pk)
        self.assertEqual(import_.status, Import.Status.FAILED)

    @clear_import_cache(import_uuid="61b7c373-7fef-41e9-a045-6b16f72787a4")
    def test_time_not_provided(self):
        """
        Verifies the expected result when users consistently omit time from their ED file and
        assays (import matches assays)
        """
        # gather inputs for the test
        import_ = Import.objects.get(pk=20)
        parse_result: FileParseResult = self.load_skyline_parse_result()
        user = factory.UserFactory.build()

        # verify that exception is thrown indicating no time values at all were provided
        with self.assertRaises(TimeNotProvidedError):
            resolver = table.ImportResolver(import_, parse_result, user)
            resolver.resolve(
                initial_upload=True, requested_status=Import.Status.SUBMITTED
            )

        # verify the resolver updated the import status in the database
        import_ = Import.objects.get(pk=import_.pk)
        self.assertEqual(import_.status, Import.Status.FAILED)

    @clear_import_cache(import_uuid="61b7c373-7fef-41e9-a045-6b16f72787a4")
    def test_some_time_missing(self):
        """
        Verifies the expected result when users inconsistently omit time from their ED file and
        assays (import matches assays)
        """
        # gather inputs for the test
        import_ = Import.objects.get(pk=20)
        parse_result: FileParseResult = self.load_skyline_parse_result()
        user = factory.UserFactory.build()

        # populate 1/2 assays with time metadata to cause the error
        add_assay_time_metadata(self.assay_time_metatype, omit="BW1")

        # verify that exception is thrown indicating some time values were missing
        with self.assertRaises(MissingAssayTimeError) as tnp:
            resolver = table.ImportResolver(import_, parse_result, user)
            resolver.resolve(
                initial_upload=True, requested_status=Import.Status.SUBMITTED
            )
        self.assertEqual(tnp.exception.details, ["BW1"])

        # verify the resolver set the import to FAILED
        import_ = Import.objects.get(pk=import_.pk)
        self.assertEqual(import_.status, Import.Status.FAILED)

    @clear_import_cache(import_uuid="61b7c373-7fef-41e9-a045-6b16f72787a4")
    def test_nonsubmit_silences_resolveable_assay_time_exceptions(self):
        """
        Verifies that if client didn't request that the import transition to any particular
        status (e.g. SUBMITTED), that it just progresses as far as it can without throwing an error
        for reasons that can be resolved later (e.g. missing assay times).  As long as the
        import progresses to at least RESOLVED, it's all good and client can decide how /
        whether to proceed.  This workflow will become more important when step 3,
        "identify" is supported, and clients want to test their step 3 entries without necessarily
        failing the import or submitting it.
        """

        # just repeat the same test as test_time_not_provided(), only without submitting.
        # instead of raising an exception, we'll expect that the resolve process completes,
        # correctly identifying that time is needed, but not raising the exception

        # gather inputs for the test
        import_ = Import.objects.get(pk=20)
        parse_result: FileParseResult = self.load_skyline_parse_result()
        user = factory.UserFactory.build()

        # similar to the production pipeline, configure message tracking for this test to allow
        # deferral of assay time errors
        track_msgs(import_.uuid)

        try:
            # verify that exception is thrown indicating no time values at all were provided
            resolver = table.ImportResolver(import_, parse_result, user)
            import_, summary = resolver.resolve(
                initial_upload=True, requested_status=""
            )

            # load expected summary results from the resolve process
            exp_summary_path = self._file_path(
                "skyline.xlsx-context-assay-times-missing.json"
            )
            exp_summary = factory.load_test_json(exp_summary_path)

            # test that resolution summary JSON is computed correctly (e.g. in this example,
            # MeasurementParseRecords get merged correctly to simplify downstream processing)
            self.assertEqual(exp_summary, summary)

            # test that import is returned with the correct status
            self.assertEqual(import_.status, Import.Status.RESOLVED)

            # test that import is actually marked as READY in the database
            import_ = Import.objects.get(pk=import_.pk)
            self.assertEqual(import_.status, Import.Status.RESOLVED)
        finally:
            # clear state and deactivate message tracking to preserve test isolation
            track_msgs(import_.uuid, False)

    @clear_import_cache(import_uuid="61b7c373-7fef-41e9-a045-6b16f72787a4")
    @override_settings(
        EDD_IMPORT_PAGE_SIZE=16,
        EDD_IMPORT_CACHE_LENGTH=5,
        EDD_IMPORT_BULK_PK_LOOKUP_LIMIT=1,
    )
    def test_valid_assay_time_metadata(self):
        """
        Tests that in the case of a valid Skyline import, the resolver successfully detects
        assay time metadata in the study, and the import progresses to READY.
        """
        # gather inputs for the test
        import_ = Import.objects.get(pk=20)
        parse_result: FileParseResult = self.load_skyline_parse_result()
        user = factory.UserFactory.build()

        # add assay time metadata so the file can be successfully resolved against the study
        add_assay_time_metadata(self.assay_time_metatype)

        # run the resolver
        resolver = table.ImportResolver(import_, parse_result, user)
        import_, summary = resolver.resolve(initial_upload=True, requested_status="")

        # load expected summary results from the resolve process
        exp_summary_path = self._file_path("skyline.xlsx-context-created.json")
        exp_summary = factory.load_test_json(exp_summary_path)

        # test that resolution summary JSON is computed correctly (e.g. in this example,
        # MeasurementParseRecords get merged correctly to simplify downstream processing)
        self.assertEqual(exp_summary, summary)

        # test that import is returned with the correct status
        self.assertEqual(import_.status, Import.Status.READY)

        # test that import is actually marked as READY in the database
        import_ = Import.objects.get(pk=import_.pk)
        self.assertEqual(import_.status, Import.Status.READY)


@override_settings(MEDIA_ROOT=_GENERIC_FILES_DIR)
class OverwriteTests(TestCase):
    """
    Tests ImportResolver's ability to detect and warn users prior to overwriting existing study
    data.
    """

    fixtures = [
        "edd_file_importer/generic_fba_imports",
        "edd_file_importer/generic_fba_imported",
    ]

    def _file_path(self, filename):
        return os.path.join("generic_import", filename)

    @clear_import_cache(import_uuid="ec2e3a30-3f35-4219-88a8-cf78fb100a98")
    @override_settings(EDD_IMPORT_PAGE_SIZE=14, EDD_IMPORT_CACHE_LENGTH=5)
    def test_overwrite_detection_result(self):
        # initiate re-import of the fixture data, verifying that an overwrite warning is
        # returned even though the request was to submit the import

        # Gather inputs for the test
        import_pk = 13
        import_ = Import.objects.get(pk=import_pk)
        user = factory.UserFactory.build()
        parse_result: FileParseResult = load_fba_od_parse_result()

        # create and run the resolver
        resolver = table.ImportResolver(import_, parse_result, user)
        import_, summary = resolver.resolve(initial_upload=True, requested_status="")

        # test that resolution summary dict is computed correctly
        exp_summary_path = self._file_path(
            "FBA-OD-generic.xslx.cache-overwrite.context.json"
        )
        exp_summary = factory.load_test_json(exp_summary_path)
        self.assertEqual(exp_summary, summary)

        # test that import is returned with the RESOLVED status
        self.assertEqual(import_.status, Import.Status.RESOLVED)

        # test that import is actually marked as RESOLVED in the database
        import_ = Import.objects.get(pk=import_pk)
        self.assertEqual(import_.status, Import.Status.RESOLVED)

    @clear_import_cache(import_uuid="ec2e3a30-3f35-4219-88a8-cf78fb100a98")
    @override_settings(EDD_IMPORT_PAGE_SIZE=14, EDD_IMPORT_CACHE_LENGTH=5)
    def test_allow_overwrite(self):
        """
        Do the same test as test_overwrite_detection_result(), but with the "allow_overwrite" flag
        set.  Verify that the result in READY status rather than RESOLVED.
        """
        # Gather inputs for the test
        import_pk = 13
        import_ = Import.objects.get(pk=import_pk)
        user = factory.UserFactory.build()
        parse_result: FileParseResult = load_fba_od_parse_result()

        # set the flag for skipping the overwrite test
        import_.allow_overwrite = True
        import_.save()

        # create and run the resolver
        resolver = table.ImportResolver(import_, parse_result, user)
        import_, result = resolver.resolve(initial_upload=True, requested_status="")

        # test that resolution summary dict is computed correctly.
        # in this case we expect essentially the same result as the a non-overwriting import,
        # since allow_overwrite skips the overwrite check
        exp_summary_path = self._file_path(
            "FBA-OD-generic.xslx.cache-overwrite-allowed.context.json"
        )
        exp_summary = factory.load_test_json(exp_summary_path)
        self.assertEqual(exp_summary, result)

        # test that import is returned with READY status
        self.assertEqual(import_.status, Import.Status.READY)

        # test that import is actually marked as READY in the database
        import_ = Import.objects.get(pk=import_pk)
        self.assertEqual(import_.status, Import.Status.READY)


class EmptyAssayTests(GenericFBAResolveMixin, TestCase):
    fixtures = [
        "edd_file_importer/generic_fba_imports",
        "edd_file_importer/generic_fba_imported",
    ]

    @clear_import_cache(import_uuid="ec2e3a30-3f35-4219-88a8-cf78fb100a98")
    def test_duplicate_inactive_assay_names(self):
        """
        Tests that ImportResolver correctly ignores inactive assays during the import, even if
        their names duplicate active assay names that the import resolves to
        """
        # delete measurements from the fixture so we don't trigger overwrite detection. we're just
        # reusing the fixture to take advantage of fixed Assay primary keys that would otherwise be
        # variable between tests (yes, even using TestCase).
        edd_models.MeasurementValue.objects.filter(study_id=10).delete()
        edd_models.Measurement.objects.filter(study_id=10).delete()

        # create one duplicate, INactive assay that should be ignored
        edd_models.Assay.objects.create(
            name="BW1", protocol_id=3, study_id=10, line_id=12, active=False
        )

        # verify that the import still resolves
        self.verify_generic_od_xlsx_resolve_success(matched_lines=False)

    @clear_import_cache(import_uuid="ec2e3a30-3f35-4219-88a8-cf78fb100a98")
    @override_settings(EDD_IMPORT_PAGE_SIZE=14, EDD_IMPORT_CACHE_LENGTH=5)
    def test_empty_assay_import(self):
        """
        Tests that when import matches empty assays (with no data or time metadata), the resolution
        succeeds on the assay match
        """
        # delete measurements from the fixture so we don't trigger overwrite detection. we're just
        # reusing the fixture to take advantage of fixed Assay primary keys that would otherwise be
        # variable between tests (yes, even using TestCase).
        edd_models.MeasurementValue.objects.filter(study_id=10).delete()
        edd_models.Measurement.objects.filter(study_id=10).delete()

        # test that import succeeds and matches assays
        self.verify_generic_od_xlsx_resolve_success(matched_lines=False)


@override_settings(MEDIA_ROOT=_GENERIC_FILES_DIR)
class DuplicationTests(TestCase):
    """
    Tests ImportResolver's ability to detect and warn users prior to duplicating existing study
    data.
    """

    fixtures = [
        "edd_file_importer/generic_fba_imports",
        "edd_file_importer/generic_fba_imported",
    ]

    @clear_import_cache(import_uuid="ec2e3a30-3f35-4219-88a8-cf78fb100a98")
    @override_settings(EDD_IMPORT_PAGE_SIZE=2, EDD_IMPORT_CACHE_LENGTH=5)
    def test_duplicate_detection_result(self):
        # rename both assays from the fixture so that assay name checks fail and the
        # import drops back to matching against line names
        edd_models.Assay.objects.filter(study_id=10, name="arcA").update(
            name="arc_original"
        )
        edd_models.Assay.objects.filter(study_id=10, name="BW1").update(
            name="BW1_original"
        )

        # initiate re-import of the same fixture data, verifying that the duplication is detected

        # gather inputs for the test
        import_ = Import.objects.get(pk=13)
        parse_result: FileParseResult = load_fba_od_parse_result()
        user = factory.UserFactory.build()
        exp_summary_path = self._file_path(
            "FBA-OD-generic.xslx.cache-duplicate.context.json"
        )

        # create and run the resolver
        resolver = table.ImportResolver(import_, parse_result, user)
        import_, summary = resolver.resolve(initial_upload=True, requested_status="")

        # compare expected vs actual summary
        exp_summary = factory.load_test_json(exp_summary_path)
        self.assertEqual(exp_summary, summary)
        self.assertEqual(import_.status, Import.Status.RESOLVED)

        # test that import is returned with the correct status
        self.assertEqual(import_.status, Import.Status.RESOLVED)

        # test that import is actually marked as RESOLVED in the database
        import_ = Import.objects.get(pk=import_.pk)
        self.assertEqual(import_.status, Import.Status.RESOLVED)

    @clear_import_cache(import_uuid="ec2e3a30-3f35-4219-88a8-cf78fb100a98")
    @override_settings(EDD_IMPORT_PAGE_SIZE=2, EDD_IMPORT_CACHE_LENGTH=5)
    def test_duplication_allowed(self):
        """
        Do the same test as test_duplicate_detection_result(), but with the "allow_duplication"
        flag set.  Verify that the result in READY status rather than RESOLVED
        """

        # rename both assays from the fixture so that assay name checks totally fail and the
        # import drops back to matching against line names
        edd_models.Assay.objects.filter(study_id=10, name="arcA").update(
            name="arc_original"
        )
        edd_models.Assay.objects.filter(study_id=10, name="BW1").update(
            name="BW1_original"
        )

        ###########################################################################################
        # initiate re-import of the same fixture data, verifying that the duplication is detected
        ###########################################################################################
        # gather inputs for the test
        import_ = Import.objects.get(pk=13)
        parse_result: FileParseResult = load_fba_od_parse_result()
        user = factory.UserFactory.build()

        # set the flag the user uses to aknowledge that duplication is intended (or known not to
        # exist, so we want to skip the expensive check)
        import_.allow_duplication = True
        import_.save()

        # same summary result as a test with non-duplicate data, since allow_duplication skips
        # the check
        exp_summary_path = self._file_path(
            "FBA-OD-generic.xlsx.cache.context-created.json"
        )

        # create and run the resolver
        resolver = table.ImportResolver(import_, parse_result, user)
        import_, summary = resolver.resolve(initial_upload=True, requested_status="")

        # verify summary result
        exp_summary = factory.load_test_json(exp_summary_path)
        self.assertEqual(exp_summary, summary)

        # test that import is returned with the correct status
        self.assertEqual(import_.status, Import.Status.READY)

        # test that import is actually marked as RESOLVED in the database
        import_ = Import.objects.get(pk=import_.pk)
        self.assertEqual(import_.status, Import.Status.READY)

    def _file_path(self, filename):
        return os.path.join("generic_import", filename)


def load_mtype_resolve_err_parse_result() -> FileParseResult:
    """
    Read simulated file parse results from file into a FileParseResult object. This test only
    addresses the resolve step, so we've skipped creating the Excel file and fixture data that
    aren't really needed.
    """
    test_file = os.path.join("generic_import", "mtype-resolve-err.parse-result.json")
    with factory.load_test_file(test_file) as json_file:
        series = json.loads(json_file.read(), object_hook=load_parse_record)
    return FileParseResult(series, "row", True, True)


def load_unit_resolve_err_parse_result() -> FileParseResult:
    """
    Read simulated file parse results from file into a FileParseResult object. This test only
    addresses the resolve step, so we've skipped creating the Excel file and fixture data that
    aren't really needed.
    """
    test_file = os.path.join("generic_import", "unit-resolve-err.parse-result.json")
    with factory.load_test_file(test_file) as json_file:
        series = json.loads(json_file.read(), object_hook=load_parse_record)
    return FileParseResult(series, "row", True, True)
