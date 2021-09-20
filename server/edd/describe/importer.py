import codecs
import copy
import json
import logging
import traceback
from collections import OrderedDict, defaultdict
from io import BytesIO
from pprint import pformat
from typing import Any, Dict, List, Tuple

from django.conf import settings
from django.core.mail import mail_admins, send_mail
from django.db import transaction
from django.urls import reverse
from requests import codes

from edd.search.registry import StrainRegistry
from main.forms import RegistryValidator
from main.models import Assay, Line, Strain
from main.signals import study_described

# avoiding loading a ton of names to the module by only loading the namespace to constants
from . import constants
from .constants import (
    ALLOW_DUPLICATE_NAMES_PARAM,
    ALLOW_NON_STRAIN_PARTS,
    BAD_GENERIC_INPUT_CATEGORY,
    DRY_RUN_PARAM,
    DUPLICATE_COMPUTED_LINE_NAMES,
    DUPLICATE_INPUT_ASSAY_NAMES,
    EMAIL_WHEN_FINISHED,
    EMPTY_FOLDER_ERROR_CATEGORY,
    EMPTY_FOLDER_ERROR_TITLE,
    EMPTY_RESULTS,
    ERROR_PRIORITY_ORDER,
    EXISTING_ASSAY_NAMES,
    EXISTING_LINE_NAMES,
    GENERIC_ICE_RELATED_ERROR,
    ICE_FOLDERS_KEY,
    IGNORE_ICE_ACCESS_ERRORS_PARAM,
    INTERNAL_EDD_ERROR_CATEGORY,
    MISSING_REQUIRED_NAMING_INPUT,
    NO_ENTRIES_TITLE,
    NO_FILTERED_ENTRIES_ERROR_CATEGORY,
    NO_INPUT,
    NON_UNIQUE_LINE_NAMES_CATEGORY,
    OMIT_STRAINS,
    PART_NUMBER_NOT_FOUND,
    SINGLE_PART_ACCESS_ERROR_CATEGORY,
    STRAINS_REQUIRED_FOR_NAMES,
    STRAINS_REQUIRED_TITLE,
    SYSTEMIC_ICE_ACCESS_ERROR_CATEGORY,
    UNPREDICTED_ERROR,
    WARNING_PRIORITY_ORDER,
    ZERO_REPLICATES,
)
from .parsers import (
    ExperimentDescFileParser,
    JsonInputParser,
    _ExperimentDescriptionFileRow,
)
from .utilities import (
    ALLOWED_RELATED_OBJECT_FIELDS,
    CombinatorialCreationPerformance,
    CombinatorialDescriptionInput,
    ExperimentDescriptionContext,
)

logger = logging.getLogger(__name__)

ERRORS_KEY = "errors"
WARNINGS_KEY = "warnings"

_STUDY_PK_OVERVIEW_NAME = "main:edd-pk:overview"
_ADMIN_EMAIL_TRACEBACK_DELIMITER = "\n\t\t"
_ADMIN_EMAIL_INDENT = 3

traceback_suffix = """The contents of the most-recent full traceback was:

        %(traceback)s
"""

base_email_format = """\
One or more error(s) occurred when attempting to add Experiment Description data for EDD study \
%(study_pk)d "%(study_name)s":

    Study URL: %(study_url)s
    Username: %(username)s
    Relevant request parameters:
        %(dry_run_param)s: %(dry_run_val)s
        %(ignore_ice_errors_param)s: %(ignore_ice_errors_val)s
        %(allow_duplicate_names_param)s: %(allow_duplicate_names_val)s
"""

ice_related_err_email_format = (
    base_email_format
    + """\
    Unique part numbers (%(unique_part_number_count)d): %(unique_part_numbers)s
    Parts not found in ICE (%(not_found_part_count)d or %(not_found_percent)0.2f%%): \
%(parts_not_found)s
    Errors detected during Experiment Description processing (may not include the error below, \
if there's a traceback): %(errors)s
    Warnings detected during Experiment Description processing: %(warnings)s
    User input source: %(user_input_source)s

    %(traceback_suffix)s"""
)


def _build_response_content(errors, warnings, val=None):
    """
    Builds a dictionary of response content that summarizes processing performed by the
    experiment description attempt, including any errors or warnings that occurred along the way.

    :param errors: a dictionary of errors that maps one of the known keys to a list of values
    associated with that error (e.g. ICE part IDs)
    :param warnings: a dictionary of warnings that maps one of the known keys to a list of values
    associated with that warning (e.g. ICE part IDs)
    :param val: the existing dictionary to add errors and warnings to, or if None, a new one
    will be created.
    :return: the dictionary containing errors and warnings
    """
    if val is None:
        val = {}
    if errors:
        val[ERRORS_KEY] = _build_prioritized_issue_list(errors, ERROR_PRIORITY_ORDER)
    if warnings:
        val[WARNINGS_KEY] = _build_prioritized_issue_list(
            warnings, WARNING_PRIORITY_ORDER
        )
    return val


def _build_prioritized_issue_list(src_dict, priority_reference):
    result = []

    unprioritized_src = copy.deepcopy(src_dict)

    # loop over defined priority order, including issues in the defined order
    for category, title_priority_order in priority_reference.items():
        title_to_summaries = unprioritized_src.get(category, None)

        if not title_to_summaries:
            continue

        for title in title_priority_order:
            err_summary = title_to_summaries.get(title, None)

            if not err_summary:
                continue

            del title_to_summaries[title]
            result.append(err_summary.to_json_dict())

    # review any items that didn't were missing from the defined order (likely due to code
    # maintenance. Add them at the top to attract attention, then print a warning log message
    for category, unprioritized_titles in unprioritized_src.items():
        for title, err_summary in unprioritized_titles.items():
            result.insert(0, err_summary.to_json_dict())
            logger.warning(
                'Including un-prioritized issue (category="%(category)s", '
                'title="%(title)s") at the top of the list. This issue '
                "should be explicitly-defined in the priority order for user review."
                % {"category": category, "title": title}
            )
    return result


