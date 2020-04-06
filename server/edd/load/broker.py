import dataclasses
import enum
import logging
from datetime import timedelta
from uuid import uuid4

from django.conf import settings
from django.core.files.storage import default_storage
from django_redis import get_redis_connection

from main import models, redis

from . import exceptions

logger = logging.getLogger(__name__)


class ImportBroker:
    def __init__(self):
        self.storage = redis.ScratchStorage(
            key_prefix=f"{__name__}.{self.__class__.__name__}"
        )

    def _import_name(self, import_id):
        return f"{import_id}"

    def set_context(self, import_id, context):
        name = self._import_name(import_id)
        expires = getattr(settings, "EDD_IMPORT_CACHE_LENGTH", None)
        self.storage.save(context, name=name, expires=expires)

    def add_page(self, import_id, page):
        name = f"{self._import_name(import_id)}:pages"
        expires = getattr(settings, "EDD_IMPORT_CACHE_LENGTH", None)
        _, count = self.storage.append(page, name=name, expires=expires)
        return count

    def check_bounds(self, import_id, page, expected_count):
        size = getattr(settings, "EDD_IMPORT_PAGE_SIZE", 1000)
        limit = getattr(settings, "EDD_IMPORT_PAGE_LIMIT", 1000)
        if len(page) > size:
            raise exceptions.ImportBoundsError(
                f"Page size is greater than maximum {size}"
            )
        if expected_count > limit:
            raise exceptions.ImportBoundsError(
                f"Total number of pages is greater than allowed maximum {limit}"
            )
        name = f"{self._import_name(import_id)}:pages"
        count = self.storage.page_count(name)
        if count > expected_count:
            raise exceptions.ImportBoundsError(
                f"Found {count} instead of expected {expected_count} pages"
            )

    def clear_context(self, import_id):
        """Clears context associated with this import ID."""
        self.storage.delete(self._import_name(import_id))

    def clear_pages(self, import_id):
        """Clears all pages associated with this import ID."""
        self.storage.delete(f"{self._import_name(import_id)}:pages")

    def load_context(self, import_id):
        """Loads context associated with this import ID."""
        return self.storage.load(self._import_name(import_id))

    def load_pages(self, import_id):
        """Fetches the pages of series data for the specified import."""
        return self.storage.load_pages(f"{self._import_name(import_id)}:pages")


