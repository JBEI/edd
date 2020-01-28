# coding: utf-8

import collections
import copy
import logging
from typing import Any, Dict, List, Optional, Sequence, Tuple, Type, Union
from uuid import UUID

from django.conf import settings
from django.utils.translation import ugettext_lazy as _
from six import string_types

from ..signals import errs_reported, warnings_reported

logger = logging.getLogger(__name__)


class EDDImportException(Exception):
    def __init__(
        self,
        category: str,
        summary: Optional[str] = "",
        subcategory: Optional[str] = "",
        details: Union[str, Sequence[str], None] = None,
        resolution: str = "",
        docs_link: str = "",
        aborted: int = 0,
        id="",
        truncated: int = 0,
        workaround_text="",
    ):
        """
        Initializes the exception.

        :param category: the user-facing category this error falls into
        :param summary: optional user-facing summary text for the class of errors uniquely
            identified by this category & subcategory.  This should be a concise phrase descriptive
            of the general error conditions, which may also be elaborated on in other parameters or
            referenced help text
        :param subcategory: optional user-facing subcategory for this error.
        :param details: a string or list of strings that detail individual occurrences of this
            error type.  Included values are displayed in list form in the user interface,
            and may be truncated based for display based on the value of
            EDD_IMPORT_ERR_REPORTING_LIMIT.
        :param resolution: optional user-facing prompt for how to resolve the error
        :param id: an identifier for this error that gets passed to front-end code for
            special-case processing
        :param workaround_text: User-facing text displayed by the front end as the
            label for a special-case button to work around this error
        """
        super().__init__()
        self.category: str = category
        self.summary: str = summary
        self.subcategory: Optional[str] = subcategory
        self.resolution: Optional[str] = resolution
        self.docs_link: Optional[str] = docs_link
        self.id: str = id
        self.truncated: int = truncated
        self.aborted: int = aborted
        self.workaround_text: str = workaround_text

        self.details: List[str] = []
        if details:
            if isinstance(details, string_types):
                self.details = [details]
            elif isinstance(details, collections.Iterable):
                # account for sets, frozensets, etc that may be more convenient for client code
                self.details = list(details)

                # if needed, truncate detail reports to the configured limit
                err_limit = getattr(
                    settings, "EDD_IMPORT_ERR_REPORTING_LIMIT", len(details)
                )
                if err_limit < len(details):
                    end = min(len(details), err_limit)
                    self.details = self.details[0:end]
            elif isinstance(details, int) or isinstance(details, float):
                self.details = [str(details)]
            else:
                raise Exception(f"Unsupported type {type(details)}")

    def __key(self):
        return (
            self.category,
            self.summary,
            self.subcategory,
            tuple(self.details),
            self.resolution,
            self.docs_link,
            self.aborted,
            self.id,
            self.truncated,
            self.workaround_text,
        )

    def __eq__(self, other):
        return self.__key() == other.__key()

    def __hash__(self):
        return hash(self.__key())

    def __str__(self):
        cols = [f'category="{self.category}"']
        if self.subcategory:
            cols.append(f'subcategory="{self.subcategory}"')
        if self.details:
            # force translation proxies, if any, to string
            details = ", ".join([str(item) for item in self.details])
            cols.append(f'details="{details}"')
        cols_str = ", ".join(cols)
        return f"{self.__class__.__name__}({cols_str})"

    def to_json(self):
        result = {"category": self.category}
        if self.docs_link:
            result["docs_link"] = self.docs_link
        if self.details:
            # force translation proxy objects into strings
            result["detail"] = ", ".join([str(item) for item in self.details])
        if self.id:
            result["id"] = self.id
        if self.resolution:
            result["resolution"] = self.resolution
        if self.subcategory:
            result["subcategory"] = self.subcategory
        result["summary"] = self.summary
        if self.workaround_text:
            result["workaround_text"] = self.workaround_text

        # if results were truncated or the search was aborted, append detail to the report
        if self.truncated:
            # force translation proxy objects into strings
            s = str(_("...(+{count} more)").format(count=self.truncated))
            result["detail"] = ", ".join([result["detail"], s])
        if self.aborted:
            # force translation proxy objects into strings
            s = str(_("Aborted after {count}.").format(count=self.aborted))
            result["detail"] = ". ".join([result["detail"], s])

        return result


class EDDImportError(EDDImportException):
    pass


class EDDImportWarning(EDDImportException):
    pass