# TODO: after we have some unit tests for this code and can refactor, replace with the newer
# variant in Import 2 (ErrorAggregator & related classes)
class ImportErrorSummary:
    """
    Defines error/warning information captured during an actual or attempted import attempt.
    Experiment Description file upload (and eventual combinatorial GUI) will be much easier to use
    if the back end can aggregate some errors and return some or all of them at the same time.
    """

    def __init__(self, category_title, summary=""):
        self.category_title = category_title
        self.summary = summary
        self.corrective_action = ""
        self.help_reference = ""
        self._occurrence_details = []

    def to_json_dict(self):
        return {
            "category": self.category_title,
            "summary": self.summary,
            "details": ", ".join(self._occurrence_details)
            if self._occurrence_details
            else "",
            "corrective_action": self.corrective_action,
            "help_reference": self.help_reference,
        }

    def add_occurrence(self, occurrence_detail):
        detail_str = str(occurrence_detail)
        self._occurrence_details.append(detail_str)


class ExperimentDescriptionOptions:
    def __init__(self, **kwargs):
        self.allow_duplicate_names = kwargs.pop("allow_duplicate_names", False)
        self.allow_non_strains = kwargs.pop("allow_non_strains", False)
        self.dry_run = kwargs.pop("dry_run", False)
        self.ignore_ice_access_errors = kwargs.pop("ignore_ice_access_errors", False)
        self.use_ice_part_numbers = kwargs.pop("use_ice_part_numbers", False)
        self.omit_all_strains = kwargs.pop("omit_strains", False)
        self.folder_entry_filters = kwargs.pop("folder_entry_filters", [])
        self.email_when_finished = kwargs.pop("email_when_finished", False)

    @staticmethod
    def of(request):

        dry_run = request.GET.get(DRY_RUN_PARAM, False)
        allow_duplicate_names = request.GET.get(ALLOW_DUPLICATE_NAMES_PARAM, False)
        ignore_ice_access_errs = request.GET.get(IGNORE_ICE_ACCESS_ERRORS_PARAM, False)
        allow_non_strains = request.GET.get(ALLOW_NON_STRAIN_PARTS, False)
        omit_strains = request.GET.get(OMIT_STRAINS, False)
        use_ice_part_nums = bool(request.FILES.get("file", False))
        email_when_finished = bool(request.GET.get(EMAIL_WHEN_FINISHED, False))

        return ExperimentDescriptionOptions(
            allow_duplicate_names=allow_duplicate_names,
            allow_non_strains=allow_non_strains,
            dry_run=dry_run,
            ignore_ice_access_errors=ignore_ice_access_errs,
            use_ice_part_numbers=use_ice_part_nums,
            omit_strains=omit_strains,
            email_when_finished=email_when_finished,
        )


