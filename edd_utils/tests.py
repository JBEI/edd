# coding: utf-8
from __future__ import division, unicode_literals

import arrow
import json
import logging
import os.path

from cStringIO import StringIO
from edd_utils.parsers.excel import (
    export_to_xlsx, import_xlsx_table, import_xlsx_tables,
)
from edd_utils.form_utils import (
    extract_floats_from_form, extract_integers_from_form, extract_non_blank_string_from_form,
)
from edd_utils.parsers import gc_ms
from edd_utils.parsers import skyline
from edd_utils.parsers import biolector
from django.test import TestCase
from edd_utils.celery_utils import (
    compute_exp_retry_delay, send_retry_warning, time_until_retry,
)

test_dir = os.path.join(os.path.dirname(__file__), "fixtures", "misc_data")
logger = logging.getLogger(__name__)


########################################################################
# GC-MS
class GCMSTests(TestCase):
    def test_1(self):
        test_file = os.path.join(test_dir, "gc_ms_1.txt")
        l = gc_ms.run([test_file], out=StringIO(), err=StringIO())
        assert len(l.samples) == 102
        # l.find_consensus_peaks(show_plot=True)
        err = StringIO()
        out = StringIO()
        l.show_peak_areas(out=out, err=err)
        assert ("0059.D          562         None         None" in out.getvalue())
        assert ("0062.D       104049      1192526        35926" in out.getvalue())
        assert ("WARNING: 2 peaks near 8.092 for sample 0062.D" in err.getvalue())
        assert (err.getvalue().count("WARNING") == 44)
        err = StringIO()
        out = StringIO()
        l.show_peak_areas_csv(out=out, err=err)
        assert ("0059.D,562,None,None" in out.getvalue())
        assert ("0062.D,104049,1192526,35926" in out.getvalue())

    def test_2(self):
        # a slightly different format
        #
        test_file = os.path.join(test_dir, "gc_ms_2.txt")
        l = gc_ms.run([test_file], out=StringIO(), err=StringIO())
        assert len(l.samples) == 5, len(l.samples)
        # print l.find_consensus_peaks()
        err = StringIO()
        out = StringIO()
        l.show_peak_areas(out=out, err=err)
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
            l = gc_ms.run([test_file], out=StringIO(), err=StringIO())
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
            assert(['4', 'A', 22] in result['rows'])


########################################################################
# BIOLECTOR IMPORT
class BiolectorTests(TestCase):
    def test_simple(self):
        filename = "edd_utils/parsers/biolector/biolector_test_file.xml"
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
        # now screw with the format
        t2 = get_table()
        t2[7][0] = "Extra"
        make_simple(t2, "tst2.xlsx")
        try:
            result = import_xlsx_tables("tst2.xlsx")
        except ValueError:
            pass
        else:
            assert False
        os.remove("tst2.xlsx")
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
                    ]
                }, ],
            ],
        })
        try:
            import_xlsx_table("tst3.xlsx", followed_by_blank_row=True)
        except ValueError:
            pass
        else:
            assert False
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
        assert(extract_integers_from_form(form, "int1") == 1)
        assert(extract_floats_from_form(form, "int1") == 1.0)
        assert(extract_integers_from_form(form, "int3", allow_list=True) == [1, 2, 3, ])
        assert(extract_floats_from_form(form, 'float3', allow_list=True) == [1.5, ])
        assert(extract_non_blank_string_from_form(form, 'str1') == "foo")
        assert(extract_non_blank_string_from_form(form, 'str2', allow_list=True) == ["foo", "bar"])
        try:
            extract_integers_from_form(form, "int3")
        except TypeError:
            pass
        else:
            assert False
        try:
            extract_integers_from_form(form, 'int2')
        except ValueError:
            pass
        else:
            assert False
        try:
            extract_integers_from_form(form, 'int5')
        except KeyError:
            pass
        else:
            assert False
        try:
            extract_integers_from_form(form, 'int4', allow_list=True)
        except ValueError:
            pass
        else:
            assert False
        try:
            extract_non_blank_string_from_form(form, 'str3')
        except ValueError:
            pass
        else:
            assert False
        assert (extract_non_blank_string_from_form(form, 'str3',
                return_none_if_missing=True) is None)
        assert (extract_floats_from_form(form, 'float4',
                return_none_if_missing=True) is None)

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


