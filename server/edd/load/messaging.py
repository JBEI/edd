import typing
import warnings
from collections.abc import Iterable

from django.conf import settings
from django.utils.functional import Promise
from django.utils.translation import gettext_lazy as _

DetailValue = str | typing.Sequence[str] | int | float | None


class ReportingLimitWarning(Warning):
    pass


class MessagingMixin:
    """Mixin class for Exceptions that also report messages to end-users."""

    def __init__(
        self,
        category: str,
        summary: str | None = "",
        subcategory: str | None = "",
        details: DetailValue = None,
        resolution: str = "",
        docs_link: str = "",
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
        """
        super().__init__()
        self.category: str = category
        self.summary: str = summary
        self.subcategory: str | None = subcategory
        self.resolution: str | None = resolution
        self.docs_link: str | None = docs_link

        self.details: list[str] = []
        match details:
            case None:
                pass
            case str() | Promise():
                self.details = [details]
            case int() | float():
                self.details = [str(details)]
            case Iterable() as d:
                # account for sets, frozensets, etc that may be more convenient for client code
                self.details = list(d)
            case _:
                raise TypeError(f"Unsupported type {type(details)}")
        self._check_report_limit()

    def __key(self):
        return (
            self.category,
            self.summary,
            self.subcategory,
            tuple(self.details),
            self.resolution,
            self.docs_link,
        )

    def __eq__(self, other):
        return isinstance(other, MessagingMixin) and self.__key() == other.__key()

    def __hash__(self):
        return hash(self.__key())

    def __str__(self):
        cols = [f'category="{self.category}"']
        if self.subcategory:
            cols.append(f'subcategory="{self.subcategory}"')
        if self.details:
            # force translation proxies, if any, to string,
            # and truncate details that may have originated from user (e.g. import file content)
            deets = ", ".join(str(item) for item in self.details)
            cols.append(f'details="{self._truncate(deets)}"')
        cols_str = ", ".join(cols)
        return f"{self.__class__.__name__}({cols_str})"

    @staticmethod
    def _truncate(s: str):
        if len(s) <= 30:
            return s
        return s[:30] + "…"

    def _check_report_limit(self):
        limit = getattr(settings, "EDD_IMPORT_ERR_REPORTING_LIMIT", 0)
        if limit and len(self.details) >= limit:
            warnings.warn(
                "Passed error reporting limit",
                category=ReportingLimitWarning,
                stacklevel=2,
            )

    def merge(self, other: "MessagingMixin") -> None:
        """
        Merges details from other exception into self.

        :param other: another MessagingMixin exception
        """
        # extend detail attribute in order,
        # while filtering duplicates
        unique = set(other.details) - set(self.details)

        def items_to_merge():
            for item in other.details:
                if item in unique:
                    yield item

        self.details.extend(items_to_merge())
        self._check_report_limit()

    def to_json(self):
        # category and summary are required
        result = {"category": str(self.category), "summary": str(self.summary)}
        # the others may be included, if set
        included = ("docs_link", "resolution", "subcategory")
        for key in included:
            value = getattr(self, key, None)
            if value:
                result[key] = str(value)
        # special handling for details to account for reporting limit
        if self.details:
            limit = getattr(settings, "EDD_IMPORT_ERR_REPORTING_LIMIT", 0)
            overage = len(self.details) - limit
            if limit and overage > 0:
                rest = _("...(+{count} more)").format(count=overage)
                showing = self.details[:limit] + [rest]
            else:
                showing = self.details
            # force translation proxy objects into strings
            result["detail"] = ", ".join(str(item) for item in showing)

        return result
