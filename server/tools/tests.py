import csv
import logging
import os.path
from io import StringIO

import pytest

from edd import TestCase

from .form_utils import (
    extract_floats_from_form,
    extract_integers_from_form,
    extract_non_blank_string_from_form,
)
from .parsers import biolector, gc_ms, skyline
from .parsers.excel import export_to_xlsx, import_xlsx_table, import_xlsx_tables

test_dir = os.path.join(os.path.dirname(__file__), "fixtures", "misc_data")
logger = logging.getLogger(__name__)


########################################################################
# GC-MS
def test_gcms_peak_areas_report_example_1():
    err = StringIO()
    out = StringIO()
    test_file = os.path.join(test_dir, "gc_ms_1.txt")

    # not testing output of run
    result = gc_ms.run([test_file], out=StringIO(), err=StringIO())
    result.show_peak_areas(out=out, err=err)

    assert len(result.samples) == 102
    assert "0059.D          562         None         None" in out.getvalue()
    assert "0062.D       104049      1192526        35926" in out.getvalue()
    assert "WARNING: 2 peaks near 8.092 for sample 0062.D" in err.getvalue()
    assert err.getvalue().count("WARNING") == 44


def test_gcms_peak_areas_csv_example_1():
    err = StringIO()
    out = StringIO()
    test_file = os.path.join(test_dir, "gc_ms_1.txt")

    # not testing output of run
    result = gc_ms.run([test_file], out=StringIO(), err=StringIO())
    result.show_peak_areas_csv(out=out, err=err)

    assert "0059.D,562,None,None" in out.getvalue()
    assert "0062.D,104049,1192526,35926" in out.getvalue()


def test_gcms_peak_areas_report_example_2():
    # a slightly different format
    err = StringIO()
    out = StringIO()
    test_file = os.path.join(test_dir, "gc_ms_2.txt")
    with open(os.path.join(test_dir, "gc_ms_2.out.txt")) as f:
        test_out = f.read()

    result = gc_ms.run([test_file], out=StringIO(), err=StringIO())
    result.show_peak_areas(out=out, err=err)

    assert len(result.samples) == 5
    assert out.getvalue() == test_out


def test_gcms_run_errors_on_malformed_input():
    test_file = os.path.join(test_dir, "skyline.csv")
    with pytest.raises(ValueError):
        gc_ms.run([test_file], out=StringIO(), err=StringIO())


def test_gcms_xls_key():
    # Import .xlsx workbook
    test_file = os.path.join(test_dir, "sample_gc_ms_key.xlsx")
    expected_headers = [
        "sample ID (could be vial #)",
        "label to display",
        "parent strain",
        "plasmid/change",
        "colony number",
        "time point",
        "media (induction, etc.)",
        "sample type",
        None,
        "user field 1",
        "user field 2",
        "user field 3",
    ]

    with open(test_file, "rb") as file:
        headers, table = gc_ms.import_xlsx_metadata(file)

    assert headers == expected_headers


def test_skyline_parsing():
    file_name = os.path.join(test_dir, "skyline.csv")
    parser = skyline.SkylineParser()

    with open(file_name) as file:
        reader = csv.reader(file)
        result = parser.export(reader)

    assert skyline.Record("4", "A", 22) in result["rows"]


def test_simple_biolector_file():
    filename = "/code/tools/parsers/biolector/biolector_test_file.xml"

    with open(filename) as file:
        results = biolector.getRawImportRecordsAsJSON(file, 0)

    assert len(results) == 48
    last_v = results[-1]["data"][-1][1]
    well_v = results[20]["metadata_by_name"]["Bio:well"]
    assert last_v == "8.829"
    assert well_v == "C05"


def get_table():
    return [
        ["Some random text we want to ignore", None, None, None, None, None],
        ["More random", 2.5, None, None, None, None],
        [None, None, None, None, None, None],
        [None, None, None, None, None, None],
        [None, "sample ID", "line ID", "replica", "molecule1", "molecule 2"],
        [None, "abcd1", "line1", 1, 5.5, 6.5],
        [None, "abcd2", "line1", 2, 4.0, 7.3],
        [None, "abcd3", "line2", 1, 3.5, 8.8],
        [None, "abcd4", "line2", 2, 2.0, 9.6],
        [None, None, None, None, None, None],
        ["Summary line", None, None, None, 3.75, 8.05],
        [None, None, None, None, None, None],
    ]


