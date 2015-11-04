import json
from datetime import datetime
from dateutil import parser

EXTENDED_JSON_CONTENT_TYPE = 'edd-json'
_TYPE = '__type__'
_VALUE = 'value'
_DATE_TIME_TYPE = '__datetime__'


class DateTimeEncoder(json.JSONEncoder):
    """
    Defines a simple JSON encoder for Python datetime objects. Allows non-datetime objects to pass
    through and use the default JSON serialization, which doesn't support datetime objects.
    """
    def default(self, obj):
        if isinstance(obj, datetime):
            return {
                _TYPE: _DATE_TIME_TYPE,
                _VALUE: obj.isoformat()
            }
        else:
            return json.JSONEncoder.default(self, obj)


def datetime_decoder(dict):
    if (_TYPE in dict) and (dict[_TYPE] == _DATE_TIME_TYPE):
        return parser.parse(dict[_VALUE])
    return dict


def datetime_dumps(dict):
    return json.dumps(dict, cls=DateTimeEncoder)


def datetime_loads(dict):
    return json.loads(dict, object_hook=datetime_decoder)
