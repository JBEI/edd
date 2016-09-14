# coding: utf-8
from __future__ import division, unicode_literals

"""
Reformat CSV output from the program Skyline to consolidate MS peak areas for
individual peptides or proteins.
"""

from collections import defaultdict, namedtuple
from decimal import Decimal
from itertools import product


Record = namedtuple('Record', ['sample', 'protein', 'peptide', 'area', ])


class SkylineParser(object):
    __slots__ = []

    def export(self, input_data):
        samples = set()
        proteins = set()
        summed_areas = defaultdict(Decimal)
        n_records = 0
        errors = []
        for item in filter(bool, map(self._parse_line, input_data)):
            n_records += 1
            samples.add(item.sample)
            proteins.add(item.protein)
            try:
                summed_areas[(item.sample, item.protein)] += Decimal(item.area)
            except ValueError:
                errors.append('Could not parse area "%s"' % (item.area, ))
        samples = sorted(samples)
        proteins = sorted(proteins)
        export_table = [
            [sample] + [summed_areas[(sample, protein)] for protein in proteins]
            for sample in samples
        ]
        # old code uses this in a view, but it does not go to final import
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

    def _parse_line(self, line):
        line = line.strip()
        if line:
            return Record(*line.split(','))
        return None
