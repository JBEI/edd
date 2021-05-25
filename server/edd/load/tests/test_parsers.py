from uuid import uuid4

import pytest

from .. import exceptions, parsers, reporting
from ..signals import warnings_reported
from . import factory


def test_GenericExcelParser_multiple_error_workflow():
    # Tests that excel parsing fails on the final error in a multi-error file.
    # It also serves as a hand-wavy proxy for all other parse errors tested in
    # greater detail here in CSV format. Code paths should be the same, and for
    # now we're favoring low-level testing of CSV only to avoid test bloat.
    path = ("generic_import_parse_errs.xlsx",)
    uuid = uuid4()
    parser = parsers.GenericExcelParser(uuid)
    # enable tracking to catch all errors
    with reporting.tracker(uuid), factory.load_test_file(*path) as file:
        # make sure final error is the one reported
        with pytest.raises(exceptions.InvalidValueError) as exc_info:
            parser.parse(file)
        assert exc_info.value.details == ['"A" (D3)']


def test_GenericCsvParser_multiple_error_workflow():
    # Tests that CSV parsing fails on the final error in a multi-error file.
    path = ("generic_import_parse_errs.csv",)
    uuid = uuid4()
    parser = parsers.GenericCsvParser(uuid)
    # enable tracking to catch all errors
    with reporting.tracker(uuid), factory.load_test_file(*path, mode="rt") as file:
        # make sure final error is the one reported
        with pytest.raises(exceptions.InvalidValueError) as exc_info:
            parser.parse(file)
        assert exc_info.value.details == ['"A" (D3)']


def test_GenericCsvParser_missing_required_columns():
    parser = parsers.GenericCsvParser(uuid4())
    # missing "line name" & "units" cols
    text = ["Measurement Type,Value,Time"]
    with pytest.raises(exceptions.RequiredColumnError):
        parser.parse(text)


def test_GenericExcelParser_wrong_format():
    path = ("generic_import_wrong_format.xlsx",)
    parser = parsers.GenericExcelParser(uuid4())
    with factory.load_test_file(*path) as file:
        with pytest.raises(exceptions.RequiredColumnError) as exc_info:
            parser.parse(file)
    # compare expected vs actual error messages reported during the attempt
    assert exc_info.value.details == [
        "Line Name",
        "Measurement Type",
        "Value",
        "Time",
        "Units",
    ]


def test_GenericCsvParser_duplicate_column():
    # "Time" appears thrice
    text = ["Line name,Measurement Type,Value,Time,Time,Units,Time"]
    uuid = uuid4()
    parser = parsers.GenericCsvParser(uuid)
    with reporting.tracker(uuid), pytest.raises(
        exceptions.DuplicateColumnError
    ) as exc_info:
        parser.parse(text)
    assert exc_info.value.details == ["D1", "E1", "G1"]


def test_GenericCsvParser_missing_required_value():
    # "Value" column is blank
    text = [
        "Line name, Measurement Type, Value, Time, Units",
        "arcA     , Optical Density ,      , 1   , n/a",
    ]
    parser = parsers.GenericCsvParser(uuid4())
    with pytest.raises(exceptions.RequiredValueError) as exc_info:
        parser.parse(text)
    assert exc_info.value.details == ["C2"]


def test_GenericCsvParser_missing_required_value_short_row():
    # "Value" column is blank
    text = [
        "Line name, Measurement Type, Value, Time, Units",
        "arcA     , Optical Density",
    ]
    parser = parsers.GenericCsvParser(uuid4())
    with pytest.raises(exceptions.RequiredValueError) as exc_info:
        parser.parse(text)
    assert exc_info.value.details == ["C2"]


def test_GenericCsvParser_missing_optional_value_short_row():
    # "Value" column is blank
    text = [
        "Line name, Measurement Type, Value, Time, Units, Media",
        "arcA     , Optical Density , 1    , 1   , n/a",
    ]
    parser = parsers.GenericCsvParser(uuid4())
    parser.parse(text)
    # no errors


def test_GenericCsvParser_invalid_numeric_value():
    # expect "Time" to be numeric, not alpha
    text = [
        "Line name, Measurement Type, Value, Time, Units",
        "arcA     , Optical Density , 1    , A   , n/a",
    ]
    parser = parsers.GenericCsvParser(uuid4())
    with pytest.raises(exceptions.InvalidValueError) as exc_info:
        parser.parse(text)
    assert exc_info.value.details == ['"A" (D2)']


def test_GenericCsvParser_starting_byte_order_mark():
    # simulate a file with a starting BOM character
    text = [
        "\ufeffLine name, Measurement Type, Value, Time, Units",
        "arcA           , Optical Density , 1    , 1   , n/a",
    ]
    parser = parsers.GenericCsvParser(uuid4())
    results = parser.parse(text)
    assert results is not None
    assert results.line_or_assay_names == {"arcA"}
    assert len(results.series_data) == 1


def test_GenericExcelParser_parse_success():
    path = ("generic_import.xlsx",)
    parser = parsers.GenericExcelParser(uuid4())
    with factory.load_test_file(*path) as file:
        parsed = parser.parse(file)
    verify_generic_parse_result(parsed)


