from uuid import uuid4

import pytest

from .. import exceptions, parsers, reporting
from ..signals import warnings_reported
from . import factory


def test_AmbrExcelParser_success():
    #
    path = ("ambr_export_test_data.xlsx",)
    parser = parsers.AmbrExcelParser(uuid4())
    with factory.load_test_file(*path) as file:
        parsed = parser.parse(file)

    assert len(parsed) == 24
