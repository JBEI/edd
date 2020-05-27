import uuid
import warnings
from unittest.mock import patch

import pytest
from django.test import override_settings

from .. import exceptions, reporting


def test_add_errors_with_string():
    key = str(uuid.uuid4())
    error = exceptions.EDDImportError()
    with reporting.tracker(key):
        reporting.add_errors(key, error)
        assert reporting.error_count(key, exceptions.EDDImportError) == 1


def test_add_errors_with_uuid():
    key = uuid.uuid4()
    error = exceptions.EDDImportError()
    with reporting.tracker(key):
        reporting.add_errors(key, error)
        assert reporting.error_count(key, exceptions.EDDImportError) == 1


def test_add_errors_without_tracking():
    error = exceptions.EDDImportError()
    with pytest.raises(exceptions.EDDImportError):
        reporting.add_errors("", error)


def test_warnings_with_string():
    key = str(uuid.uuid4())
    warning = exceptions.EDDImportWarning()
    with reporting.tracker(key):
        reporting.warnings(key, warning)
        assert reporting.warning_count(key, exceptions.EDDImportWarning) == 1


def test_warnings_with_uuid():
    key = uuid.uuid4()
    warning = exceptions.EDDImportWarning()
    with reporting.tracker(key):
        reporting.warnings(key, warning)
        assert reporting.warning_count(key, exceptions.EDDImportWarning) == 1


def test_warnings_without_tracking():
    warning = exceptions.EDDImportWarning()
    # shouting into the void ...
    reporting.warnings("", warning)


def test_raise_errors_single_error():
    key = uuid.uuid4()
    error = exceptions.EDDImportError()
    with reporting.tracker(key):
        with pytest.raises(exceptions.EDDImportError):
            reporting.raise_errors(key, error)
        assert reporting.error_count(key, exceptions.EDDImportError) == 1


def test_raise_errors_multiple_errors():
    key = uuid.uuid4()
    error1 = exceptions.EDDImportError()
    error2 = exceptions.EDDImportError()
    error3 = exceptions.DuplicateLineError()
    with reporting.tracker(key):
        reporting.add_errors(key, error1)
        reporting.add_errors(key, error2)
        with pytest.raises(exceptions.EDDImportError):
            reporting.raise_errors(key, error3)
        # same types get merged
        assert reporting.error_count(key) == 2
        assert reporting.error_count(key, exceptions.DuplicateLineError) == 1


def test_json_preserialize():
    key = uuid.uuid4()
    error1 = exceptions.EDDImportError()
    error2 = exceptions.EDDImportError()
    error3 = exceptions.DuplicateLineError()
    warning = exceptions.EDDImportWarning()
    with reporting.tracker(key):
        reporting.add_errors(key, error1)
        reporting.add_errors(key, error2)
        reporting.add_errors(key, error3)
        reporting.warnings(key, warning)
        summary = reporting.build_messages_summary(key)
        assert summary == {
            "errors": [
                {"category": "Uncategorized Error", "summary": ""},
                {
                    "category": "Cannot resolve line names",
                    "summary": "Study has duplicate line names",
                },
            ],
            "warnings": [{"category": "Uncategorized Warning", "summary": ""}],
        }


def test_error_count_untracked():
    key = str(uuid.uuid4())
    with pytest.raises(exceptions.LoadError):
        reporting.error_count(key)


def test_warning_count_untracked():
    key = str(uuid.uuid4())
    with pytest.raises(exceptions.LoadError):
        reporting.warning_count(key)


def test_log_reported_errors_simulated_error():
    key = str(uuid.uuid4())
    # simulate an error inside signal handler
    with patch("edd.load.reporting.MessageAggregator") as ma, reporting.tracker(key):
        ma.return_value.add_errors.side_effect = AttributeError
        reporting.log_reported_errors(ma, key, exceptions.EDDImportWarning())
    # exception was caught


def test_log_reported_warnings_simulated_error():
    key = str(uuid.uuid4())
    # simulate an error inside signal handler
    with patch("edd.load.reporting.MessageAggregator") as ma, reporting.tracker(key):
        ma.return_value.add_warnings.side_effect = AttributeError
        reporting.log_reported_warnings(ma, key, exceptions.EDDImportWarning())
    # exception was caught


def test_MessagingMixin_no_details():
    mm = exceptions.core.MessagingMixin("category", subcategory="sub")
    assert str(mm) == """MessagingMixin(category="category", subcategory="sub")"""


def test_MessagingMixin_string_details():
    mm = exceptions.core.MessagingMixin("category", details="detail!")
    assert str(mm) == """MessagingMixin(category="category", details="detail!")"""


def test_MessagingMixin_long_string_details():
    long_string = "foo" * 40
    mm = exceptions.core.MessagingMixin("category", details=long_string)
    truncated = "foofoofoofoofoofoofoofoofoofoo…"
    assert str(mm) == f"""MessagingMixin(category="category", details="{truncated}")"""


def test_MessagingMixin_iterable_details():
    details = ["foo"] * 3
    mm = exceptions.core.MessagingMixin("category", details=details)
    assert str(mm) == """MessagingMixin(category="category", details="foo, foo, foo")"""


@override_settings(EDD_IMPORT_ERR_REPORTING_LIMIT=1)
def test_MessagingMixin_iterable_details_past_limit():
    with warnings.catch_warnings(record=True) as w:
        details = ["foo"] * 3
        exceptions.core.MessagingMixin("category", details=details)
        assert len(w) == 1
        assert issubclass(w[0].category, exceptions.ReportingLimitWarning)


def test_MessagingMixin_int_details():
    mm = exceptions.core.MessagingMixin("category", details=13)
    assert str(mm) == """MessagingMixin(category="category", details="13")"""


def test_MessagingMixin_float_details():
    mm = exceptions.core.MessagingMixin("category", details=3.14159)
    assert str(mm) == """MessagingMixin(category="category", details="3.14159")"""


def test_MessagingMixin_unsupported_details():
    with pytest.raises(TypeError):
        exceptions.core.MessagingMixin("category", details=object())


def test_MessagingMixin_equality_and_hash():
    a = exceptions.core.MessagingMixin("category")
    b = exceptions.core.MessagingMixin("category")
    assert id(a) != id(b)
    assert hash(a) == hash(b)
    assert a == b


def test_MessagingMixin_merging():
    a = exceptions.core.MessagingMixin("category", details=[*"abcdef"])
    b = exceptions.core.MessagingMixin("category", details=[*"defghi"])
    c = exceptions.core.MessagingMixin("category", details=[*"abcdefghi"])
    a.merge(b)
    assert a == c


@override_settings(EDD_IMPORT_ERR_REPORTING_LIMIT=3)
def test_MessagingMixin_json_report_limit():
    # verify warning emitted when 9 detail items sent, and limit is 3
    with pytest.warns(exceptions.ReportingLimitWarning):
        c = exceptions.core.MessagingMixin("category", details=[*"abcdefghi"])
    result = c.to_json()
    assert result["detail"] == "a, b, c, ...(+6 more)"


@override_settings(EDD_IMPORT_ERR_REPORTING_LIMIT=0)
def test_MessagingMixin_json_no_report_limit():
    c = exceptions.core.MessagingMixin("category", details=[*"abcdefghi"])
    result = c.to_json()
    assert result["detail"] == "a, b, c, d, e, f, g, h, i"
