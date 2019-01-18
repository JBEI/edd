# coding: utf-8
"""
General utility code for EDD, not tied to Django or Celery.
"""

import json

from datetime import date, datetime
from dateutil import parser as date_parser
from decimal import Decimal
from django.conf import settings
from django.utils.encoding import force_text
from django.utils.functional import Promise
from kombu.serialization import register
from uuid import UUID


DATETIME = '__datetime__'
TYPE = '__type__'
VALUE = 'value'


class JSONEncoder(json.JSONEncoder):
    """
    Enhancement of base JSONEncoder, also handling these objects:
     * datetime.datetime
     * decimal.Decimal
     * uuid.UUID
    """

    def default(self, o):
        if isinstance(o, Decimal):
            return float(o)
        elif isinstance(o, UUID):
            return str(o)
        elif isinstance(o, (date, datetime)):
            return {
                TYPE: DATETIME,
                VALUE: o.isoformat(),
            }
        elif isinstance(o, Promise):
            return force_text(o)
        return super(JSONEncoder, self).default(o)

    @staticmethod
    def dumps(obj):
        return json.dumps(obj, cls=JSONEncoder)


class JSONDecoder(json.JSONDecoder):
    """
    Complement of JSONEncoder, translates encoded datetime objects back to real datetime.
    """

    def __init__(self, *args, **kwargs):
        super(JSONDecoder, self).__init__(object_hook=self.object_hook, *args, **kwargs)

    def object_hook(self, o):
        if TYPE not in o:
            return o
        klass = o[TYPE]
        if klass == DATETIME:
            return date_parser.parse(o[VALUE])
        return o

    @staticmethod
    def loads(text):
        return json.loads(text, cls=JSONDecoder)


# register serializers for JSON that handle UUIDs and datetime objects
register(
    name=getattr(settings, 'EDD_SERIALIZE_NAME', 'edd-json'),
    encoder=JSONEncoder.dumps,
    decoder=JSONDecoder.loads,
    content_type='application/x-edd-json',
    content_encoding='UTF-8',
)
