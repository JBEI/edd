from django.utils.translation import gettext as _

from .messaging import MessagingMixin


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


class EDDImportError(MessagingMixin, LoadError):
    def __init__(self, *, category=_("Uncategorized Error"), **kwargs):
        super().__init__(category=category, **kwargs)


class EDDImportWarning(MessagingMixin, LoadWarning):
    def __init__(self, *, category=_("Uncategorized Warning"), **kwargs):
        super().__init__(category=category, **kwargs)


class InvalidLoadRequestError(EDDImportError):
    def __init__(self, **kwargs):
        super().__init__(
            category=_("Invalid ID"),
            summary=_("Data loading request was not found"),
            **kwargs,
        )


class ParseError(EDDImportError):
    pass


class ParseWarning(EDDImportWarning):
    pass


class UnsupportedMimeTypeError(ParseError):
    def __init__(self, *, mime_type, supported, **kwargs):
        super().__init__(
            category=_("Invalid file"),
            summary=_("Unsupported mime type"),
            details=[
                _(
                    "The upload you provided was sent with MIME type {mime}. "
                    "However, EDD expected one of the following supported "
                    "MIME types: {supported}."
                ).format(mime=mime_type, supported=supported),
            ],
            resolution=_(
                "Go back to Step 1 to select a layout supporting {mime}, "
                "or convert your upload to one of the supported types."
            ).format(mime=mime_type),
            **kwargs,
        )


class IgnoredWorksheetWarning(ParseWarning):
    def __init__(self, *, processed_title, ignored_sheet_count, **kwargs):
        super().__init__(
            category=_("Ignored data"),
            summary=_("Worksheets ignored"),
            details=_(
                "Only the first sheet in your workbook, `{sheet}`, was "
                "processed. All other sheets were ignored ({count})."
            ).format(sheet=processed_title, count=ignored_sheet_count),
            **kwargs,
        )


class RequiredColumnError(ParseError):
    def __init__(self, **kwargs):
        super().__init__(
            category=_("Invalid file"),
            summary=_("Missing required columns"),
            resolution=_(
                "Fix the headings in your file, or go back "
                "and choose another layout."
            ),
            **kwargs,
        )


class IgnoredColumnWarning(ParseWarning):
    def __init__(self, **kwargs):
        super().__init__(
            category=_("Ignored data"),
            summary=_("Ignored columns"),
            **kwargs,
        )


class IgnoredMetadataColumnWarning(ParseWarning):
    def __init__(self, *, ignored_name, **kwargs):
        super().__init__(
            category=_("Ignored data"),
            summary=_("Ignored columns"),
            details=_(
                "Found multiple possible metadata matches for `{title}`, "
                "please contact support."
            ).format(title=ignored_name),
            **kwargs,
        )


class IgnoredRowWarning(ParseWarning):
    def __init__(self, *, row_index, **kwargs):
        super().__init__(
            category=_("Ignored data"),
            summary=_("Missing required data in the following rows"),
            details=str(row_index),
            **kwargs,
        )


class InvalidValueWarning(ParseWarning):
    def __init__(self, *, bad_value, **kwargs):
        super().__init__(
            category=_("Ignored data"),
            summary=_("Invalid values in row"),
            details=[
                _("Could not validate value `{value}`").format(value=bad_value),
            ],
            **kwargs,
        )


class RequiredValueWarning(ParseWarning):
    def __init__(self, **kwargs):
        super().__init__(
            category=_("Ignored data"),
            summary=_("Required values missing from row"),
            **kwargs,
        )


class ResolveError(EDDImportError):
    pass


class ResolveWarning(EDDImportWarning):
    pass


class FailedTransitionError(ResolveError):
    def __init__(self, *, begin, end, **kwargs):
        super().__init__(
            category=_("Invalid Request"),
            summary=_("Failed state transition"),
            details=_("Transition from {begin} to {end} has failed.").format(
                begin=begin,
                end=end,
            ),
            **kwargs,
        )


class CommunicationError(ResolveError):
    def __init__(self, **kwargs):
        super().__init__(
            category=_("Communication Error"),
            summary=_("EDD was unable to contact a third-party application."),
            resolution=_("Wait a few minutes and try again."),
            **kwargs,
        )


class UnknownLayout(LoadError):
    pass


__all__ = [
    "CommunicationError",
    "EDDImportError",
    "EDDImportWarning",
    "IgnoredColumnWarning",
    "IgnoredMetadataColumnWarning",
    "IgnoredWorksheetWarning",
    "InvalidLoadRequestError",
    "InvalidValueWarning",
    "LoadError",
    "ParseError",
    "ParseWarning",
    "RequiredColumnError",
    "RequiredValueWarning",
    "ResolveError",
    "ResolveWarning",
    "UnknownLayout",
    "UnsupportedMimeTypeError",
]
