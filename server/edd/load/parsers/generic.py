from uuid import UUID

from main.models import Measurement

from ..reporting import raise_errors
from .core import (
    CsvParserMixin,
    ExcelParserMixin,
    MeasurementParseRecord,
    ParseResult,
    TableParser,
    _has_any_value,
)


class GenericImportParser(TableParser):
    """
    Parser for EDD's "Generic" import file: a normalized, simple, accessible,
    and machine-readable tabular format designed largely for automated data import.
    """

    default_columns = ["Line Name", "Measurement Type", "Value", "Time", "Units"]

    def __init__(self, import_uuid: UUID):
        super().__init__(
            req_cols=self.default_columns,
            import_uuid=import_uuid,
            numeric_cols=["Time", "Value"],
        )
        self._measurements = []

    def _verify_layout(self, header_row_index):
        pass

    def _parse_row(self, cells_list, row_index):
        # extract raw values from in-use cols in this row
        # Note: "Line Name" header is used for simplicity for most users, even though it may
        # actually match assay name during some imports....the difference should often be
        # transparent.
        loa_name = self._get_raw_value(cells_list, "Line Name")
        mtype = self._get_raw_value(cells_list, "Measurement Type")
        val = self._get_raw_value(cells_list, "Value")
        time = self._get_raw_value(cells_list, "Time")
        units = self._get_raw_value(cells_list, "Units")

        # skip the row entirely if no in-use column has a value in it
        any_value = _has_any_value(loa_name, mtype, val, time, units)
        if not any_value:
            return None

        # now that we've seen at least a single value in the row, do more rigorous parsing /
        # verification of the values
        loa_name = self._parse_and_verify_val(loa_name, row_index, "Line Name")
        mtype = self._parse_and_verify_val(mtype, row_index, "Measurement Type")
        val = self._parse_and_verify_val(val, row_index, "Value")
        time = self._parse_and_verify_val(time, row_index, "Time")
        units = self._parse_and_verify_val(units, row_index, "Units")

        # store x and y as arrays to match underlying field types in MeasurementValue...
        # easier comparisons along the way with existing study data
        data = [[time], [val]]

        # always convert loa_name to a string, since Excel / openpyxl may convert numeric names to
        # numbers, which won't match when compared to the study
        loa_name = str(loa_name)
        m = MeasurementParseRecord(
            loa_name=loa_name,
            mtype_name=mtype,
            # TODO: revisit value_format when adding vector support
            value_format=Measurement.Format.SCALAR,
            data=data,
            x_unit_name="hours",  # assumed hours for time, included in EDD's bootstrap.json
            y_unit_name=units,
            src_ids=(row_index + 1,),
        )
        self._measurements.append(m)

    @property
    def _parse_result(self):
        raise_errors(self.import_uuid)

        # note successful parsing of this format implies that every record has a time, since
        # time is a required column for the format
        return ParseResult(
            series_data=self._measurements,
            any_time=True,  # required by format
            has_all_times=True,  # required by format
            record_src="row",
        )


class GenericExcelParser(ExcelParserMixin, GenericImportParser):
    pass


class GenericCsvParser(CsvParserMixin, GenericImportParser):
    pass


