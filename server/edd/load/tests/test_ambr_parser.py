from uuid import uuid4

import pytest

from .. import parsers
from . import factory


@pytest.mark.django_db
def test_AmbrExcelParser_success():
    path = "ambr_test_data.xlsx"
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
    assert record_count == 36
    assert parsed.any_time is True
    assert parsed.has_all_times is True
    assert parsed.record_src == "row"
    assert parsed.units == {"hours", "mM/L/h", "% maximum measured", "lpm", "mL"}
    # drill down and verify that ParseRecords were created as expected
    assert len(parsed.series_data) == 36
    mes_parse_record = parsed.series_data[0]
    assert mes_parse_record.loa_name == "HT1"
    assert mes_parse_record.mtype_name == "Acid volume pumped"
    assert mes_parse_record.y_unit_name == "mL"
    assert mes_parse_record.x_unit_name == "hours"
    assert mes_parse_record.value_format == "0"
    assert mes_parse_record.data == [[71.968730211], [9.05400000045242e-06]]
    mes_parse_record = parsed.series_data[1]
    assert mes_parse_record.loa_name == "HT1"
    assert mes_parse_record.mtype_name == "Acid volume pumped"
    assert mes_parse_record.y_unit_name == "mL"
    assert mes_parse_record.x_unit_name == "hours"
    assert mes_parse_record.value_format == "0"
    assert mes_parse_record.data == [[121.720276960917], [9.05400000045242e-06]]
    mes_parse_record = parsed.series_data[2]
    assert mes_parse_record.loa_name == "HT1"
    assert mes_parse_record.mtype_name == "Acid volume pumped"
    assert mes_parse_record.y_unit_name == "mL"
    assert mes_parse_record.x_unit_name == "hours"
    assert mes_parse_record.value_format == "0"
    assert mes_parse_record.data == [[121.723614433222], [0.000866085999999433]]
    mes_parse_record = parsed.series_data[3]
    assert mes_parse_record.loa_name == "HT1"
    assert mes_parse_record.mtype_name == "Air flow"
    assert mes_parse_record.y_unit_name == "lpm"
    assert mes_parse_record.x_unit_name == "hours"
    assert mes_parse_record.value_format == "0"
    assert mes_parse_record.data == [[0.00133676594444444], [75.0770034790039]]
    mes_parse_record = parsed.series_data[4]
    assert mes_parse_record.loa_name == "HT1"
    assert mes_parse_record.mtype_name == "Air flow"
    assert mes_parse_record.y_unit_name == "lpm"
    assert mes_parse_record.x_unit_name == "hours"
    assert mes_parse_record.value_format == "0"
    assert mes_parse_record.data == [[0.00469898883333333], [75.0449981689453]]
    mes_parse_record = parsed.series_data[5]
    assert mes_parse_record.loa_name == "HT1"
    assert mes_parse_record.mtype_name == "Air flow"
    assert mes_parse_record.y_unit_name == "lpm"
    assert mes_parse_record.x_unit_name == "hours"
    assert mes_parse_record.value_format == "0"
    assert mes_parse_record.data == [[0.00803494352777778], [74.6869964599609]]
    mes_parse_record = parsed.series_data[6]
    assert mes_parse_record.loa_name == "HT1"
    assert mes_parse_record.mtype_name == "Air flow"
    assert mes_parse_record.y_unit_name == "lpm"
    assert mes_parse_record.x_unit_name == "hours"
    assert mes_parse_record.value_format == "0"
    assert mes_parse_record.data == [[0.0114117729166667], [75.0439987182617]]
    mes_parse_record = parsed.series_data[7]
    assert mes_parse_record.loa_name == "HT1"
    assert mes_parse_record.mtype_name == "Base volume pumped"
    assert mes_parse_record.y_unit_name == "mL"
    assert mes_parse_record.x_unit_name == "hours"
    assert mes_parse_record.value_format == "0"
    assert mes_parse_record.data == [[0.00469898883333333], [9.05399999867607e-06]]
    mes_parse_record = parsed.series_data[8]
    assert mes_parse_record.loa_name == "HT1"
    assert mes_parse_record.mtype_name == "Base volume pumped"
    assert mes_parse_record.y_unit_name == "mL"
    assert mes_parse_record.x_unit_name == "hours"
    assert mes_parse_record.value_format == "0"
    assert mes_parse_record.data == [[13.2848959848611], [9.05399999867607e-06]]
    mes_parse_record = parsed.series_data[9]
    assert mes_parse_record.loa_name == "HT1"
    assert mes_parse_record.mtype_name == "Base volume pumped"
    assert mes_parse_record.y_unit_name == "mL"
    assert mes_parse_record.x_unit_name == "hours"
    assert mes_parse_record.value_format == "0"
    assert mes_parse_record.data == [[13.2882466308333], [0.00865728599999921]]
    mes_parse_record = parsed.series_data[10]
    assert mes_parse_record.loa_name == "HT1"
    assert mes_parse_record.mtype_name == "CER"
    assert mes_parse_record.y_unit_name == "mM/L/h"
    assert mes_parse_record.x_unit_name == "hours"
    assert mes_parse_record.value_format == "0"
    assert mes_parse_record.data == [[0.00133676594444444], [0.162894560296047]]
    mes_parse_record = parsed.series_data[11]
    assert mes_parse_record.loa_name == "HT1"
    assert mes_parse_record.mtype_name == "CER"
    assert mes_parse_record.y_unit_name == "mM/L/h"
    assert mes_parse_record.x_unit_name == "hours"
    assert mes_parse_record.value_format == "0"
    assert mes_parse_record.data == [[0.00469898883333333], [0.162894640482908]]
    mes_parse_record = parsed.series_data[12]
    assert mes_parse_record.loa_name == "HT1"
    assert mes_parse_record.mtype_name == "CER"
    assert mes_parse_record.y_unit_name == "mM/L/h"
    assert mes_parse_record.x_unit_name == "hours"
    assert mes_parse_record.value_format == "0"
    assert mes_parse_record.data == [[0.00803494352777778], [0.162893274969477]]
    mes_parse_record = parsed.series_data[13]
    assert mes_parse_record.loa_name == "HT1"
    assert mes_parse_record.mtype_name == "CER"
    assert mes_parse_record.y_unit_name == "mM/L/h"
    assert mes_parse_record.x_unit_name == "hours"
    assert mes_parse_record.value_format == "0"
    assert mes_parse_record.data == [[0.0114117729166667], [0.162891826049647]]
    mes_parse_record = parsed.series_data[14]
    assert mes_parse_record.loa_name == "HT1"
    assert mes_parse_record.mtype_name == "Dissolved Oxygen"
    assert mes_parse_record.y_unit_name == "% maximum measured"
    assert mes_parse_record.x_unit_name == "hours"
    assert mes_parse_record.value_format == "0"
    assert mes_parse_record.data == [[0.00133676594444444], [99.5141229062182]]
    mes_parse_record = parsed.series_data[15]
    assert mes_parse_record.loa_name == "HT1"
    assert mes_parse_record.mtype_name == "Dissolved Oxygen"
    assert mes_parse_record.y_unit_name == "% maximum measured"
    assert mes_parse_record.x_unit_name == "hours"
    assert mes_parse_record.value_format == "0"
    assert mes_parse_record.data == [[0.00469898883333333], [98.92277614905]]
    mes_parse_record = parsed.series_data[16]
    assert mes_parse_record.loa_name == "HT1"
    assert mes_parse_record.mtype_name == "Dissolved Oxygen"
    assert mes_parse_record.y_unit_name == "% maximum measured"
    assert mes_parse_record.x_unit_name == "hours"
    assert mes_parse_record.value_format == "0"
    assert mes_parse_record.data == [[0.00803466633333333], [98.814533264843]]
    mes_parse_record = parsed.series_data[17]
    assert mes_parse_record.loa_name == "HT1"
    assert mes_parse_record.mtype_name == "Dissolved Oxygen"
    assert mes_parse_record.y_unit_name == "% maximum measured"
    assert mes_parse_record.x_unit_name == "hours"
    assert mes_parse_record.value_format == "0"
    assert mes_parse_record.data == [[0.0114117729166667], [98.6245908238958]]
    mes_parse_record = parsed.series_data[18]
    assert mes_parse_record.loa_name == "HT2"
    assert mes_parse_record.mtype_name == "Acid volume pumped"
    assert mes_parse_record.y_unit_name == "mL"
    assert mes_parse_record.x_unit_name == "hours"
    assert mes_parse_record.value_format == "0"
    assert mes_parse_record.data == [[71.9505442165], [9.05400000045242e-06]]
    mes_parse_record = parsed.series_data[19]
    assert mes_parse_record.loa_name == "HT2"
    assert mes_parse_record.mtype_name == "Acid volume pumped"
    assert mes_parse_record.y_unit_name == "mL"
    assert mes_parse_record.x_unit_name == "hours"
    assert mes_parse_record.value_format == "0"
    assert mes_parse_record.data == [[71.9517022505278], [0.00069078400000061]]
    mes_parse_record = parsed.series_data[20]
    assert mes_parse_record.loa_name == "HT2"
    assert mes_parse_record.mtype_name == "Acid volume pumped"
    assert mes_parse_record.y_unit_name == "mL"
    assert mes_parse_record.x_unit_name == "hours"
    assert mes_parse_record.value_format == "0"
    assert mes_parse_record.data == [[71.9538838950833], [0.00189841999999724]]
    mes_parse_record = parsed.series_data[21]
    assert mes_parse_record.loa_name == "HT2"
    assert mes_parse_record.mtype_name == "Air flow"
    assert mes_parse_record.y_unit_name == "lpm"
    assert mes_parse_record.x_unit_name == "hours"
    assert mes_parse_record.value_format == "0"
    assert mes_parse_record.data == [[0.00332820980555556], [74.7689971923828]]
    mes_parse_record = parsed.series_data[22]
    assert mes_parse_record.loa_name == "HT2"
    assert mes_parse_record.mtype_name == "Air flow"
    assert mes_parse_record.y_unit_name == "lpm"
    assert mes_parse_record.x_unit_name == "hours"
    assert mes_parse_record.value_format == "0"
    assert mes_parse_record.data == [[0.00744660863888889], [74.7649993896484]]
    mes_parse_record = parsed.series_data[23]
    assert mes_parse_record.loa_name == "HT2"
    assert mes_parse_record.mtype_name == "Air flow"
    assert mes_parse_record.y_unit_name == "lpm"
    assert mes_parse_record.x_unit_name == "hours"
    assert mes_parse_record.value_format == "0"
    assert mes_parse_record.data == [[0.01004618625], [75.036003112793]]
    mes_parse_record = parsed.series_data[24]
    assert mes_parse_record.loa_name == "HT2"
    assert mes_parse_record.mtype_name == "Air flow"
    assert mes_parse_record.y_unit_name == "lpm"
    assert mes_parse_record.x_unit_name == "hours"
    assert mes_parse_record.value_format == "0"
    assert mes_parse_record.data == [[0.0133746873611111], [74.9970016479492]]
    mes_parse_record = parsed.series_data[25]
    assert mes_parse_record.loa_name == "HT2"
    assert mes_parse_record.mtype_name == "Base volume pumped"
    assert mes_parse_record.y_unit_name == "mL"
    assert mes_parse_record.x_unit_name == "hours"
    assert mes_parse_record.value_format == "0"
    assert mes_parse_record.data == [[0.00744660863888889], [9.05399999867607e-06]]
    mes_parse_record = parsed.series_data[26]
    assert mes_parse_record.loa_name == "HT2"
    assert mes_parse_record.mtype_name == "Base volume pumped"
    assert mes_parse_record.y_unit_name == "mL"
    assert mes_parse_record.x_unit_name == "hours"
    assert mes_parse_record.value_format == "0"
    assert mes_parse_record.data == [[16.2741913846111], [9.05399999867607e-06]]
    mes_parse_record = parsed.series_data[27]
    assert mes_parse_record.loa_name == "HT2"
    assert mes_parse_record.mtype_name == "Base volume pumped"
    assert mes_parse_record.y_unit_name == "mL"
    assert mes_parse_record.x_unit_name == "hours"
    assert mes_parse_record.value_format == "0"
    assert mes_parse_record.data == [[16.2775798205556], [0.00875467599999974]]
    mes_parse_record = parsed.series_data[28]
    assert mes_parse_record.loa_name == "HT2"
    assert mes_parse_record.mtype_name == "CER"
    assert mes_parse_record.y_unit_name == "mM/L/h"
    assert mes_parse_record.x_unit_name == "hours"
    assert mes_parse_record.value_format == "0"
    assert mes_parse_record.data == [[0.00332820980555556], [0.0949098408436696]]
    mes_parse_record = parsed.series_data[29]
    assert mes_parse_record.loa_name == "HT2"
    assert mes_parse_record.mtype_name == "CER"
    assert mes_parse_record.y_unit_name == "mM/L/h"
    assert mes_parse_record.x_unit_name == "hours"
    assert mes_parse_record.value_format == "0"
    assert mes_parse_record.data == [[0.00744660863888889], [0.0949099148115106]]
    mes_parse_record = parsed.series_data[30]
    assert mes_parse_record.loa_name == "HT2"
    assert mes_parse_record.mtype_name == "CER"
    assert mes_parse_record.y_unit_name == "mM/L/h"
    assert mes_parse_record.x_unit_name == "hours"
    assert mes_parse_record.value_format == "0"
    assert mes_parse_record.data == [[0.01004618625], [0.0949093010018652]]
    mes_parse_record = parsed.series_data[31]
    assert mes_parse_record.loa_name == "HT2"
    assert mes_parse_record.mtype_name == "CER"
    assert mes_parse_record.y_unit_name == "mM/L/h"
    assert mes_parse_record.x_unit_name == "hours"
    assert mes_parse_record.value_format == "0"
    assert mes_parse_record.data == [[0.0133746873611111], [0.0949084797380677]]
    mes_parse_record = parsed.series_data[32]
    assert mes_parse_record.loa_name == "HT2"
    assert mes_parse_record.mtype_name == "Dissolved Oxygen"
    assert mes_parse_record.y_unit_name == "% maximum measured"
    assert mes_parse_record.x_unit_name == "hours"
    assert mes_parse_record.value_format == "0"
    assert mes_parse_record.data == [[0.00332820980555556], [100.187744527793]]
    mes_parse_record = parsed.series_data[33]
    assert mes_parse_record.loa_name == "HT2"
    assert mes_parse_record.mtype_name == "Dissolved Oxygen"
    assert mes_parse_record.y_unit_name == "% maximum measured"
    assert mes_parse_record.x_unit_name == "hours"
    assert mes_parse_record.value_format == "0"
    assert mes_parse_record.data == [[0.00744660863888889], [99.9159880308283]]
    mes_parse_record = parsed.series_data[34]
    assert mes_parse_record.loa_name == "HT2"
    assert mes_parse_record.mtype_name == "Dissolved Oxygen"
    assert mes_parse_record.y_unit_name == "% maximum measured"
    assert mes_parse_record.x_unit_name == "hours"
    assert mes_parse_record.value_format == "0"
    assert mes_parse_record.data == [[0.01004618625], [99.6116340645008]]
    mes_parse_record = parsed.series_data[35]
    assert mes_parse_record.loa_name == "HT2"
    assert mes_parse_record.mtype_name == "Dissolved Oxygen"
    assert mes_parse_record.y_unit_name == "% maximum measured"
    assert mes_parse_record.x_unit_name == "hours"
    assert mes_parse_record.value_format == "0"
    assert mes_parse_record.data == [[0.0133746873611111], [99.4631435142741]]
