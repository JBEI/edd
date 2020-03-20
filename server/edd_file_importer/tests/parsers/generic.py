import json
import os
from typing import List, Union
from uuid import UUID, uuid4

import pytest

import edd_file_importer.exceptions as exc
from edd_file_importer import parsers
from edd_file_importer.signals import warnings_reported

from .. import factory
from ..test_utils import load_parse_record


def test_multi_err_workflow_excel():
    """
    Tests that excel parsing fails on the final error in a multi-error file.  It also serves as
    a hand-wavy proxy for all other parse errors tested in greater detail here in CSV format.
    Code paths should be the same, and for now we're favoring low-level testing of CSV only to
    avoid test bloat.
    """

    file_path = factory.build_test_file_path(
        "generic_import", "generic_import_parse_errs.xlsx"
    )

    # invent a UUID for tracking messages in this workflow.  in context, this would
    # normally be an import UUID
    uuid = uuid4()
    exc.track_msgs(uuid)

    try:
        parser = parsers.GenericExcelParser(uuid)
        with open(file_path, "rb") as file:
            with pytest.raises(exc.InvalidValueError) as exc_info:
                parser.parse(file)

        # test that the last error in the file is the one that finally triggered the Exception
        assert exc_info.value.details == ['"A" (D3)']
    finally:
        # clean up error & warning reports generated as a side effect of the test
        exc.track_msgs(uuid, False)


def test_multi_err_workflow_csv():
    """
    Tests that CSV parsing fails on the final error in a multi-error file.  Assuming reporting
    code not tested here functions correctly, this gives us a reasonable, if not rigorous,
    verification that errors are being aggregated and reported from the parser.
    """

    file_path = factory.build_test_file_path(
        "generic_import", "generic_import_parse_errs.csv"
    )

    # invent a UUID for tracking messages in this workflow.  in context, this would
    # normally be an import UUID
    uuid = uuid4()
    exc.track_msgs(uuid)

    try:
        parser = parsers.GenericCsvParser(uuid)
        with open(file_path) as file:
            with pytest.raises(exc.InvalidValueError) as exc_info:
                parser.parse(file)

        # test that the last error in the file is the one that finally triggered the Exception
        assert exc_info.value.details == ['"A" (D3)']
    finally:
        # clean up error & warning reports generated as a side effect of the test
        exc.track_msgs(uuid, False)


def test_missing_req_cols():
    """
    Checks that missing required columns are correctly detected and that a helpful error
    message is created
    """

    # invent a UUID for tracking messages in this workflow.  in context, this would
    # normally be an import UUID
    uuid = uuid4()

    parser = parsers.GenericCsvParser(uuid)
    text = ["Measurement Type,Value,Time"]  # missing "line name" & "units" cols
    with pytest.raises(exc.RequiredColumnError):
        parser.parse(text)


def test_wrong_format():
    """
    Checks that missing required columns are correctly detected and that a helpful error
    message is created
    """
    file_path = factory.build_test_file_path(
        "generic_import", "generic_import_wrong_format.xlsx"
    )

    # invent a UUID for tracking messages in this workflow.  in context, this would
    # normally be an import UUID
    uuid = uuid4()

    parser = parsers.GenericExcelParser(uuid)
    with open(file_path, "rb") as file:
        with pytest.raises(exc.RequiredColumnError) as exc_info:
            parser.parse(file)

    # compare expected vs actual error messages reported during the attempt
    exception = exc_info.value
    assert exception.details == [
        "Line Name",
        "Measurement Type",
        "Value",
        "Time",
        "Units",
    ]


def test_duplicate_col():
    # invent a UUID for tracking messages in this workflow.  in context, this would
    # normally be an import UUID
    uuid = uuid4()

    text = ["Line name,Measurement Type,Value,Time,Time,Units"]

    parser = parsers.GenericCsvParser(uuid)
    with pytest.raises(exc.DuplicateColumnError) as exc_info:
        parser.parse(text)
    assert exc_info.value.details == ["D1", "E1"]


def test_missing_req_val():
    # invent a UUID for tracking messages in this workflow.  in context, this would
    # normally be an import UUID
    uuid = uuid4()

    text = [
        "Line name, Measurement Type, Value, Time, Units",
        "arcA     , Optical Density ,       , 1 ,  n/a",
    ]
    parser = parsers.GenericCsvParser(uuid)
    with pytest.raises(exc.RequiredValueError) as exc_info:
        parser.parse(text)
    assert exc_info.value.details == ["C2"]


