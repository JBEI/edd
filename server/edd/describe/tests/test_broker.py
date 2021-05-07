from unittest.mock import patch

from .. import exceptions, reporting
from ..broker import DescribeErrorReport


def test_DescribeErrorReport_stash_errors_empty():
    dr = DescribeErrorReport()
    dr.stash_errors()
    assert dr.unstash_errors() == {"errors": [], "warnings": []}


def test_DescribeErrorReport_stash_errors_only_errors():
    dr = DescribeErrorReport()
    with reporting.tracker(dr.request):
        reporting.add_errors(
            dr.request,
            exceptions.ReportableDescribeError(summary="D^ng3r W1ll R0b1ns0n"),
        )
        dr.stash_errors()
    assert dr.unstash_errors() == {
        "errors": [
            {"category": "Uncategorized Error", "summary": "D^ng3r W1ll R0b1ns0n"}
        ],
        "warnings": [],
    }


def test_DescribeErrorReport_stash_errors_only_warnings():
    dr = DescribeErrorReport()
    with reporting.tracker(dr.request):
        reporting.warnings(
            dr.request,
            exceptions.ReportableDescribeWarning(
                summary="I feel a disturbance in the 4th"
            ),
        )
        dr.stash_errors()
    assert dr.unstash_errors() == {
        "errors": [],
        "warnings": [
            {
                "category": "Uncategorized Warning",
                "summary": "I feel a disturbance in the 4th",
            }
        ],
    }


def test_DescribeErrorReport_stash_massages_both():
    dr = DescribeErrorReport()
    with reporting.tracker(dr.request):
        reporting.add_errors(
            dr.request,
            exceptions.ReportableDescribeError(summary="Luke, I am your farther"),
        )
        reporting.warnings(
            dr.request,
            exceptions.ReportableDescribeWarning(
                summary="Feel the power of the Dark Mode"
            ),
        )
        dr.stash_errors()
    assert dr.unstash_errors() == {
        "errors": [
            {"category": "Uncategorized Error", "summary": "Luke, I am your farther"}
        ],
        "warnings": [
            {
                "category": "Uncategorized Warning",
                "summary": "Feel the power of the Dark Mode",
            }
        ],
    }


@patch.object(DescribeErrorReport, "_connect")
def test_DescribeErrorReport_stash_errors_simulate_exception(stub_method):
    # simulate an error connecting
    stub_method.side_effect = Exception("Oops, couldn't connect")
    dr = DescribeErrorReport()
    # trying to stash some stuff, but connection will fail
    # don't cause exception, just keep going with lost messages
    with reporting.tracker(dr.request):
        reporting.warnings(dr.request, exceptions.ReportableDescribeWarning())
        dr.stash_errors()
    # still have a connection error
    # verify nothing comes out
    assert dr.unstash_errors() == {}
