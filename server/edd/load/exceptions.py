from collections import namedtuple

from django.urls import reverse
from django.utils.translation import gettext as _

from main.query import get_absolute_url

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


class UnplannedOverwriteError(EDDImportError):
    def __init__(self, *, count, **kwargs):
        super().__init__(
            category=_("Study Altered"),
            summary=_(
                "Import would overwrite values that weren't detected when the file was "
                "first checked against the study."
            ),
            details=_(
                "No overwrite was planned, but {count} values would be overwritten."
            ).format(count=count),
            resolution=_(
                "Check that collaborators are finished changing the study, "
                "then re-try your import."
            ),
            **kwargs,
        )


class ParseError(EDDImportError):
    pass


class ParseWarning(EDDImportWarning):
    pass


class BadParserError(ParseError):
    def __init__(self, *, parser_class, problem, **kwargs):
        super().__init__(
            category=_("Internal error"),
            summary=_("Parser error"),
            details=_(
                "Unable to instantiate parser class {parser_class}. "
                "The problem was: {problem}"
            ).format(parser_class=parser_class, problem=problem),
            **kwargs,
        )


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


class DuplicateColumnError(ParseError):
    def __init__(self, **kwargs):
        super().__init__(
            category=_("Invalid file"),
            summary=_("Duplicate column headers"),
            **kwargs,
        )


class IgnoredColumnWarning(ParseWarning):
    def __init__(self, **kwargs):
        super().__init__(
            category=_("Ignored data"),
            summary=_("Ignored columns"),
            **kwargs,
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
            category=_("Invalid file"),
            summary=_("Unsupported units"),
            **kwargs,
        )


class RequiredValueError(ParseError):
    def __init__(self, **kwargs):
        super().__init__(
            category=_("Invalid file"),
            summary=_("Required values missing"),
            **kwargs,
        )


class InvalidValueError(ParseError):
    def __init__(self, **kwargs):
        super().__init__(
            category=_("Invalid file"),
            summary=_("Invalid value"),
            **kwargs,
        )


class ResolveError(EDDImportError):
    pass


class ResolveWarning(EDDImportWarning):
    pass


class ImportTooLargeError(ResolveError):
    def __init__(self, *, max_count, **kwargs):
        super().__init__(
            category=_("Import is too large"),
            summary=_("Uploaded file has too much data to process."),
            details=_("EDD is configured for a maximum of {max_count} records."),
            resolution=_(
                "Split your data into smaller files for upload, or contact "
                "the EDD administrators to use alternative methods of import."
            ),
            **kwargs,
        )


class UnmatchedAssayError(ResolveError):
    def __init__(self, **kwargs):
        super().__init__(
            category=_("File doesn't match study"),
            summary=_("Assay names in file not found in study"),
            resolution=_(
                "Check for: A) identifiers in the file that don't match assays "
                "in the study, or B) missing assays in the study due to omitted "
                "time in the experiment definition."
            ),
            **kwargs,
        )


class UnmatchedLineError(ResolveError):
    def __init__(self, **kwargs):
        super().__init__(
            category=_("File doesn't match study"),
            summary=_("Line names in file not found in study"),
            **kwargs,
        )


class UnmatchedStudyInternalsError(ResolveError):
    def __init__(self, **kwargs):
        super().__init__(
            category=_("File doesn't match study"),
            summary=_(
                "Identifiers in your file must match either line or assay names in the "
                "study"
            ),
            **kwargs,
        )


class DuplicateAssayError(ResolveError):
    def __init__(self, **kwargs):
        super().__init__(
            category=_("Cannot resolve assay names"),
            summary=_("Study has duplicate assay names"),
            **kwargs,
        )


class DuplicateLineError(ResolveError):
    def __init__(self, **kwargs):
        super().__init__(
            category=_("Cannot resolve line names"),
            summary=_("Study has duplicate line names"),
            **kwargs,
        )


class UnmatchedMtypeError(ResolveError):
    def __init__(self, **kwargs):
        # use absolute URLs so they also function from user emails
        url = reverse("load_flat:wizard_help")
        url = get_absolute_url(f"{url}#generic-mtypes")
        docs_link = _(
            "Check that you chose the right category for these measurements. If so, "
            "check the list of "
            '<a href="{url}" target="_blank">Generic Measurement Types</a> to see if '
            "these are listed under another name"
        ).format(url=url)
        super().__init__(
            category=_("Measurement types not found"),
            summary=_("Measurement types do not exist in EDD"),
            docs_link=docs_link,
            **kwargs,
        )


class OverdeterminedTimeError(ResolveError):
    def __init__(self, **kwargs):
        super().__init__(
            category=_("Overdetermined time"),
            summary=_(
                "Your file has time data, but assays in the study also have "
                "time metadata"
            ),
            **kwargs,
        )


class IllegalTransitionError(ResolveError):
    def __init__(self, *, begin, end, **kwargs):
        super().__init__(
            category=_("Invalid Request"),
            summary=_("Illegal state transition"),
            details=_("Transition from {begin} to {end} is not allowed.").format(
                begin=begin,
                end=end,
            ),
            **kwargs,
        )


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


