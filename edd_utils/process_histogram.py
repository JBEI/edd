#!/usr/bin/env python
# coding: utf-8

"""
Example file for processing histograms out of Jake Beal's analysis pipeline.

`parse_name` would be different for every run, until a standard naming scheme is developed.
`process_file` should be adapted to run in a pipeline instead of as a shell session.
Example code of what to put in a shell session is in a large comment block at the end of the file.
"""

import re
import sys
import pprint

from collections import defaultdict, namedtuple
from decimal import Decimal

Enum = namedtuple('Enum', ['index', 'value', ])
Info = namedtuple('Info', ['media', 'time', 'plate', 'well', 'promoter', ])
Row = namedtuple('Row', ['info', 'values', 'count', 'mean', 'variance', ])

# builds list of bins from 0.15, 0.25, …, 7.85, 7.95
halfstep = Decimal('0.05')
bins = [(Decimal(v) / 10) - halfstep for v in range(2, 81)]
name_pattern = re.compile(r'(\w+)_(\d+)h_MP(\d)_(\w+)\s+(\w+)')


def parse_name(name):
    # CSM_4h_MP1_A02 ADH1 == "{Media}_{Time}_{Plate}_{Well} {Promoter}"
    match = name_pattern.match(name)
    return Info(**{
        'media': match.group(1),
        'time': match.group(2),
        'plate': match.group(3),
        'well': match.group(4),
        'promoter': match.group(5),
    })


def process_file(filename):
    print('Reading %s …' % filename)
    with open(filename, 'r') as f:
        f.readline()
        f.readline()
        for line in f:
            # simple progress indicator
            sys.stdout.write('.')
            sys.stdout.flush()
            # get all the cells in the row
            row = line.strip().split(',')
            # name is the first cell, parse into Info
            info = parse_name(row[0])
            # values are the remaining cells; last cell is empty
            values = [int(v) for v in row[1:-1]]
            # build an enumeration of values
            evalues = [Enum(*e) for e in enumerate(values)]
            # sum of all cells is population count
            count = sum(values)
            if count:
                # cell value multiplied by bin value across all bins, averaged
                mean = sum([bins[v.index] * v.value for v in evalues]) / count
                # cell value multiplied by square of difference from bin to mean, averaged
                variance = sum([((bins[v.index] - mean) ** 2) * v.value for v in evalues]) / count
            else:
                mean = Decimal(0.)
                variance = Decimal(0.)
            # quantize to limit precision based on bin size
            mean = mean.quantize(halfstep)
            variance = variance.quantize(halfstep)
            # yield processed data
            yield Row(info, values, count, mean, variance)
        print('')


def main(argv):
    lines = defaultdict(list)
    for filename in argv:
        for row in process_file(filename):
            line_id = '%(media)s_%(promoter)s_%(plate)s%(well)s' % row.info._asdict()
            lines[line_id].append(row)
    for line_id in sorted(lines.keys()):
        rows = lines[line_id]
        print(line_id)
        pprint.pprint(rows)

# Approximate steps to parse histograms into study
# -----------------------------------------------------------------------------
# study = Study.objects.get(…)
# lines = defaultdict(list)
# media_type = MetadataType.objects.get(type_name='Media')
# promoter_type = MetadataType.objects.get(type_name='Promoter')
# plate_type = MetadataType.objects.get(type_name='Plate ID')
# well_type = MetadataType.objects.get(type_name='Well Location')
# protocol = Protocol.objects.get(…)
# gfp = MeasurementType.objects.get(…)
# mefl = MeasurementUnit.objects.get(…)
# hist = MeasurementUnit.objects.get(…)
# hours = MeasurementUnit.objects.get(…)
# for row in process_file(…):
#     line_id = '%(media)s_%(promoter)s_%(plate)s%(well)s' % row.info._asdict()
#     lines[line_id].append(row)
# for line_id in sorted(lines.keys()):
#     rows = lines[line_id]
#     info = rows[0].info
#     line, created = study.line_set.update_or_create(name=line_id)
#     line.metadata_add(media_type, info.media)
#     line.metadata_add(promoter_type, info.promoter)
#     line.metadata_add(plate_type, info.plate)
#     line.metadata_add(well_type, info.well)
#     line.save()
#     assay, created = line.assay_set.update_or_create(
#         protocol=protocol,
#         name='%(plate)s%(well)s' % row.info._asdict(),
#     )
#     scalar, created = assay.measurement_set.update_or_create(
#         measurement_type=gfp,
#         measurement_format='0',
#         compartment='1',
#         x_units=hours,
#         y_units=mefl,
#     )
#     sigma, created = assay.measurement_set.update_or_create(
#         measurement_type=gfp,
#         measurement_format='3',
#         compartment='1',
#         x_units=hours,
#         y_units=mefl,
#     )
#     histogram, created = assay.measurement_set.update_or_create(
#         measurement_type=gfp,
#         measurement_format='2',
#         compartment='1',
#         x_units=hours,
#         y_units=hist,
#     )
#     for row in rows:
#         scalar.measurementvalue_set.update_or_create(
#             x=[Decimal(row.info.time)],
#             y=[row.mean],
#         )
#         sigma.measurementvalue_set.update_or_create(
#             x=[Decimal(row.info.time)],
#             y=[row.mean, row.variance, row.count, ],
#         )
#         histogram.measurementvalue_set.update_or_create(
#             x=[Decimal(row.info.time)],
#             y=row.values,
#         )


if __name__ == '__main__':
    main(sys.argv[1:])
