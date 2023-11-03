import collections

import pytest

from main.tests import factory as core_factory

from .. import exceptions, layout, reader
from . import factory


def consume(iterable):
    """
    Helper function that runs through an entire iterable, i.e. consume a generator.
    """
    collections.deque(iterable, maxlen=0)


def test_registered_layouts_exist():
    names_and_labels = layout.Layout.all_available()

    # make sure we at least have Generic, Skyline, Ambr from this module
    assert len(names_and_labels) > 2


@pytest.mark.parametrize(
    "key,label",
    (
        ("generic", "Generic"),
        ("skyline", "Skyline"),
        ("ambr", "Ambr"),
    ),
)
def test_registered_layout_labels(key, label):
    assert layout.Layout.get_label(key) == label


def test_unknown_layout_keys():
    key = "this is a deliberately unknown key"
    with pytest.raises(exceptions.UnknownLayout):
        layout.Layout.get_class(key)
    with pytest.raises(exceptions.UnknownLayout):
        layout.Layout.get_label(key)


def test_parse_basic_csv(db):
    csv_reader = reader.CsvImportReader()
    parser = reader.Parser(csv_reader, layout.GenericLayout)

    with factory.load_test_file("generic_import.csv", mode="rt") as file:
        records = list(parser.parse(file))

    assert len(records) == 2
    assert records[0].locator == "A"
    assert records[0].type_name == "CID:440917"
    assert records[1].locator == "B"
    assert records[1].type_name == "CID:5288798"


def test_parse_basic_xlsx(db):
    xlsx_reader = reader.ExcelImportReader()
    parser = reader.Parser(xlsx_reader, layout.GenericLayout)

    with factory.load_test_file("generic_import.xlsx") as file:
        records = list(parser.parse(file))

    assert len(records) == 2
    assert records[0].locator == "A"
    assert records[0].type_name == "CID:440917"
    assert records[1].locator == "B"
    assert records[1].type_name == "CID:5288798"


def test_parse_generic_with_missing_value(db):
    csv_reader = reader.CsvImportReader()
    parser = reader.Parser(csv_reader, layout.GenericLayout)
    # "Value" column is blank
    text = [
        "Line name, Measurement Type, Value, Time, Units",
        "arcA     , Optical Density ,      , 1   , n/a",
    ]

    records = list(parser.parse(text))

    assert len(records) == 0


def test_parse_generic_with_invalid_value(db):
    csv_reader = reader.CsvImportReader()
    parser = reader.Parser(csv_reader, layout.GenericLayout)
    # "Value" column is blank
    text = [
        "Line name, Measurement Type, Value, Time, Units",
        "arcA     , Optical Density ,   foo, 1   , n/a",
    ]

    records = list(parser.parse(text))

    assert len(records) == 0


def test_parse_generic_with_short_row(db):
    csv_reader = reader.CsvImportReader()
    parser = reader.Parser(csv_reader, layout.GenericLayout)
    # "Value" column is blank
    text = [
        "Line name, Measurement Type, Value, Time, Units",
        "arcA     , Optical Density",
    ]

    records = list(parser.parse(text))

    assert len(records) == 0


def test_parse_generic_with_metadata(db):
    csv_reader = reader.CsvImportReader()
    parser = reader.Parser(csv_reader, layout.GenericLayout)
    meta = core_factory.AssayMetadataTypeFactory()
    text = [
        f"Line name, Measurement Type, Value, Time, Units, {meta.type_name}",
        " arcA     , Optical Density ,  3.14, 1   ,   n/a, foo",
    ]

    records = list(parser.parse(text))

    assert len(records) == 1
    first = records[0]
    assert first.locator == "arcA"
    assert first.type_name == "Optical Density"
    assert first.x == [1]
    assert len(first.y) == 1
    y = first.y[0]
    assert 3.13 < y and y < 3.15
    assert first.metadata[meta.pk] == "foo"


