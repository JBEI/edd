import dataclasses
import enum
import functools
import itertools
import json
import logging
import typing
from collections.abc import Iterable
from contextlib import contextmanager
from uuid import UUID, uuid4

from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer
from django.core.files.storage import Storage, storages
from django.db import transaction
from django.utils.translation import gettext_lazy as _

from edd.utilities import JSONDecoder, JSONEncoder, RecordCache, RecordRequest
from main import models as edd_models
from main.signals import study_described

from .exceptions import SetupException
from .forms import ResolveTokensForm
from .lookup import Resolver
from .parser import MetaInfo, Parser, Record, RecordResolver

if typing.TYPE_CHECKING:
    from django.contrib.auth.models import AbstractUser

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


def default_request():
    return RecordCache(SetupRequest, Record).request()


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
    request: RecordRequest[Record] = dataclasses.field(default_factory=default_request)
    path: str | None = None
    mime_type: str | None = None
    original_name: str | None = None
    status: Status = Status.CREATED

    # internal init API

    def __post_init__(self):
        if isinstance(self.status, str):
            # convert string status to Enum type
            self.status = SetupRequest.Status(self.status)

    @classmethod
    def fetch(cls, request_uuid: UUID | str) -> "SetupRequest":
        """Fetches the request info from storage."""
        try:
            request = RecordCache(cls, Record).request(request_uuid)
            if meta := request.meta_fetch():
                return SetupRequest(request=request, **meta)
        except Exception as e:
            raise SetupException(_("Error loading setup details")) from e
        raise SetupException(_("Could not find matching setup request"))

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
            path=f"!edd.setup!{self.request.uuid}",
        )
        try:
            with transaction.atomic(savepoint=True), update:
                it = iter(self.request.resolved())
                while batch := tuple(itertools.islice(it, 20)):
                    line_count, assay_count = writer.persist_batch(batch)
                    self.request.counter_tick("records", len(batch))
                    self.request.counter_tick("lines", line_count)
                    self.request.counter_tick("assays", assay_count)
                    self.send_update()
                study_described.send(
                    sender=self.__class__,
                    study=edd_models.Study.objects.get(uuid=self.study_uuid),
                    user=user,
                    count=self.request.counter_value("lines"),
                )
            self.request.resolved_clear()
        except Exception as e:
            raise SetupException() from e
        return self

    def form_payload_fetch(self, payload_key):
        try:
            return json.loads(self.request.payload_fetch(payload_key), cls=JSONDecoder)
        except Exception as e:
            raise SetupException() from e

    def form_payload_stash(self, payload):
        try:
            payload_json = json.dumps(payload, cls=JSONEncoder).encode("utf8")
            return self.request.payload_stash(payload_json)
        except Exception as e:
            raise SetupException() from e

    def get_unresolved_tokens_range(self, start: int, end: int) -> Iterable[str]:
        return self.request.tokens(start, end)

    @contextmanager
    def lock_status(self, *, active, failed, success, expect=None):
        try:
            self.transition(new_status=active, expect=expect)
            yield
            self.transition(new_status=success, expect=active)
        except Exception as e:
            self.transition(new_status=failed)
            raise e

    def open(self) -> typing.IO:
        try:
            if self.mime_type and self.mime_type[:5] == "text/":
                return self._storage().open(self.path, mode="rt")
            return self._storage().open(self.path)
        except Exception as e:
            raise SetupException(_("Error reading uploaded file")) from e

    def process_form(self, tokens_form: ResolveTokensForm) -> typing.Self:
        try:
            self.request.tokens_remove(*tokens_form.raw_tokens)
            resolver = tokens_form.get_resolver()
            it = iter(self.request.unresolved())
            while batch := tuple(itertools.islice(it, 100)):
                self._process_record_batch(batch, resolver)
        except Exception as e:
            raise SetupException() from e
        return self

    def process_payload(self, payload: Iterable[Record], user: "User") -> typing.Self:
        resolver = Resolver(user=user)
        # need an iterator for the while loop
        records = iter(payload)
        while batch := tuple(itertools.islice(records, 100)):
            self._process_record_batch(batch, resolver)
        return self

    def process_upload(self, user: "User") -> typing.Self:
        parser = Parser(self.mime_type)
        with self.open() as file:
            return self.process_payload(parser.parse(file), user)

    @property
    def progress(self) -> SetupProgress:
        try:
            return {
                "resolved": self.request.resolved_length(),
                "saved": {
                    "assays": self.request.counter_value("assays"),
                    "lines": self.request.counter_value("lines"),
                    "records": self.request.counter_value("records"),
                },
                "status": str(self.status),
                "tokens": self.request.tokens_length(),
                "unresolved": self.request.unresolved_length(),
            }
        except Exception as e:
            raise SetupException(_("Failed to fetch progress information")) from e

    @property
    def request_uuid(self) -> str:
        return str(self.request.uuid)

    def retire(self):
        "Retire the experiment setup, removing all intermediate info from storage."
        try:
            self.request.expire()
            self._delete_file()
        except Exception as e:
            raise SetupException() from e

    def send_update(self) -> typing.Self:
        channel_layer = get_channel_layer()
        send = async_to_sync(channel_layer.group_send)
        update = {"type": "update", **self.progress}
        send(f"edd.setup.{self.request.uuid}", update)
        return self

    def store(self) -> typing.Self:
        """Stores the request info by its ID for one week."""
        try:
            self.request.meta_stash(self._store_values())
        except Exception as e:
            raise SetupException(_("Failed to store request information")) from e
        return self

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
            if self.request.meta_update_atomic("status", str(new_status), str(self.status)):
                # instead of full refresh from cache, just set status on in-memory object
                self.status = new_status
                return True
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
        uuid = str(self.request.uuid)
        return f"setup/{uuid[:2]}/{uuid}"

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
        self.request.resolved_add(*matched)
        self.request.unresolved_add(*unmatched)
        self.request.tokens_add(*failed)
        self.send_update()

    def _storage(self) -> Storage:
        return storages["edd.setup"]

    def _store_values(self) -> dict[str, str]:
        # get only the original field names
        fields = {f.name for f in dataclasses.fields(self.__class__)} - {"request"}
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
                assert record.name is not None
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
