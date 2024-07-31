import dataclasses
import enum
import functools
import hashlib
import itertools
import json
import logging
import typing
from collections.abc import Iterable
from contextlib import contextmanager
from datetime import timedelta
from uuid import UUID, uuid4

from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer
from django.core.files.storage import Storage, storages
from django.db import transaction
from django.utils.translation import gettext_lazy as _
from django_redis import get_redis_connection

from edd.utilities import JSONDecoder, JSONEncoder
from main import models as edd_models
from main.signals import study_described

from .exceptions import SetupException
from .forms import ResolveTokensForm
from .lookup import Resolver
from .parser import MetaInfo, Parser, Record, RecordResolver

if typing.TYPE_CHECKING:
    from django.contrib.auth.models import AbstractUser
    from redis import Redis

    RequestKey: typing.TypeAlias = str
    User: typing.TypeAlias = AbstractUser

logger = logging.getLogger(__name__)


class SavedProgress(typing.TypedDict):
    assays: int
    lines: int
    records: int


class SetupProgress(typing.TypedDict):
    resolved: int
    saved: SavedProgress
    status: str
    tokens: int
    unresolved: int


@dataclasses.dataclass(eq=False)
class SetupRequest:
    """Submitted information for EDD Experiment Setup."""

    class Status(enum.Enum):
        """
        CREATED = initial state, no file uploaded
        READY = ready to add or update records
        UPDATING = adding or updating processed records
        SAVING = converting cache records to database records
        DONE = done
        """

        CREATED = "Created"
        READY = "Ready"
        UPDATING = "Updating"
        SAVING = "Saving"
        DONE = "Done"
        FAILED = "Failed"

        def __str__(self):
            # this makes it possible to translate to/from redis
            return self.value

    study_uuid: str
    request_uuid: str = dataclasses.field(default_factory=lambda: str(uuid4()))
    path: str | None = None
    mime_type: str | None = None
    original_name: str | None = None
    status: Status = Status.CREATED

    # internal init API

    def __post_init__(self):
        if isinstance(self.status, str):
            # convert string status to Enum type
            self.status = SetupRequest.Status(self.status)

    @staticmethod
    def _connect() -> "Redis":
        return get_redis_connection("default")

    @classmethod
    def _expire(cls):
        return timedelta(weeks=1)

    @classmethod
    def _key(cls, uuid: UUID | str) -> "RequestKey":
        # key is fully-qualified classname
        # plus str representation of request UUID
        return f"{__name__}.{cls.__name__}:{str(uuid)}"

    def _subkey(self, sub: str) -> "RequestKey":
        return f"{self._key(self.request_uuid)}:{sub}"

    @classmethod
    def fetch(cls, request_uuid: UUID | str) -> typing.Self:
        """Fetches the request info from storage."""
        try:
            db = cls._connect()
            values = db.hgetall(cls._key(request_uuid))
            if not values:
                raise SetupException(_("Setup details not found"))
            # keys/values will be bytes,
            # have to decode to strings to do **values
            values = {k.decode("utf8"): v.decode("utf8") for k, v in values.items()}
            # adding the request_uuid along with the stored attributes
            values.update(request_uuid=request_uuid)
            return cls(**values)
        except SetupException:
            raise
        except Exception as e:
            raise SetupException(_("Error loading setup details")) from e

    # public API

    def check_study(self, study: edd_models.Study) -> typing.Self:
        """Validates that the Study object matches this request."""
        if str(study.uuid) != self.study_uuid:
            raise SetupException(_("Setup details not found for this Study."))
        return self

    def commit(self, user: "User") -> typing.Self:
        writer = DatabaseWriter(self, user)
        update = edd_models.Update.fake_request(
            user=user,
            path=f"!edd.setup!{self.request_uuid}",
        )
        db = self._db()
        key = self._subkey("resolved")
        try:
            with transaction.atomic(savepoint=True), update:
                start = 0
                # redis range is inclusive, call will return 100 items
                while raw := db.lrange(key, start, start + 99):
                    batch = [Record(**json.loads(r, cls=JSONDecoder)) for r in raw]
                    start += len(batch)
                    line_count, assay_count = writer.persist_batch(batch)
                    self._save_counts(len(batch), line_count, assay_count)
                    self.send_update()
                self._postcommit(user)
            db.delete(key)
        except Exception as e:
            raise SetupException() from e
        return self

    def form_payload_fetch(self, payload_key):
        try:
            subkey = self._subkey(payload_key)
            return json.loads(self._db().get(subkey), cls=JSONDecoder)
        except Exception as e:
            raise SetupException() from e

    def form_payload_stash(self, payload):
        try:
            payload_json = json.dumps(payload, cls=JSONEncoder).encode("utf8")
            hasher = hashlib.sha256(payload_json)
            payload_key = hasher.hexdigest()[:16]
            db = self._db()
            key = self._subkey(payload_key)
            db.set(key, payload_json)
            db.expire(key, self._expire())
            return payload_key
        except Exception as e:
            raise SetupException() from e

    def get_unresolved_tokens_range(self, start: int, end: int) -> Iterable[str]:
        try:
            # Redis lrange is inclusive, take one off end to match Python
            return self._db().lrange(self._subkey("tokenlist"), start, end - 1)
        except Exception as e:
            raise SetupException() from e

    def is_process_ready(self) -> bool:
        """Request can begin process() call when it has an upload to parse."""
        return self.status == SetupRequest.Status.READY

    @contextmanager
    def lock_status(self, *, active, failed, success, expect=None):
        try:
            self.transition(new_status=active, expect=expect)
            yield
            self.transition(new_status=success, expect=active)
        except Exception:
            self.transition(new_status=failed)

    def open(self) -> typing.IO:
        try:
            if self.mime_type and self.mime_type[:5] == "text/":
                return self._storage().open(self.path, mode="rt")
            return self._storage().open(self.path)
        except Exception as e:
            raise SetupException(_("Error reading uploaded file")) from e

    def process_form(self, tokens_form: ResolveTokensForm) -> typing.Self:
        try:
            db = self._db()
            # remove tokens the form claims to resolve
            db.srem(self._subkey("tokens"), *tokens_form.raw_tokens)
            # move aside current unresolved list
            db.rename(self._subkey("unresolved"), self._subkey("scratch"))
            # get resolver from form
            resolver = tokens_form.get_resolver()
            # pop items from unresolved list in a loop
            while batch := db.lpop(self._subkey("scratch"), 100):
                records = [Record(**json.loads(r, cls=JSONDecoder)) for r in batch]
                self._process_record_batch(records, resolver)
            # clean up list that should now be empty
            db.delete(self._subkey("scratch"))
            # sort tokens so next form can maintain consistent ordering
            self._sort_tokens()
        except Exception as e:
            raise SetupException() from e
        return self

    def process_payload(self, payload: Iterable[Record], user: "User") -> typing.Self:
        resolver = Resolver(user=user)
        # need an iterator for the while loop
        records = iter(payload)
        while batch := tuple(itertools.islice(records, 100)):
            self._process_record_batch(batch, resolver)
        self._sort_tokens()
        return self

    def process_upload(self, user: "User") -> typing.Self:
        parser = Parser(self.mime_type)
        with self.open() as file:
            return self.process_payload(parser.parse(file), user)

    @property
    def progress(self) -> SetupProgress:
        try:
            db = self._db()
            saving = self._subkey("saving")
            return {
                "resolved": self.records_resolved,
                "saved": {
                    "assays": db.zscore(saving, "assays"),
                    "lines": db.zscore(saving, "lines"),
                    "records": db.zscore(saving, "records"),
                },
                "status": str(self.status),
                "tokens": db.scard(self._subkey("tokens")),
                "unresolved": self.records_unresolved,
            }
        except Exception as e:
            raise SetupException(_("Failed to fetch progress information")) from e

    @property
    def records_resolved(self) -> int:
        return self._db().llen(self._subkey("resolved"))

    @property
    def records_unresolved(self) -> int:
        return self._db().llen(self._subkey("unresolved"))

    def retire(self):
        "Retire the experiment setup, removing all intermediate info from storage."
        try:
            db = self._db()
            self._delete_file()
            # use expire instead of delete, so progress bar has some time to display
            db.expire(self._key(self.request_uuid), timedelta(minutes=1))
            for key in db.scan_iter(self._subkey("*")):
                db.expire(key, timedelta(minutes=1))
        except Exception as e:
            raise SetupException() from e

    def send_update(self) -> typing.Self:
        channel_layer = get_channel_layer()
        send = async_to_sync(channel_layer.group_send)
        update = {"type": "update", **self.progress}
        send(f"edd.setup.{self.request_uuid}", update)
        return self

    def store(self) -> typing.Self:
        """Stores the request info by its ID for one week."""
        try:
            with self._db().pipeline() as pipe:
                key = self._key(self.request_uuid)
                pipe.hset(key, mapping=self._store_values())
                pipe.expire(key, self._expire())
                pipe.execute()
        except Exception as e:
            raise SetupException(_("Failed to store request information")) from e
        return self

    @property
    def token_count(self) -> int:
        return self._db().scard(self._subkey("tokens"))

    def transition(
        self,
        new_status: Status,
        expect: Status | None = None,
    ) -> bool:
        """
        Transitions the SetupRequest to the new_status provided.

        :param new_status: the desired status
        :param expect: the current expected status; raise an error on mismatch
        :returns: True only if the transition completed successfully
        """
        if expect and self.status != expect:
            raise SetupException(f"Expected state {expect} but in {self.status}")
        try:
            key = self._key(self.request_uuid)
            with self._db().pipeline(transaction=True) as pipe:
                # using watch() for optimistic locking
                pipe.watch(key)
                # don't transition if status in backend does not match
                current_status = pipe.hget(key, "status")
                if current_status == str(self.status).encode("utf8"):
                    pipe.multi()
                    pipe.hset(key, "status", str(new_status))
                    pipe.expire(key, self._expire())
                    pipe.execute()
                    self.status = new_status
                    self.send_update()
                    return True
                # execute() will unset watch,
                # but it might not run,
                # and we're done watching
                pipe.unwatch()
        except Exception as e:
            logger.info(f"Transition failed: {e!r}")
        return False

    def upload(self, files_payload, default_mime="application/octet-stream") -> bool:
        """
        Note, files_payload should be the Django request FILES attribute.
        """
        if file := files_payload.get("file", None):
            try:
                # clean up any existing file(s)
                self._delete_file()
                # write to storage
                self.path = self._storage().save(self._create_path(), file)
                self.mime_type = getattr(file, "content_type", default_mime)
                self.original_name = getattr(file, "name", None)
                self.status = SetupRequest.Status.READY
                self.store()
                return True
            except Exception as e:
                logger.exception("Could not upload LoadRequest file", exc_info=e)
        return False

    # internal API

    def _create_path(self) -> str:
        # path is first namespaced to setup,
        # then further namespace with first two UUID characters (a la git)
        # fill out with remainder of UUID
        return f"setup/{self.request_uuid[:2]}/{self.request_uuid}"

    @functools.cache
    def _db(self) -> "Redis":
        """Creates or retrieves a cached Redis connection."""
        return self._connect()

    def _delete_file(self) -> typing.Self:
        if self.path:
            try:
                self._storage().delete(self.path)
            except Exception as e:
                logger.warning(f"Failed to cleanup file {self.path}", exc_info=e)
            self.path = None
            self.mime_type = None
            self.original_name = None
        return self

    def _postcommit(self, user) -> None:
        db = self._db()
        study_described.send(
            sender=self.__class__,
            study=edd_models.Study.objects.get(uuid=self.study_uuid),
            user=user,
            count=db.zscore(self._subkey("saving"), "lines"),
        )

    def _process_record_batch(
        self,
        batch: Iterable[Record],
        resolver: RecordResolver,
    ) -> None:
        # store unmatched metadata and strain tokens
        failed: set[str] = set()
        matched: list[Record] = []
        unmatched: list[Record] = []
        for record in batch:
            if result := record.resolve(resolver):
                unmatched.append(record)
                failed.update(result)
            else:
                matched.append(record)
        # persist tokens to the cache
        with self._db().pipeline() as pipe:
            pipe.multi()
            if matched:
                serialized = [json.dumps(r.__dict__, cls=JSONEncoder) for r in matched]
                key = self._subkey("resolved")
                pipe.rpush(key, *serialized)
                pipe.expire(key, self._expire())
            if unmatched:
                serialized = [json.dumps(r.__dict__, cls=JSONEncoder) for r in unmatched]
                key = self._subkey("unresolved")
                pipe.rpush(key, *serialized)
                pipe.expire(key, self._expire())
            if failed:
                key = self._subkey("tokens")
                pipe.sadd(key, *failed)
                pipe.expire(key, self._expire())
            pipe.execute()
        self.send_update()

    def _save_counts(self, records, lines, assays) -> typing.Self:
        db = self._db()
        key = self._subkey("saving")
        db.zincrby(key, records, "records")
        db.zincrby(key, lines, "lines")
        db.zincrby(key, assays, "assays")
        db.expire(key, self._expire())
        return self

    def _sort_tokens(self) -> typing.Self:
        unordered_key = self._subkey("tokens")
        ordered_key = self._subkey("tokenlist")
        db = self._db()
        tokens = sorted(db.smembers(unordered_key))
        with db.pipeline() as pipe:
            pipe.multi()
            pipe.delete(ordered_key)
            if tokens:
                pipe.rpush(ordered_key, *tokens)
                pipe.expire(ordered_key, self._expire())
            pipe.execute()
        return self

    def _storage(self) -> Storage:
        return storages["edd.setup"]

    def _store_values(self) -> dict[str, str]:
        # get only the original field names
        fields = {f.name for f in dataclasses.fields(self.__class__)}
        # filter out anything else that may have been set
        return {k: str(v) for k, v in self.__dict__.items() if k in fields and v}