@dataclasses.dataclass
class LoadRequest:
    """Submitted information on loading data into EDD via wizard import."""

    class Options(enum.Flag):
        """Available options for Load processing."""

        empty = 0
        email_when_complete = enum.auto()
        allow_overwrite = enum.auto()
        allow_duplication = enum.auto()

        def __str__(self):
            # this makes it possible to translate to/from redis
            return str(self.value)

    class Status(enum.Enum):
        """
        States in processing a payload for data loading.

        Possible values:
        CREATED = payload exists, not be processed yet
        RESOLVED = payload parsed and verified, but some context missing
        READY = payload parsed and verified, context OK to continue
        PROCESSING = loading task is currently processing payload to database
        COMPLETED = payload has been written to the database
        ABORTED = end-user requested payload be removed from processing
        FAILED = payload could not be written to the database
        """

        CREATED = "Created"
        RESOLVED = "Resolved"
        READY = "Ready"
        PROCESSING = "Processing"
        COMPLETED = "Completed"
        ABORTED = "Aborted"
        FAILED = "Failed"

        def __str__(self):
            # this makes it possible to translate to/from redis
            return self.value

    request_uuid: str = dataclasses.field(default_factory=lambda: str(uuid4()))
    study_uuid: str = None
    protocol_uuid: str = None
    x_units_name: str = None
    y_units_name: str = None
    compartment: str = None
    path: str = None
    mime_type: str = None
    status: Status = Status.CREATED
    options: Options = Options.empty

    def __post_init__(self):
        if isinstance(self.status, str):
            # convert string status to Enum type
            self.status = LoadRequest.Status(self.status)
        if isinstance(self.options, str):
            # convert string option to int, then Flag type
            self.options = LoadRequest.Options(int(self.options))
        if self.compartment is None:
            self.compartment = models.Measurement.Compartment.UNKNOWN

    @staticmethod
    def _connect():
        return get_redis_connection("default")

    @classmethod
    def _key(cls, uuid):
        # key is fully-qualified classname
        # plus str representation of request UUID
        return f"{__name__}.{cls.__name__}:{str(uuid)}"

    @classmethod
    def fetch(cls, request_uuid):
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
        except exceptions.LoadError:
            raise
        except Exception as e:
            raise exceptions.CommunicationError() from e

    # properties

    @property
    def request(self):
        """Token used to identify this LoadRequest."""
        return self.request_uuid

    @property
    def study(self):
        """Queries the Study model object associated with the LoadRequest."""
        return models.Study.objects.get(uuid=self.study_uuid)

    @property
    def protocol(self):
        """Queries the Protocol model object associated with the LoadRequest."""
        return models.Protocol.objects.get(uuid=self.protocol_uuid)

    @property
    def x_units(self):
        """Queries the MeasurementUnit model associated with LoadRequest X-axis units."""
        return models.MeasurementUnit.objects.get(unit_name=self.x_units_name)

    @property
    def y_units(self):
        """Queries the MeasurementUnit model associated with LoadRequest Y-axis units."""
        return models.MeasurementUnit.objects.get(unit_name=self.y_units_name)

    @property
    def allow_duplication(self):
        return self.options & LoadRequest.Options.allow_duplication

    @property
    def allow_overwrite(self):
        return self.options & LoadRequest.Options.allow_overwrite

    @property
    def email_when_complete(self):
        return self.options & LoadRequest.Options.email_when_complete

    # actions

    def fetch_study_for(self, user):
        """Queries the Study model object, and checks permission for user."""
        access = models.Study.access_filter(user, models.StudyPermission.WRITE)
        return models.Study.objects.get(access, uuid=self.study_uuid)

    def open(self):
        try:
            if self.mime_type and self.mime_type[:5] == "text/":
                return default_storage.open(self.path, mode="rt")
            return default_storage.open(self.path)
        except Exception as e:
            raise exceptions.CommunicationError() from e

    def retire(self):
        """Retires the request info, removing from storage."""
        try:
            self._delete_file()
            db = self._connect()
            db.delete(self._key(self.request))
        except Exception as e:
            raise exceptions.CommunicationError() from e

    def store(self):
        """Stores the request info by its ID for one week."""
        try:
            db = self._connect()
            with db.pipeline() as pipe:
                key = self._key(self.request)
                for k, v in self._store_values().items():
                    pipe.hset(key, k, v)
                pipe.expire(key, timedelta(weeks=1))
                pipe.execute()
        except Exception as e:
            raise exceptions.CommunicationError() from e

    def transition(self, new_status: "LoadRequest.Status"):
        """
        Transitions the LoadRequest to the new_status provided.

        :param new_status: the desired status
        :returns: True only if the transition completed successfully
        """
        try:
            db = self._connect()
            key = self._key(self.request)
            with db.pipeline(transaction=True) as pipe:
                # using watch() for optimistic locking
                pipe.watch(key)
                # don't transition if status in backend does not match
                current_status = pipe.hget(key, "status")
                if current_status == str(self.status).encode("utf8"):
                    pipe.multi()
                    pipe.hset(key, "status", str(new_status))
                    pipe.execute()
                    self.status = new_status
                    return True
                # execute() will unset watch,
                # but it might not run,
                # and we're done watching
                pipe.unwatch()
        except Exception as e:
            logger.info(f"Transition failed: {e!r}")
        return False

    def store_values(self):
        # get only the original field names,
        # minus request, which is in the key
        fields = {f.name for f in dataclasses.fields(self.__class__)} - {"request"}
        # filter out anything else that may have been set
        return {k: str(v) for k, v in self.__dict__.items() if k in fields and v}