# TODO: resolve with more recent changes to legacy import for external lookup
class CommunicationError(ResolveError):
    def __init__(self, **kwargs):
        super().__init__(
            category=_("Communication Error"),
            summary=_("EDD was unable to contact a third-party application."),
            resolution=_("Wait a few minutes and try again."),
            **kwargs,
        )


class MissingAssayTimeError(ResolveError):
    def __init__(self, **kwargs):
        super().__init__(
            category=_("Missing assay time metadata"),
            summary=_(
                "Some assays are missing time metadata required to complete the import"
            ),
            **kwargs,
        )


class TimeUnresolvableError(ResolveError):
    def __init__(self, **kwargs):
        super().__init__(
            category=_("Missing time information"),
            subcategory=_("Time unresolvable (file matched lines)"),
            summary=_(
                "EDD can't complete your import because time isn't provided in the file or via "
                "the study"
            ),
            resolution=kwargs.get(
                "resolution",
                _(
                    "Either: A) use a file format that includes time, B) set assay time metadata "
                    "in the study, or C) If you provided assay time, correct your file or "
                    "study so that identifiers in the file match assay names in the study"
                ),
            ),
            **kwargs,
        )


class TimeNotProvidedError(ResolveError):
    def __init__(self, **kwargs):
        super().__init__(
            category=_("Missing time information"),
            subcategory=_("Time not provided (file matched assays)"),
            summary=_(
                "EDD can't complete your import because time isn't provided in the file or via "
                "the study"
            ),
            resolution=kwargs.get(
                "resolution",
                _(
                    "Either: A) use a file format that includes time, or B) set assay time "
                    "metadata in the study"
                ),
            ),
            **kwargs,
        )


class MeasurementCollisionError(ResolveError):
    def __init__(self, **kwargs):
        super().__init__(
            category=_("Measurement collision"),
            summary=_("Duplicate simultaneous measurements"),
            **kwargs,
        )


class ImportConflictWarning(ResolveWarning):
    ConflictSummary = namedtuple("ConflictSummary", ["from_study", "from_import"])
    _normal_resolution = _(
        "Data points with the same protocol and time as the file will be replaced."
    )
    _multi_overwrite_resolution = _(
        "Data points with the same protocol and time as the file will be replaced. This "
        "study already contains duplicates for some values that will be overwritten."
    )


class OverwriteWarning(ImportConflictWarning):
    def __init__(self, total: int, conflicts: ImportConflictWarning.ConflictSummary):
        """
        Initializes the Overwrite warning

        :param total: the total number of MeasurementValues in the import
            (== #MeasurementParseRecords)
        :param conflicts: a summary of conflicts detected between the import and the study
        """
        self.total = total
        self.conflicts = conflicts

        super().__init__(
            category=_("Overwrite warning"),
            summary=_(
                "Submitting this import will overwrite data. {overwrite} values will "
                "be updated."
            ).format(overwrite=conflicts.from_study),
            resolution=self._normal_resolution,
        )
        if conflicts.from_study > conflicts.from_import:
            self.category = _("Overwrite warning (multiple overwrites)")
            self.resolution = self._multi_overwrite_resolution


class MergeWarning(ImportConflictWarning):
    def __init__(self, total: int, conflicts: ImportConflictWarning.ConflictSummary):
        """
        Initializes the Merge warning

        :param total: the total number of MeasurementValues in the import
            (== #MeasurementParseRecords)
        :param conflicts: a summary of conflicts detected between the import and the study
        """
        self.total = total
        self.conflicts = conflicts

        add = total - conflicts.from_import
        super().__init__(
            category=_("Merge warning (overwrite)"),
            summary=_(
                "Submitting this import will both add AND overwrite data. {add} new "
                "values will be added and {overwrite} existing values will be updated."
            ).format(add=add, overwrite=conflicts.from_study),
            resolution=self._normal_resolution,
        )
        if conflicts.from_study > conflicts.from_import:
            self.category = _("Merge warning (multiple overwrites)")
            self.resolution = self._multi_overwrite_resolution


class ImportBoundsError(LoadError):
    pass


class ImportTaskError(LoadError):
    pass


__all__ = [
    "BadParserError",
    "CommunicationError",
    "DuplicateAssayError",
    "DuplicateColumnError",
    "DuplicateLineError",
    "EDDImportError",
    "EDDImportWarning",
    "IgnoredColumnWarning",
    "IgnoredValueWarning",
    "IgnoredWorksheetWarning",
    "IllegalTransitionError",
    "ImportBoundsError",
    "ImportConflictWarning",
    "ImportTaskError",
    "ImportTooLargeError",
    "InvalidLoadRequestError",
    "InvalidValueError",
    "LoadError",
    "MeasurementCollisionError",
    "MergeWarning",
    "MissingAssayTimeError",
    "OverdeterminedTimeError",
    "OverwriteWarning",
    "ParseError",
    "ParseWarning",
    "RequiredColumnError",
    "RequiredValueError",
    "ResolveError",
    "ResolveWarning",
    "TimeNotProvidedError",
    "TimeUnresolvableError",
    "UnmatchedAssayError",
    "UnmatchedLineError",
    "UnmatchedMtypeError",
    "UnmatchedStudyInternalsError",
    "UnplannedOverwriteError",
    "UnsupportedMimeTypeError",
    "UnsupportedUnitsError",
]
