import dataclasses
import json
import logging
from datetime import timedelta
from uuid import uuid4

from django_redis import get_redis_connection

from . import reporting

logger = logging.getLogger(__name__)


@dataclasses.dataclass
class DescribeErrorReport:
    """
    Information on errors and warnings that occurred during an edd.describe run
    """

    request: str = dataclasses.field(default_factory=lambda: str(uuid4()))

    @staticmethod
    def _connect():
        return get_redis_connection("default")

    @classmethod
    def _key(cls, uuid):
        # key is fully-qualified classname
        # plus str representation of request UUID
        return f"{__name__}.{cls.__name__}:{str(uuid)}"

    # actions

    def clear_stash(self):
        """Clears any persisted errors and warnings for the Describe request."""
        try:
            db = self._connect()
            key = self._key(self.request)
            errors_key = f"{key}:errors"
            warnings_key = f"{key}:warnings"
            db.delete(errors_key)
            db.delete(warnings_key)
        except Exception as e:
            logger.warning(f"Could not clear errors: {e!r}")

    def stash_errors(self):
        """Finds reported errors and warnings, then stores them."""
        try:
            db = self._connect()
            key = self._key(self.request)
            errors_key = f"{key}:errors"
            warnings_key = f"{key}:warnings"
            summary = reporting.build_messages_summary(self.request)
            with db.pipeline() as pipe:
                pipe.multi()
                if "errors" in summary:
                    errors = (json.dumps(item) for item in summary["errors"])
                    pipe.rpush(errors_key, *errors)
                    pipe.expire(errors_key, timedelta(weeks=1))
                if "warnings" in summary:
                    warnings = (json.dumps(item) for item in summary["warnings"])
                    pipe.rpush(warnings_key, *warnings)
                    pipe.expire(warnings_key, timedelta(weeks=1))
                pipe.execute()
        except Exception as e:
            logger.warning(f"Could not stash LoadRequest errors: {e!r}")

    def unstash_errors(self):
        """Returns any errors and warnings stashed by .stash_errors()."""
        summary = {}
        try:
            db = self._connect()
            key = self._key(self.request)
            errors_key = f"{key}:errors"
            warnings_key = f"{key}:warnings"
            summary["errors"] = [
                json.loads(item) for item in db.lrange(errors_key, 0, -1)
            ]
            summary["warnings"] = [
                json.loads(item) for item in db.lrange(warnings_key, 0, -1)
            ]
        except Exception as e:
            logger.warning(f"Could not unstash LoadRequest errors: {e!r}")
        return summary
