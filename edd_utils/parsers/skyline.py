# coding: utf-8
"""
Reformat CSV output from the program Skyline to consolidate MS peak areas for
individual peptides or proteins.
"""

import re

from collections import defaultdict, namedtuple
from decimal import Decimal
from itertools import product

from .util import RawImportRecord


Record = namedtuple('Record', ['sample', 'measurement', 'value', ])
decimal_pattern = re.compile(r'^[-+]?(\d+(\.\d*)?|\.\d+)([eE][-+]?\d+)?')


class SkylineParser(object):
    __slots__ = ['col_index']

    def __init__(self, col_index=Record(0, 1, 3), *args, **kwargs):
        """
        Optionally take indices for the columns containing sample name, measurement type, and
        value; defaults to assuming 0th, 1st, and 3rd columns (2nd is discarded peptide seq).
        """
        self.col_index = col_index

    def export(self, input_data):
        """
        This "export" takes a two-dimensional array of input data and creates a data structure
        used by the old proteomics skyline conversion tool.
        """
        samples = set()
        proteins = set()
        summed_areas = defaultdict(Decimal)
        n_records = 0
        errors = []
        for item in self._input_to_generator(input_data):
            n_records += 1
            samples.add(item.sample)
            proteins.add(item.measurement)
            try:
                summed_areas[(item.sample, item.measurement)] += Decimal(item.value)
            except ValueError:
                errors.append('Could not parse value "%s"' % (item.value, ))
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
            Record(sample, protein, summed_areas[(sample, protein)])
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
        """
        Create RawImportRecord objects from a spreadsheet input.

        :param spreadsheet: 2D spreadsheet data
        :return: list of RawImportRecord objects
        """
        rows = self.export(spreadsheet)['rows']
        return [
            RawImportRecord(
                kind='skyline',
                assay_name=item.sample,
                # TODO: extract timestamp value from item.sample?
                data=[[None, item.value]],
                line_name=item.sample,
                name=item.measurement,
            ).to_json()
            for item in rows
        ]

    def _input_to_generator(self, input_data):
        """
        Convert some input data into a generator of Record tuples.

        :param input_data: either a 2D list-of-lists (e.g. parsed from Excel), or a file-like
            object to be parsed as a CSV input.
        :return: a generator yielding Record tuples for Skyline records in the input.
        """
        # the input_data could be a 2D array parsed from excel or CSV
        if isinstance(input_data, list):
            return (
                self._row_to_record(item)
                for item in filter(self._real_values, input_data)
            )
        # or input_data could be a file with lines of CSV text
        return (
            self._row_to_record(cols)
            for cols in filter(self._real_values, map(self._split_to_columns, input_data))
        )

    def _real_values(self, row):
        """
        Function should evaluate to True if the row has a numeric value in the value column.
        """
        return bool(decimal_pattern.match(row[self.col_index.value]))

    def _row_to_record(self, row):
        """ Converting array of spreadsheet cells to a Record tuple. """
        return Record(
            row[self.col_index.sample],
            row[self.col_index.measurement],
            row[self.col_index.value],
        )

    def _split_to_columns(self, line):
        if isinstance(line, bytes):
            # the chunks returned from Django UploadFile could be bytes instead of str
            # convert it here
            line = line.decode('utf-8')
        return line.split(',')