def test_parse_generic_with_metadata_duplicate_in_database(db):
    csv_reader = reader.CsvImportReader()
    parser = reader.Parser(csv_reader, layout.GenericLayout)
    meta_a = core_factory.AssayMetadataTypeFactory()
    # intentionally creating a duplicate in database
    core_factory.AssayMetadataTypeFactory(type_name=meta_a.type_name.lower())
    text = [
        f"Line name, Measurement Type, Value, Time, Units, {meta_a.type_name}",
        " arcA     , Optical Density ,  3.14, 1   ,   n/a, foo",
    ]

    records = list(parser.parse(text))

    # record is created, but nothing is put in metadata
    assert len(records) == 1
    first = records[0]
    assert len(first.metadata) == 0


def test_parse_generic_with_empty_columns(db):
    csv_reader = reader.CsvImportReader()
    parser = reader.Parser(csv_reader, layout.GenericLayout)
    text = [
        "Line name, Measurement Type,,, Value, Time, Units",
        "arcA     , Optical Density ,,,  3.14, 1   ,   n/a",
    ]

    records = list(parser.parse(text))

    assert len(records) == 1
    first = records[0]
    assert first.locator == "arcA"
    assert first.type_name == "Optical Density"
    assert first.x == [1]
    assert len(first.y) == 1
    y = first.y[0]
    assert 3.13 < y and y < 3.15


def test_parse_generic_with_partial_required_columns(db):
    csv_reader = reader.CsvImportReader()
    parser = reader.Parser(csv_reader, layout.GenericLayout)
    text = [
        "Line name, Value, Time, Units",
        "arcA     ,  3.14, 1   ,   n/a",
    ]

    with pytest.raises(exceptions.RequiredColumnError):
        consume(parser.parse(text))


def test_parse_with_unmatched_layout(db):
    xlsx_reader = reader.ExcelImportReader()
    parser = reader.Parser(xlsx_reader, layout.GenericLayout)

    with factory.load_test_file("generic_import_wrong_format.xlsx") as file:
        with pytest.raises(exceptions.RequiredColumnError):
            # consume generator to trigger error
            consume(parser.parse(file))


def test_parse_skyline_basic(db):
    csv_reader = reader.CsvImportReader()
    parser = reader.Parser(csv_reader, layout.SkylineLayout)
    sl = parser.layout()
    text = [
        "Replicate name, Protein Name, Peptide, Total Area",
        "          arcA,            A,       Q,          1",
        "          arcA,            B,       R,          1",
        "          arcA,            B,       S,          1",
    ]

    records = list(parser.parse(text))

    assert records == [
        sl._start_record(locator="arcA", type_name="A", y=[1]),
        sl._start_record(locator="arcA", type_name="B", y=[2]),
    ]


def test_parse_skyline_with_partial_required_columns(db):
    csv_reader = reader.CsvImportReader()
    parser = reader.Parser(csv_reader, layout.SkylineLayout)
    text = [
        "Replicate name, Total Area",
        "          arcA,          1",
        "          arcA,          1",
        "          arcA,          1",
    ]

    with pytest.raises(exceptions.RequiredColumnError):
        consume(parser.parse(text))


def test_parse_skyline_empty(db):
    csv_reader = reader.CsvImportReader()
    parser = reader.Parser(csv_reader, layout.SkylineLayout)
    text = [
        "Replicate name, Protein Name, Peptide, Total Area",
        "",
    ]
    records = list(parser.parse(text))
    assert records == []


def test_parse_skyline_csv(db):
    csv_reader = reader.CsvImportReader()
    parser = reader.Parser(csv_reader, layout.SkylineLayout)
    sl = parser.layout()

    with factory.load_test_file("skyline.csv", mode="rt") as file:
        records = list(parser.parse(file))

    # properly merging and summing records
    assert records == [
        sl._start_record(locator="arcA", type_name="A", y=[1]),
        sl._start_record(locator="arcA", type_name="B", y=[2]),
        sl._start_record(locator="arcA", type_name="C", y=[3]),
        sl._start_record(locator="BW1", type_name="A", y=[3]),
        sl._start_record(locator="BW1", type_name="B", y=[2]),
        sl._start_record(locator="BW1", type_name="C", y=[1]),
        sl._start_record(locator="arcA", type_name="D", y=[0]),
    ]


