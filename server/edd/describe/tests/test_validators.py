from jsonschema import Draft4Validator

from ..validators import SCHEMA as JSON_SCHEMA


def test_json_schema_valid():
    Draft4Validator.check_schema(JSON_SCHEMA)
