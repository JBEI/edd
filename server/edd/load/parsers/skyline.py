import collections
import decimal
from typing import List
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
    build_src_summary,
)


class BaseSkylineParser(TableParser):
    """A parser using fixed file headers consistent with exports from Skyline."""

    def __init__(self, import_uuid: UUID):
        super().__init__(
            req_cols=["Replicate Name", "Protein Name", "Total Area"],
            import_uuid=import_uuid,
            opt_cols=["Peptide"],
            numeric_cols=["Total Area"],
        )
        self._summed_areas = collections.defaultdict(decimal.Decimal)
        # maps (loa, meas) => row # list
        self._area_sources = collections.defaultdict(list)

    def _parse_row(self, cells_list, row_index):
        loa_name = self._get_raw_value(cells_list, "Replicate Name")
        protein_id = self._get_raw_value(cells_list, "Protein Name")
        total_area = self._get_raw_value(cells_list, "Total Area")

        # skip the row entirely if no in-use cell has content
        any_value = _has_any_value(loa_name, protein_id, total_area)
        if not any_value:
            return None

        loa_name = self._parse_and_verify_val(loa_name, row_index, "Replicate Name")
        protein_id = self._parse_and_verify_val(protein_id, row_index, "Protein Name")

        if "#N/A" == total_area:
            total_area = 0
        else:
            total_area = self._parse_and_verify_val(total_area, row_index, "Total Area")

        key = (loa_name, protein_id)
        # prevent subsequent problems adding to decimal summed_areas
        if not isinstance(total_area, decimal.Decimal):
            total_area = decimal.Decimal(total_area)
        self._summed_areas[key] += total_area
        self._area_sources[key].append(row_index + 1)

    @property
    def _parse_result(self):
        raise_errors(self.import_uuid)
        measurements: List[MeasurementParseRecord] = []
        time = None  # this format doesn't include time
        for (line_or_assay_name, protein_id), area in self._summed_areas.items():
            sources = self._build_src_summary(line_or_assay_name, protein_id)

            # always convert loa_name to a string, since Excel / openpyxl may convert numeric
            # names to numbers, which won't match when compared to the study
            line_or_assay_name = str(line_or_assay_name)

            m = MeasurementParseRecord(
                loa_name=line_or_assay_name,
                mtype_name=protein_id,
                value_format=Measurement.Format.SCALAR,
                # inner arrays match final storage in MeasurementValue
                data=[[time], [area]],
                x_unit_name="hours",  # assumed hours for time & included in EDD's bootstrap.json
                y_unit_name="counts",  # implied by file format & included in EDD's bootstrap.json
                src_ids=tuple(sources),
            )
            measurements.append(m)
        return ParseResult(
            series_data=measurements,
            any_time=False,
            has_all_times=False,
            record_src="row",
        )

    def _build_src_summary(self, loa_name, protein_id):
        """
        Builds a concise summary string describing the range(s) of file rows a record was derived
        from.
        """

        # review source row list (in order), and replace consecutive rows with row ranges
        src_rows = self._area_sources[(loa_name, protein_id)]
        return build_src_summary(src_rows)


class SkylineExcelParser(ExcelParserMixin, BaseSkylineParser):
    pass


class SkylineCsvParser(CsvParserMixin, BaseSkylineParser):
    pass