class IcePartResolver:
    """
    Strain identifier resolution strategy used to resolve ICE part numbers from
    user input in Experiment Description files to existing/new Strain entries
    in EDD's database. Steps performed are:

      1) Query ICE for each part number
      2) Use part UUID from ICE to locate a matching Strain (if any) in
         EDD's database
      3) Create a Strain in EDD's database for any not found in step 2
      4) Replace part numbers in the input with local EDD strain primary keys
    TODO: update description to include folders
    """

    def __init__(
        self, importer, line_def_inputs, options, cache, strains_required_for_naming
    ):
        self.importer = importer
        self.edd_cache = cache
        self.combinatorial_inputs = line_def_inputs
        self.options = options
        self.exception_interrupted_ice_queries = False

        self.strains_required_for_naming = strains_required_for_naming

        # build a list of unique strain and ICE folder ids (UUID or ICE part number, depending on
        # input source)
        unique_part_ids = set()
        unique_folder_ids = set()
        combinatorial_strains = False

        self.ice_folder_to_filters = line_def_inputs[0].ice_folder_to_filters
        for combo in line_def_inputs:
            unique_part_ids.update(combo.get_related_object_ids(cache.strains_mtype.pk))
            unique_folder_ids.update(
                combo.get_related_object_ids(constants.ICE_FOLDERS_KEY)
            )

            combinatorial_strains = (
                combinatorial_strains
                or combo.combinatorial_strains(cache.strains_mtype.pk, ICE_FOLDERS_KEY)
            )

        # though each input supports tracking it separately, we're guaranteed there's only one...
        # either it was provided by the combo's GUI (only ony needed), or ED file, whose parser
        # enforces consistency
        self.ice_folder_to_filters = line_def_inputs[0].ice_folder_to_filters

        self.unique_part_ids = unique_part_ids
        self.unique_folder_ids = unique_folder_ids
        self.combinatorial_strains = combinatorial_strains
        self.parts_by_ice_id = OrderedDict()
        self.folders_by_ice_id = defaultdict(list)

        # entries found outside of folders
        self.individual_entries_found = 0
        # folder entries found that passed filters
        self.total_filtered_entry_count = 0

    def _validate_strain_info_abort(self):
        # return None to abort strain resolution; otherwise an ICE connection

        # if any errors were detected during initialization, skip further processing
        if self.importer.errors:
            return None

        # if no parts or folders, skip processing
        if not (self.unique_part_ids or self.unique_folder_ids):
            logger.debug("No part or folder IDs to look up!")
            return None

        if self.options.omit_all_strains:
            if self.combinatorial_strains:
                self.importer.add_error(
                    INTERNAL_EDD_ERROR_CATEGORY,
                    STRAINS_REQUIRED_TITLE,
                    "Inadequate information to create lines combinatorially "
                    "without strain information.",
                )
            elif (
                self.strains_required_for_naming
                and not self.options.allow_duplicate_names
            ):
                self.importer.add_error(
                    NON_UNIQUE_LINE_NAMES_CATEGORY,
                    STRAINS_REQUIRED_FOR_NAMES,
                    "Request to drop strain information would result in duplicate "
                    "line names",
                )
            else:
                logger.info("Dropping all strain data per user request")
            return None

        registry = StrainRegistry()
        return registry.login(self.importer.user)

    def _validate_strain_search_abort(self):
        # if we've detected one or more systemic ICE access errors during
        # individual queries for part ID's, send a single error email to admins
        # that aggregates them
        if self.importer.errors or self.importer.has_warning(GENERIC_ICE_RELATED_ERROR):
            self._notify_admins_of_systemic_ice_access_errors(
                self.options, self.unique_part_ids, self.parts_by_ice_id
            )
            return bool(self.importer.errors)
        return False

    def _merge_top_and_folder_strains(self, edd_strains_by_ice_id):
        # Merge ICE entries provided via folder with those provided directly
        for input_set in self.combinatorial_inputs:
            # find ICE folder ID's provided by the front end and remove them
            folders = input_set.get_related_object_ids(ICE_FOLDERS_KEY)
            if not folders:
                continue
            del input_set.combinatorial_line_metadata[ICE_FOLDERS_KEY]

            # merge part numbers from the contained folder entries into the list of combinatorial
            # part IDs already in use
            for folder_id in folders:
                folder = self.folders_by_ice_id[folder_id]
                for ice_entry in folder.entries:
                    use_ice_part_numbers = self.options.use_ice_part_numbers
                    ice_id = (
                        ice_entry.part_id
                        if use_ice_part_numbers
                        else ice_entry.registry_id
                    )
                    edd_strain = edd_strains_by_ice_id[ice_id]
                    input_set.add_combinatorial_line_metadata(
                        self.edd_cache.strains_mtype.pk, edd_strain.pk
                    )

            if logger.getEffectiveLevel() == logging.DEBUG:
                logger.debug(
                    "Post folder merge combinatorial metadata: "
                    f"{input_set.combinatorial_line_metadata}"
                )

    def resolve_strains(self):
        """
        Resolves ICE strains from the input, including finding and filtering
        contents of ICE folders if present, and also resolving ICE part
        identifiers present in the input.

        When processing Experiment Description files, identifiers will be
        human-readable ICE part numbers that must be resolved by querying ICE.
        For bulk line creation, identifiers will be UUID's that may not have to
        be resolved by querying ICE if not already cached in EDD. For
        simplicity, this method always queries ICE first before checking EDD.

        When this method returns, either errors have been reported to the
        importer, or all folders and ICE entries in the input have been
        resolved, and ICE entries have all been cached in EDD's database.

        :return a dict that maps pk => EDD strain for each strain that was
            resolved in ICE
        """

        # get an ICE connection to look up strain UUID's from part number user input
        ice = self._validate_strain_info_abort()
        if ice is None:
            return

        # query ICE for UUID's part numbers found in the input file
        try:
            self._query_ice_folder_contents(ice)
            self._query_ice_entries(ice)
        except OSError:
            self._systemic_ice_access_error(self.unique_part_ids, "strain")

        if self._validate_strain_search_abort():
            return

        # query EDD for Strains by UUIDs found in ICE
        strains_by_pk = {}
        edd_strains_by_ice_id = {}
        for part_id, entry in self.parts_by_ice_id.items():
            strain = Strain.objects.get(registry_id=entry.registry_id)
            strains_by_pk[strain.pk] = strain
            edd_strains_by_ice_id[part_id] = strain

        # Replace part-number-based strain references in the input with local
        # keys usable to create Line entries in EDD's database
        strains_mtype = self.edd_cache.strains_mtype
        for input_set in self.combinatorial_inputs:
            input_set.replace_ice_ids_with_edd_pks(
                edd_strains_by_ice_id, self.parts_by_ice_id, strains_mtype.pk
            )
        self._merge_top_and_folder_strains(edd_strains_by_ice_id)

        return strains_by_pk

    def _query_ice_entries(self, ice):
        """
        Queries ICE for parts with the provided (locally-unique) numbers,
        logging errors for any parts that weren't found. Note that we're
        purposefully trading off readability for a guarantee of
        multi-deployment uniqueness, though as in use at JBEI the odds are
        still pretty good that a part number is sufficient to uniquely identify
        an ICE entry.
        """
        self.individual_entries_found = 0
        with ice:
            for entry_id in self.unique_part_ids:
                if entry_id not in self.parts_by_ice_id:
                    try:
                        entry = ice.get_entry(entry_id)
                        self._process_entry(entry_id, entry)
                        self.individual_entries_found += 1
                    except Exception:
                        self.importer.add_error(
                            SINGLE_PART_ACCESS_ERROR_CATEGORY,
                            PART_NUMBER_NOT_FOUND,
                            f"EDD could not find a reference to {entry_id}",
                        )

    def _query_ice_folder_contents(self, ice):
        """
        Queries ICE for folders with the provided (locally-unique) numbers,
        logging errors for any that weren't found.
        """
        with ice:
            for folder_id in self.unique_folder_ids:
                folder = ice.get_folder(folder_id)
                filtered_entries = []
                unfiltered_entry_count = 0
                for entry in folder.list_entries():
                    unfiltered_entry_count += 1
                    entry_id = entry.registry_id
                    if self.options.use_ice_part_numbers:
                        entry_id = entry.part_id
                    if entry.payload["type"] in self.ice_folder_to_filters[folder_id]:
                        self._process_entry(entry_id, entry)
                        filtered_entries.append(entry)
                self.folders_by_ice_id[folder_id] = folder
                self.total_filtered_entry_count += len(filtered_entries)
                logger.info(
                    f'Folder "{folder.name}": found {len(folder.entries)} entries. '
                    f"{unfiltered_entry_count} passed the filters "
                    f"({self.ice_folder_to_filters[folder_id]})"
                )
                folder_desc = f'"{folder.name}" ({folder_id})'
                if not filtered_entries:
                    self.importer.add_error(
                        EMPTY_FOLDER_ERROR_CATEGORY,
                        EMPTY_FOLDER_ERROR_TITLE,
                        folder_desc,
                    )
                elif not unfiltered_entry_count:
                    self.importer.add_error(
                        NO_FILTERED_ENTRIES_ERROR_CATEGORY,
                        NO_ENTRIES_TITLE,
                        folder_desc,
                    )

    def _process_entry(self, entry_id, entry):
        self.parts_by_ice_id[entry_id] = entry
        validator = RegistryValidator(existing_entry=entry)
        validator(entry.registry_id)

    def _systemic_ice_access_error(self, unique_ids, resource_name):
        """
        Handles a systemic ICE communication error according to request parameters set by
        the UI
        """
        logger.exception(f"Error querying ICE for {resource_name}(s)")

        importer = self.importer
        self.exception_interrupted_ice_queries = True

        if self.combinatorial_strains:
            importer.add_error(
                SYSTEMIC_ICE_ACCESS_ERROR_CATEGORY,
                STRAINS_REQUIRED_TITLE,
                "You can retry, or remove strains from your input, which may change the result "
                "or require more work to correct later. EDD administrators have been notified of "
                "the problem.",
            )
            return
        elif self.strains_required_for_naming:
            importer.add_error(
                NON_UNIQUE_LINE_NAMES_CATEGORY,
                STRAINS_REQUIRED_FOR_NAMES,
                "ICE part information is required input to computing line names as configured, "
                "but an error occurred while communicating with ICE. You may remove strains from "
                "line names or retry when ICE is working again.",
            )
            return

        # If not specifically-requested by the UI, the normal case should be to reject the
        # upload
        # and force the user to acknowledge / override the problem rather than silently working
        # around it. In this unlikely case, this approach is slightly more work for users,
        # but also allows them to prevent creating inconsistencies that they'll have to resolve
        # later using more labor-intensive processes (e.g. potentially expensive manual line
        #  edits)
        if not self.options.ignore_ice_access_errors:
            importer.add_error(
                SYSTEMIC_ICE_ACCESS_ERROR_CATEGORY,
                GENERIC_ICE_RELATED_ERROR,
                "EDD administrators have been notified of the problem.  You can try again later, "
                "or proceed now and omit strain data from new lines in your study. "
                "If you omit strain data now, you'll have to manually edit your lines later "
                "after the problem is fixed.  Depending on the experiment, manually filling "
                "in the missing strain data later could be more work.",
            )

        else:
            # If user got feedback re: ICE communication errors and chose to proceed anyway,
            # build a descriptive warning message re: the error if some subset of strains were
            # found, then proceed with line/assay creation.
            found_resources = (
                self.folders_by_ice_id
                if resource_name == "folder"
                else self.parts_by_ice_id
            )
            found_count = len(found_resources)
            requested_count = len(unique_ids)
            if found_count:
                percent_found = 100 * (float(found_count) / requested_count)
                importer.add_warning(
                    SYSTEMIC_ICE_ACCESS_ERROR_CATEGORY,
                    GENERIC_ICE_RELATED_ERROR,
                    "Lines were added to your study, but some will not be associated with "
                    f"ICE strains. {found_count} of {requested_count} "
                    f"{resource_name}s ({percent_found:.2f}%) were found before the error "
                    "occurred. The rest will need to be added later after the problem is "
                    "fixed. EDD administrators have been notified of the problem.",
                )

    def _notify_admins_of_systemic_ice_access_errors(
        self, options, unique_part_numbers, ice_parts_by_number
    ):
        """
        If configured, builds and sends a time-saving notification email re: ICE communication
        problems to EDD admins. The email informs admins of problems that should be resolved
        without user involvement, and aggregates/captures relevant context that will be hard to
        remember and extract from log content and complex related code.
        """

        importer = self.importer

        # return early if no notification-worthy errors have occurred
        if (
            not importer.has_error(GENERIC_ICE_RELATED_ERROR)
        ) and not importer.has_warning(GENERIC_ICE_RELATED_ERROR):
            return

        logger.info(
            "Notifying system administrators of a systemic error communicating with ICE"
        )

        # even though users may be able to work around the error, email EDD admins since they
        # should look into / resolve systemic ICE communication errors without user
        # intervention. Since communication via the Internet is involved, possible that the
        # errors during a workaround are different than during the first attempt. We'll clearly
        # mark that case in the email subject, but still send the email.
        subject = "ICE access error during Experiment Description%s" % (
            ": (User Ignored)" if options.ignore_ice_access_errors else ""
        )

        # build traceback string to include in the email
        formatted_lines = traceback.format_exc().splitlines()
        traceback_str = _ADMIN_EMAIL_TRACEBACK_DELIMITER.join(formatted_lines)

        part_numbers_not_found = [
            part_number
            for part_number in unique_part_numbers
            if part_number not in ice_parts_by_number
        ]
        not_found_part_count = len(part_numbers_not_found)
        desired_part_count = len(unique_part_numbers)
        not_found_part_percent = 100 * (
            (float(not_found_part_count) / desired_part_count)
            if desired_part_count
            else 0
        )

        errors_list = json.dumps(
            _build_prioritized_issue_list(importer.errors, ERROR_PRIORITY_ORDER)
        )
        warnings_list = json.dumps(
            _build_prioritized_issue_list(importer.warnings, WARNING_PRIORITY_ORDER)
        )

        message = ice_related_err_email_format % {
            "study_pk": importer.study.pk,
            "study_name": importer.study.name,
            "study_url": reverse(
                "main:edd-pk:overview", kwargs={"pk": importer.study.pk}
            ),
            "username": importer.ice_username,
            "ignore_ice_errors_param": IGNORE_ICE_ACCESS_ERRORS_PARAM,
            "ignore_ice_errors_val": options.ignore_ice_access_errors,
            "allow_duplicate_names_param": ALLOW_DUPLICATE_NAMES_PARAM,
            "allow_duplicate_names_val": options.allow_duplicate_names,
            "dry_run_param": DRY_RUN_PARAM,
            "dry_run_val": options.dry_run,
            "unique_part_number_count": desired_part_count,
            "unique_part_numbers": ", ".join(unique_part_numbers),
            "not_found_part_count": not_found_part_count,
            "not_found_percent": not_found_part_percent,
            "parts_not_found": ", ".join(part_numbers_not_found),
            "errors": pformat(errors_list, indent=_ADMIN_EMAIL_INDENT),
            "warnings": pformat(warnings_list, indent=_ADMIN_EMAIL_INDENT),
            "user_input_source": str(importer._input_summary),
            "traceback_suffix": (traceback_suffix % {"traceback": traceback_str}),
        }

        mail_admins(subject=subject, message=message, fail_silently=True)


