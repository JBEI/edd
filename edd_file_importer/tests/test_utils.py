# coding: utf-8

import json
import math

from . import factory

CONTEXT_PATH = 'generic_import/FBA-OD-generic.xlsx.cache.context.json'
SERIES_PATH = 'generic_import/FBA-OD-generic.xlsx.cache.series.json'


class ImportTestsMixin(object):
    def _slice_series_pages(self, series_path, page_count, page_size):
        """ Read the aggregated series data from file and if configured to test multiple pages,
            break it up into chunks for insertion into the simulated cache. Clients of this
            method must override EDD_IMPORT_PAGE_SIZE to get predictable results.
        """

        with factory.load_test_file(series_path, 'rt') as series_file:
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
            end_index = min((i+1) * page_size, item_count)
            page_series = series[i * page_size:end_index]
            pages.append(json.dumps(page_series))
            self.assertTrue(page_series)
        self.assertEquals(len(pages), page_count)  # verify that data file content matches

        return pages
