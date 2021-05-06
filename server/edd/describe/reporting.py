import logging
import typing
import uuid
from contextlib import contextmanager

from edd import receiver

from . import exceptions
from .signals import errors_reported, warnings_reported

logger = logging.getLogger(__name__)

# type aliases
StrTriple = typing.Tuple[str, str, str]
Aggregate = typing.Dict[StrTriple, exceptions.MessagingMixin]
MaybeError = typing.Optional[exceptions.ReportableDescribeError]
MaybeErrorType = typing.Optional[typing.Type[exceptions.ReportableDescribeError]]
MaybeWarningType = typing.Optional[typing.Type[exceptions.ReportableDescribeWarning]]
MaybeTrackedType = typing.Optional[typing.Type[exceptions.MessagingMixin]]
TrackingId = typing.Union["uuid.UUID", str]
MessageSummary = typing.Dict[str, typing.List[typing.Any]]


class MessageAggregator:
    """
    Tracks errors and warnings that occur during a workflow.

    Client code controls when or whether errors are raised. Multiple Exception
    instances can be created or caught, added to this API, then dealt with
    later. This class IS INTERNAL API, AND MAY CHANGE IN FUTURE RELEASES.
    """

    def __init__(self):
        self._errors: Aggregate = {}
        self._warnings: Aggregate = {}
        # reference to the latest reported error occurrence, which enables raising it on demand
        self._latest_error: MaybeError = None

    def _key(self, msgs: exceptions.MessagingMixin) -> StrTriple:
        # Note some messages may only have one or the other of subcategory / summary, so include
        # both
        return msgs.category, msgs.subcategory, msgs.summary

    def add_errors(self, errs: exceptions.ReportableDescribeError):
        """
        Adds errors represented by the Exception parameter.

        Errors with the same category, subcategory, and summary are merged
        together internally.

        :param errs: an Exception representing one or more occurrences of an
            error. A reference to this parameter is kept internally and may be
            modified by further error reports.
        """
        self._add_msg(self._errors, errs)

        key = self._key(errs)
        self._latest_error = self._errors.get(key)

    def add_warnings(self, warns: exceptions.ReportableDescribeWarning):
        """
        Adds warning represented by the ReportableDescribeWarning parameter.

        Warnings with the same category, subcategory, and summary are merged
        together internally.

        :param warns: an ReportableDescribeWarning representing one or more occurrences
            of an error. A reference to this parameter is kept internally and
            may be modified by subsequent warning reports.
        """
        self._add_msg(self._warnings, warns)

    def _add_msg(self, target: Aggregate, message: exceptions.MessagingMixin):
        key = self._key(message)

        existing = target.get(key, None)
        if existing:
            existing.merge(message)
        else:
            target[key] = message

    def raise_errors(self):
        """
        Raises an exception if there are any known errors reported in this or preceding method
        calls.

        Even if the "errors" parameter is provided, calling this method is preferred over
        raising the Exception directly. The result of calling this method is an Exception
        that contains information about all preceding reported errors rather than just
        the latest one captured in the parameter.

        :raises EDDUserError if any errors have been reported
        """
        if self._latest_error:
            raise self._latest_error

    def error_count(self, err_class: MaybeErrorType = None) -> int:
        return self._msg_count(self._errors, err_class)

    def warn_count(self, warn_class: MaybeWarningType = None) -> int:
        return self._msg_count(self._warnings, warn_class)

    def _msg_count(self, target: Aggregate, msg_class: MaybeTrackedType = None) -> int:
        if msg_class:
            matches = (e for e in target.values() if isinstance(e, msg_class))
            return sum(map(bool, matches))
        return len(target)

    def to_json(self) -> MessageSummary:
        result = {}
        if self._errors:
            result["errors"] = self._to_json(self._errors)
        if self._warnings:
            result["warnings"] = self._to_json(self._warnings)
        return result

    def _to_json(self, src: Aggregate) -> typing.List[typing.Any]:
        summary = []
        for _key, msg in src.items():
            summary.append(msg.to_json())
        return summary


def add_errors(key: TrackingId, errs: exceptions.ReportableDescribeError):
    """
    Reports one or more error occurrences from an ReportableDescribeError exception.

    This method is intended for use in stateful message tracking, so the
    Exception parameter will be raised immediately if message tracking is not
    configured for the workflow identified by this key. Raising the parameter
    supports reuse of code written for stateful reporting in cases where
    stateful reporting isn't configured. For example, a parser written to
    collect and report on all the errors in a file would instead raise the
    first encountered error.

    Each call to this function will result in a notifications to listeners on
    the edd.describe.signals.errors_reported signal.

    :param key: unique key for this workflow (e.g. the UUID for a single experiment
        description run)
    :param errs: ReportableDescribeError instance representing one or more error occurrences
    """
    # if UUID incoming, force to string
    key = str(key)
    # always trigger signal handlers
    errors_reported.send_robust(sender=MessageAggregator, key=key, errors=errs)

    if key not in _tracked_msgs:
        # re-raise immediately when not tracking
        raise errs