def make_simple(t, file_name):
    return export_to_xlsx(t, file_name=file_name, title=file_name)


class ExcelTests(TestCase):
    def test_simple(self):
        make_simple(get_table(), "tst1.xlsx")
        result = import_xlsx_tables("tst1.xlsx")
        t = result["worksheets"][0][0]
        self.assertEqual(
            t["headers"], ["sample ID", "line ID", "replica", "molecule1", "molecule 2"]
        )
        self.assertEqual(
            t["values"],
            [
                ["abcd1", "line1", 1, 5.5, 6.5],
                ["abcd2", "line1", 2, 4, 7.3],
                ["abcd3", "line2", 1, 3.5, 8.8],
                ["abcd4", "line2", 2, 2, 9.6],
            ],
        )
        result2 = import_xlsx_tables(
            "tst1.xlsx", worksheet_name="tst1.xlsx", column_search_text="sample"
        )
        t2 = result2["worksheets"][0][0]
        self.assertEqual(t2, t)
        # note different function
        result3 = import_xlsx_table("tst1.xlsx")
        self.assertEqual(result3, t)
        result4 = import_xlsx_table(
            "tst1.xlsx", column_labels=["sample id", "molecule1", "MOLECULE 2"]
        )
        self.assertEqual(
            result4,
            {
                "headers": ["sample ID", "molecule1", "molecule 2"],
                "values": [
                    ["abcd1", 5.5, 6.5],
                    ["abcd2", 4, 7.3],
                    ["abcd3", 3.5, 8.8],
                    ["abcd4", 2, 9.6],
                ],
            },
        )
        os.remove("tst1.xlsx")

    def test_error_handling(self):
        t3 = get_table()
        t3[7][1] = None
        make_simple(t3, "tst3.xlsx")
        result = import_xlsx_tables("tst3.xlsx")
        self.assertEqual(
            result,
            {
                "worksheets": [
                    [
                        {
                            "headers": [
                                "sample ID",
                                "line ID",
                                "replica",
                                "molecule1",
                                "molecule 2",
                            ],
                            "values": [
                                ["abcd1", "line1", 1, 5.5, 6.5],
                                ["abcd2", "line1", 2, 4, 7.3],
                                [None, "line2", 1, 3.5, 8.8],
                                ["abcd4", "line2", 2, 2, 9.6],
                            ],
                        }
                    ]
                ]
            },
        )
        # ask for missing worksheet
        with self.assertRaises(KeyError):
            import_xlsx_table("tst3.xlsx", worksheet_name="foo")
        os.remove("tst3.xlsx")

    def test_non_numeric(self):
        get_table()


class UtilsTests(TestCase):
    def test_form_handling(self):
        form = {
            "int1": "1",
            "float1": "2.5",
            "int2": "1.5",
            "float2": "2",
            "int3": ["1", "2", "3"],
            "float3": ["1.5"],
            "int4": ["1.5", "2", "3"],
            "float4": "",
            "str1": "foo",
            "str2": ["foo", "bar"],
            "str3": "",
        }
        self.assertEqual(extract_integers_from_form(form, "int1"), 1)
        self.assertEqual(extract_floats_from_form(form, "int1"), 1.0)
        self.assertEqual(
            extract_integers_from_form(form, "int3", allow_list=True), [1, 2, 3]
        )
        self.assertEqual(
            extract_floats_from_form(form, "float3", allow_list=True), [1.5]
        )
        self.assertEqual(extract_non_blank_string_from_form(form, "str1"), "foo")
        self.assertEqual(
            extract_non_blank_string_from_form(form, "str2", allow_list=True),
            ["foo", "bar"],
        )
        with self.assertRaises(TypeError):
            extract_integers_from_form(form, "int3")
        with self.assertRaises(ValueError):
            extract_integers_from_form(form, "int2")
        with self.assertRaises(KeyError):
            extract_integers_from_form(form, "int5")
        with self.assertRaises(ValueError):
            extract_integers_from_form(form, "int4", allow_list=True)
        with self.assertRaises(ValueError):
            extract_non_blank_string_from_form(form, "str3")
        self.assertIsNone(
            extract_non_blank_string_from_form(
                form, "str3", return_none_if_missing=True
            )
        )
        self.assertIsNone(
            extract_floats_from_form(form, "float4", return_none_if_missing=True)
        )
