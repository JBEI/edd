import warnings

import pytest
from django.test import override_settings

from .. import exceptions


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
