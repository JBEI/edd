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
            times = [row[col_index].value for row in sheet.rows]
            values = [row[col_index + 1].value for row in sheet.rows]

            # decimate the data here
            # check if data has more than 200 points then decimate else do not
            if len(values) > 200:
                times = times[0::10]
                values = values[0::10]

            # using mapper to map data into the EDD import format
            # and convert in to a pandas dataframe
            # set the line name and the dataframe with the two columns
            # with data for the next measurement type
            yield from self._map_data(sheet.title, times, values)

<<<<<<< HEAD
    def _map_data(self, name, times, values):
        # first row are the "headers", grab the type from values
        type_object = self._lookup_type(values[0])
        unit = self._lookup_unit(type_object)
        for y, x in zip(values, times):
=======
    def map_data(self, name, data):

        time_data, mes_data = data
        mtype_name = mes_data[0]

        try:
            mes_type_obj = MeasurementType.objects.filter(
                Q(type_name=mtype_name)
                | Q(
                    measurementnametransform__input_type_name=mtype_name,
                    measurementnametransform__parser="ambr",
                )
            ).first()
        except MeasurementType.DoesNotExist:
            logger.error("Measurement Type for could not be found")

        try:
            du_obj = DefaultUnit.objects.get(
                measurement_type=mes_type_obj, parser="ambr"
            )
        except DefaultUnit.DoesNotExist:
            logger.error("Default Unit could not be found")

        # appending mapped measurements to parsed worksheet
        for i in range(1, len(mes_data)):
>>>>>>> 36bfb229 (Fixing error importing large EDD file)
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
            direct_type_match = Q(type_name=type_name)
            translated_match = Q(
                measurementnametransform__input_type_name=type_name,
                measurementnametransform__parser="ambr",
            )
            return MeasurementType.objects.filter(
                direct_type_match | translated_match
            ).first()
        except MeasurementType.DoesNotExist:
            logger.error(f"Measurement Type for {type_name} could not be found")
            raise

    def _lookup_unit(self, type_object):
        try:
            default = DefaultUnit.objects.get(
                measurement_type=type_object, parser="ambr",
            )
            return default.unit
        except DefaultUnit.DoesNotExist:
            logger.error("Default Unit could not be found")
            raise

    def _is_valid(self, value):
        if value is None:
            return False
        try:
            return not np.isnan(float(value))
        except ValueError:
            return False
