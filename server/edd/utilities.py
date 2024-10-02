"""General utility code for EDD."""

import enum
import functools
import hashlib
import json
import re
import typing
import warnings
from datetime import date, datetime, timedelta
from decimal import Decimal
from uuid import UUID, uuid4

from dateutil import parser as date_parser
from django.conf import settings
from django.contrib.staticfiles import storage
from django.core.exceptions import ValidationError
from django.urls import reverse
from django.utils.encoding import force_str
from django.utils.functional import Promise
from django.utils.translation import gettext as _
from django_redis import get_redis_connection
from storages.backends import s3boto3

if typing.TYPE_CHECKING:
    from redis import Redis

DATETIME = "__datetime__"
TYPE = "__type__"
VALUE = "value"


def add_form_validation_classes(form):
    """Use in form clean() methods. Adds Bootstrap 5 `is-invalid` classes to failed fields."""
    for fieldname in form.errors:
        widget = form[fieldname].field.widget
        if klass := widget.attrs.get("class", None):
            widget.attrs["class"] = klass + " is-invalid"
        else:
            widget.attrs["class"] = "is-invalid"


def ws_reverse(url_name, *args, **kwargs):
    return reverse(url_name, urlconf=settings.WEBSOCKET_URLCONF, *args, **kwargs)


class JSONEncoder(json.JSONEncoder):
    """
    Enhancement of base JSONEncoder, also handling these objects:
     * datetime.datetime
     * decimal.Decimal
     * uuid.UUID
     * set
    """

    def default(self, o):
        if isinstance(o, Decimal):
            return float(o)
        elif isinstance(o, UUID):
            return str(o)
        elif isinstance(o, (date, datetime)):
            return {TYPE: DATETIME, VALUE: o.isoformat()}
        elif isinstance(o, Promise):
            return force_str(o)
        elif isinstance(o, set):
            return list(o)
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
        match o:
            case {"__type__": "__datetime__", "value": v}:
                return date_parser.parse(v)
            case _:
                return o

    @staticmethod
    def loads(text):
        return json.loads(text, cls=JSONDecoder)


class S3MediaStorage(s3boto3.S3Boto3Storage):
    """Stores media/upload files using the S3 API."""

    location = "media"


class S3PrivateStorage(s3boto3.S3Boto3Storage):
    """Stores media/upload files that will not need anonymous access using S3 API."""

    location = "private"


class HashManifestFilesMixin(storage.ManifestFilesMixin):
    """
    Overrides the hashed_name function of ManifestFilesMixin so that "missing"
    files emit a warning instead of crashing Django startup.
    """

    def hashed_name(self, name, content=None, filename=None):
        try:
            return super().hashed_name(name, content, filename)
        except ValueError as e:
            warnings.warn(f"Skipping hash: {e}")
            return name


class S3StaticStorage(HashManifestFilesMixin, s3boto3.S3Boto3Storage):
    """
    Uses Django Manifest storage combined with S3 storage. Static files are
    saved with a hash in the name, recorded in a manifest file. The backing
    storage is a bucket using the S3 API, instead of the filesystem.
    """

    location = "static"
    manifest_name = getattr(settings, "STATICFILES_MANIFEST", "staticfiles.json")


class StaticFilesStorage(HashManifestFilesMixin, storage.ManifestStaticFilesStorage):
    """
    Exactly the same as ManifestStaticFilesStorage from the Django contrib
    package, except this one optionally changes the manifest file name
    based on the value of STATICFILES_MANIFEST in settings.
    """

    manifest_name = getattr(settings, "STATICFILES_MANIFEST", "staticfiles.json")


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


class Sentinel(enum.Enum):
    token = 0


MISSING = Sentinel.token


class HasRequest[R](typing.Protocol):
    request: "RecordRequest[R]"

    def __init__(self, request: "RecordRequest[R]", *args, **kwargs): ...


class RecordCache[R]:
    """
    Interface to handle retreiving and storing arbitrary JSON-serializable
    record objects in the cache (Redis). This object is a factory for a
    "session" RecordRequest object that implements the actual cache storage,
    namespaced to a generated UUID per-request.
    """

    def __init__(self, request_class: type, record_class: type[R]):
        self.prefix = f"{request_class.__module__}.{request_class.__name__}"
        self.record_class = record_class

    def _connect(self) -> "Redis":
        return get_redis_connection("default")

    def build_record(self, raw_bytes) -> R:
        return self.record_class(**json.loads(raw_bytes, cls=JSONDecoder))

    def request(self, uuid: UUID | str | Sentinel = MISSING) -> "RecordRequest[R]":
        if uuid is MISSING:
            uuid = uuid4()
        return RecordRequest[R](self, uuid)


