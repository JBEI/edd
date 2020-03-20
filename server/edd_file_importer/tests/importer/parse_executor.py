import os

from django.contrib.auth import get_user_model
from django.test import override_settings

import edd_file_importer.importer.table as table
from edd import TestCase
from edd_file_importer.exceptions import (
    BadParserError,
    ParseError,
    UnsupportedMimeTypeError,
)

from ...models import Import

User = get_user_model()

_PARENT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
_TEST_FILES_DIR = os.path.join(_PARENT_DIR, "files")
_GENERIC_FILES_DIR = os.path.join(_TEST_FILES_DIR, "generic_import")


@override_settings(MEDIA_ROOT=_GENERIC_FILES_DIR)
class ImportParseExecutorTests(TestCase):
    """
    Tests ImportParseExecutor error detection for common anticipated errors.  This helps verify
    behavior that should bubble up to clear log and UI output for site admins or developers who
    are implementing new import parsers.
    """

    fixtures = ["edd_file_importer/parse_executor"]

    @classmethod
    def setUpTestData(cls):
        super().setUpTestData()
        cls.write_user = User.objects.get(username="study.writer.user")

    def test_missing_parser_class(self):
        """
        Tests good downstream behavior of the importer code if admins have configured erroneous
        parsers in the management app (non-existent class)
        """
        # test that in import using a parser that doesn't exist fails as expected
        import_ = Import.objects.get(pk=13)
        exec = table.ImportParseExecutor(import_, self.write_user, None)

        with self.assertRaises(BadParserError):
            exec.parse()

    def test_malformed_parser_name(self):
        """
        Tests good downstream behavior of the importer code if admins have configured erroneous
        parsers in the management app (no package in class name -- import code requires this).
        """
        import_ = Import.objects.get(pk=15)
        exec = table.ImportParseExecutor(import_, self.write_user, None)

        with self.assertRaises(BadParserError):
            exec.parse()

    def test_unsupported_mime_type_err(self):
        """
        Tests that the import code raises a helpful exception if the browser / client OS
        provide an unsupported MIME type for the uploaded import file.
        """
        import_ = Import.objects.get(pk=17)
        exec = table.ImportParseExecutor(import_, self.write_user, None)

        with self.assertRaises(UnsupportedMimeTypeError):
            exec.parse()

    def test_parser_err_propagation(self):
        """
        Tests that ImportParseExecutor.parse() correctly propagates ParseExceptions thrown by the
        parser for a badly formatted file
        """
        import_ = Import.objects.get(pk=21)
        exec = table.ImportParseExecutor(import_, self.write_user, None)

        with self.assertRaises(ParseError):
            exec.parse()

    def test_successful_parse(self):
        """
        Tests that successful parsing of the FBA-OD-generic.xlsx file results in the expected
        output from the ImportParseExecutor.
        """
        import_ = Import.objects.get(pk=19)
        executor = table.ImportParseExecutor(import_, self.write_user, None)
        parsed = executor.parse()

        # verify that expected values were parsed.
        self.assertEqual(parsed.line_or_assay_names, frozenset({"arcA", "BW1"}))
        self.assertEqual(parsed.mtypes, frozenset({"Optical Density"}))
        self.assertEqual(len(parsed.series_data), 14)
        self.assertTrue(parsed.any_time)
        self.assertTrue(parsed.has_all_times)
        self.assertEqual(parsed.record_src, "row")
        self.assertEqual(parsed.units, frozenset({"hours", "n/a"}))
