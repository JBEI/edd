import collections
import typing
import warnings

from django.conf import settings
from django.utils.translation import ugettext_lazy as _

DetailValue = typing.Union[str, typing.Sequence[str], int, float, None]


class LoadError(Exception):
    """
    Parent Exception for all exception types in the edd.load app.

    Contains no boilerplate meant for reading by end-users by default.
    """

    pass


class LoadWarning(Warning):
    """
    Parent Warning for "plain" import/load warnings.

    Contains no boilerplate meant for reading by end-users.
    """

    pass


class ReportingLimitWarning(LoadWarning):
    pass


class MessagingMixin:
    """Mixin class for Exceptions that also report messages to end-users."""

    def __init__(
        self,
        category: str,
        summary: typing.Optional[str] = "",
        subcategory: typing.Optional[str] = "",
        details: DetailValue = None,
        resolution: str = "",
        docs_link: str = "",
        id="",
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
        self.subcategory: typing.Optional[str] = subcategory
        self.resolution: typing.Optional[str] = resolution
        self.docs_link: typing.Optional[str] = docs_link
        self.id: str = id
        self.workaround_text: str = workaround_text

        self.details: typing.List[str] = []
        if details:
            if isinstance(details, str):
                self.details = [details]
            elif isinstance(details, collections.Iterable):
                # account for sets, frozensets, etc that may be more convenient for client code
                self.details = list(details)
            elif isinstance(details, int) or isinstance(details, float):
                self.details = [str(details)]
            else:
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
            self.id,
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
                "Passed error reporting limit", category=ReportingLimitWarning
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
        result = {"category": self.category, "summary": self.summary}
        # the others may be included, if set
        included = ("docs_link", "id", "resolution", "subcategory", "workaround_text")
        for key in included:
            value = getattr(self, key, None)
            if value:
                result[key] = value
        # special handling for details to account for reporting limit
        if self.details:
            limit = getattr(settings, "EDD_IMPORT_ERR_REPORTING_LIMIT", 0)
            if limit:
                count = len(self.details) - limit
                rest = _("...(+{count} more)").format(count=count)
                showing = self.details[:limit] + [rest]
            else:
                showing = self.details
            # force translation proxy objects into strings
            result["detail"] = ", ".join(str(item) for item in showing)

        return result


class EDDImportError(MessagingMixin, LoadError):
    def __init__(self, **kwargs):
        if "category" not in kwargs:
            kwargs.update(category=_("Uncategorized Error"))
        super().__init__(**kwargs)


class EDDImportWarning(MessagingMixin, LoadWarning):
    def __init__(self, **kwargs):
        if "category" not in kwargs:
            kwargs.update(category=_("Uncategorized Warning"))
        super().__init__(**kwargs)


class InvalidLoadRequestError(EDDImportError):
    def __init__(self, **kwargs):
        super().__init__(
            category=_("Invalid ID"),
            summary=_("Data loading request was not found"),
            **kwargs,
        )
