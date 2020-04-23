from unittest.mock import MagicMock, patch

import pytest
from django.test import override_settings

from .. import exceptions, reporting
from ..broker import ImportBroker, LoadRequest


def test_ImportBroker_check_bounds_on_empty():
    ib = ImportBroker()
    # should have no errors below
    ib.check_bounds(import_id="1234", page=[], expected_count=0)


@override_settings(EDD_IMPORT_PAGE_SIZE=1)
def test_ImportBroker_check_bounds_page_too_big():
    ib = ImportBroker()
    with pytest.raises(exceptions.ImportBoundsError):
        ib.check_bounds(import_id="1234", page=["foo", "bar"], expected_count=0)


def test_ImportBroker_check_bounds_too_many_pages():
    ib = ImportBroker()
    with pytest.raises(exceptions.ImportBoundsError):
        ib.check_bounds(import_id="1234", page=[], expected_count=9000)


def test_ImportBroker_check_bounds_mismatch():
    ib = ImportBroker()
    try:
        # add some stuff
        ib.add_page(import_id="1234", page="some random garbage")
        with pytest.raises(exceptions.ImportBoundsError):
            ib.check_bounds(import_id="1234", page=[], expected_count=0)
    finally:
        # cleanup
        ib.clear_pages(import_id="1234")


def test_LoadRecord_initial_state():
    lr = LoadRequest()
    assert lr.request
    assert lr.status == LoadRequest.Status.CREATED


def test_LoadRecord_fetch_bad_id():
    with pytest.raises(exceptions.InvalidLoadRequestError):
        # made-up ID should not exist
        LoadRequest.fetch("1234")


@patch.object(LoadRequest, "_connect")
def test_LoadRecord_fetch_comms_error(stub_method):
    # simulate an error connecting
    stub_method.side_effect = Exception("Oops, couldn't connect")
    with pytest.raises(exceptions.CommunicationError):
        LoadRequest.fetch("1234")


@patch.object(LoadRequest, "_connect")
def test_LoadRecord_store_comms_error(stub_method):
    lr = LoadRequest()
    # simulate an error connecting
    stub_method.side_effect = Exception("Oops, couldn't connect")
    with pytest.raises(exceptions.CommunicationError):
        lr.store()


@patch.object(LoadRequest, "_connect")
def test_LoadRecord_retire_comms_error(stub_method):
    lr = LoadRequest()
    # simulate an error connecting
    stub_method.side_effect = Exception("Oops, couldn't connect")
    with pytest.raises(exceptions.CommunicationError):
        lr.retire()


@patch.object(LoadRequest, "_connect")
def test_LoadRecord_transition_comms_error(stub_method):
    lr = LoadRequest()
    # simulate an error connecting
    stub_method.side_effect = Exception("Oops, couldn't connect")
    # default does not raise exception
    result = lr.transition(LoadRequest.Status.ABORTED)
    assert result is False


@patch.object(LoadRequest, "_connect")
def test_LoadRecord_transition_comms_error_with_raise(stub_method):
    lr = LoadRequest()
    # simulate an error connecting
    stub_method.side_effect = Exception("Oops, couldn't connect")
    with pytest.raises(exceptions.IllegalTransitionError):
        lr.transition(LoadRequest.Status.ABORTED, raise_errors=True)


def test_LoadRecord_load_and_store_simple():
    lr = LoadRequest()
    lr.study_uuid = "abcdef"
    # store and fetch give objects that are equal, but not identical
    try:
        lr.store()
        reloaded = LoadRequest.fetch(lr.request)
        assert lr is not reloaded
        assert lr == reloaded
    finally:
        # cleanup
        lr.retire()


def test_LoadRecord_load_and_store_options():
    lr = LoadRequest()
    lr.study_uuid = "abcdef"
    lr.options = (
        LoadRequest.Options.allow_duplication | LoadRequest.Options.email_when_complete
    )
    # store and fetch give objects that are equal, but not identical
    try:
        lr.store()
        reloaded = LoadRequest.fetch(lr.request)
        assert lr is not reloaded
        assert lr == reloaded
    finally:
        # cleanup
        lr.retire()


def test_LoadRecord_options_from_rest():
    # fake REST payload
    payload = {
        "allow_overwrite": "1",
        "email_when_complete": "1",
        "protocol": "abcd-ef-012345-6789",
    }
    # fake study object
    study = MagicMock()
    study.uuid = "9876-54-3210ab-cdef"
    try:
        lr = LoadRequest.from_rest(study, payload)
        assert not lr.allow_duplication
        assert lr.allow_overwrite
        assert lr.email_when_complete
    finally:
        # cleanup
        lr.retire()


def test_LoadRecord_update_from_rest():
    # fake REST payload
    payload = {
        "compartment": "IC",
        "protocol": "abcd-ef-012345-6789",
        "x_units": "minutes",
        "y_units": "whuffie",
    }
    lr = LoadRequest()
    try:
        lr.update(payload)
        assert lr.compartment == "IC"
        assert lr.protocol_uuid == "abcd-ef-012345-6789"
        assert lr.x_units_name == "minutes"
        assert lr.y_units_name == "whuffie"
    finally:
        # cleanup
        lr.retire()


def test_LoadRecord_open_error():
    lr = LoadRequest()
    # calling open without a path triggers error
    with pytest.raises(exceptions.CommunicationError):
        lr.open()


def test_LoadRecord_stash_errors_empty():
    lr = LoadRequest()
    lr.stash_errors()
    assert lr.unstash_errors() == {"errors": [], "warnings": []}


def test_LoadRecord_stash_errors_only_errors():
    lr = LoadRequest()
    with reporting.tracker(lr.request):
        reporting.add_errors(lr.request, exceptions.DuplicateColumnError())
        lr.stash_errors()
    assert lr.unstash_errors() == {
        "errors": [
            {"category": "Invalid file", "summary": "Duplicate column headers"},
        ],
        "warnings": [],
    }


def test_LoadRecord_stash_errors_only_warnings():
    lr = LoadRequest()
    with reporting.tracker(lr.request):
        reporting.warnings(lr.request, exceptions.IgnoredColumnWarning())
        lr.stash_errors()
    assert lr.unstash_errors() == {
        "errors": [],
        "warnings": [{"category": "Ignored data", "summary": "Ignored columns"}],
    }


def test_LoadRecord_stash_errors_both():
    lr = LoadRequest()
    with reporting.tracker(lr.request):
        reporting.add_errors(lr.request, exceptions.DuplicateColumnError())
        reporting.warnings(lr.request, exceptions.IgnoredColumnWarning())
        lr.stash_errors()
    assert lr.unstash_errors() == {
        "errors": [
            {"category": "Invalid file", "summary": "Duplicate column headers"},
        ],
        "warnings": [{"category": "Ignored data", "summary": "Ignored columns"}],
    }


@patch.object(LoadRequest, "_connect")
def test_LoadRecord_stash_errors_simulate_exception(stub_method):
    # simulate an error connecting
    stub_method.side_effect = Exception("Oops, couldn't connect")
    lr = LoadRequest()
    # trying to stash some stuff, but connection will fail
    # don't cause exception, just keep going with lost messages
    with reporting.tracker(lr.request):
        reporting.warnings(lr.request, exceptions.IgnoredColumnWarning())
        lr.stash_errors()
    # still have a connection error
    # verify nothing comes out
    assert lr.unstash_errors() == {}
