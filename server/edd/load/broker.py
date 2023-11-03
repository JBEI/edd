import dataclasses
import enum
import functools
import hashlib
import itertools
import json
import logging
import typing
from collections.abc import Iterable
from datetime import timedelta
from uuid import uuid4

from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer
from django.core.files.storage import storages
from django.db import transaction
from django_redis import get_redis_connection

from edd.utilities import JSONDecoder, JSONEncoder
from main import models as edd_models
from main.signals import study_imported

from . import exceptions, lookup, reader
from .layout import Layout, Record

if typing.TYPE_CHECKING:
    from redis import Redis

logger = logging.getLogger(__name__)


@dataclasses.dataclass(eq=False)
class LoadRequest:
    """Submitted information on loading data into EDD via wizard import."""

    class Status(enum.Enum):
        """
        States in processing a payload for data loading.

        Possible values:
        CREATED = initial state, no records ready yet
        ABORTED = end-user requested payload be removed from processing
        FAILED = payload could not be written to the database
        PROCESSED = have some records, either resolved or unresolved
        UPDATING = tasks are actively updating records, converting unresolved to resolved
        SAVING = tasks are actively writing resolved records to database
        COMPLETED = payload has been written to the database
        """

        CREATED = "Created"
        COMPLETED = "Completed"
        ABORTED = "Aborted"
        FAILED = "Failed"
        PROCESSED = "Processed"
        UPDATING = "Updating"
        SAVING = "Saving"

        def __str__(self):
            # this makes it possible to translate to/from redis
            return self.value

    request_uuid: str = dataclasses.field(default_factory=lambda: str(uuid4()))
    study_uuid: str = None
    layout_key: str = None
    protocol_uuid: str = None
    x_units_name: str = None
    y_units_name: str = None
    compartment: str = None
    path: str = None
    mime_type: str = None
    original_name: str = None
    status: Status = Status.CREATED

    def __post_init__(self):
        if isinstance(self.status, str):
            # convert string status to Enum type
            self.status = LoadRequest.Status(self.status)
        if self.compartment is None:
            self.compartment = edd_models.Measurement.Compartment.UNKNOWN

    @staticmethod
    def _connect() -> "Redis":
        return get_redis_connection("default")

    @classmethod
    def _key(cls, uuid):
        # key is fully-qualified classname
        # plus str representation of request UUID
        return f"{__name__}.{cls.__name__}:{str(uuid)}"

    def _subkey(self, sub):
        return f"{self._key(self.request)}:{sub}"

    @classmethod
    def fetch(cls, request_uuid):
        """Fetches the request info from storage."""
        try:
            db = cls._connect()
            values = db.hgetall(cls._key(request_uuid))
            if not values:
                raise exceptions.InvalidLoadRequestError()
            # keys/values will be bytes,
            # have to decode to strings to do **values
            values = {k.decode("utf8"): v.decode("utf8") for k, v in values.items()}
            # adding the request_uuid along with the stored attributes
            values.update(request_uuid=request_uuid)
            return cls(**values)
        except (exceptions.LoadError, exceptions.LoadWarning):
            raise
        except Exception as e:
            raise exceptions.CommunicationError() from e

    @functools.cache
    def db(self) -> "Redis":
        """Creates or retrieves a cached Redis connection."""
        return self._connect()

    # properties

    @property
    def request(self):
        """Token used to identify this LoadRequest."""
        return self.request_uuid

    @property
    def study(self):
        """Queries the Study model object associated with the LoadRequest."""
        return edd_models.Study.objects.get(uuid=self.study_uuid)

    @property
    def layout(self):
        """Fetches the Layout object associated with the LoadRequest."""
        return Layout.get_class(self.layout_key)

    @property
    def protocol(self):
        """Queries the Protocol model object associated with the LoadRequest."""
        return edd_models.Protocol.objects.get(uuid=self.protocol_uuid)

    @property
    def is_process_ready(self):
        """LoadRequest can begin process() call when it has an upload to parse."""
        return self.path is not None

    @property
    def is_interpret_ready(self):
        """
        LoadRequest can begin resolve_tokens() call when there are tokens to
        resolve and no fatal errors.
        """
        try:
            ok_status = self.status == LoadRequest.Status.PROCESSED
            has_tokens = self.db().scard(self._subkey("tokens")) > 0
            return ok_status and has_tokens
        except Exception:
            return False

    @property
    def is_save_ready(self):
        return self.status is LoadRequest.Status.SAVING

    @property
    def is_upload_ready(self):
        """LoadRequest can begin upload() call when it has category, protocol, and layout."""
        return self.protocol_uuid and self.layout_key

    @property
    def progress(self):
        try:
            db = self.db()
            return {
                "added": db.zscore(self._subkey("saving"), "added"),
                "resolved": db.llen(self._subkey("resolved")),
                "status": str(self.status),
                "tokens": db.scard(self._subkey("tokens")),
                "unresolved": db.llen(self._subkey("unresolved")),
                "updated": db.zscore(self._subkey("saving"), "updated"),
            }
        except Exception as e:
            raise exceptions.CommunicationError() from e

    # actions

    def check_study(self, study):
        """Validates that the Study object matches this LoadRequest."""
        if str(study.uuid) != self.study_uuid:
            raise exceptions.InvalidLoadRequestError()

    def commit(self, user):
        self._precommit()
        writer = DatabaseWriter(self, user)
        update = edd_models.Update.fake_request(
            user=user,
            path=f"!edd.load.wizard!{self.request_uuid}",
        )
        db = self.db()
        key = self._subkey("resolved")
        try:
            with transaction.atomic(savepoint=True), update:
                start = 0
                # redis range is inclusive, call will return 100 items
                while raw := db.lrange(key, start, start + 99):
                    batch = [Record(**json.loads(r, cls=JSONDecoder)) for r in raw]
                    start += 100
                    added, updated = writer.persist_batch(batch)
                    self._save_count_update(added, updated)
                    self.send_update()
                self._postcommit(user)
            db.delete(key)
        except Exception as e:
            logger.error("failed commit", exc_info=e)
            self.transition(LoadRequest.Status.FAILED)

    def form_payload_restore(self, payload_key):
        try:
            self.db().get(payload_key)
            return json.loads(self.db().get(payload_key), cls=JSONDecoder)
        except Exception as e:
            raise exceptions.CommunicationError() from e

    def form_payload_save(self, payload):
        try:
            payload = json.dumps(payload, cls=JSONEncoder).encode("utf8")
            hash_object = hashlib.sha256(payload)
            payload_key = self._subkey(hash_object.hexdigest()[:16])
            self.db().set(payload_key, payload)
            return payload_key
        except Exception as e:
            raise exceptions.CommunicationError() from e

    def ok_to_process(self) -> bool:
        ok_status = self.status in (self.Status.CREATED, self.Status.PROCESSED)
        return ok_status and self.transition(self.Status.UPDATING)

    def ok_to_save(self) -> bool:
        ok_status = self.status == self.Status.PROCESSED
        return ok_status and self.transition(self.Status.SAVING, reset_save_count=True)

    def open(self):
        try:
            if self.mime_type and self.mime_type[:5] == "text/":
                return self._storage().open(self.path, mode="rt")
            return self._storage().open(self.path)
        except Exception as e:
            raise exceptions.CommunicationError() from e

    def process(self, records, user):
        resolver = lookup.Resolver(load=self, user=user)
        # ensure we're working with an iter_ATOR_
        # the while loop becomes an infinite loop when `records` is an iter_ABLE_
        records = iter(records)
        try:
            self._preprocessing()
            while batch := tuple(itertools.islice(records, 100)):
                self.resolve_batch(batch, resolver)
            self._postprocessing()
        except (exceptions.LoadError, exceptions.LoadWarning):
            raise
        except Exception as e:
            raise exceptions.CommunicationError() from e

    def read(self) -> Iterable["Record"]:
        parser = reader.Parser(
            self._build_reader(),
            self.layout,
            load_uuid=self.request_uuid,
        )
        with self.open() as file:
            yield from parser.parse(file)

    def resolve_batch(self, batch: Iterable["Record"], resolver) -> None:
        """Resolve a batch of Record objects to database identifiers."""
        failed: set[str] = set()
        matched: list[Record] = []
        unmatched: list[Record] = []
        for record in batch:
            if result := record.resolve(resolver):
                unmatched.append(record)
                failed.update(result)
            else:
                matched.append(record)
        with self.db().pipeline() as pipe:
            pipe.multi()
            if matched:
                matched = [json.dumps(r.__dict__, cls=JSONEncoder) for r in matched]
                pipe.rpush(self._subkey("resolved"), *matched)
            if unmatched:
                unmatched = [json.dumps(r.__dict__, cls=JSONEncoder) for r in unmatched]
                pipe.rpush(self._subkey("unresolved"), *unmatched)
            if failed:
                pipe.sadd(self._subkey("tokens"), *failed)
            pipe.execute()
        self.send_update()

    def resolve_tokens(self, tokens_form):
        try:
            self._preprocessing()
            db = self.db()
            # remove tokens the form claims to resolve
            db.srem(self._subkey("tokens"), *tokens_form.raw_tokens)
            # move aside current unresolved list
            db.rename(self._subkey("unresolved"), self._subkey("scratch"))
            # pop items from unresolved_records in a loop
            while batch := db.lpop(self._subkey("scratch"), 100):
                records = [Record(**json.loads(r, cls=JSONDecoder)) for r in batch]
                self.resolve_batch(records, tokens_form)
            # clean up the scratch key
            db.delete(self._subkey("scratch"))
            self._postprocessing()
        except Exception as e:
            raise exceptions.CommunicationError() from e

    def retire(self):
        """Retires the request info, removing from storage."""
        try:
            self._delete_file()
            self.db().delete(self._key(self.request))
            for key in self.db().scan_iter(self._subkey("*")):
                self.db().delete(key)
        except Exception as e:
            raise exceptions.CommunicationError() from e

    def send_update(self):
        channel_layer = get_channel_layer()
        send = async_to_sync(channel_layer.group_send)
        update = {"type": "update", **self.progress}
        send(f"edd.load.{self.request_uuid}", update)

    def sort_tokens(self):
        """
        When building set of unresolved tokens in a LoadRequest, they are
        unordered. When presenting them to be resolved, they should be ordered;
        this method saves the tokens into an ordered list.
        """
        unordered_key = self._subkey("tokens")
        ordered_key = self._subkey("tokenlist")
        db = self.db()
        # sort the tokens
        tokens = sorted(db.smembers(unordered_key))
        with db.pipeline() as pipe:
            pipe.multi()
            pipe.delete(ordered_key)
            if tokens:
                pipe.rpush(ordered_key, *tokens)
            pipe.execute()

    def store(self):
        """Stores the request info by its ID for one week."""
        try:
            with self.db().pipeline() as pipe:
                key = self._key(self.request)
                for k, v in self._store_values().items():
                    pipe.hset(key, k, v)
                pipe.expire(key, timedelta(weeks=1))
                pipe.execute()
        except Exception as e:
            raise exceptions.CommunicationError() from e

    def transition(
        self,
        new_status: "LoadRequest.Status",
        raise_errors=False,
        reset_save_count=False,
    ):
        """
        Transitions the LoadRequest to the new_status provided.

        :param new_status: the desired status
        :returns: True only if the transition completed successfully
        """
        try:
            key = self._key(self.request)
            with self.db().pipeline(transaction=True) as pipe:
                # using watch() for optimistic locking
                pipe.watch(key)
                # don't transition if status in backend does not match
                current_status = pipe.hget(key, "status")
                if current_status == str(self.status).encode("utf8"):
                    pipe.multi()
                    pipe.hset(key, "status", str(new_status))
                    if reset_save_count:
                        pipe.delete(self._subkey("saving"))
                    pipe.execute()
                    self.status = new_status
                    return True
                # execute() will unset watch,
                # but it might not run,
                # and we're done watching
                pipe.unwatch()
        except Exception as e:
            logger.info(f"Transition failed: {e!r}")
            if raise_errors:
                raise exceptions.FailedTransitionError(
                    begin=str(self.status),
                    end=str(new_status),
                ) from e
        return False

    def unresolved_tokens(self, start: int, end: int):
        try:
            # Redis lrange is inclusive, take one off end to match Python
            return self.db().lrange(self._subkey("tokenlist"), start, end - 1)
        except Exception as e:
            raise exceptions.CommunicationError() from e

    def upload(self, files_payload, default_mime="application/octet-stream"):
        """
        Note, files_payload should be the Django request FILES attribute.
        """
        if file := files_payload.get("file", None):
            try:
                # reset status
                self.transition(self.Status.CREATED)
                # clear out previous failed, matched, unmatched
                self._clear_resolved()
                # clean up any existing file(s)
                self._delete_file()
                # write to storage
                self.path = self._storage().save(self._create_path(), file)
                self.mime_type = getattr(file, "content_type", default_mime)
                self.original_name = getattr(file, "name", None)
                self.store()
                return True
            except Exception as e:
                logger.exception("Could not upload LoadRequest file", exc_info=e)
        return False

    def _build_reader(self):
        csv = "text/csv"
        excel = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        if self.mime_type == csv:
            return reader.CsvImportReader()
        elif self.mime_type == excel:
            # TODO: when would multisheet need to be off?
            return reader.ExcelImportReader(multisheet=True)
        raise exceptions.UnsupportedMimeTypeError(
            mime_type=self.mime_type,
            supported=[csv, excel],
        )

    def _clear_resolved(self):
        self.db().delete(
            self._subkey("resolved"),
            self._subkey("unresolved"),
            self._subkey("tokens"),
        )

    def _create_path(self):
        # path is first namespaced to load,
        # then further namespace with first two UUID characters (a la git)
        # fill out with remainder of UUID
        return f"load/{self.request_uuid[:2]}/{self.request_uuid[2:]}"

    def _delete_file(self):
        if self.path:
            try:
                self._storage().delete(self.path)
            except Exception as e:
                logger.warning(f"Failed to cleanup file {self.path}", exc_info=e)
            self.path = None
            self.mime_type = None
            self.original_name = None

    def _postcommit(self, user):
        self.transition(self.Status.COMPLETED, raise_errors=True)
        self.send_update()
        lines = edd_models.Line.objects.filter(
            assay__protocol=self.protocol,
            assay__updated_id=self.study.updated_id,
            study=self.study,
        )
        study_imported.send(
            count=lines.distinct().count(),
            protocol=self.protocol,
            sender=LoadRequest,
            study=self.study,
            user=user,
        )

    def _postprocessing(self):
        self.sort_tokens()
        self.transition(LoadRequest.Status.PROCESSED, raise_errors=True)
        self.send_update()

    def _precommit(self):
        if self.status != self.Status.SAVING:
            raise exceptions.ResolveError()

    def _preprocessing(self):
        if self.status != self.Status.UPDATING:
            raise exceptions.ResolveError()

    def _save_count_update(self, added, updated):
        db = self.db()
        key = self._subkey("saving")
        db.zincrby(key, added, "added")
        db.zincrby(key, updated, "updated")

    def _storage(self):
        return storages["edd.load"]

    def _store_values(self):
        # get only the original field names
        fields = {f.name for f in dataclasses.fields(self.__class__)}
        # filter out anything else that may have been set
        return {k: str(v) for k, v in self.__dict__.items() if k in fields and v}


