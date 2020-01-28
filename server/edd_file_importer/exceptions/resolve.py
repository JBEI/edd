# coding: utf-8

from django.urls import reverse
from django.utils.translation import ugettext_lazy as _

from main.query import get_absolute_url

from .core import EDDImportError, EDDImportWarning


class ResolveError(EDDImportError):
    pass


class ResolveWarning(EDDImportWarning):
    pass


class InvalidIdError(ResolveError):
    def __init__(self, **kwargs):
        super().__init__(
            category=_("Invalid file"), summary=_("Invalid identifier format"), **kwargs
        )


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


class UnmatchedNamesError(ResolveError):
    def __init__(self, **kwargs):
        super().__init__(
            category=_("File doesn't match study"),
            summary=_(
                "Identifiers in your file must match either line or assay names in the "
                "study"
            ),
            **kwargs,
        )


class UnmatchedMtypeError(ResolveError):
    def __init__(self, **kwargs):
        # use absolute URLs so they also function from user emails
        url = reverse("edd_file_importer:import_help")
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


_IDS_LINK = 'For help, see <a href="{url}" target="_blank">Standard Identifiers</a>'


# TODO:
# communication errors... current model load_or_create methods don't support differentiating
#  between different communication errors with external databasaes, but we should eventually
#  add additional detail to improve user feedback & simplify debugging
# PARTNER_INTERNAL_ERROR = auto()
# COMMUNICATION_ERROR = auto()
# PERMISSION_DENIED = auto()
class ProteinNotFoundError(ResolveError):
    def __init__(self, **kwargs):
        # use absolute URLs so they also function from user emails
        url = reverse("edd_file_importer:import_help")
        url = get_absolute_url(f"{url}#ids")
        super().__init__(
            category=_("Proteins not found"),
            summary=_("Not found in UniProt or ICE"),
            docs_link=_(_IDS_LINK).format(url=url),
            **kwargs,
        )


class GeneNotFoundError(ResolveError):
    def __init__(self, **kwargs):
        # use absolute URLs so they also function from user emails
        url = reverse("edd_file_importer:import_help")
        url = get_absolute_url(f"{url}#ids")
        super().__init__(
            category=_("Genes not found"),
            summary=_("Not found"),
            docs_link=_(_IDS_LINK).format(url=url),
            **kwargs,
        )


class PhosphorNotFoundError(ResolveError):
    def __init__(self, **kwargs):
        # use absolute URLs so they also function from user emails
        url = reverse("edd_file_importer:import_help")
        url = get_absolute_url(f"{url}#ids")
        super().__init__(
            category=_("Fluorophores not found"),
            summary=_("Not found in EDD"),
            docs_link=_(_IDS_LINK).format(url=url),
            **kwargs,
        )


class MetaboliteNotFoundError(ResolveError):
    def __init__(self, **kwargs):
        # use absolute URLs so they also function from user emails
        url = reverse("edd_file_importer:import_help")
        url = get_absolute_url(f"{url}#ids")
        super().__init__(
            category=_("Metabolites not found"),
            summary=_("Not found in PubChem"),
            resolution=_(
                'Use a valid PubChem CID in the form "CID:0000", or "CID:0000:Label"'
            ),
            docs_link=_(_IDS_LINK).format(url=url),
            **kwargs,
        )


class CompartmentNotFoundError(ResolveError):
    def __init__(self, **kwargs):
        super().__init__(
            category=_("Missing required input"),
            summary=_("Measurement compartment"),
            **kwargs,
        )


class UnitsNotProvidedError(ResolveError):
    def __init__(self, **kwargs):
        super().__init__(
            category=_("Missing required input"),
            summary=_("Measurement units"),
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


class OverwriteWarning(ResolveWarning):
    def __init__(self, **kwargs):
        super().__init__(
            category=_("Overwrite warning"),
            summary=_("Submitting this import will overwrite data"),
            resolution=kwargs.get(
                "resolution",
                _(
                    "Data points with the same protocol and time as the file "
                    "will be replaced"
                ),
            ),
            id="overwrite_warning",
            workaround_text=_("Overwrite"),
            **kwargs,
        )


class DuplicationWarning(ResolveWarning):
    def __init__(self, **kwargs):
        super().__init__(
            category=_("Duplication warning"),
            summary=_("Submitting this import will duplicate data"),
            resolution=kwargs.get(
                "resolution",
                _(
                    "Either remove measurements with the same protocol & time as the file,"
                    " or continue with creating duplicates."
                ),
            ),
            id="duplication_warning",
            workaround_text=_("Duplicate"),
            **kwargs,
        )


class UnexpectedError(ResolveError):
    def __init__(self, **kwargs):
        super().__init__(
            category=_("Error"), summary=_("An unexpected error occurred"), **kwargs
        )
