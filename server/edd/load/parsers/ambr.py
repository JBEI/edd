import logging

import numpy as np
from django.db.models import Q

from edd.load.models import DefaultUnit
from main.models import MeasurementType

from .core import MultiSheetExcelParserMixin
from .generic import GenericImportParser

logger = logging.getLogger(__name__)


class AmbrExcelParser(MultiSheetExcelParserMixin, GenericImportParser):
    def _parse_sheet_rows(self, sheet):

        # for every two columns in the worksheet
        # corresponding to each measurement type in the sheet
        for col_index in range(0, sheet.max_column, 2):
            pairs = [
                (row[col_index].value, row[col_index + 1].value) for row in sheet.rows
            ]
            pairs = self._sample(pairs)
            # using mapper to map data into tuples for EDD import
            yield from self._map_data(sheet.title, pairs)

    def _sample(self, pairs):
        # if there's more than 200 points, sample only every ten
        if len(pairs) > 200:
            return pairs[0::10]
        return pairs

    def _map_data(self, name, pairs):
        # first row are the "headers", grab the type from values
        first_row = pairs[0]
        type_object = self._lookup_type(first_row[1])
        unit = self._lookup_unit(type_object)
        for x, y in pairs:
            # dropping records with NaN values
            if self._is_valid(y) and self._is_valid(x):
                yield (
                    name,
                    type_object.type_name,
                    float(y),
                    float(x),
                    unit.unit_name,
                )

    def _lookup_type(self, type_name):
        try:
            direct_match = Q(type_name=type_name)
            translated = Q(
                measurementnametransform__input_type_name=type_name,
                measurementnametransform__parser="ambr",
            )
            possible = MeasurementType.objects.filter(direct_match | translated)
            return possible.get()
        except MeasurementType.DoesNotExist:
            logger.error(f"Measurement Type for `{type_name}` could not be found")
            raise
        except MeasurementType.MultipleObjectsReturned:
            candidates = [f"`{t.type_name}` (ID: {t.id})" for t in possible[:10]]
            logger.error(
                f"Measurement Type for `{type_name}` has multiple possible results, "
                f"including: {', '.join(candidates)}"
            )
            raise

    def _lookup_unit(self, type_object):
        try:
            default = DefaultUnit.objects.get(
                measurement_type=type_object,
                parser="ambr",
            )
            return default.unit
        except DefaultUnit.DoesNotExist:
            logger.error(
                f"Default Unit for (ID: {type_object.pk}) "
                f"{type_object.type_name} could not be found"
            )
            raise

    def _is_valid(self, value):
        if value is None:
            return False
        try:
            return not np.isnan(float(value))
        except ValueError:
            return False
