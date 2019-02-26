# coding: utf-8

import csv
import logging

from django.db import connection, transaction
from rest_framework_csv import renderers as csv_renderers
from uuid import uuid4


logger = logging.getLogger(__name__)


class ExportRenderer(csv_renderers.CSVRenderer):
    """
    Renders data serialized by edd.rest.serializers.ExportSerializer to CSV.
    """

    # dotted paths are for serializer fields! not model fields
    header = [
        'study.pk',
        'study.name',
        'measurement.assay.line.pk',
        'measurement.assay.line.name',
        'measurement.assay.line.description',
        'measurement.assay.protocol.name',
        'measurement.assay.pk',
        'measurement.assay.name',
        'measurement.type_name',
        'measurement.compartment',
        'measurement.unit_name',
        'y',
        'x',
    ]
    labels = {
        'study.pk': 'Study ID',
        'study.name': 'Study Name',
        'measurement.assay.line.pk': 'Line ID',
        'measurement.assay.line.name': 'Line Name',
        'measurement.assay.line.description': 'Line Description',
        'measurement.assay.protocol.name': 'Protocol',
        'measurement.assay.pk': 'Assay ID',
        'measurement.assay.name': 'Assay Name',
        'measurement.type_name': 'Measurement Type',
        'measurement.compartment': 'Compartment',
        'measurement.unit_name': 'Units',
        'y': 'Value',
        'x': 'Hours',
    }


class Echo(object):
    """Implements write() interface for use by csv.writer()."""

    def write(self, value):
        return value


class StreamingExportRenderer(object):
    """Not actually a DRF renderer, but close enough."""

    # these columns are based on the MODEL, not DRF serializers
    columns = [
        "study_id",
        "study__name",
        "measurement__assay__line_id",
        "measurement__assay__line__name",
        "measurement__assay__line__description",
        "measurement__assay__protocol__name",
        "measurement__assay_id",
        "measurement__assay__name",
        "measurement__measurement_type__type_name",
        "measurement__compartment",
        "measurement__y_units__unit_name",
        "y",
        "x",
    ]

    def stream_csv(self, queryset):
        # limit columns to only those needed to render CSV
        queryset = queryset.values(*self.columns)
        # create csv writer
        writer = csv.writer(Echo())
        # yield header using same labels as renderer.ExportRenderer
        er_header = ExportRenderer.header
        er_labels = ExportRenderer.labels
        yield writer.writerow([er_labels.get(x, x) for x in er_header])
        # prepare to declare cursor
        raw = str(queryset.query)
        name = uuid4().hex
        # create cursor and iterate results to yield csv rows
        with transaction.atomic(), connection.cursor() as cursor:
            cursor.execute(f"DECLARE temp_{name} CURSOR FOR {raw}")
            while True:
                cursor.execute(f"FETCH 100 FROM temp_{name}")
                rows = cursor.fetchall()
                if not rows:
                    break
                for row in rows:
                    # items in index 11 and 12 are arrays for Y and X
                    # replace with first values
                    row = list(row)
                    row[11] = row[11][0] if row[11] else ''
                    row[12] = row[12][0] if row[12] else ''
                    yield writer.writerow(row)