class MessageAggregator:
    """
    Tracks errors and warnings that occur during the import process, while offering client code
    control over when/whether errors are raised.  This class IS INTERNAL API, AND MAY CHANGE IN
    FUTURE RELEASES.
    """

    def __init__(self):
        self._errors: Dict[Tuple[str, str, str], EDDImportException] = {}
        self._warnings: Dict[Tuple[str, str, str], EDDImportWarning] = {}
        # reference to the latest reported error occurrence, which enables raising it on demand
        self._latest_errors: Optional[EDDImportError] = None

    def _key(self, msgs: EDDImportException):
        # Note some messages may only have one or the other of subcategory / summary, so include
        # both
        return msgs.category, msgs.subcategory, msgs.summary

    def add_errors(self, errs: EDDImportError):
        """
        Adds errors represented by the Exception parameter.  Errors with the same category,
        subcategory, and summary are merged together internally.
        :param errs: an Exception representing one or more occurrences of an error.  A
            reference to this parameter is kept internally and may be modified by further error
            reports.
        """
        self._add_msg(self._errors, errs)

        key = self._key(errs)
        self._latest_errors = self._errors.get(key)

    def add_warnings(self, warns: EDDImportWarning):
        """
            Adds warning represented by the EDDImportWarning parameter.  Warnings with
            the same category, subcategory, and summary are merged together internally.
            :param warns: an EDDImportWarning representing one or more occurrences
                of an error.  A reference to this parameter is kept internally and may be
                modified by subsequent warning reports.
        """
        self._add_msg(self._warnings, warns)

    def _add_msg(
        self,
        target: Dict[Tuple[str, str, str], EDDImportException],
        msg: EDDImportException,
    ):
        key = self._key(msg)

        existing = target.get(key, None)
        if existing:
            self._merge_msg_details(key, existing, msg)
        else:
            target[key] = copy.deepcopy(msg)

    def _merge_msg_details(
        self, key, existing: EDDImportException, msg: EDDImportException
    ):
        """
        Merges details from a newly reported exception report into the internal tracking for
        messages of that type
        :param existing: the existing internal Exception used to track all reported occurrences
        :param msg: the newly reported message
        """

        # test whether the newly reported details surpass the limit for reporting
        total = len(existing.details) + len(msg.details)
        rpt_limit = getattr(settings, "EDD_IMPORT_ERR_REPORTING_LIMIT", total)
        non_duplicates = set(msg.details) - set(existing.details)
        if total <= rpt_limit:
            # if there's no need to truncate some detail reports, just save all the details.

            # work around key insertion order tracking problems that still seem to exist
            # in Python 3.7 sets.  It's important for usability to preserve the order
            # in which errors were detected, but we also want to prevent duplicate inserts
            for detail in msg.details:
                if detail in non_duplicates:
                    existing.details.append(detail)
        else:
            # some detail reports surpass the reporting limit
            if not existing.truncated:
                # only report a truncation warning once, when the first truncation occurs
                logger.warning(
                    f"Reached reporting limit of {rpt_limit} for {key}. Further occurrences "
                    f"of this issue type will not be tracked"
                )

            include_max = max(rpt_limit - len(existing.details), 0)

            if include_max > 0:
                # work around key insertion order tracking problems that still seem to exist
                # in Python 3.7 sets.  It's important for usability to preserve the order
                # in which errors were detected, but we also want to prevent duplicate inserts
                included_count = 0
                for detail in msg.details:
                    if detail in non_duplicates:
                        existing.details.append(detail)
                        included_count += 1
                        if included_count == include_max:
                            break

                # track how many were actually included after removing duplicates
                existing.truncated += len(non_duplicates) - included_count
            else:
                existing.truncated += len(non_duplicates)

        # propagate the encountered abort limit, if present
        if msg.aborted:
            existing.aborted = msg.aborted

    def clear(self):
        self._errors.clear()
        self._warnings.clear()
        self._latest_errors = None

    def raise_errors(self, errs: Optional[EDDImportError] = None):
        """
        Raises an exception if there are any known errors reported in this or preceding method
        calls.

        Even if the "errors" parameter is provided, calling this method is preferred over
        raising the Exception directly.  The result of calling this method is an Exception
        that contains information about all preceding reported errors rather than just
        the latest one captured in the parameter.
        ß
        :param errs: an optional Exception representing one ore more error occurrences
        :raises EDDImportError if any errors have been reported
        """
        if errs:
            # add the error to our store of error reports
            self._add_msg(self._errors, errs)

            key = self._key(errs)
            self._latest_errors = self._errors.get(key)

        if self._latest_errors:
            raise self._latest_errors

    @property
    def first_err_category(self) -> str:
        return next(iter(self._errors.keys()))[0]

    def err_count(self, err_class: Optional[Type[EDDImportError]] = None) -> int:
        return self._msg_count(self._errors, err_class)

    def warn_count(self, warn_class: Optional[Type[EDDImportWarning]] = None) -> int:
        return self._msg_count(self._warnings, warn_class)

    def _msg_count(
        self,
        target: Dict[Tuple[str, str, str], EDDImportException],
        msg_class: Optional[Type[EDDImportException]] = None,
    ) -> int:
        if msg_class:
            val = sum(
                map(lambda err: 1 if isinstance(err, msg_class) else 0, target.values())
            )
            if val is None:
                return 0
            return val
        return len(target)

    def to_json(self) -> Dict[str, List]:
        result = {}
        if self._errors:
            result["errors"] = self._to_json(self._errors)
        if self._warnings:
            result["warnings"] = self._to_json(self._warnings)
        return result

    def _to_json(
        self, src: Dict[Tuple[str, str, str], EDDImportException]
    ) -> List[Any]:
        summary = []
        for key, msg in src.items():
            summary.append(msg.to_json())
        return summary

    def __eq__(self, other):
        return (
            self._errors == other._errors
            and self._warnings == other._warnings
            and self._truncated_count == other._truncated_count
        )