class DatabaseWriter:
    def __init__(self, load, user):
        self.compartment = load.compartment
        self.protocol_id = load.protocol.pk
        self.study_id = load.study.pk
        self.user = user
        self.update = edd_models.Update.load_update()
        # optimization: if study has no assays with current protocol, just do inserts
        self.quick_insert = edd_models.Assay.objects.filter(
            study_id=self.study_id,
            protocol_id=self.protocol_id,
        ).exists()

    def persist_batch(self, batch: Iterable["Record"]) -> tuple[int, int]:
        # find existing assay records
        assay_ids = {r.assay_id for r in batch}
        queryset = edd_models.Assay.objects.filter(
            active=True,
            protocol_id=self.protocol_id,
            study_id=self.study_id,
        )
        existing_assays = queryset.in_bulk(assay_ids)
        # store measurements
        total_added = 0
        total_updated = 0
        for record in batch:
            if assay := existing_assays.get(record.assay_id, None):
                if self._write_measurement(assay, record):
                    total_added += 1
                else:
                    total_updated += 1
            else:
                logger.warning(f"No existing assay found for {record}")
        return total_added, total_updated

    def _write_measurement(self, assay, record) -> bool:
        find = {
            "active": True,
            "compartment": self.compartment,
            "measurement_type_id": record.type_id,
            "measurement_format": record.shape,
            "x_units_id": record.x_unit_id,
            "y_units_id": record.y_unit_id,
        }
        # need to fill in everything here, the previous filter() doesn't apply to get_or_create()
        defaults = {
            "assay_id": assay.id,
            "experimenter": self.user,
            "study_id": assay.study_id,
            **find,
        }
        if self.quick_insert:
            measurement = assay.measurement_set.create(**defaults)
            return self._write_value(assay, measurement, record, True)
        qs = assay.measurement_set.filter(**find)
        measurement, created = qs.get_or_create(defaults=defaults)
        return self._write_value(assay, measurement, record, created)

    def _write_value(self, assay, measurement, record, is_new):
        find = {
            "study_id": assay.study_id,
            "x": record.x,
        }
        defaults = {
            "updated": self.update,
            "y": record.y,
            **find,
        }
        if is_new:
            measurement.measurementvalue_set.create(**defaults)
            return True
        _, created = measurement.measurementvalue_set.update_or_create(
            defaults=defaults,
            **find,
        )
        return created
