import collections
import io

import pytest

from ..exceptions import SetupException
from ..lookup import Resolver
from ..parser import Parser, Record


def consume(iterable):
    """
    Helper function that runs through an entire iterable, i.e. consume a generator.
    """
    collections.deque(iterable, maxlen=0)


def test_parse_empty_csv_file(db):
    parser = Parser("text/csv")
    empty = io.StringIO()
    result = list(parser.parse(empty))

    assert len(result) == 0


def test_parse_unknown_file(db):
    parser = Parser("image/jpeg")
    file = io.BytesIO()

    with pytest.raises(SetupException):
        consume(parser.parse(file))


def test_parse_no_line_name_column_csv_file(db):
    parser = Parser("text/csv")
    text = [
        "Part ID,Shaking Speed",
    ]
    result = list(parser.parse(text))

    assert len(result) == 0


def test_parse_no_line_name_value_csv_file(db):
    parser = Parser("text/csv")
    text = [
        "Line Name,Part ID,Shaking Speed",
        ",ICE-9,90rpm,",
    ]
    result = list(parser.parse(text))

    assert len(result) == 0


def test_parse_header_only_csv_file(db):
    parser = Parser("text/csv")
    text = [
        "Line Name,Part ID,Shaking Speed",
    ]
    result = list(parser.parse(text))

    assert len(result) == 0


def test_parse_single_record_csv_file(db):
    parser = Parser("text/csv")
    text = [
        "Line Name,Part ID,,Shaking Speed",
        "A,ICE-9,ignored column,90rpm,more ignored",
    ]
    result = list(parser.parse(text))

    assert result == [
        Record(
            meta=[{"name": "Shaking Speed", "uuid": None, "value": "90rpm"}],
            name="A",
            strain=[{"name": "ICE-9", "uuids": None}],
        )
    ]


def test_parse_bad_replicate_csv_file(db):
    parser = Parser("text/csv")
    text = [
        "Line Name,replicate",
        "A,not-a-number",
        "B,3",
    ]
    result = list(parser.parse(text))

    assert result == [Record(name="A"), Record(name="B", replicates=3)]


def test_parse_file_with_multiple_empty_rows_at_end(db):
    parser = Parser("text/csv")
    text = [
        "Line Name,Part ID,,Shaking Speed",
        "A,ICE-9,ignored column,90rpm,more ignored",
        ",,,,,,",
        ",,,,,,",
        "",
        ",,,,,,",
    ]
    result = list(parser.parse(text))

    assert result == [
        Record(
            meta=[{"name": "Shaking Speed", "uuid": None, "value": "90rpm"}],
            name="A",
            strain=[{"name": "ICE-9", "uuids": None}],
        )
    ]


def test_parse_row_without_a_name_skips_record(db):
    parser = Parser("text/csv")
    text = [
        "Line Name,",
        # this row doesn't have required line name
        ",",
        "A,",
    ]
    result = list(parser.parse(text))

    assert result == [Record(name="A")]


def test_parse_row_with_empty_metadata(db):
    parser = Parser("text/csv")
    text = [
        "Line Name,,,Shaking Speed",
        # leaving metadata column empty
        "A,,,,",
    ]
    result = list(parser.parse(text))

    assert result == [Record(name="A")]


def test_parse_row_with_empty_strain(db):
    parser = Parser("text/csv")
    text = [
        "Line Name,Part ID",
        "A,,",
        "B,ICE-9,",
    ]
    result = list(parser.parse(text))

    assert result == [
        Record(name="A"),
        Record(name="B", strain=[{"name": "ICE-9", "uuids": None}]),
    ]


def test_parse_excel_file(db, dir_of_test_files):
    parser = Parser("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
    with open(dir_of_test_files / "simple.xlsx", "rb") as f:
        result = list(parser.parse(f))

    assert len(result) == 2


def test_resolve_metadata_by_name(db, edd_user):
    resolver = Resolver(user=edd_user)
    meta = resolver.metatype_from_name("Time")
    assert meta.type_name == "Time"


def test_resolve_metadata_by_uuid(db, edd_user):
    resolver = Resolver(user=edd_user)
    meta = resolver.metatype_from_uuid("6629231d-4ef0-48e3-a21e-df8db6dfbb72")
    assert meta.type_name == "Time"


def test_resolve_metadata_unknown_name(db, edd_user):
    resolver = Resolver(user=edd_user)
    meta = resolver.metatype_from_name("Random garbage")
    assert meta is None


def test_resolve_metadata_unknown_uuid(db, edd_user):
    resolver = Resolver(user=edd_user)
    meta = resolver.metatype_from_uuid("Random garbage")
    assert meta is None


def test_resolve_metadata_caches_results(db, edd_user, django_assert_num_queries):
    resolver = Resolver(user=edd_user)
    # calling multiple times will not generate more queries
    with django_assert_num_queries(2):
        resolver.metatype_from_name("Media")
        resolver.metatype_from_uuid("463546e4-a67e-4471-a278-9464e78dbc9d")
        resolver.metatype_from_name("Media")
        resolver.metatype_from_uuid("463546e4-a67e-4471-a278-9464e78dbc9d")


def test_resolve_protocol_always_none(db, edd_user):
    resolver = Resolver(user=edd_user)
    protocol = resolver.protocol_id_from_name("")
    assert protocol is None