# register a default signal handler that just logs all reported errors
def _log_reported_errors(sender, **kwargs):
    key = str(sender)
    errs: EDDImportError = kwargs["errs"]
    logger.exception(f"{errs}")

    tracked: MessageAggregator = _tracked_msgs.get(key, None)
    if tracked:
        tracked.add_errors(errs)


# register a default signal handler to log all reported warnings, and track them if configured
def _log_reported_warnings(sender, **kwargs):
    key = str(sender)
    warns: EDDImportWarning = kwargs["warns"]
    logger.warning(f"{warns}")

    tracked: MessageAggregator = _tracked_msgs.get(key, None)
    if tracked:
        tracked.add_warnings(warns)


errs_reported.connect(
    _log_reported_errors,
    weak=False,
    dispatch_uid="edd_file_importer.exceptions.core._log_reported_errors",
)

warnings_reported.connect(
    _log_reported_warnings,
    weak=False,
    dispatch_uid="edd_file_importer.exceptions.core._log_reported_warnings",
)


def errors(key: Union[UUID, str], errs: EDDImportError):
    """
    Reports one or more error occurrences represented by the EDDImportError parameter.

    By default, errors reported here are logged and immediately raised.  Clients may also call
    track_msgs() to turn on stateful tracking for this key so that messages reported here can
    be deferred and accessed later when the end of the workflow is reached.

    Each call to this function will result in a notifications to listeners on the
    edd_file_importer.signals.errs_reported signal.

    :param key: the unique key for this workflow (e.g. the UUID for a single import)
    :param errs: EDDImportError instance representing one or more error occurrences
    """
    errs_reported.send_robust(sender=str(key), errs=errs)


def add_errors(key: Union[UUID, str], errs: EDDImportError):
    """
    Reports one or more error occurrences represented by the EDDImportError parameter.

    This method is intended for use in stateful message tracking, so the Exception parameter
    will be raised immediately if message tracking is not configured for the workflow identified by
    this key.  Raising the parameter supports reuse of code written for stateful reporting in
    cases where stateful reporting isn't configured.  For example, a parser written to collect and
    report on all the errors in a file would instead raise the first encountered error.

    :param key: unique key for this workflow (e.g. the UUID for a single import)
    :param errs: EDDImportError instance representing one or more error occurrences
    """
    key = str(key)

    # always trigger signal handlers
    errors(key, errs)

    if key not in _tracked_msgs:
        # if tracking isn't enabled, fail immediately so code written to accumulate errors
        # will still fail in a logical way (just on the first error instead of after many)
        raise errs
    # else:
    #     tracked.add_errors(errs)


def warnings(key: Union[UUID, str], warns: EDDImportWarning):
    """
    Reports one or more warning occurrences represented by the EDDImportWarning parameter.

    By default, warnings reported here are only logged and no further action is taken.  Clients may
    also call track_msgs() to turn on error and warning aggregation for this key so that
    reported messages can be accessed when the end of the workflow is reached.

    Each call to this function will result in a notifications to listeners on the
    edd_file_importer.signals.warnings_reported signal.

    :param key: the unique key that identifies this workflow (e.g. the UUID for a single import)
    :param warns: EDDImportWarning instance representing one or more warning occurrences
    """
    logger.debug(
        f"warnings(): {warns}"
    )  # TODO: remove  -- already handled in signal handler
    warnings_reported.send_robust(sender=str(key), warns=warns)