class CombinatorialCreationImporter:
    def __init__(self, study, user, cache=None):

        self.performance = CombinatorialCreationPerformance()

        # maps title -> subtitle ->  occurrence details
        self.errors = defaultdict(dict)
        self.warnings = defaultdict(dict)
        self._input_summary = None

        self.exception_interrupted_ice_queries = False

        ###########################################################################################
        # Gather context from EDD's database
        ###########################################################################################

        # TODO: these should be queried separately when this code gets relocated to a Celery task
        self.user = user
        self.study = study

        self.cache = cache if cache else ExperimentDescriptionContext()

        self.performance.end_context_queries()

    @property
    def ice_username(self):
        if self.user:
            return self.user.email
        return None

    def add_issue(self, is_error, title, subtitle, occurrence):
        if is_error:
            self.add_error(title, subtitle, occurrence)
        else:
            self.add_warning(title, subtitle, occurrence)

    def add_error(self, category_title, subtitle="", occurrence=None):
        self._append_summary(self.errors, category_title, subtitle, occurrence)

    def add_warning(self, category_title, subtitle="", occurrence=None):
        self._append_summary(self.warnings, category_title, subtitle, occurrence)

    def has_error(self, subtitle):
        return any(subtitle in v for v in self.errors.values())

    def has_warning(self, subtitle):
        return any(subtitle in v for v in self.warnings.values())

    @staticmethod
    def _append_summary(source, category_title, subtitle, occurrence=None):
        summary = source[category_title].get(subtitle)
        if not summary:
            summary = ImportErrorSummary(category_title, subtitle)
            source[category_title][subtitle] = summary

        if occurrence:
            summary.add_occurrence(occurrence)

    def do_import(
        self,
        stream,
        options: ExperimentDescriptionOptions,
        filename: str = None,
        file_extension=None,
        encoding="utf8",
    ):
        """
        Performs the import or raises an Exception if an unexpected / unhandled error occurred

        :param stream: the stream (a.k.a. file-like object) to read input from
        :param options: options for configuring the import
        :param filename: the file name of the data file for this import, or None if there was
            no file.
        :param file_extension: the extension of the data file for this import, or None if there
            was no file.
        :param encoding: encoding of the data file, if it's a CSV.  Ignored otherwise.

        :return: a json dict with a summary of import results (for success or failure)
        """
        logger.info(
            f"Processing experiment description inputs for study "
            f"{self.study.slug}, filename={filename}"
        )

        ###########################################################################################
        # Clear out state from previous import attempts using this importer
        ###########################################################################################
        self.performance.reset()
        self._input_summary = None
        self.errors.clear()
        self.warnings.clear()
        self.exception_interrupted_ice_queries = False

        ###########################################################################################
        # Parse / validate the input against metadata defined in the database
        ###########################################################################################
        # Note: it would be more memory efficient to perform creation after reading each line of
        # the file, but that's not likely to be a problem. Can do that optimization later after
        # enforcing a good separation of concerns with this general layout.
        line_def_inputs = self.parse_input(stream, filename, file_extension, encoding)

        if (not line_def_inputs) and (not self.errors):
            self.add_error(BAD_GENERIC_INPUT_CATEGORY, NO_INPUT)

        # if there were any file parse errors, return helpful output before attempting any
        # database insertions. Note: returning normally causes the transaction to commit, but that
        # is ok here since no DB changes have occurred yet
        if self.errors:
            return (
                codes.bad_request,
                _build_response_content(self.errors, self.warnings),
            )

        required_naming_meta_pks = self._query_related_object_context(line_def_inputs)
        strains_required_for_naming = (
            self.cache.strains_mtype.pk in required_naming_meta_pks
        )

        # if there were any related object lookup errors, return helpful output before
        # attempting any database insertions
        if self.errors:
            return (
                codes.bad_request,
                _build_response_content(self.errors, self.warnings),
            )

        with transaction.atomic(savepoint=False):
            result = self._define_study(
                line_def_inputs, options, strains_required_for_naming
            )

        return result

    def parse_input(
        self, stream, filename: str, file_extension: str, encoding: str
    ) -> List[CombinatorialDescriptionInput]:
        """
        Parses the input and returns a list of combinatorial line/assay creations that need to
        be performed

        :param stream: the stream (a.k.a. file-like object) to read input from
            open())
        :param filename: the filename, IFF this input came from file
        :param file_extension: the file extension
        :param encoding: the encoding for the input

        :return: the parsed content
        """
        if filename:
            parser = ExperimentDescFileParser(self.cache, self)
            if file_extension == "csv":
                reader = codecs.getreader(encoding)
                line_def_inputs = parser.parse_csv(reader(stream).readlines())
            else:
                with BytesIO(stream.read()) as stream:
                    line_def_inputs = parser.parse_excel(stream)
        else:
            parser = JsonInputParser(self.cache, self)
            line_def_inputs = parser.parse(stream.read())

        # cache a human-readable summary of input for possible use in error emails
        if filename:
            self._input_summary = filename
        else:
            self._input_summary = parser.parsed_json

        self.performance.end_input_parse()
        return line_def_inputs

    def _query_related_object_context(self, line_def_inputs):
        """
        Searches the database for related object data for any supported related object fields
        needed as input for computing line names (e.g. experimenter__last_name) or needed as
        input to line creation (any M2M relation specified as a metadata item, regardless of
        whether it's included in line names).

        :return: the Set of MetadataType primary keys required as input to computing line/assay
            names.  Note that this may be a subset of the related objects queried and cached
            by this method.
        """
        # build up a list of line metadata types for related object fields that will need to be
        # looked up before line names can be determined or before lines can be created. Should be
        # much more efficient to look up and cache values up front rather than as each line name is
        # computed / as each line is created
        # TODO: expand support here for looking up whitelisted related fields by value to complete
        # back-end support for arbitrary metadata type input via Experiment Description files. Note
        # that it will also require: 1) Adding
        required_meta_pks = set()
        required_naming_meta_pks = set()
        for line_def_input in line_def_inputs:

            # get line metadata types pks required for naming
            pks = line_def_input.get_required_naming_meta_pks()
            required_naming_meta_pks.update(pks)
            required_meta_pks.update(pks)

            # find other unique value identifiers for related objects, even if they aren't needed
            # for computing line names. It's still helpful to look them up and cache them in
            # advance of line creation.
            required_meta_pks.update(
                {
                    pk
                    for pk in self.cache.related_object_mtypes.keys()
                    if pk != self.cache.strains_mtype.pk
                    and pk not in required_meta_pks
                    and line_def_input.get_related_object_ids(pk)
                }
            )

        if not required_meta_pks:
            logger.info(
                "Skipping related object lookup. No non-Strain related objects are "
                "required to compute line names or to set foreign key relations "
                "following line creation."
            )
            return required_naming_meta_pks

        line_meta_types = self.cache.line_meta_types
        strains_mtype_pk = self.cache.strains_mtype.pk

        logger.debug(
            "Looking up related object values: %s"
            % {pk: line_meta_types.get(pk).type_name for pk in required_meta_pks}
        )

        try:
            for line_meta_pk in required_meta_pks:
                # skip strains -- those are a special case handled separately
                if line_meta_pk == strains_mtype_pk:
                    continue

                required_value_ids = set()
                for line_def_input in line_def_inputs:
                    required_value_ids.update(
                        line_def_input.get_related_object_ids(line_meta_pk)
                    )

                self._validate_required_values_exist(line_meta_pk, required_value_ids)

            logger.debug(f"Found related object values: {self.cache.related_objects}")

        except Exception as e:
            logger.exception("Error looking up naming context")
            self.add_error(INTERNAL_EDD_ERROR_CATEGORY, UNPREDICTED_ERROR, str(e))

        return required_naming_meta_pks

    def _validate_required_values_exist(self, line_meta_pk, pks):
        attribute_name = self.cache.line_meta_types[line_meta_pk].type_field
        if attribute_name is None:
            # if this metadata is required as input to computing the line name, but isn't
            # a line attribute, then the stored value isn't a pk, it's just a value
            # (e.g. Media in EDD 2.2.0)
            # calling loop to skip to next metadata PK
            return
        attribute = Line._meta.get_field(attribute_name)
        queryset = attribute.related_model.objects.filter(pk__in=pks)
        # select related field values along with the query (assumes we aren't crossing
        # M2M relationships)
        related_field_name = ALLOWED_RELATED_OBJECT_FIELDS[attribute_name]
        related_field = attribute.related_model._meta.get_field(related_field_name)
        if related_field.is_relation:
            if related_field.one_to_many or related_field.many_to_many:
                queryset = queryset.prefetch_related(related_field_name)
            else:
                queryset = queryset.select_related(related_field_name)

        found_context = {result.pk: result for result in queryset}
        self.cache.related_objects[line_meta_pk] = found_context

        if len(found_context) != len(pks):
            missing_pks = [str(pk) for pk in pks if pk not in found_context]
            line_meta_type = self.cache.line_meta_types[line_meta_pk]
            logger.error(
                f"Unable to locate {len(missing_pks)} of {len(pks)} "
                f"required inputs for metadata {line_meta_type.type_name}"
            )
            pk_str = ", ".join(missing_pks)
            self.add_error(
                INTERNAL_EDD_ERROR_CATEGORY,
                MISSING_REQUIRED_NAMING_INPUT,
                f"{line_meta_type.type_name}: {pk_str}",
            )

    def _define_study(
        self, line_def_inputs, options, strains_required_for_naming
    ) -> Tuple[int, Dict[str, Any]]:
        """
        Queries EDD and ICE to verify that the required ICE strains have an entry in EDD's
        database. If not, creates them.  Once strains are created, combinatorially creates lines
        and assays within the study as specified by combinatorial_inputs.

        :return: A tuple of HTTP return code and JSON summary dict that summarizes results of
            the attempted line/assay/strain creation
        :raise Exception: if an unexpected error occurs.
        """

        ###########################################################################################
        # Look up folders and parts in ICE, caching any in EDD that aren't already there
        ###########################################################################################
        # Note: ideally we'd do this externally to the @atomic block, in the surrounding
        # importer code, but other EDD queries have to precede this one
        lookup_strategy = IcePartResolver(
            self, line_def_inputs, options, self.cache, strains_required_for_naming
        )
        self.cache.strains_by_pk = lookup_strategy.resolve_strains()

        if self.errors:
            status_code = (
                codes.bad_request
                if self.has_error(PART_NUMBER_NOT_FOUND)
                else codes.internal_server_error
            )
            return status_code, _build_response_content(self.errors, self.warnings)

        ###########################################################################################
        # Compute line/assay names if needed as output for a dry run, or if needed to
        # proactively check for duplicates
        ###########################################################################################
        # For maintenance: Note that line names may contain strain information that has to be
        # looked up above before the name can be determined
        planned_names = []
        if options.dry_run or (not options.allow_duplicate_names):
            planned_names = self._compute_and_check_names(line_def_inputs, options)
            self.performance.end_naming_check()

        # return just the planned line/assay names if we're doing a dry run
        if options.dry_run:
            content = {"count": len(planned_names), "lines": planned_names}

            status = codes.ok
            if self.errors and not options.allow_duplicate_names:
                status = codes.bad_request

            elif not planned_names:
                self.add_error(INTERNAL_EDD_ERROR_CATEGORY, EMPTY_RESULTS)
                status = codes.internal_server_error

            _build_response_content(self.errors, self.warnings, val=content)
            return status, content

        # if we've detected errors before modifying the study, fail before attempting db mods
        if self.errors:
            return (
                codes.bad_request,
                _build_response_content(self.errors, self.warnings),
            )

        created_lines_list, total_assay_count = self._create_lines_and_assays(
            line_def_inputs, options
        )

        ###########################################################################################
        # Package up and return results
        ###########################################################################################
        total_line_count = len(created_lines_list)
        self.performance.overall_end()

        if self.errors:
            raise RuntimeError("Errors occurred during experiment description upload")

        logger.info(
            "Created %(line_count)d lines and %(assay_count)d assays in %(seconds)0.2f "
            "seconds"
            % {
                "line_count": total_line_count,
                "assay_count": total_assay_count,
                "seconds": self.performance.total_time_delta.total_seconds(),
            }
        )

        content = {
            "lines_created": total_line_count,
            "assays_created": total_assay_count,
            "runtime_seconds": self.performance.total_time_delta.total_seconds(),
            "success_redirect": reverse("main:lines", kwargs={"slug": self.study.slug}),
        }

        study_described.send(
            sender=self.__class__,
            study=self.study,
            user=self.user,
            count=total_line_count,
        )

        return codes.ok, _build_response_content(self.errors, self.warnings, content)

    def _create_lines_and_assays(self, line_def_inputs, options):
        created_lines_list = []
        total_assay_count = 0
        for index, input_set in enumerate(line_def_inputs):
            if input_set.replicate_count == 0:
                self.add_error(BAD_GENERIC_INPUT_CATEGORY, ZERO_REPLICATES, index)

            creation_visitor = input_set.populate_study(self.study, self.cache, options)
            created_lines_list.extend(creation_visitor.lines_created)
            for (
                protocol_map
            ) in creation_visitor.line_to_protocols_to_assays_list.values():
                for assays_list in protocol_map.values():
                    total_assay_count += len(assays_list)

        return created_lines_list, total_assay_count

    def _compute_and_check_names(self, combinatorial_inputs, options):
        """
        Tests the input for non-unique line/assay naming prior to attempting to insert it into the
        database, then captures errors if any duplicate names would be created during database I/O.
        Testing for inconsistency first should be efficient in may error cases, where it prevents
        unnecessary database I/O for line/assay creation prior to detecting duplicated naming.

        :return a dict with a hierarchical listing of all planned line/assay names (regardless of
            whether some are duplicates)
        :raises ValueError: for invalid input (e.g. incorrect metadata items)
        """
        # get convenient references to unclutter syntax below
        study = self.study

        # Check for uniqueness of planned names so that overlaps can be flagged as an error
        # (e.g. as possible in the combinatorial GUI mockup attached to EDD-257)
        collector = NameCollector()

        # for Experiment Description files, track which file row created the duplication to help
        # users track it down. This can be hard in a large file.
        line_name_to_input_rows = defaultdict(set)
        protocol_to_assay_name_to_input_rows = defaultdict(lambda: defaultdict(set))

        # line name -> protocol -> [assay name], across all combinatorial inputs.
        all_planned_names = defaultdict(lambda: defaultdict(list))

        # loop over the sets of combinatorial inputs, computing names of new lines/assays to be
        # added to the study, and checking for any potential overlap in the input line/assay names.
        # This step doesn't required any database I/O, so we'll do it first to check for
        # self-inconsistent input. While we're at it, merge results from all sets of combinatorial
        # inputs to build a superset of planned results.

        # Note that we're creating two similar dicts here for different purposes:
        # protocol_to_unique_input_assay_names detects assay name uniqueness across all
        # CombinatorialInputDescriptions for a single protocol.  All_planned_names is the union of
        # all the planned names for each CombinatorialDescriptionInput (regardless of uniqueness).
        for i, input_set in enumerate(combinatorial_inputs, start=1):
            logger.info(
                f"Processing combinatorial input {i} of {len(combinatorial_inputs)}"
            )
            names = input_set.compute_line_and_assay_names(study, self.cache, options)
            for line_name in names.line_names:
                protocol_to_assay_names = names.line_to_protocols_to_assays_list.get(
                    line_name
                )

                if isinstance(input_set, _ExperimentDescriptionFileRow):
                    line_name_to_input_rows[line_name].add(input_set.row_number)

                collector.collect_line(line_name)

                # defaultdict, so side effect is assignment
                all_protocol_to_assay_names = all_planned_names[line_name]

                for protocol_pk, assay_names in protocol_to_assay_names.items():
                    all_planned_assay_names = all_protocol_to_assay_names[protocol_pk]

                    for assay_name in assay_names:
                        all_planned_assay_names.append(assay_name)

                        if isinstance(input_set, _ExperimentDescriptionFileRow):
                            protocol_to_assay_name_to_input_rows[protocol_pk][
                                assay_name
                            ].add(input_set.row_number)

                        collector.collect_assay(protocol_pk, assay_name)

        # if we're allowing duplicate names, skip further checking / DB queries for duplicates
        if options.allow_duplicate_names:
            return all_planned_names

        self._validate_duplicate_names(collector, line_name_to_input_rows)
        self._validate_duplicate_names_cells(
            collector, protocol_to_assay_name_to_input_rows
        )

        # return early, avoiding extra DB queries if the input isn't self-consistent
        if collector.any_duplicates():
            return all_planned_names

        self._validate_existing_line_names(collector)
        self._validate_existing_assay_names(collector)

        return all_planned_names

    def _validate_duplicate_names(self, collector, line_name_to_input_rows):
        # add error messages for duplicate line names that indicate that the input isn't
        # self-consistent
        for duplicate_name in collector.duplicated_new_line_names:
            message = duplicate_name
            row_nums = line_name_to_input_rows[duplicate_name]

            # e.g. this is an Experiment Description file build a bettor error message
            if row_nums and row_nums is not None:
                message = f"{duplicate_name} (row {sorted(row_nums)})"
            self.add_error(
                NON_UNIQUE_LINE_NAMES_CATEGORY, DUPLICATE_COMPUTED_LINE_NAMES, message
            )

    def _validate_duplicate_names_cells(
        self, collector, protocol_to_assay_name_to_input_rows
    ):
        # aggregate/add error messages for duplicate assay names that indicate that the input isn't
        # self-consistent. Note that though it isn't all used yet, we purposefully organize the
        # intermediate data in two ways: one for convenient display in the current UI, the other
        # for eventual JSON generation for the following one...see comments in EDD-626.
        mapping = defaultdict(set)
        for pk, duplicates in collector.protocol_to_duplicate_new_assay_names.items():
            for name in duplicates:
                row_nums = [
                    str(row_num)
                    for row_num in protocol_to_assay_name_to_input_rows[pk][name]
                ]
                if row_nums:
                    # TODO: cells!
                    mapping[name].update(row_nums)

        for assay_name, cells in mapping.items():
            message = f"{assay_name} ({sorted(cells)})"
            self.add_error(
                NON_UNIQUE_LINE_NAMES_CATEGORY, DUPLICATE_INPUT_ASSAY_NAMES, message
            )

    def _validate_existing_line_names(self, collector):
        # query the database in bulk for any existing lines in the study whose names are the same
        # as lines in the input
        existing_lines = Line.objects.filter(
            study__pk=self.study.pk, name__in=collector.unique_input_line_names
        )
        for existing in existing_lines.values_list("name", flat=True):
            self.add_error(
                NON_UNIQUE_LINE_NAMES_CATEGORY, EXISTING_LINE_NAMES, existing
            )

    def _validate_existing_assay_names(self, collector):
        # do a series of bulk queries to check for uniqueness of assay names within each protocol.
        # TODO: we can do some additional work to provide better (e.g. cell-number based) feedback,
        # but this should be a good stopgap.
        duplicate_existing_assay_names = set()
        for (
            protocol_pk,
            assay_names_list,
        ) in collector.protocol_to_unique_input_assay_names.items():
            existing_assays = Assay.objects.filter(
                name__in=assay_names_list,
                line__study__pk=self.study.pk,
                protocol_id=protocol_pk,
            ).distinct()

            for existing in {assay.name for assay in existing_assays}:
                duplicate_existing_assay_names.add(existing)

        for name in duplicate_existing_assay_names:
            self.add_error(NON_UNIQUE_LINE_NAMES_CATEGORY, EXISTING_ASSAY_NAMES, name)

    def send_unexpected_err_email(
        self, dry_run, ignore_ice_related_errors, allow_duplicate_names
    ):
        """
        Creates and sends a context-specific error email with helpful information
        regarding unexpected errors encountered during Experiment Description processing.
        """
        # build traceback string to include in a bare-bones admin notification email
        formatted_lines = traceback.format_exc().splitlines()
        traceback_str = _ADMIN_EMAIL_TRACEBACK_DELIMITER.join(formatted_lines)

        subject = "Unexpected Error during Experiment Description processing"
        message = base_email_format % {
            "study_pk": self.study.pk,
            "study_name": self.study.name,
            "study_url": reverse(_STUDY_PK_OVERVIEW_NAME, kwargs={"pk": self.study.pk}),
            "username": self.user.username,
            "dry_run_param": DRY_RUN_PARAM,
            "dry_run_val": dry_run,
            "ignore_ice_errors_param": IGNORE_ICE_ACCESS_ERRORS_PARAM,
            "ignore_ice_errors_val": ignore_ice_related_errors,
            "allow_duplicate_names_param": ALLOW_DUPLICATE_NAMES_PARAM,
            "allow_duplicate_names_val": allow_duplicate_names,
        } + (traceback_suffix % {"traceback": traceback_str})
        mail_admins(subject, message, fail_silently=True)

    def send_user_err_email(self):
        subject = f"{settings.EMAIL_SUBJECT_PREFIX  }Line Creation Error"
        message = (
            f'Your line creation attempt failed for study "{self.study.name}". '
            f"EDD administrators have been notified of the problem."
        )

        send_mail(subject, message, settings.SERVER_EMAIL, [self.user.email])

    def send_user_success_email(self, summary):
        line_count = summary["lines_created"]
        subject = f"{settings.EMAIL_SUBJECT_PREFIX}Line Creation Complete"
        message = (
            f'Line creation is complete for your study "{self.study.name}". '
            f"{line_count} lines were created."
        )
        send_mail(subject, message, settings.SERVER_EMAIL, [self.user.email])


class NameCollector:
    def __init__(self):
        self.unique_input_line_names = set()
        self.duplicated_new_line_names = set()
        self.protocol_to_unique_input_assay_names = defaultdict(set)
        self.protocol_to_duplicate_new_assay_names = defaultdict(list)

    def any_duplicates(self):
        return (
            self.duplicated_new_line_names or self.protocol_to_duplicate_new_assay_names
        )

    def collect_line(self, name):
        if name in self.unique_input_line_names:
            self.duplicated_new_line_names.add(name)
        self.unique_input_line_names.add(name)

    def collect_assay(self, protocol, name):
        unique_names = self.protocol_to_unique_input_assay_names[protocol]
        if name in unique_names:
            self.protocol_to_duplicate_new_assay_names[protocol].append(name)
        unique_names.add(name)
