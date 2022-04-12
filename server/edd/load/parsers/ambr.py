import logging
from uuid import UUID

import numpy as np
from django.db.models import Q

from edd.load.models import DefaultUnit
from main.models import MeasurementType

from .core import MultiSheetExcelParserMixin
from .generic import GenericImportParser

logger = logging.getLogger(__name__)


class AmbrExcelParser(MultiSheetExcelParserMixin, GenericImportParser):
    def __init__(self, import_uuid: UUID):
        super().__init__(import_uuid=import_uuid,)
        self.parsed_sheet_rows = []

    def _parse_sheet_rows(self, name, sheet):

        # for every two columns in the worksheet
        # corresponding to each measurement type in the sheet
        for col_index in range(1, sheet.max_column + 1, 2):
            time_data = []
            mes_data = []
            for row in sheet.rows:
                row_list = [cell.value for cell in row][col_index - 1 : col_index + 1]
                time_data.append(row_list[0])
                mes_data.append(row_list[1])

            # decimate the data here
            # check if data has more than 200 points then decimate else do not
            if len(mes_data) > 200:
                time_data = time_data[0::10]
                mes_data = mes_data[0::10]

            # using mapper to map data into the EDD import format
            # and convert in to a pandas dataframe
            # set the line name and the dataframe with the two columns
            # with data for the next measurement type
            self.map_data(name, (time_data, mes_data))

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
            # dropping records with NaN values
            if self.is_valid(mes_data[i]):
                self.parsed_sheet_rows.append(
                    (
                        name,
                        mtype_name,
                        float(mes_data[i]),
                        float(time_data[i]),
                        du_obj.unit.unit_name,
                    )
                )

    def is_valid(self, value):
        if value is None:
            return False
        if np.isnan(float(value)):
            return False
        return True
