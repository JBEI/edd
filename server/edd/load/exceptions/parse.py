from django.utils.translation import ugettext_lazy as _

from .core import EDDImportError, EDDImportWarning


class ParseError(EDDImportError):
    pass


class ParseWarning(EDDImportWarning):
    pass


class BadParserError(ParseError):
    def __init__(self, **kwargs):
        super().__init__(
            category=_("Internal error"), summary=_("Parser error"), **kwargs
        )


class UnsupportedMimeTypeError(ParseError):
    def __init__(self, **kwargs):
        super().__init__(
            category=_("Invalid file"), summary=_("Unsupported mime type"), **kwargs
        )


class EmptyFileError(ParseError):
    def __init__(self, **kwargs):
        super().__init__(
            category=_("Invalid file"), summary=_("File is empty"), **kwargs
        )


class IgnoredWorksheetWarning(ParseWarning):
    def __init__(self, **kwargs):
        super().__init__(
            category=_("Ignored data"), summary=_("Worksheets ignored"), **kwargs
        )


class RequiredColumnError(ParseError):
    def __init__(self, **kwargs):
        super().__init__(
            category=_("Invalid file"),
            summary=_("Missing required columns"),
            resolution=kwargs.pop(
                "resolution",
                _(
                    "Fix formatting in your file, or go back and choose the correct format"
                ),
            ),
            **kwargs,
        )


class DuplicateColumnError(ParseError):
    def __init__(self, **kwargs):
        super().__init__(
            category=_("Invalid file"), summary=_("Duplicate column headers"), **kwargs
        )


class IgnoredColumnWarning(ParseWarning):
    def __init__(self, **kwargs):
        super().__init__(
            category=_("Ignored data"), summary=_("Ignored columns"), **kwargs
        )


class IgnoredValueWarning(ParseWarning):
    def __init__(self, **kwargs):
        super().__init__(
            category=_("Ignored data"),
            summary=_("Ignored values before recognized headers"),
            **kwargs,
        )


class UnsupportedUnitsError(ParseError):
    def __init__(self, **kwargs):
        super().__init__(
            category=_("Invalid file"), summary=_("Unsupported units"), **kwargs
        )


class RequiredValueError(ParseError):
    def __init__(self, **kwargs):
        super().__init__(
            category=_("Invalid file"), summary=_("Required values missing"), **kwargs
        )


class InvalidValueError(ParseError):
    def __init__(self, **kwargs):
        super().__init__(
            category=_("Invalid file"), summary=_("Invalid value"), **kwargs
        )
