# coding: utf-8

import logging
import os.path

from django.test import TestCase
from io import StringIO

from .parsers.excel import export_to_xlsx, import_xlsx_table, import_xlsx_tables
from .form_utils import (
    extract_floats_from_form,
    extract_integers_from_form,
    extract_non_blank_string_from_form,
)
from .parsers import biolector, gc_ms, skyline

test_dir = os.path.join(os.path.dirname(__file__), "fixtures", "misc_data")
logger = logging.getLogger(__name__)


########################################################################
# GC-MS
class GCMSTests(TestCase):
    def test_1(self):
        test_file = os.path.join(test_dir, "gc_ms_1.txt")
        result = gc_ms.run([test_file], out=StringIO(), err=StringIO())
        assert len(result.samples) == 102
        # result.find_consensus_peaks(show_plot=True)
        err = StringIO()
        out = StringIO()
        result.show_peak_areas(out=out, err=err)
        assert ("0059.D          562         None         None" in out.getvalue())
        assert ("0062.D       104049      1192526        35926" in out.getvalue())
        assert ("WARNING: 2 peaks near 8.092 for sample 0062.D" in err.getvalue())
        assert (err.getvalue().count("WARNING") == 44)
        err = StringIO()
        out = StringIO()
        result.show_peak_areas_csv(out=out, err=err)
        assert ("0059.D,562,None,None" in out.getvalue())
        assert ("0062.D,104049,1192526,35926" in out.getvalue())

    def test_2(self):
        # a slightly different format
        #
        test_file = os.path.join(test_dir, "gc_ms_2.txt")
        result = gc_ms.run([test_file], out=StringIO(), err=StringIO())
        assert len(result.samples) == 5, len(result.samples)
        # print result.find_consensus_peaks()
        err = StringIO()
        out = StringIO()
        result.show_peak_areas(out=out, err=err)
        assert (out.getvalue() == """\
          ID       Peak 1       Peak 2       Peak 3       Peak 4
  0827.a24.D       197080      1830086       849878       702183
    0827a1.D       440937      1740194       684256       822430
   0827a12.D       304791      1490375       580788       833538
   0827a17.D        95305       613903       408431       625373
   0827a24.D       197080      1830086       849878       702183
"""), "'%s'" % out.getvalue()
        #
        # Fault tolerance
        #
        test_file = os.path.join(test_dir, "skyline.csv")
        try:
            result = gc_ms.run([test_file], out=StringIO(), err=StringIO())
        except ValueError:
            pass
        else:
            assert False

    def test_xls_key(self):
        #
        # Import .xlsx workbook
        #
        test_file = os.path.join(test_dir, "sample_gc_ms_key.xlsx")
        headers, table = gc_ms.import_xlsx_metadata(open(test_file, "rb"))
        assert (headers == [
            'sample ID (could be vial #)',
            'label to display',
            'parent strain',
            'plasmid/change',
            'colony number',
            'time point',
            'media (induction, etc.)',
            'sample type',
            None,
            'user field 1',
            'user field 2',
            'user field 3',
        ])


########################################################################
# SKYLINE
class SkylineTests (TestCase):
    def test_1(self):
        file_name = os.path.join(test_dir, "skyline.csv")
        parser = skyline.SkylineParser()
        with open(file_name, 'U') as file:
            result = parser.export(file)
            self.assertIn(skyline.Record('4', 'A', 22), result['rows'])


########################################################################
# BIOLECTOR IMPORT
class BiolectorTests(TestCase):
    def test_simple(self):
        filename = "/code/edd_utils/parsers/biolector/biolector_test_file.xml"
        file = open(filename, 'U')
        results = biolector.getRawImportRecordsAsJSON(file, 0)
        self.assertEqual(len(results), 48)
        last_v = results[-1]['data'][-1][1]
        self.assertEqual(last_v, '8.829')
        well_v = results[20]['metadata_by_name']['Bio:well']
        self.assertEqual(well_v, 'C05')


