from collections import namedtuple

from django.urls import reverse
from django.utils.translation import gettext_lazy as _

from main.query import get_absolute_url

from .core import EDDImportError, EDDImportWarning


class ResolveError(EDDImportError):
    pass


class ResolveWarning(EDDImportWarning):
    pass


class ImportTooLargeError(ResolveError):
    def __init__(self, **kwargs):
        super().__init__(
            category=_("Import is too large"),
            summary=_(
                "Break up your file for import, and consider contacting EDD "
                "administrators to request an import size limit increase"
            ),
            **kwargs,
        )


class UnmatchedAssayError(ResolveError):
    def __init__(self, **kwargs):
        super().__init__(
            category=_("File doesn't match study"),
            summary=_("Assay names in file not found in study"),
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
        url = reverse("main:load_flat:wizard_help")
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
    def __init__(self, **kwargs):
        super().__init__(
            category=_("Invalid Request"),
            summary=_("Illegal state transition"),
            **kwargs,
        )


# TODO: resolve with more recent changes to legacy import for external lookup
class CommunicationError(ResolveError):
    def __init__(self, **kwargs):
        super().__init__(
            category=_("Communication error"),
            summary=_("EDD was unable to contact a third-party application"),
            resolution=kwargs.get("resolution", _("Wait a few minutes and try again")),
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