def test_invalid_numeric_value():
    """
    Tests that the generic parser correctly detects when an expected numeric value isn't
    parseable.
    """
    # invent a UUID for tracking messages in this workflow.  in context, this would
    # normally be an import UUID
    uuid = uuid4()

    text = [
        "Line name, Measurement Type, Value, Time, Units",
        "arcA     , Optical Density ,   1   , A ,  n/a",
    ]
    parser = parsers.GenericCsvParser(uuid)
    with pytest.raises(exc.InvalidValueError) as exc_info:
        parser.parse(text)
    assert exc_info.value.details == ['"A" (D2)']


def test_parse_success_xlsx():
    """
    Tests successful parsing of a sample XLSX-format file, as well as verifying that parsing it
    produces the same output whether read from XLSX or CSV.
    """
    # invent a UUID for tracking messages in this workflow.  in context, this would
    # normally be an import UUID
    uuid = uuid4()

    file_path = factory.build_test_file_path("generic_import", "generic_import.xlsx")

    parser = parsers.GenericExcelParser(uuid)
    with open(file_path, "rb") as file:
        parsed = parser.parse(file)

    verify_parse_result(parsed)


def verify_parse_result(parsed: parsers.FileParseResult):
    """
    Utility method that compares parsed content from XLSX and CSV format files,
    verifying that A) the results are correct and B) that they're consistent regardless of
    which file format was used.

    :param parsed: parse results
    """

    # verify that expected values were parsed
    assert parsed is not None
    assert parsed.line_or_assay_names == {"A", "B"}
    assert parsed.mtypes == {"CID:440917", "CID:5288798"}
    record_count = len(parsed.series_data)
    assert record_count == 2
    assert parsed.any_time is True
    assert parsed.has_all_times is True
    assert parsed.record_src, "row"
    assert parsed.units, {"g/L", "hours"}

    # drill down and verify that ParseRecords were created as expected
    test_file = os.path.join("generic_import", "generic_import_parse_parse_result.json")
    with factory.load_test_file(test_file) as json_file:
        expected = json.loads(json_file.read(), object_hook=load_parse_record)
        assert expected == parsed.series_data


def test_parse_success_csv():
    """
    Tests successful parsing of a sample CSV-format file, as well as verifying that parsing it
    produces the same output whether read from CSV or XLSX.
    """
    # invent a UUID for tracking messages in this workflow.  in context, this would normally be
    # an import UUID
    uuid = uuid4()

    file_path = factory.build_test_file_path("generic_import", "generic_import.csv")

    parser = parsers.GenericCsvParser(uuid)
    with open(file_path) as file:
        parsed = parser.parse(file)

    verify_parse_result(parsed)


def test_warnings_xlsx():
    """
    Tests that a successful parse also detects and reports warnings.
    """
    # invent a UUID for tracking messages in this workflow.  in context, this would normally be
    # an import UUID
    uuid = uuid4()
    file_path = factory.build_test_file_path("generic_import", "generic_import.xlsx")

    # set up a callback to track which warnings were reported via the "warnings_reported"
    # signal
    warnings: List[exc.EDDImportWarning] = []

    def warning_listener(key: Union[UUID, str], **kwargs):
        warns: exc.EDDImportWarning = kwargs["warns"]
        warnings.append(warns)

    warnings_reported.connect(warning_listener, uuid)

    try:
        # parse the file
        parser = parsers.GenericExcelParser(uuid)
        with open(file_path, "rb") as file:
            parser.parse(file)

        # test that warnings are being reported
        assert warnings == [
            exc.IgnoredWorksheetWarning(
                details='Only the first sheet in your workbook, "Sheet 1", '
                'was processed. The other sheet "Unused" was ignored.'
            ),
            exc.IgnoredColumnWarning(
                details=['"Unrecognized Header" (C2)', '"Measured Quantity" (E2)']
            ),
            exc.IgnoredValueWarning(details=['"Hand-scrawled research notes" (B1)']),
        ]
    finally:
        warnings_reported.disconnect(warning_listener, uuid)
