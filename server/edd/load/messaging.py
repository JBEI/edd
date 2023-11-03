import typing
from collections.abc import Iterable

from django.utils.functional import Promise

DetailValue = str | typing.Sequence[str] | None


class MessagingMixin:
    """Mixin class for Exceptions that also report messages to end-users."""

    def __init__(
        self,
        category: str,
        summary: str | None = "",
        details: DetailValue = None,
        resolution: str = "",
    ):
        """
        Initializes the exception.

        :param category: the user-facing category this error falls into
        :param summary: optional user-facing summary text for the class of error.
            This should be a concise phrase descriptive of the error.
        :param details: a string or list of strings that detail individual occurrences of this
            error type.
        :param resolution: optional user-facing prompt for how to resolve the error
        """
        super().__init__()
        self.category: str = category
        self.summary: str = summary
        self.resolution: str | None = resolution

        self.details: list[str] = []
        match details:
            case None:
                pass
            case str() | Promise():
                self.details = [details]
            case Iterable() as d:
                # account for sets, frozensets, etc that may be more convenient for client code
                self.details = list(d)
