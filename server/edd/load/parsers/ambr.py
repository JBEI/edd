from uuid import UUID

import pandas as pd

from edd.load.models import DefaultUnit, MeasurementNameTransform
from main.models import MeasurementType, Protocol

from .core import MultiSheetExcelParserMixin
from .generic import GenericImportParser


class AmbrExcelParser(MultiSheetExcelParserMixin, GenericImportParser):
    def __init__(self, import_uuid: UUID):
        super().__init__(import_uuid=import_uuid,)
        self.parsed_result = pd.DataFrame()

    def _parse_sheet_rows(self, name, sheet):

        # for every two columns in the worksheet
        # corresponding to each measurement type in the sheet
        # mapper = MeasurementMapper()
        for i in range(0, int(sheet.shape[1]), 2):
            two_cols = sheet[sheet.columns[i : i + 2]]

            # dropping all rows with nan values in the worksheet
            two_cols = two_cols.dropna()
            if not two_cols.dropna().empty:
                # decimate the data
                two_cols = two_cols.iloc[::10, :]

                # using mapper to map data into the EDD import format
                # and convert in to a pandas dataframe
                # set the line name and the dataframe with the two columns
                # with data for the next measurement type
                # mapper.set_line_name(name)
                # mapper.set_data(two_cols)
                # parsed_df = mapper.map_data()
                parsed_df = self.map_data(name, two_cols)
                self.parsed_result = self.parsed_result.append(parsed_df)
        # return parsed_result

    def map_data(self, name, df):

        mtype_name = df[df.columns[1:2]].columns.values[0]
        df["Line Name"] = name
        df.columns.values[0] = "Time"
        df.columns.values[1] = "Value"

        # get EDD name for current measurement if mapping exists
        mes_transform_qs = MeasurementNameTransform.objects.all().filter(
            input_type_name=mtype_name, parser="ambr"
        )
        if len(mes_transform_qs) == 1:
            mtype_name = mes_transform_qs[0].edd_type_name

        # get default unit record for current measurement type
        mes_type_qs = MeasurementType.objects.all().filter(type_name=mtype_name)
        prot_type_qs = Protocol.objects.all().filter(name="AMBR250")
        if len(mes_type_qs) == 1 and len(prot_type_qs) == 1:
            du_qs = DefaultUnit.objects.all().filter(
                measurement_type=mes_type_qs[0], protocol=prot_type_qs[0], parser="ambr"
            )
        if len(du_qs) == 1:
            du_obj = du_qs[0]

        # populating the dataframe
        df["Measurement Type"] = mtype_name
        df["Units"] = du_obj.unit.unit_name
        # dropping records with NaN values
        df = df[df["Value"].notna()]

        return df
