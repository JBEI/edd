# coding: utf-8
from __future__ import division, unicode_literals

"""
Reformat CSV output from the program Skyline to consolidate MS peak areas for
individual peptides or proteins.
"""

import re

from collections import defaultdict, namedtuple
from decimal import Decimal
from itertools import ifilter, imap, product

from .util import RawImportRecord


Record = namedtuple('Record', ['sample', 'protein', 'peptide', 'area', ])
decimal_pattern = re.compile(r'^[-+]?(\d+(\.\d*)?|\.\d+)([eE][-+]?\d+)?')


class SkylineParser(object):
    __slots__ = []

    def export(self, input_data):
        """ This "export" takes a two-dimensional array of input data and creates a data structure
            used by the old proteomics skyline conversion tool. """
        samples = set()
        proteins = set()
        summed_areas = defaultdict(Decimal)
        n_records = 0
        errors = []
        for item in self._input_to_generator(input_data):
            n_records += 1
            samples.add(item.sample)
            proteins.add(item.protein)
            try:
                summed_areas[(item.sample, item.protein)] += Decimal(item.area)
            except ValueError:
                errors.append('Could not parse area "%s"' % (item.area, ))
        samples = sorted(samples)
        proteins = sorted(proteins)
        # 'short and wide'
        protein_list = list(proteins)
        export_table = [[''] + protein_list] + [
            [sample] + [summed_areas[(sample, protein)] for protein in protein_list]
            for sample in samples
        ]
        # 'tall and skinny'
        rows = [
            [sample, protein, summed_areas[(sample, protein)], ]
            for (sample, protein) in product(samples, proteins)
        ]
        return {
            'n_records': n_records,
            'n_proteins': len(proteins),
            'n_samples': len(samples),
            'by_protein': export_table,
            'rows': rows,
            'errors': errors,
        }

    def getRawImportRecordsAsJSON(self, spreadsheet):
        """ Create RawImportRecord objects from a spreadsheet input.

            :param spreadsheet: 2D spreadsheet data
        """
        rows = self.export(spreadsheet)['rows']
        return [
            RawImportRecord(
                kind='skyline',
                assay_name=item[0],
                # TODO: extract timestamp value from item[0]
                data=[[None, item[2]]],
                line_name=item[0],
                name=item[1],
            ).to_json()
            for item in rows
        ]

    def _input_to_generator(self, input_data):
        # the input_data could be a 2D array parsed from excel or CSV
        if isinstance(input_data, list):
            return (Record(*item) for item in ifilter(self._header_or_blank, input_data))
        # or input_data could be a file with lines of CSV text
        return (
            Record(*cols)
            for cols in ifilter(self._header_or_blank, imap(self._split_to_columns, input_data))
        )

    def _header_or_blank(self, row):
        return (len(row) == 4) and decimal_pattern.match(row[3])

    def _split_to_columns(self, line):
        return line.split(',')
