import dataclasses
import enum
import itertools
import json
import logging
from collections.abc import Iterable
from contextlib import contextmanager

from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer
from django.core.files.storage import storages
from django.db import transaction

from edd.utilities import JSONDecoder, JSONEncoder, RecordCache, RecordRequest
from main import models as edd_models
from main.signals import study_imported

from . import exceptions, lookup, reader
from .layout import Layout, Record

logger = logging.getLogger(__name__)


def default_request():
    return RecordCache(LoadRequest, Record).request()


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

    request: RecordRequest[Record] = dataclasses.field(default_factory=default_request)
    study_uuid: str | None = None
    layout_key: str | None = None
    protocol_uuid: str | None = None
    x_units_name: str | None = None
    y_units_name: str | None = None
    compartment: str | None = None
    path: str | None = None
    mime_type: str | None = None
    original_name: str | None = None
    status: Status = Status.CREATED

    def __post_init__(self):
        if isinstance(self.status, str):
            # convert string status to Enum type
            self.status = LoadRequest.Status(self.status)
        if self.compartment is None:
            self.compartment = edd_models.Measurement.Compartment.UNKNOWN

    @classmethod
    def fetch(cls, request_uuid):
        """Fetches the request info from storage."""
        try:
            request = RecordCache(cls, Record).request(request_uuid)
            if meta := request.meta_fetch():
                return LoadRequest(request=request, **meta)
        except Exception as e:
            raise exceptions.CommunicationError() from e
        raise exceptions.InvalidLoadRequestError()

    # properties

    @property
    def request_uuid(self):
        """Token used to identify this LoadRequest."""
        return self.request.uuid

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
            has_tokens = self.request.tokens_length() > 0
            return ok_status and has_tokens
        except Exception:
            return False

    @property
    def is_save_ready(self):
        return self.status is LoadRequest.Status.PROCESSED

    @property
    def is_upload_ready(self):
        """LoadRequest can begin upload() call when it has protocol and layout."""
        return self.protocol_uuid and self.layout_key

    @property
    def progress(self):
        try:
            return {
                "added": self.request.counter_value("added"),
                "resolved": self.request.resolved_length(),
                "status": str(self.status),
                "tokens": self.request.tokens_length(),
                "unresolved": self.request.unresolved_length(),
                "updated": self.request.counter_value("updated"),
            }
        except Exception as e:
            raise exceptions.CommunicationError() from e

    # actions

    def check_study(self, study):
        """Validates that the Study object matches this LoadRequest."""
        if str(study.uuid) != self.study_uuid:
            raise exceptions.InvalidLoadRequestError()

    def commit(self, user):
        writer = DatabaseWriter(self, user)
        update = edd_models.Update.fake_request(
            user=user,
            path=f"!edd.load.wizard!{self.request_uuid}",
        )
        with transaction.atomic(savepoint=True), update:
            it = iter(self.request.resolved())
            while batch := tuple(itertools.islice(it, 20)):
                added, updated = writer.persist_batch(batch)
                self.request.counter_tick("added", added)
                self.request.counter_tick("updated", updated)
                self.send_update()
            self._postcommit(user)
        self.request.resolved_clear()

    def form_payload_restore(self, payload_key):
        try:
            return json.loads(self.request.payload_fetch(payload_key), cls=JSONDecoder)
        except Exception as e:
            raise exceptions.CommunicationError() from e

    def form_payload_save(self, payload):
        try:
            payload_json = json.dumps(payload, cls=JSONEncoder).encode("utf8")
            return self.request.payload_stash(payload_json)
        except Exception as e:
            raise exceptions.CommunicationError() from e

    @contextmanager
    def lock_status(self, *, active, failed, success, expect=None):
        try:
            self.transition(new_status=active, expect=expect)
            yield
            self.transition(new_status=success, expect=active)
            self.send_update()
        except Exception as e:
            self.transition(new_status=failed)
            self.send_update()
            raise e

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
            while batch := tuple(itertools.islice(records, 100)):
                self.resolve_batch(batch, resolver)
        except (exceptions.LoadError, exceptions.LoadWarning):
            raise
        except Exception as e:
            raise exceptions.CommunicationError() from e

    def read(self) -> Iterable["Record"]:
        parser = reader.Parser(self._build_reader(), self.layout)
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
        self.request.resolved_add(*matched)
        self.request.unresolved_add(*unmatched)
        self.request.tokens_add(*failed)
        self.send_update()

    def resolve_tokens(self, tokens_form):
        try:
            self.request.tokens_remove(*tokens_form.raw_tokens)
            it = iter(self.request.unresolved())
            while batch := tuple(itertools.islice(it, 100)):
                self.resolve_batch(batch, tokens_form)
        except Exception as e:
            raise exceptions.CommunicationError() from e

    def retire(self):
        """Retires the request info, removing from storage."""
        try:
            self.request.expire()
            self._delete_file()
        except Exception as e:
            raise exceptions.CommunicationError() from e

    def send_update(self):
        channel_layer = get_channel_layer()
        send = async_to_sync(channel_layer.group_send)
        update = {"type": "update", **self.progress}
        send(f"edd.load.{self.request_uuid}", update)

    def store(self):
        """Stores the request info by its ID for one week."""
        try:
            self.request.meta_stash(self._store_values())
        except Exception as e:
            raise exceptions.CommunicationError() from e

    def transition(
        self,
        new_status: Status,
        expect: Status | None = None,
    ):
        """
        Transitions the LoadRequest to the new_status provided.

        :param new_status: the desired status
        :returns: True only if the transition completed successfully
        """
        if expect and self.status != expect:
            raise exceptions.FailedTransitionError(begin=str(self.status), end=str(new_status))
        try:
            if self.request.meta_update_atomic("status", str(new_status), str(self.status)):
                # instead of full refresh from cache, just set status on in-memory object
                self.status = new_status
                return True
        except Exception as e:
            logger.info(f"Transition failed: {e!r}")
        return False

    def unresolved_tokens(self, start: int, end: int):
        return self.request.tokens(start, end)

    def upload(self, files_payload, default_mime="application/octet-stream"):
        """
        Note, files_payload should be the Django request FILES attribute.
        """
        if file := files_payload.get("file", None):
            try:
                # reset status
                self.transition(self.Status.CREATED)
                # clear out previous failed, matched, unmatched
                self.request.resolved_clear()
                self.request.unresolved_clear()
                self.request.tokens_clear()
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

    def _create_path(self):
        # path is first namespaced to load,
        # then further namespace with first two UUID characters (a la git)
        # fill out with remainder of UUID
        uuid = str(self.request.uuid)
        return f"load/{uuid[:2]}/{uuid}"

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

    def _storage(self):
        return storages["edd.load"]

    def _store_values(self):
        # get only the original field names
        fields = {f.name for f in dataclasses.fields(self.__class__)} - {"request"}
        # filter out anything else that may have been set
        return {k: str(v) for k, v in self.__dict__.items() if k in fields and v}


