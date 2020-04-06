from unittest.mock import patch

import pytest
from django.test import override_settings

from .. import exceptions
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