class CeleryUtilsTests(TestCase):
    """
    Defines unit tests for a subset of the methods in the celery.utils module. More testing is
    clearly possible there, but the initial implementation covers the low-hanging fruit.
    """

    _BASE_DIR = os.path.dirname(__file__)
    _TEST_DATA_FILE = os.path.join(_BASE_DIR, "fixtures", "misc_data", "celery_test_data.json")

    def test_compute_exp_retry_delay(self):
        """
        Reads in test data and expected results from the reference file and compares
        them to computed results.
        """

        with open(self._TEST_DATA_FILE) as test_fixture:
            test_data = json.load(test_fixture)['compute_exp_retry_delay']

            for test_case_name in test_data:
                # extract useful data from the JSON dictionary
                test_case = test_data[test_case_name]
                task = decode_test_task(test_case['task'], require_max_retries=False)
                exp_result = test_case['expected_result']

                # assert that computed results match the reference results
                try:
                    result = compute_exp_retry_delay(task)
                    if 'ValueError' == exp_result:
                        self.fail("Expected ValueError but got a %s" % result)
                    self.assertEquals(int(exp_result), result)
                except ValueError:
                    if "ValueError" != exp_result:
                        self.fail("Expected a result (%d), but got a ValueError"
                                  % float(exp_result))
                else:
                    if "ValueError" == exp_result:
                        self.fail("Expected a ValueError but got (%d)" % float(exp_result))

    def test_time_until_retry_num(self):
        """
        Reads in test data and expected results from the reference file and compares
        them to computed results.
        """

        with open(self._TEST_DATA_FILE) as test_fixture:
            test_data = json.load(test_fixture)['time_until_retry']

            for test_case_name in test_data:
                # extract useful data from the JSON dictionary
                test_case = test_data[test_case_name]
                exp_result = test_case['expected_result']
                start_retry_num = int(test_case['start_retry_num'])
                goal_retry_num = int(test_case['goal_retry_num'])

                # get estimated execution time, or assume it's zero if not provided
                est_execution_time_key = 'est_execution_time'
                est_execution_time = 0
                if est_execution_time_key in test_case:
                    est_execution_time = float(test_case[est_execution_time_key])
                default_retry_delay = int(test_case['default_retry_delay'])

                # assert that computed results match the reference results
                try:
                    result = time_until_retry(start_retry_num, goal_retry_num, est_execution_time,
                                              default_retry_delay)
                    if 'ValueError' == exp_result:
                        self.fail("Expected ValueError but got a result (%f)" % result)
                    self.assertEquals(float(exp_result), result)
                except ValueError:
                    self.assertEquals("ValueError", exp_result)

    def test_send_retry_warning_before_failure(self):
        """
        Reads in test data and expected results from the reference file and compares them to
        computed results
        """
        with open(self._TEST_DATA_FILE) as test_fixture:
            test_data = json.load(test_fixture)['send_retry_warning_before_failure']

            for test_case_name in test_data:
                test_case = test_data[test_case_name]
                task = decode_test_task(test_case['task'], require_soft_time_limit=False)
                est_task_execution_time = float(test_case['est_execution_time'])
                exp_result = test_case['expected_result'] is True
                notify_on_retry_num = test_case['notify_on_retry_num']

                result = send_retry_warning(task, est_task_execution_time, notify_on_retry_num,
                                            logger)
                self.assertEquals(exp_result, result,
                                  'Unexpected result in testcase %s: %s vs %s' %
                                  (test_case_name, result, exp_result))
