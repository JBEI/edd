# coding: utf-8

import csv
import logging

from django.db import transaction
from rest_framework_csv import renderers as csv_renderers

logger = logging.getLogger(__name__)


class ExportRenderer(csv_renderers.CSVRenderer):
    """
    Renders data serialized by edd.rest.serializers.ExportSerializer to CSV.
    """

    # dotted paths are for serializer fields! not model fields
    header = [
        "study.pk",
        "study.name",
        "measurement.assay.line.pk",
        "measurement.assay.line.name",
        "measurement.assay.line.description",
        "measurement.assay.protocol.name",
        "measurement.assay.pk",
        "measurement.assay.name",
        "type_formal",
        "measurement.type_name",
        "measurement.compartment",
        "measurement.unit_name",
        "y",
        "x",
    ]
    labels = {
        "study.pk": "Study ID",
        "study.name": "Study Name",
        "measurement.assay.line.pk": "Line ID",
        "measurement.assay.line.name": "Line Name",
        "measurement.assay.line.description": "Line Description",
        "measurement.assay.protocol.name": "Protocol",
        "measurement.assay.pk": "Assay ID",
        "measurement.assay.name": "Assay Name",
        "type_formal": "Formal Type",
        "measurement.type_name": "Measurement Type",
        "measurement.compartment": "Compartment",
        "measurement.unit_name": "Units",
        "y": "Value",
        "x": "Hours",
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
        "anno_formal_type",
        "measurement__measurement_type__type_name",
        "measurement__compartment",
        "measurement__y_units__unit_name",
        "y",
        "x",
    ]

    def stream_csv(self, queryset):
        # limit columns to only those needed to render CSV
        queryset = queryset.values_list(*self.columns)
        # create csv writer
        writer = csv.writer(Echo())
        # yield header using same labels as renderer.ExportRenderer
        er_header = ExportRenderer.header
        er_labels = ExportRenderer.labels
        yield writer.writerow([er_labels.get(x, x) for x in er_header])
        with transaction.atomic():
            for row in queryset.iterator(chunk_size=100):
                row = list(row)
                # items in index 12 and 13 are arrays for Y and X
                # replace with first values
                row[12] = row[12][0] if row[12] else ""
                row[13] = row[13][0] if row[13] else ""
                yield writer.writerow(row)