class DatabaseWriter:
    def __init__(self, setup, user):
        self.study = edd_models.Study.objects.get(uuid=setup.study_uuid)
        self.user = user

    def persist_batch(self, batch: Iterable[Record]) -> tuple[int, int]:
        count_assay = 0
        count_line = 0
        for record in batch:
            if record.replicates:
                names = [f"{record.name}-R{n}" for n in range(1, record.replicates + 1)]
                self._add_replicate_id_metadata(record)
            else:
                names = [record.name]
            for name in names:
                lc, ac = self._create_line(record, name)
                count_line += lc
                count_assay += ac
        return count_line, count_assay

    def _add_replicate_id_metadata(self, record: Record) -> None:
        replicate: MetaInfo = {
            "name": "Replicate",
            "uuid": self._replicate_meta.uuid,
            "value": uuid4().hex,
        }
        record.meta.append(replicate)

    def _create_line(self, record: Record, name: str | None) -> tuple[int, int]:
        line = edd_models.Line.objects.create(
            description=record.description,
            name=name,
            study=self.study,
        )
        for meta in record.meta:
            mtype = self._load_type(meta["uuid"])
            line.metadata_add(mtype, meta["value"])
        for strain in record.strain:
            for sid in strain["uuids"] or []:
                line.strains.add(self._load_strain(sid))
        line.save()
        return 1, self._create_assays(record, line)

    def _create_assays(self, record: Record, line: edd_models.Line) -> int:
        created = 0
        for protocol_uuid, values in record.iter_assays():
            self._create_assay(line, self._load_protocol(protocol_uuid), values)
            created += 1
        return created

    def _create_assay(
        self,
        line: edd_models.Line,
        protocol: edd_models.Protocol,
        values: list[MetaInfo],
    ) -> edd_models.Assay:
        index = line.new_assay_number(protocol)
        name = edd_models.Assay.build_name(line, protocol, index)
        assay = line.new_assay(name, protocol)
        for meta in values:
            mtype = self._load_type(meta["uuid"])
            assay.metadata_add(mtype, meta["value"])
        assay.save()
        return assay

    @functools.cache
    def _load_protocol(self, uuid: str) -> edd_models.Protocol:
        return edd_models.Protocol.objects.get(uuid=uuid)

    @functools.cache
    def _load_strain(self, uuid: str) -> edd_models.Strain:
        return edd_models.Strain.objects.get(registry_id=uuid)

    @functools.cache
    def _load_type(self, uuid: str) -> edd_models.MetadataType:
        return edd_models.MetadataType.objects.get(uuid=uuid)

    @functools.cached_property
    def _replicate_meta(self) -> edd_models.MetadataType:
        return edd_models.MetadataType.system("Replicate")
