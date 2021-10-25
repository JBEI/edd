from uuid import uuid4

import pytest

from .. import parsers
from . import factory


@pytest.mark.django_db
def test_AmbrExcelParser_success():
    path = "ambr_export_test_data.xlsx"
    parser = parsers.AmbrExcelParser(uuid4())

    with factory.load_test_file(path) as file:
        parsed = parser.parse(file)
    verify_parse_result(parsed)


def verify_parse_result(parsed):
    # Utility method that compares parsed content from XLSX and CSV format files,
    # verifying that:
    #     A) the results are correct, and
    #     B) that they're consistent regardless of file format.

    # verify that expected values were parsed
    assert parsed is not None
    assert parsed.line_or_assay_names == {"HT1", "HT2"}
    assert parsed.mtypes == {
        "Acid volume pumped",
        "Air flow",
        "Base volume pumped",
        "CER",
        "Dissolved Oxygen",
    }
    record_count = len(parsed.series_data)
    assert record_count == 10
    assert parsed.any_time is True
    assert parsed.has_all_times is True
    assert parsed.record_src == "row"
    assert parsed.units == {"hours", "mM/L/h", "% maximum measured", "lpm", "mL"}
    # drill down and verify that ParseRecords were created as expected
    assert len(parsed.series_data) == 10
    mes_parse_record = parsed.series_data[0]
    assert mes_parse_record.loa_name == "HT1"
    assert mes_parse_record.mtype_name == "Acid volume pumped"
    assert mes_parse_record.y_unit_name == "mL"
    assert mes_parse_record.x_unit_name == "hours"
    assert mes_parse_record.value_format == "0"
    assert mes_parse_record.data == [[71.968730211], [9.05400000045242e-06]]
    mes_parse_record = parsed.series_data[1]
    assert mes_parse_record.loa_name == "HT1"
    assert mes_parse_record.mtype_name == "Air flow"
    assert mes_parse_record.y_unit_name == "lpm"
    assert mes_parse_record.x_unit_name == "hours"
    assert mes_parse_record.value_format == "0"
    assert mes_parse_record.data == [[0.00133676594444444], [75.0770034790039]]
    mes_parse_record = parsed.series_data[2]
    assert mes_parse_record.loa_name == "HT1"
    assert mes_parse_record.mtype_name == "Base volume pumped"
    assert mes_parse_record.y_unit_name == "mL"
    assert mes_parse_record.x_unit_name == "hours"
    assert mes_parse_record.value_format == "0"
    assert mes_parse_record.data == [[0.00469898883333333], [9.05399999867607e-06]]
    mes_parse_record = parsed.series_data[3]
    assert mes_parse_record.loa_name == "HT1"
    assert mes_parse_record.mtype_name == "CER"
    assert mes_parse_record.y_unit_name == "mM/L/h"
    assert mes_parse_record.x_unit_name == "hours"
    assert mes_parse_record.value_format == "0"
    assert mes_parse_record.data == [[0.00133676594444444], [0.162894560296047]]
    mes_parse_record = parsed.series_data[4]
    assert mes_parse_record.loa_name == "HT1"
    assert mes_parse_record.mtype_name == "Dissolved Oxygen"
    assert mes_parse_record.y_unit_name == "% maximum measured"
    assert mes_parse_record.x_unit_name == "hours"
    assert mes_parse_record.value_format == "0"
    assert mes_parse_record.data == [[0.00133676594444444], [99.5141229062182]]
    mes_parse_record = parsed.series_data[5]
    assert mes_parse_record.loa_name == "HT2"
    assert mes_parse_record.mtype_name == "Acid volume pumped"
    assert mes_parse_record.y_unit_name == "mL"
    assert mes_parse_record.x_unit_name == "hours"
    assert mes_parse_record.value_format == "0"
    assert mes_parse_record.data == [[71.9505442165], [9.05400000045242e-06]]
    mes_parse_record = parsed.series_data[6]
    assert mes_parse_record.loa_name == "HT2"
    assert mes_parse_record.mtype_name == "Air flow"
    assert mes_parse_record.y_unit_name == "lpm"
    assert mes_parse_record.x_unit_name == "hours"
    assert mes_parse_record.value_format == "0"
    assert mes_parse_record.data == [[0.00332820980555556], [74.7689971923828]]
    mes_parse_record = parsed.series_data[7]
    assert mes_parse_record.loa_name == "HT2"
    assert mes_parse_record.mtype_name == "Base volume pumped"
    assert mes_parse_record.y_unit_name == "mL"
    assert mes_parse_record.x_unit_name == "hours"
    assert mes_parse_record.value_format == "0"
    assert mes_parse_record.data == [[0.00744660863888889], [9.05399999867607e-06]]
    mes_parse_record = parsed.series_data[8]
    assert mes_parse_record.loa_name == "HT2"
    assert mes_parse_record.mtype_name == "CER"
    assert mes_parse_record.y_unit_name == "mM/L/h"
    assert mes_parse_record.x_unit_name == "hours"
    assert mes_parse_record.value_format == "0"
    assert mes_parse_record.data == [[0.00332820980555556], [0.0949098408436696]]
    mes_parse_record = parsed.series_data[9]
    assert mes_parse_record.loa_name == "HT2"
    assert mes_parse_record.mtype_name == "Dissolved Oxygen"
    assert mes_parse_record.y_unit_name == "% maximum measured"
    assert mes_parse_record.x_unit_name == "hours"
    assert mes_parse_record.value_format == "0"
    assert mes_parse_record.data == [[0.00332820980555556], [100.187744527793]]
