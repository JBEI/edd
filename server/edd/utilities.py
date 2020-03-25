"""
General utility code for EDD, not tied to Django or Celery.
"""

import json
import mimetypes
import re
from datetime import date, datetime
from decimal import Decimal
from uuid import UUID

from dateutil import parser as date_parser
from django.conf import settings
from django.contrib.staticfiles.storage import ManifestStaticFilesStorage
from django.core.exceptions import ValidationError
from django.utils.encoding import force_text
from django.utils.functional import Promise
from django.utils.translation import gettext as _
from kombu.serialization import register

DATETIME = "__datetime__"
TYPE = "__type__"
VALUE = "value"


def guess_extension(mime_type):
    """Given a MIME type string, return a suggested file extension."""
    if not mimetypes.inited:
        mimetypes.init()
    extension = mimetypes.guess_extension(mime_type)
    if extension and extension[0] == ".":
        extension = extension[1:]
    return extension


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
            return {TYPE: DATETIME, VALUE: o.isoformat()}
        elif isinstance(o, Promise):
            return force_text(o)
        return super().default(o)

    @staticmethod
    def dumps(obj):
        return json.dumps(obj, cls=JSONEncoder)


class JSONDecoder(json.JSONDecoder):
    """
    Complement of JSONEncoder, translates encoded datetime objects back to real datetime.
    """

    def __init__(self, *args, **kwargs):
        super().__init__(object_hook=self.object_hook, *args, **kwargs)

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


class StaticFilesStorage(ManifestStaticFilesStorage):
    """
    Exactly the same as ManifestStaticFilesStorage from the Django contrib
    package, except this one optionally changes the manifest file name
    based on the value of STATICFILES_MANIFEST in settings.
    """

    manifest_name = getattr(settings, "STATICFILES_MANIFEST", "staticfiles.json")


# register serializers for JSON that handle UUIDs and datetime objects
register(
    name=getattr(settings, "EDD_SERIALIZE_NAME", "edd-json"),
    encoder=JSONEncoder.dumps,
    decoder=JSONDecoder.loads,
    content_type="application/x-edd-json",
    content_encoding="UTF-8",
)


class LBNLTemplate2Validator:
    """
    Implements LBNL Template 2 Password validation.

    See: https://commons.lbl.gov/display/cpp/Minimum+Security+Requirements
      - Minimum 8 characters
      - 1 lowercase letter
      - 1 uppercase letter
      - 1 number
      - 1 special character
    """

    lower = re.compile(r"[a-z]")
    upper = re.compile(r"[A-Z]")
    digit = re.compile(r"[0-9]")
    special = re.compile(r"[^a-zA-Z0-9]")

    def _checks_fail(self, password):
        yield len(password) < 8
        yield len(self.lower.findall(password)) < 1
        yield len(self.upper.findall(password)) < 1
        yield len(self.digit.findall(password)) < 1
        yield len(self.special.findall(password)) < 1

    def validate(self, password, user=None):
        if any(self._checks_fail(password)):
            raise ValidationError(
                _(
                    "Passwords must be at least 8 characters long, "
                    "with at least one each of: Uppercase, lowercase, "
                    "numeral, and special character."
                )
            )

    def get_help_text(self):
        return _(
            "LBNL requirements specify your password must be "
            "at least 8 characters, with at least one character in each of "
            "Uppercase, lowercase, numeral, and special character."
        )