########################################################################
# EXCEL IMPORT
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
        t = result['worksheets'][0][0]
        assert (t['headers'] == ['sample ID', 'line ID', 'replica', 'molecule1', 'molecule 2'])
        assert (t['values'] == [
            ['abcd1', 'line1', 1, 5.5, 6.5],
            ['abcd2', 'line1', 2, 4, 7.3],
            ['abcd3', 'line2', 1, 3.5, 8.8],
            ['abcd4', 'line2', 2, 2, 9.6]])
        result2 = import_xlsx_tables(
            "tst1.xlsx",
            worksheet_name="tst1.xlsx",
            column_search_text="sample",
        )
        t2 = result2['worksheets'][0][0]
        assert t2 == t
        result3 = import_xlsx_table("tst1.xlsx")  # note different function
        assert result3 == t
        result4 = import_xlsx_table(
            "tst1.xlsx", column_labels=["sample id", "molecule1", "MOLECULE 2"])
        assert (result4 == {
            'headers': ['sample ID', 'molecule1', 'molecule 2'],
            'values': [['abcd1', 5.5, 6.5],
                       ['abcd2', 4, 7.3],
                       ['abcd3', 3.5, 8.8],
                       ['abcd4', 2, 9.6]]})
        os.remove("tst1.xlsx")

    def test_error_handling(self):
        t3 = get_table()
        t3[7][1] = None
        make_simple(t3, "tst3.xlsx")
        result = import_xlsx_tables("tst3.xlsx")
        assert (result == {
            'worksheets': [
                [{
                    'headers': ['sample ID', 'line ID', 'replica', 'molecule1', 'molecule 2'],
                    'values': [
                        ['abcd1', 'line1', 1, 5.5, 6.5],
                        ['abcd2', 'line1', 2, 4, 7.3],
                        [None, 'line2', 1, 3.5, 8.8],
                        ['abcd4', 'line2', 2, 2, 9.6],
                    ]
                }, ],
            ],
        })
        # ask for missing worksheet
        try:
            import_xlsx_table("tst3.xlsx", worksheet_name="foo")
        except KeyError:
            pass
        else:
            assert False
        os.remove("tst3.xlsx")

    def test_non_numeric(self):
        get_table()


########################################################################
# OTHER
class UtilsTests(TestCase):
    def test_form_handling(self):
        form = {
            'int1': "1",
            'float1': "2.5",
            'int2': "1.5",
            'float2': "2",
            'int3': ["1", "2", "3"],
            'float3': ["1.5"],
            'int4': ["1.5", "2", "3"],
            'float4': "",
            'str1': "foo",
            'str2': ["foo", "bar"],
            'str3': "",
        }
        self.assertEqual(extract_integers_from_form(form, "int1"), 1)
        self.assertEqual(extract_floats_from_form(form, "int1"), 1.0)
        self.assertEqual(extract_integers_from_form(form, "int3", allow_list=True), [1, 2, 3, ])
        self.assertEqual(extract_floats_from_form(form, 'float3', allow_list=True), [1.5, ])
        self.assertEqual(extract_non_blank_string_from_form(form, 'str1'), "foo")
        self.assertEqual(
            extract_non_blank_string_from_form(form, 'str2', allow_list=True),
            ["foo", "bar"]
        )
        with self.assertRaises(TypeError):
            extract_integers_from_form(form, "int3")
        with self.assertRaises(ValueError):
            extract_integers_from_form(form, 'int2')
        with self.assertRaises(KeyError):
            extract_integers_from_form(form, 'int5')
        with self.assertRaises(ValueError):
            extract_integers_from_form(form, 'int4', allow_list=True)
        with self.assertRaises(ValueError):
            extract_non_blank_string_from_form(form, 'str3')
        self.assertIsNone(
            extract_non_blank_string_from_form(form, 'str3', return_none_if_missing=True)
        )
        self.assertIsNone(
            extract_floats_from_form(form, 'float4', return_none_if_missing=True)
        )

# _INITIAL_ICE_RETRY_DELAY = config['ice'].get('initial_retry_delay_seconds', 2)
# _MAX_ICE_RETRIES = config['ice'].get('max_retries', 19)
# _RETRY_NUMBER_FOR_ICE_NOTIFICATION = config['ice'].get('notify_after_retry', 3)


class TestCeleryRequest:
        def __init__(self, retries):
            self.retries = retries


class TestTask:
    """
    Defines a minimal subset of data members that approximates Celery's Task class for testing
    purposes. Duck typing! :-)
    """
    def __init__(self, retry_num, default_retry_delay, soft_time_limit=None, max_retries=None):
        self.request = TestCeleryRequest(retry_num)
        self.default_retry_delay = default_retry_delay
        self.soft_time_limit = soft_time_limit
        self.max_retries = max_retries


def decode_test_task(dict, require_soft_time_limit=True, require_max_retries=True):
    """
    A JSON decoder for TestTask
    :param dict: a dictionary containing the data for a TestTask
    :return: the TestTask
    """
    retries = int(dict['retries'])
    default_retry_delay = float(dict['default_retry_delay'])

    # optionally read soft time limit
    soft_time_limit = None
    key = 'soft_time_limit'
    if require_soft_time_limit or key in dict:
        soft_limit_str = dict[key]
        soft_time_limit = int(soft_limit_str)

    # optionally read max retries
    max_retries = None
    key = 'max_retries'
    if require_max_retries or key in dict:
        max_retries_str = dict['max_retries']
        max_retries = int(max_retries_str)

    return TestTask(retries, default_retry_delay, soft_time_limit, max_retries)
