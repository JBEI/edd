import uuid

import pytest

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


def test_first_err_category_without_tracking():
    assert reporting.first_err_category("") is None


def test_first_err_category_single_error():
    key = uuid.uuid4()
    error = exceptions.EDDImportError()
    with reporting.tracker(key):
        reporting.add_errors(key, error)
        assert reporting.first_err_category(key) == str(error.category)


def test_first_err_category_multiple_errors():
    key = uuid.uuid4()
    error1 = exceptions.DuplicateLineError()
    error2 = exceptions.EDDImportError()
    error3 = exceptions.EDDImportError()
    with reporting.tracker(key):
        reporting.add_errors(key, error1)
        reporting.add_errors(key, error2)
        reporting.add_errors(key, error3)
        assert reporting.first_err_category(key) == str(error1.category)
