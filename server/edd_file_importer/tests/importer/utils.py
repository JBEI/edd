import json
import math
import os
from typing import Iterable, List, Tuple
from uuid import UUID

from django.conf import settings

import main.models as edd_models
from edd.load.broker import ImportBroker

from ...parsers import FileParseResult
from .. import factory
from ..test_utils import load_parse_record


def load_fba_od_parse_result() -> FileParseResult:
    """
    Read expected file parse results from file into a FileParseResult object. Note we could also
    just parse the Excel file, but this provides better test isolation at very low cost.
    """
    test_file = os.path.join("generic_import", "FBA-OD-generic.xlsx.parse-result.json")
    with factory.load_test_file(test_file) as json_file:
        series = json.loads(json_file.read(), object_hook=load_parse_record)
    return FileParseResult(series, "row", True, True)


def add_assay_time_metadata(
    assay_time_metatype: edd_models.MetadataType, omit: str = ""
):
    """
    Adds assay time metadata to assays in the study.  It's expected that tests are using the
    "skyline_imports.json" fixture.
    :param assay_time_metatype:
    :param omit:
    :return:
    """
    if omit != "arcA":
        arcA = edd_models.Assay.objects.get(study_id=1000, name="arcA")
        arcA.metadata_add(assay_time_metatype, 4)
        arcA.save()

    if omit != "BW1":
        bw1 = edd_models.Assay.objects.get(study_id=1000, name="BW1")
        bw1.metadata_add(assay_time_metatype, 5)
        bw1.save()


class CacheEntries:
    """
    A support class that captures expected import cache entries consistently across unit tests
    and provides support for loading the content from file and slicing it up into pages based on
    the EDD_IMPORT_PAGE_SIZE setting
    """

    def __init__(self, context_path: str, series_path: str, page_count: int):
        self._context_path: str = context_path
        self._series_path: str = series_path
        self._page_count: int = page_count

        self._import_uuid: str = None  # Truthy after the file is read
        self._context_str: str = None
        self._series_pages: List[str] = []

    def create_cache_entries(self, broker: ImportBroker):
        """
        Configures an ImportBroker that produces the same cache entries as the actual
        ImportBroker, but from file.  Note that this method must be called from within an
        @override_settings block so that it's not sensitive to local changes to
        EDD_IMPORT_PAGE_SIZE.
        :returns a tuple of (UUID, context_str, iteratable[str] of series pages)
        """
        self._load_cache_files()
        broker.set_context(self._import_uuid, self._context_str)
        for page in self._series_pages:
            broker.add_page(self._import_uuid, page)

    def _slice_series_pages(self, series_path, page_count, page_size):
        """
        Read the aggregated series data from file and if configured to test multiple pages,
        break it up into chunks for insertion into the simulated cache. Clients of this
        method must override EDD_IMPORT_PAGE_SIZE to get predictable results.
        """

        with factory.load_test_file(series_path, "rt") as series_file:
            series_str = series_file.read()

        # if import can be completed in a single page, just return the series data directly from
        # file
        if page_count == 1:
            return [series_str]

        # since we have to page the data, parse the json and break it up into pages of the
        # requested size
        series = json.loads(series_str)
        item_count = len(series)

        pages = []
        for i in range(0, int(math.ceil(item_count / page_size))):
            end_index = min((i + 1) * page_size, item_count)
            page_series = series[i * page_size : end_index]
            pages.append(json.dumps(page_series))
        return pages

    @property
    def import_uuid(self) -> str:
        if not self._import_uuid:
            self._load_cache_files()
        return self._import_uuid

    @property
    def context_str(self) -> str:
        if not self._import_uuid:
            self._load_cache_files()
        return self._context_str

    @property
    def series_pages(self) -> Iterable[str]:
        if not self._import_uuid:
            self._load_cache_files()
        return self._series_pages

    @property
    def page_count(self):
        return self._page_count

    def _load_cache_files(self):
        """
        Loads data from file
        :return: a tuple of (UUID, context_str, series_pages (an iterable of strings))
        """
        # return early if files are already parsed
        if self._import_uuid:
            return

        # load context and series cache data from file
        self._import_uuid, self._context_str = self._load_context_file()

        # optionally load the series pages -- in some PATCH cases tests won't modify existing
        # data content, only the context, e.g. when overriding an overwrite warning
        self._series_pages = None
        if self._series_path:
            self._series_pages = self._slice_series_pages(
                self._series_path, self._page_count, settings.EDD_IMPORT_PAGE_SIZE
            )

    def _load_context_file(self) -> Tuple[UUID, str]:
        with factory.load_test_file(self._context_path, "rt") as context_file:
            # strip off trailing whitespace added by pre-commit
            context_str = context_file.read().strip()
            import_uuid = UUID(json.loads(context_str)["importId"])
        return import_uuid, context_str