def test_GenericCsvParser_parse_success():
    path = ("generic_import.csv",)
    parser = parsers.GenericCsvParser(uuid4())
    with factory.load_test_file(*path, mode="rt") as file:
        parsed = parser.parse(file)
    verify_generic_parse_result(parsed)


def verify_generic_parse_result(parsed):
    # Utility method that compares parsed content from XLSX and CSV format files,
    # verifying that:
    #     A) the results are correct, and
    #     B) that they're consistent regardless of file format.

    # verify that expected values were parsed
    assert parsed is not None
    assert parsed.line_or_assay_names == {"A", "B"}
    assert parsed.mtypes == {"CID:440917", "CID:5288798"}
    record_count = len(parsed.series_data)
    assert record_count == 2
    assert parsed.any_time is True
    assert parsed.has_all_times is True
    assert parsed.record_src == "row"
    assert parsed.units == {"g/L", "hours"}
    # drill down and verify that ParseRecords were created as expected
    assert len(parsed.series_data) == 2
    first = parsed.series_data[0]
    assert first.loa_name == "A"
    assert first.mtype_name == "CID:440917"
    assert first.y_unit_name == "g/L"
    assert first.x_unit_name == "hours"
    assert first.value_format == "0"
    assert first.data == [[8], [1]]
    second = parsed.series_data[1]
    assert second.loa_name == "B"
    assert second.mtype_name == "CID:5288798"
    assert second.y_unit_name == "g/L"
    assert second.x_unit_name == "hours"
    assert second.value_format == "0"
    assert second.data == [[24], [2]]


def test_GenericExcelParser_generates_warnings():
    uuid = uuid4()
    path = ("generic_import.xlsx",)
    # set up a callback to track which warnings were reported
    # via the "warnings_reported" signal
    received = []

    def warning_listener(sender, key, warnings, **kwargs):
        received.append(warnings)

    warnings_reported.connect(warning_listener)

    # enable tracking to catch all warnings
    with reporting.tracker(uuid):
        try:
            # parse the file
            parser = parsers.GenericExcelParser(uuid)
            with factory.load_test_file(*path) as file:
                parser.parse(file)

            # test that warnings are being reported
            assert len(received) == 3
            assert isinstance(received[0], exceptions.IgnoredWorksheetWarning)
            assert received[0].details == [
                'Only the first sheet in your workbook, "Sheet 1", '
                "was processed. All other sheets were ignored (1).",
            ]
            assert isinstance(received[1], exceptions.IgnoredColumnWarning)
            assert received[1].details == [
                '"Unrecognized Header" (C2)',
                '"Measured Quantity" (E2)',
            ]
            assert isinstance(received[2], exceptions.IgnoredValueWarning)
            assert received[2].details == [
                '"Hand-scrawled research notes" (B1)',
            ]
        finally:
            # cleanup callback
            warnings_reported.disconnect(warning_listener, uuid)


def test_SkylineCsvParser_wrong_layout():
    text = ["Not,  The,  Right,   Format"]
    parser = parsers.SkylineCsvParser(uuid4())
    with pytest.raises(exceptions.RequiredColumnError) as exc_info:
        parser.parse(text)
    # compare expected vs actual error messages reported during the attempt
    assert exc_info.value.details == ["Replicate Name", "Protein Name", "Total Area"]


def test_SkylineCsvParser_duplicate_columns():
    text = ["Replicate Name, Protein Name, Peptide, Total Area, Total Area"]
    parser = parsers.SkylineCsvParser(uuid4())
    with pytest.raises(exceptions.DuplicateColumnError) as exc_info:
        parser.parse(text)
    assert exc_info.value.details == ["D1", "E1"]


def test_SkylineCsvParser_missing_required_value():
    # "Total Area" column is empty
    text = [
        "Replicate Name, Protein Name, Peptide, Total Area",
        "arcA          , A           , Q      ,           ",
    ]
    parser = parsers.SkylineCsvParser(uuid4())
    with pytest.raises(exceptions.RequiredValueError) as exc_info:
        parser.parse(text)
    assert exc_info.value.subcategory == "Total Area"
    assert exc_info.value.details == ["D2"]


def test_SkylineCsvParser_invalid_numeric_value():
    # "Kitty" is not numeric
    text = [
        "Replicate Name, Protein Name, Peptide, Total Area",
        "arcA          , A           , Q      ,  Kitty    ",
    ]
    parser = parsers.SkylineCsvParser(uuid4())
    with pytest.raises(exceptions.InvalidValueError) as exc_info:
        parser.parse(text)
    assert exc_info.value.subcategory == "Total Area"
    assert exc_info.value.details == ['"Kitty" (D2)']


def test_SkylineExcelParser_success():
    path = ("skyline.xlsx",)
    parser = parsers.SkylineExcelParser(uuid4())
    with factory.load_test_file(*path) as file:
        parsed = parser.parse(file)
    verify_skyline_parse_results(parsed)


def test_SkylineCsvParser_success():
    path = ("skyline.csv",)
    parser = parsers.SkylineCsvParser(uuid4())
    with factory.load_test_file(*path, mode="rt") as file:
        parsed = parser.parse(file)
    verify_skyline_parse_results(parsed)