class RecordRequest[R]:
    """
    Implements cache read/write operations for dealing with JSON-serializable
    record objects and associated metadata. There are six main pieces of data
    handled: counter, meta, payload, resolved, tokens, and unresolved.

    The 'counter' data tracks the counts of actions to track as part of the
    processing of records. e.g. number of database rows inserted.

    Any key-value metadata dealing with the collection of records is handled
    with 'meta'. e.g. study UUID, file path to temporary data.

    Use 'payload' data to cache temporary data, such as form payloads.

    The 'resolved' and 'unresolved' data are lists of record objects, that are
    ready to save to the database, and not, respectively.

    Finally, 'token' data are lists of strings indicating items that need to be
    updated with further information to transition records from unresolved.
    """

    def __init__(self, cache: RecordCache[R], uuid: UUID | str):
        self.cache = cache
        self.uuid = uuid

    @functools.cache
    def _db(self) -> "Redis":
        return self.cache._connect()

    @functools.cache
    def _key(self) -> str:
        return f"{self.cache.prefix}:{str(self.uuid)}"

    @functools.cache
    def _subkey(self, sub: str) -> str:
        return f"{self._key()}:{sub}"

    @functools.cache
    def _ttl(self):
        return timedelta(weeks=1)

    def counter_tick(self, name: str, ticks: int) -> typing.Self:
        db = self._db()
        key = self._subkey("counter")
        db.zincrby(key, ticks, name)
        db.expire(key, self._ttl())
        return self

    def counter_value(self, name: str) -> int:
        db = self._db()
        key = self._subkey("counter")
        return db.zscore(key, name)

    def expire(self) -> None:
        db = self._db()
        # expire allows some time for progress bar to display
        t = timedelta(minutes=1)
        db.expire(self._key(), t)
        for key in db.scan_iter(self._subkey("*")):
            db.expire(key, t)

    def meta_fetch(self) -> dict:
        db = self._db()
        values = db.hgetall(self._key())
        # keys/values will be bytes, need to decode to str
        return {k.decode("utf8"): v.decode("utf8") for k, v in values.items()}

    def meta_stash(self, meta: dict) -> typing.Self:
        db = self._db()
        key = self._key()
        db.hset(key, mapping=meta)
        db.expire(key, self._ttl())
        return self

    def meta_update_atomic(self, key: str, value: str, expect: str) -> bool:
        db = self._db()
        meta = self._key()
        with db.pipeline(transaction=True) as pipe:
            # using watch() for optimistic locking
            pipe.watch(meta)
            # don't update if current value does not match expected value
            current = pipe.hget(meta, key)
            if current != expect.encode("utf8"):
                return False
            pipe.multi()
            pipe.hset(meta, key, value)
            pipe.expire(meta, self._ttl())
            pipe.execute()
            return True

    def payload_fetch(self, payload_key: str) -> bytes:
        db = self._db()
        key = self._subkey(payload_key)
        return db.get(key)

    def payload_stash(self, payload: bytes) -> str:
        hasher = hashlib.sha256(payload)
        payload_key = hasher.hexdigest()[:16]
        db = self._db()
        key = self._subkey(payload_key)
        db.set(key, payload)
        db.expire(key, self._ttl())
        return payload_key

    def resolved(self) -> typing.Generator[R, None, None]:
        db = self._db()
        key = self._subkey("resolved")
        start = 0
        # redis range is inclusive, call will return 100 items
        while raw := db.lrange(key, start, start + 99):
            yield from [self.cache.build_record(r) for r in raw]
            start += len(raw)

    def resolved_add(self, *resolved: R) -> typing.Self:
        db = self._db()
        key = self._subkey("resolved")
        serialized = [json.dumps(r.__dict__, cls=JSONEncoder) for r in resolved]
        if serialized:
            db.rpush(key, *serialized)
            db.expire(key, self._ttl())
        return self

    def resolved_clear(self) -> typing.Self:
        self._db().delete(self._subkey("resolved"))
        return self

    def resolved_length(self) -> int:
        return self._db().llen(self._subkey("resolved"))

    def tokens(
        self,
        start: int | None = None,
        end: int | None = None,
    ) -> typing.Generator[str, None, None]:
        db = self._db()
        tokens = sorted(db.smembers(self._subkey("tokens")))
        yield from tokens[start:end]

    def tokens_add(self, *tokens: str) -> typing.Self:
        db = self._db()
        key = self._subkey("tokens")
        if tokens:
            db.sadd(key, *tokens)
            db.expire(key, self._ttl())
        return self

    def tokens_clear(self) -> typing.Self:
        self._db().delete(self._subkey("tokens"))
        return self

    def tokens_length(self) -> int:
        return self._db().scard(self._subkey("tokens"))

    def tokens_remove(self, *tokens: str) -> typing.Self:
        db = self._db()
        key = self._subkey("tokens")
        db.srem(key, *tokens)
        return self

    def unresolved(self) -> typing.Generator[R, None, None]:
        db = self._db()
        # may add new unresolved items while iterating, so move aside the list
        key = self._subkey("scratch")
        db.rename(self._subkey("unresolved"), key)
        # pop in batches and yield
        while batch := db.lpop(key, 99):
            yield from [self.cache.build_record(r) for r in batch]
        # clean up now empty list
        db.delete(key)

    def unresolved_add(self, *unresolved: R) -> typing.Self:
        db = self._db()
        key = self._subkey("unresolved")
        serialized = [json.dumps(r.__dict__, cls=JSONEncoder) for r in unresolved]
        if serialized:
            db.rpush(key, *serialized)
            db.expire(key, self._ttl())
        return self

    def unresolved_clear(self) -> typing.Self:
        self._db().delete(self._subkey("unresolved"))
        return self

    def unresolved_length(self) -> int:
        return self._db().llen(self._subkey("unresolved"))
