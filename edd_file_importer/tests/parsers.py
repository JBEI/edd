# coding: utf-8
import json

from unittest.mock import call, patch

from .import factory
from edd_file_importer.codes import FileParseCodes
from edd_file_importer.parsers.table import GenericImportParser
from main.models import MeasurementType
from main.tests import TestCase


class Import2ParserTests(TestCase):

    def test_excel_err_detection(self):
        """
        Tests error detection for anticipated common errors
        """
        file_path = factory.test_file_path('generic_import/generic_import_errs.xlsx')
        self.check_errs(file_path, True)

    def test_csv_err_detection(self):
        file_path = factory.test_file_path('generic_import/generic_import_errs.csv')
        self.check_errs(file_path, False)

    def check_errs(self, file_path, is_excel):
        # mocking importer and test that the parsing does its job of aggregating errors
        # note that we init internal dicts in mock instance so they don't cause errors
        with patch('edd_file_importer.utilities.ErrorAggregator') as MockImporter:
            aggregator = MockImporter.return_value
            aggregator.errors = {}

            # parse the input from either file type. note that the mock masks exceptions normally
            # raised by the parser...we'll check below
            parser = GenericImportParser(MeasurementType.Group.METABOLITE, aggregator)
            if is_excel:
                parser.parse_excel(file_path)
            else:
                parser.parse_csv(file_path)

            aggregator.add_error.assert_has_calls([
                call(FileParseCodes.DUPLICATE_COL_HEADER,
                     occurrence='"Time" (E1)'),
                call(FileParseCodes.MISSING_REQ_VALUE,
                     subcategory='Measurement Type',
                     occurrence='B2'),
                call(FileParseCodes.MISSING_REQ_VALUE,
                     subcategory='Value',
                     occurrence='C2'),
                call(FileParseCodes.UNSUPPORTED_UNITS,
                     occurrence='"G/l" (F2)'),
                call(FileParseCodes.INVALID_VALUE,
                     subcategory="Time",
                     occurrence='"A" (D3)'),
            ])

    def test_excel_success_and_warnings(self):
        self.check_success_and_warnings('generic_import/generic_import.xlsx', True)

    def test_csv_success_and_warnings(self):
        self.check_success_and_warnings('generic_import/generic_import.csv', False)

    def check_success_and_warnings(self, filename, is_excel):
        """
        Tests for successful parsing of generic import file
        """
        file_path = factory.test_file_path(filename)

        # mocking error aggregator to test that the parsing does its job
        with patch('edd_file_importer.utilities.ErrorAggregator') as MockImporter:
            importer = MockImporter.return_value
            importer.errors = {}  # prevent mock from masking correct parse return value
            parser = GenericImportParser(MeasurementType.Group.METABOLITE, importer)

            if is_excel:
                mcount = parser.parse_excel(file_path)
            else:
                mcount = parser.parse_csv(file_path)

            importer.add_error.assert_not_called()

            # build a list of warnings expected to be detected during parsing
            warning_calls = []
            if is_excel:
                warning_calls = [
                    call(FileParseCodes.IGNORED_WORKSHEET,
                         occurrence='Only the first sheet in your workbook, "Sheet 1", '
                                    'was processed.  All other sheets will be ignored.')]
            warning_calls.append(
                call(FileParseCodes.COLUMN_IGNORED, occurrence='"Unrecognized Header" (C2)'))

            # verify expected errors and warnings detected
            importer.add_warning.assert_has_calls(warning_calls)
            importer.add_warnings.assert_called_once_with(
                FileParseCodes.IGNORED_VALUE_BEFORE_HEADERS,
                ['"Hand-scrawled research notes" (B1)'])

            self.assertEqual(mcount, 2)

        with factory.load_test_file('generic_import/parse_result.json') as json_file:
            expected = json.loads(json_file.read())
            parsed = [m.to_json() for m in parser.series_data]

            self.assertEqual(expected, parsed)