class DatabaseWriter:
    def __init__(self, load, user):
        self.compartment = load.compartment
        self.protocol_id = load.protocol.pk
        self.study_id = load.study.pk
        self.user = user
        self.update = edd_models.Update.load_update()
        # track added / updated
        self.added = 0
        self.updated = 0

    def persist_batch(self, batch: Iterable["Record"]) -> tuple[int, int]:
        # find existing assay records
        assay_ids = {r.assay_id for r in batch}
        queryset = edd_models.Assay.objects.filter(
            active=True,
            protocol_id=self.protocol_id,
            study_id=self.study_id,
        )
        existing_assays = queryset.in_bulk(assay_ids)
        for record in batch:
            if assay := existing_assays.get(record.assay_id, None):
                self._write_measurement(assay, record)
            else:
                logger.warning(f"No existing assay found for {record}")
        return self.added, self.updated

    def _write_measurement(self, assay, record) -> None:
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
        qs = assay.measurement_set.filter(**find)
        measurement, created = qs.get_or_create(defaults=defaults)
        self._write_value(assay, measurement, record, created)

    def _write_value(self, assay, measurement, record, is_new) -> None:
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
            # when the measurement is just created, can skip querying for any existing value
            measurement.measurementvalue_set.create(**defaults)
            self.added += 1
            return
        _, created = measurement.measurementvalue_set.update_or_create(
            defaults=defaults,
            **find,
        )
        if created:
            self.added += 1
        else:
            self.updated += 1
