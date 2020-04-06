import collections
import itertools
import typing

from django.conf import settings
from django.utils.translation import ugettext_lazy as _


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
        details: typing.Union[str, typing.Sequence[str], None] = None,
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
        self.subcategory: typing.Optional[str] = subcategory
        self.resolution: typing.Optional[str] = resolution
        self.docs_link: typing.Optional[str] = docs_link
        self.id: str = id
        self.truncated: int = truncated
        self.aborted: int = aborted
        self.workaround_text: str = workaround_text

        self.details: typing.List[str] = []
        if details:
            if isinstance(details, str):
                self.details = [details]
            elif isinstance(details, collections.Iterable):
                # account for sets, frozensets, etc that may be more convenient for client code
                self.details = list(details)
                # if needed, truncate detail reports to the configured limit
                limit = getattr(settings, "EDD_IMPORT_ERR_REPORTING_LIMIT", 0)
                if limit:
                    self.details = self.details[:limit]
            elif isinstance(details, int) or isinstance(details, float):
                self.details = [str(details)]
            else:
                raise TypeError(f"Unsupported type {type(details)}")

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

    def merge(self, other: "MessagingMixin") -> None:
        """
        Merges details from other exception into self.

        :param other: another MessagingMixin exception
        :raises ReportingLimitWarning: if merging would go beyond configured
            limits on unique detail counts, but only the first time
        """
        limit = getattr(settings, "EDD_IMPORT_ERR_REPORTING_LIMIT", 0)
        # extend detail attribute in order,
        # while filtering duplicates,
        # and only going up to limit amount
        unique = set(other.details) - set(self.details)

        def items_to_merge():
            for item in other.details:
                if item in unique:
                    yield item

        # copy abort limit, if present
        if other.aborted:
            self.aborted = other.aborted
        if limit:
            items = items_to_merge()
            # only extend up to the limit
            self.details.extend(itertools.islice(items, limit - len(self.details)))
            # count the remainder of items that would be added
            truncated = len(list(items))
            self.truncated += truncated
            if self.truncated == truncated:
                # first time going over, raise warning
                raise ReportingLimitWarning()
        else:
            self.details.extend(items_to_merge())

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