def test_parse_skyline_excel(db):
    xlsx_reader = reader.ExcelImportReader()
    parser = reader.Parser(xlsx_reader, layout.SkylineLayout)
    sl = parser.layout()

    with factory.load_test_file("skyline.xlsx") as file:
        records = list(parser.parse(file))

    # properly merging and summing records
    assert records == [
        sl._start_record(locator="arcA", type_name="A", y=[1]),
        sl._start_record(locator="arcA", type_name="B", y=[2]),
        sl._start_record(locator="arcA", type_name="C", y=[3]),
        sl._start_record(locator="BW1", type_name="A", y=[3]),
        sl._start_record(locator="BW1", type_name="B", y=[2]),
        sl._start_record(locator="BW1", type_name="C", y=[1]),
        sl._start_record(locator="arcA", type_name="D", y=[0]),
    ]


def test_parse_ambr(db):
    xlsx_reader = reader.ExcelImportReader(multisheet=True)
    parser = reader.Parser(xlsx_reader, layout.AmbrLayout)

    with factory.load_test_file("ambr_test_data.xlsx") as file:
        records = list(parser.parse(file))

    assert len(records) == 10
    # check that NaN are skipped, blanks terminate column
    assert len(records[0].x) == 3
    assert len(records[1].x) == 3
    assert len(records[2].x) == 3
    assert len(records[3].x) == 4
    assert len(records[4].x) == 4
    assert len(records[5].x) == 3
    assert len(records[6].x) == 4
    assert len(records[7].x) == 3
    assert len(records[8].x) == 4
    assert len(records[9].x) == 4


def test_ambr_requires_first_row_header(db):
    csv_reader = reader.CsvImportReader()
    parser = reader.Parser(csv_reader, layout.AmbrLayout)
    empty_row = [""]

    with pytest.raises(exceptions.RequiredColumnError):
        consume(parser.parse(empty_row))


def test_ambr_with_unmatched_type(db):
    csv_reader = reader.CsvImportReader()
    parser = reader.Parser(csv_reader, layout.AmbrLayout)
    # custom type + unit
    something = core_factory.GenericTypeFactory(type_name="Something")
    factory.DefaultUnitFactory(measurement_type=something, parser="ambr")
    # missing units type
    core_factory.GenericTypeFactory(type_name="No Units")
    # deliberate duplicated type
    core_factory.GenericTypeFactory(type_name="Duplicate")
    core_factory.GenericTypeFactory(type_name="Duplicate")
    simple_ambr_rows = [
        "Time,Does Not Exist, , ,Time,Something,Time,Duplicate,Time,No Units",
        "   1,             2,3,4,   5,        6,   7,        8,   9,       0",
    ]

    # faking spreadsheet sheet names
    ambr = parser.layout()
    ambr.sheet("assay name")
    records = list(parser.consume_stream(simple_ambr_rows, ambr))
    ambr.finish()

    # only one valid record should return with one x/y point
    assert len(records) == 1
    first = records[0]
    assert len(first.x) == 1
    assert first.x[0] == 5
    assert len(first.y) == 1
    assert first.y[0] == 6


def test_ambr_downsampling(db):
    csv_reader = reader.CsvImportReader()
    parser = reader.Parser(csv_reader, layout.AmbrLayout)
    # custom type + unit
    something = core_factory.GenericTypeFactory(type_name="Something")
    factory.DefaultUnitFactory(measurement_type=something, parser="ambr")
    many_ambr_rows = ["Time,Something,"] + [
        f"{0.25*i},{core_factory.fake.pyfloat(min_value=10.0, max_value=100.0)}"
        for i in range(1234)
    ]

    # faking spreadsheet sheet names
    ambr = parser.layout()
    ambr.sheet("assay name")
    records = list(parser.consume_stream(many_ambr_rows, ambr))
    ambr.finish()

    # confirm ambr layout downsamples to 200 points
    assert len(records) == 1
    first = records[0]
    assert len(first.x) == 200
    assert len(first.y) == 200