def verify_skyline_parse_results(parsed):
    # Utility method that compares parsed content from XLSX and CSV format files,
    # verifying that:
    #     A) the results are correct, and
    #     B) that they're consistent regardless of file format.
    assert parsed is not None
    assert parsed.any_time is False
    assert parsed.has_all_times is False
    assert parsed.has_all_units is True
    assert parsed.record_src == "row"
    assert parsed.line_or_assay_names == frozenset({"arcA", "BW1"})
    assert parsed.mtypes == {"A", "B", "C", "D"}
    assert parsed.units == frozenset({"counts", "hours"})
    # compare MeasurementParseRecords generated by the parser
    assert len(parsed.series_data) == 7
    first = parsed.series_data[0]
    assert first.loa_name == "arcA"
    assert first.mtype_name == "A"
    assert first.y_unit_name == "counts"
    assert first.x_unit_name == "hours"
    assert first.value_format == "0"
    assert first.data == [[None], [1]]
    second = parsed.series_data[1]
    assert second.loa_name == "arcA"
    assert second.mtype_name == "B"
    assert second.y_unit_name == "counts"
    assert second.x_unit_name == "hours"
    assert second.value_format == "0"
    assert second.data == [[None], [2]]
    third = parsed.series_data[2]
    assert third.loa_name == "arcA"
    assert third.mtype_name == "C"
    assert third.y_unit_name == "counts"
    assert third.x_unit_name == "hours"
    assert third.value_format == "0"
    assert third.data == [[None], [3]]
    fourth = parsed.series_data[3]
    assert fourth.loa_name == "BW1"
    assert fourth.mtype_name == "A"
    assert fourth.y_unit_name == "counts"
    assert fourth.x_unit_name == "hours"
    assert fourth.value_format == "0"
    assert fourth.data == [[None], [3]]
    fifth = parsed.series_data[4]
    assert fifth.loa_name == "BW1"
    assert fifth.mtype_name == "B"
    assert fifth.y_unit_name == "counts"
    assert fifth.x_unit_name == "hours"
    assert fifth.value_format == "0"
    assert fifth.data == [[None], [2]]
    sixth = parsed.series_data[5]
    assert sixth.loa_name == "BW1"
    assert sixth.mtype_name == "C"
    assert sixth.y_unit_name == "counts"
    assert sixth.x_unit_name == "hours"
    assert sixth.value_format == "0"
    assert sixth.data == [[None], [1]]
    seventh = parsed.series_data[6]
    assert seventh.loa_name == "arcA"
    assert seventh.mtype_name == "D"
    assert seventh.y_unit_name == "counts"
    assert seventh.x_unit_name == "hours"
    assert seventh.value_format == "0"
    assert seventh.data == [[None], [0]]


def test_SkylineExcelParser_generates_warnings():
    uuid = uuid4()
    path = ("skyline.xlsx",)
    # set up a callback to track which warnings were reported
    # via the "warnings_reported" signal
    received = []

    def warning_listener(sender, key, warnings, **kwargs):
        received.append(warnings)

    warnings_reported.connect(warning_listener)

    # enable tracking to catch all warnings
    with reporting.tracker(uuid):
        try:
            # parse the file
            parser = parsers.SkylineExcelParser(uuid)
            with factory.load_test_file(*path) as file:
                parser.parse(file)

            # test that warnings are being reported
            assert len(received) == 3
            assert isinstance(received[0], exceptions.IgnoredWorksheetWarning)
            assert received[0].details == [
                'Only the first sheet in your workbook, "Sheet 1", '
                "was processed. All other sheets were ignored (1).",
            ]
            assert isinstance(received[1], exceptions.IgnoredColumnWarning)
            assert received[1].details == [
                '"Unrecognized Header" (D2)',
            ]
            assert isinstance(received[2], exceptions.IgnoredValueWarning)
            assert received[2].details == [
                '"Hand-scrawled research notes" (B1)',
            ]
        finally:
            # cleanup callback
            warnings_reported.disconnect(warning_listener, uuid)


def test_build_src_summary_empty():
    summary = parsers.build_src_summary([])
    assert summary == []


def test_build_src_summary_single():
    summary = parsers.build_src_summary([4])
    assert summary == [4]


def test_build_src_summary_contiguous():
    summary = parsers.build_src_summary([1, 2, 3, 4])
    assert summary == ["1-4"]


def test_build_src_summary_break():
    summary = parsers.build_src_summary([1, 2, 3, 5])
    assert summary == ["1-3", 5]


def test_build_src_summary_convert():
    summary = parsers.build_src_summary([1, 2, 3, 5], convert_ints=True)
    assert summary == ["1-3", "5"]


def test_build_src_summary_offset():
    summary = parsers.build_src_summary([3, 5, 6, 7])
    assert summary == [3, "5-7"]


def test_build_src_summary_with_non_number():
    summary = parsers.build_src_summary(["foo", 5, 6, 7, "bar"])
    assert summary == ["foo", "5-7", "bar"]