def raise_errors(key: Union[UUID, str], errs: Optional[EDDImportError] = None):
    """
    Raises an EDDImportException if any errors have been reported associated with this key,
    either by providing the "errs" parameter, or via a preceding call to add_errors() with
    message aggregation enabled via a call to track_msgs().

    This function is intended for use in workflows that opt into error tracking via a call to
    track_msgs().  When message tracking is enabled, this method allows clients to control when
    deferred errors are raised, and as a convenience, to also report an error.  If  message
    tracking isn't enabled for this key, the only effect of calling this method without the
    errors parameter is to print a warning message.

    :param key: the unique key that identifies this workflow (e.g. the UUID for a single import)
    :param errs: an optional EDDImportError instance representing one or more error occurrences
    :raises EDDImportException if errors is defined, or
    """
    key = str(key)
    tracked: MessageAggregator = _tracked_msgs.get(key, None)

    if errs:
        # report errs parameter so signal will get sent and errors will get merged with others
        # if tracking is enabled for this key
        add_errors(key, errs)
        if not tracked:
            return
    elif not tracked:
        logger.warning(
            f'Key "{key}" is not configured for error tracking.  raise_errors() '
            f"will never raise an exception when called with zero arguments"
        )
        return

    # if aggregating messages for this key, merge with any previously-reported errors of the same
    # type, then raise an Exception (maybe the merged result)
    tracked.raise_errors(errs)


def track_msgs(key: Union[UUID, str], track=True):
    """
    Configures stateful tracking of errors and warnings reported using this key.

    When enabled, errors and warnings reported via this module are tracked, and may have their
    details merged together if multiple matching errors are reported.  Note that once
    tracking is enabled, state for this key is persistent in the runtime environment, so in most
    cases should only be used for the duration of a single workflow (e.g. while processing a
    single HTTP request or running a single Celery task).

    :param key: the key to configure tracking for (e.g. the import UUID)
    :param track: True to track messages for this key, False to stop tracking and to clear any
    previously-reported messages for this key.
    """
    key = str(key)

    if key in _tracked_msgs:
        if not track:
            logger.info(f"Disabling message tracking and clearing state for {key}")
            del _tracked_msgs[key]
        return

    if track:
        logger.info(f"Enabling message tracking for {key}")
        _tracked_msgs[key] = MessageAggregator()


# Define a dict of MessageAggregators to support opt-in stateful message tracking for each unique
# key (import UUID) handled in this process.
# To prevent potential interference between runs if multiple sequential requests for the same
# import happen to run in the same worker process, state for each import ID must be
# cleared when the current thread is finished with it (e.g. before replying to the current
# HTTP request or ending the current Celery task).
_tracked_msgs: Dict[str, MessageAggregator] = {}


def first_err_category(key: Union[UUID, str]) -> str:
    """
    Gets a reference to the first reported EDDImportError instance.  This FUNCTION IS INTERNAL API,
    AND MAY CHANGE IN FUTURE RELEASES.

    :param key: the unique key that identifies this workflow (e.g. the UUID for a single import)
    :return: the first EDDImportError instance reported for this workflow
    """
    messages: MessageAggregator = _tracked_msgs.get(str(key), None)
    return messages.first_err_category if messages else None


def err_type_count(
    key: Union[UUID, str], err_class: Optional[Type[EDDImportError]] = None
) -> int:
    """
    Tests the number of unique error types that have been reported for this workflow.

    Unique categories are defined by the combination of (category, subcategory, summary) for
    EDDImportException classes.  See also MessageAggregator._key(). THIS FUNCTION IS INTERNAL API,
    AND MAY CHANGE IN FUTURE RELEASES.

    :param key: the unique key that identifies this workflow (e.g. the UUID for a single import)
    :return: the number of unique error types of the specified class or its descendents that have
    been reported
    """
    messages: MessageAggregator = _tracked_msgs.get(str(key), None)
    return messages.err_count(err_class) if messages else 0


def warn_type_count(
    key: Union[UUID, str], warn_class: Optional[Type[EDDImportWarning]] = None
) -> int:
    """
    Tests the number of unique error types that have been reported for this workflow.

    Unique categories are defined by the combination of (category, subcategory, summary) for
    EDDImportException classes.  See also MessageAggregator._key().

    This FUNCTION IS INTERNAL API, AND MAY CHANGE IN FUTURE RELEASES.

    :param key: the unique key that identifies this workflow (e.g. the UUID for a single import)
    :return: the number of unique error types of the specified class or its descendents that have
    been reported
    """
    messages: MessageAggregator = _tracked_msgs.get(str(key), None)
    return messages.warn_count(warn_class) if messages else 0


def build_messages_summary(key: Union[UUID, str]) -> Dict[str, List[Any]]:
    """
    Builds a Dict representation of all the errors and warnings reported for this
    workflow that's suitable for JSON serialization.

    This FUNCTION IS INTERNAL API, AND MAY CHANGE IN FUTURE RELEASES.
    """
    messages: MessageAggregator = _tracked_msgs.get(str(key), None)
    return messages.to_json() if messages else {}