def warnings(key: TrackingId, warns: exceptions.ReportableDescribeWarning):
    """
    Reports one or more warning occurrences from an ReportableDescribeWarning exception.

    By default, warnings reported here are only logged and no further action is
    taken. Clients may also call tracker() to turn on error and warning
    aggregation for this key so that reported messages can be accessed when the
    end of the workflow is reached.

    Each call to this function will result in a notifications to listeners on
    the edd.describe.signals.warnings_reported signal.

    :param key: the unique key for this workflow (e.g. the UUID for a single experiment
        description run)
    :param warns: ReportableDescribeWarning instance representing one or more warning occurrences
    """
    # if UUID incoming, force to string
    key = str(key)
    warnings_reported.send_robust(sender=MessageAggregator, key=key, warnings=warns)


def raise_errors(key: TrackingId, errors: MaybeError = None):
    """
    Raises errors if any exist, including any provided as an argument.

    This function is intended for use in workflows that opt into error tracking
    via a call to tracker(). When message tracking is enabled, this method
    allows clients to control when deferred errors are raised, and as a
    convenience, to also report an error. If message tracking isn't enabled for
    this key, the only effect of calling this method without the errors
    parameter is to print a warning message.

    :param key: the unique key that identifies this workflow
        (e.g. the UUID for a single workflow)
    :param errors: an optional ReportableDescribeError instance
    :raises ReportableDescribeError: if any tracked errors are stored,
        including the parameter to this call
    """
    key = str(key)
    tracked: MessageAggregator = _tracked_msgs.get(key, None)

    if errors:
        # report errors parameter so signal will get sent and errors will get merged with others
        # if tracking is enabled for this key
        add_errors(key, errors)
    if not tracked:
        logger.warning(
            f'Key "{key}" is not configured for error tracking. raise_errors() '
            f"will never raise an exception when called with zero arguments"
        )
        return
    # if aggregating messages for this key,
    # merge with any previously-reported errors of the same type,
    # then raise an Exception (maybe the merged result)
    tracked.raise_errors()


@contextmanager
def tracker(key: TrackingId):
    """Begins tracking of errors and warnings reported with the given key."""
    key = str(key)
    logger.debug(f"Enabling message tracking for {key}")
    try:
        tracked = MessageAggregator()
        _tracked_msgs[key] = tracked
        yield tracked
    finally:
        logger.debug(f"Disabling message tracking for {key}")
        del _tracked_msgs[key]


# Define a dict of MessageAggregators to support opt-in tracking
# for each unique key (experiment description run ID) handled in this process.
# To prevent potential interference between runs
# if multiple sequential requests for the same run
# happen to run in the same worker process,
# state for each run must be cleared
# when the current thread is finished with it
# (e.g. before replying to the current HTTP request or ending the current Celery task).
# Using the tracker() context manager handles this automagically
_tracked_msgs: typing.Dict[str, MessageAggregator] = {}


def error_count(key: TrackingId, err_class: MaybeErrorType = None) -> int:
    """
    Tests the number of unique error types that have been reported for this workflow.

    Unique categories are defined by the combination of (category, subcategory,
    summary) for ReportableDescribeError classes. See also MessageAggregator._key().
    THIS FUNCTION IS INTERNAL API, AND MAY CHANGE IN FUTURE RELEASES.

    :param key: the unique key that identifies this workflow
        (e.g. the UUID for a single experiment description run)
    :return: the number of unique reported error types of the specified class,
        or its descendents
    """
    try:
        return _tracked_msgs[str(key)].error_count(err_class)
    except KeyError as e:
        raise exceptions.DescribeError(f"Not tracking for {key}") from e


def warning_count(key: TrackingId, warn_class: MaybeWarningType = None) -> int:
    """
    Tests the number of unique error types that have been reported for this workflow.

    Unique categories are defined by the combination of (category, subcategory,
    summary) for ReportableDescribeWarning classes. See also MessageAggregator._key().
    This FUNCTION IS INTERNAL API, AND MAY CHANGE IN FUTURE RELEASES.

    :param key: the unique key that identifies this workflow
        (e.g. the UUID for a single experiment description run)
    :return: the number of unique reported warning types of the specified class,
        or its descendents
    """
    try:
        return _tracked_msgs[str(key)].warn_count(warn_class)
    except KeyError as e:
        raise exceptions.DescribeError(f"Not tracking for {key}") from e


def build_messages_summary(key: TrackingId) -> MessageSummary:
    """
    Builds a Dict representation of all the errors and warnings reported for this
    workflow that's suitable for JSON serialization.

    This FUNCTION IS INTERNAL API, AND MAY CHANGE IN FUTURE RELEASES.
    """
    messages: MessageAggregator = _tracked_msgs.get(str(key), None)
    return messages.to_json() if messages else {}


@receiver(errors_reported, dispatch_uid="edd.describe.log_reported_errors")
def log_reported_errors(sender, key, errors, **kwargs):
    try:
        reporter = _tracked_msgs.get(key, None)
        if reporter:
            reporter.add_errors(errors)
    except Exception as e:
        logger.exception(e)


@receiver(warnings_reported, dispatch_uid="edd.describe.log_reported_warnings")
def log_reported_warnings(sender, key, warnings, **kwargs):
    try:
        reporter = _tracked_msgs.get(key, None)
        if reporter:
            reporter.add_warnings(warnings)
    except Exception as e:
        logger.exception(e)
