# coding: utf-8

import copy
import json
import logging
import requests
import traceback

from collections import defaultdict, OrderedDict
from django.conf import settings
from django.core.mail import mail_admins
from django.core.urlresolvers import reverse
from django.db import transaction
from django.utils.translation import ugettext as _
from future.utils import viewitems, viewvalues
from io import BytesIO
from openpyxl import load_workbook
from pprint import pformat
from requests import codes

from jbei.rest.clients.ice.api import Strain as IceStrain
from jbei.rest.clients.ice.utils import build_entry_ui_url
from main.models import Strain, Assay, Line
from main.tasks import create_ice_connection
# avoiding loading a ton of names to the module by only loading the namespace to constants
from . import constants
from .constants import (
    ALLOW_DUPLICATE_NAMES_PARAM,
    BAD_GENERIC_INPUT_CATEGORY,
    BAD_REQUEST,
    DRY_RUN_PARAM,
    DUPLICATE_INPUT_ASSAY_NAMES,
    DUPLICATE_INPUT_LINE_NAMES,
    EMPTY_RESULTS,
    ERROR_PRIORITY_ORDER,
    EXISTING_ASSAY_NAMES,
    EXISTING_LINE_NAMES,
    FORBIDDEN,
    FORBIDDEN_PART_KEY,
    FOUND_PART_NUMBER_DOESNT_MATCH_QUERY,
    GENERIC_ICE_RELATED_ERROR,
    IGNORE_ICE_ACCESS_ERRORS_PARAM,
    INTERNAL_EDD_ERROR_CATEGORY,
    INTERNAL_SERVER_ERROR,
    MISSING_REQUIRED_NAMING_INPUT,
    NAMING_OVERLAP_CATEGORY,
    NON_STRAINS_CATEGORY,
    NON_STRAIN_ICE_ENTRY,
    NO_INPUT,
    OK,
    PART_NUMBER_NOT_FOUND,
    SINGLE_PART_ACCESS_ERROR_CATEGORY,
    STRAINS_REQUIRED_FOR_NAMES,
    STRAINS_ACCESS_REQUIRED_FOR_NAMES,
    SYSTEMIC_ICE_ACCESS_ERROR_CATEGORY,
    UNPREDICTED_ERROR,
    WARNING_PRIORITY_ORDER,
    ZERO_REPLICATES,
)
from .parsers import ExperimentDescFileParser, JsonInputParser, _ExperimentDescriptionFileRow
from .utilities import (
    ALLOWED_RELATED_OBJECT_FIELDS,
    CombinatorialCreationPerformance,
    ExperimentDescriptionContext,
    find_existing_strains,
)


logger = logging.getLogger(__name__)

ERRORS_KEY = 'errors'
WARNINGS_KEY = 'warnings'

_STUDY_PK_OVERVIEW_NAME = 'main:edd-pk:overview'
_ADMIN_EMAIL_TRACEBACK_DELIMITER = '\n\t\t'
_ADMIN_EMAIL_INDENT = 3

traceback_suffix = ("""The contents of the most-recent full traceback was:

        %(traceback)s
""")

base_email_format = ("""\
One or more error(s) occurred when attempting to add Experiment Description data for EDD study \
%(study_pk)d "%(study_name)s":

    Study URL: %(study_url)s
    Username: %(username)s
    Relevant request parameters:
        %(dry_run_param)s: %(dry_run_val)s
        %(ignore_ice_errors_param)s: %(ignore_ice_errors_val)s
        %(allow_duplicate_names_param)s: %(allow_duplicate_names_val)s
""")

ice_related_err_email_format = (base_email_format + """\
    Unique part numbers (%(unique_part_number_count)d): %(unique_part_numbers)s
    Parts not found in ICE (%(not_found_part_count)d or %(not_found_percent)0.2f%%): \
%(parts_not_found)s
    Errors detected during Experiment Description processing (may not include the error below, \
if there's a traceback): %(errors)s
    Warnings detected during Experiment Description processing: %(warnings)s
    User input source: %(user_input_source)s

    %(traceback_suffix)s""")


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
        val[WARNINGS_KEY] = _build_prioritized_issue_list(warnings, WARNING_PRIORITY_ORDER)
    return val


def _build_prioritized_issue_list(src_dict, priority_reference):
    result = []

    unprioritized_src = copy.deepcopy(src_dict)

    # loop over defined priority order, including issues in the defined order
    for category, title_priority_order in viewitems(priority_reference):
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
    for category, unprioritized_titles in viewitems(unprioritized_src):
        for title, err_summary in viewitems(unprioritized_titles):
            result.insert(0, err_summary.to_json_dict())
            logger.warning('Including un-prioritized issue (category="%(category)s", '
                           'title="%(title)s") at the top of the list. This issue '
                           'should be explicitly-defined in the priority order for user review.'
                           % {
                                'category': category,
                                'title': title,
                           })
    return result


class ImportErrorSummary(object):
    """
    Defines error/warning information captured during an actual or attempted import attempt.
    Experiment Description file upload (and eventual combinatorial GUI) will be much easier to use
    if the back end can aggregate some errors and return some or all of them at the same time.
    """
    def __init__(self, category_title, summary=''):
        self.category_title = category_title
        self.summary = summary
        self.corrective_action = ''
        self.help_reference = ''
        self._occurrence_details = []

    def to_json_dict(self):
        return {
            'category': self.category_title,
            'summary': self.summary,
            'details':  ', '.join(self._occurrence_details) if self._occurrence_details else '',
            'corrective_action': self.corrective_action,
            'help_reference': self.help_reference,
        }

    def add_occurrence(self, occurrence_detail):
        detail_str = str(occurrence_detail)
        self._occurrence_details.append(detail_str)


class ExperimentDescriptionOptions(object):
    def __init__(self, allow_duplicate_names=False, allow_non_strains=False, dry_run=False,
                 ignore_ice_access_errors=False, use_ice_part_numbers=True,
                 omit_strains=False):
        self.allow_duplicate_names = allow_duplicate_names
        self.allow_non_strains = allow_non_strains
        self.dry_run = dry_run
        self.ignore_ice_access_errors = ignore_ice_access_errors
        self.use_ice_part_numbers = use_ice_part_numbers
        self.omit_all_strains = omit_strains


class IcePartResolver(object):
    """
    Strain identifier resolution strategy used to resolve ICE part numbers from user input in
    Experiment Description files to existing/new Strain entries in EDD's database. Steps
    performed are:
    1) Query ICE for each part number
    2) Use part UUID from ICE to locate a matching Strain (if any) in EDD's database
    3) Create a Strain in EDD's database for any not found in step 2
    4) Replace part numbers in the input with local EDD strain primary keys
    """
    def __init__(self, importer, unique_part_numbers, combinatorial_inputs,
                 options, strains_required_for_naming,):
        self.importer = importer
        self.unique_part_numbers = unique_part_numbers
        self.combinatorial_inputs = combinatorial_inputs
        self.options = options
        self.exception_interrupted_ice_queries = False
        self.strains_required_for_naming = strains_required_for_naming

    def resolve_strains(self, strains_mtype_pk):
        ###########################################################################################
        # Search ICE for entries corresponding to the part numbers in the file
        ###########################################################################################
        # Note: ideally we'd do this externally to the @atomic block, in the surrounding
        # importer code, but other EDD queries have to precede this one
        parts_by_ice_id = OrderedDict()
        unique_ids = self.unique_part_numbers
        importer = self.importer
        options = self.options
        performance = importer.performance
        unique_id_count = len(unique_ids)

        if options.omit_all_strains:
            if self.strains_required_for_naming and not self.options.allow_duplicate_names:
                importer.add_error(NAMING_OVERLAP_CATEGORY, STRAINS_REQUIRED_FOR_NAMES,
                                   'Request to drop strain information would result in duplicate '
                                   'line names')
            else:
                logger.info('Dropping all strain data per user request')
            return

        # query ICE for UUID's part numbers found in the input file
        # NOTE: important to preserve EDD's ability to function without ICE here, so we need some
        # nontrivial error handling to handle ICE/communication errors while still informing the
        # user about problems that occurred / gaps in data entry
        try:
            self._search_ice_entries(unique_ids, parts_by_ice_id,
                                     self.options.use_ice_part_numbers)

        # handle uncaught errors as a result of ICE communication (e.g.
        # requests.ConnectionErrors that we purposefully avoid catching above since they likely
        # impact all future requests)
        except IOError as err:
            self._handle_systemic_ice_error(unique_ids, parts_by_ice_id)
        performance.end_ice_search(len(parts_by_ice_id), unique_id_count)

        # if we've detected one or more systemic ICE access errors during individual queries for
        # part ID's, send a single error email to admins that aggregates them as determined by
        # error handling in get_ice_entries()
        if importer.errors or importer.has_warning(GENERIC_ICE_RELATED_ERROR):
            self._notify_admins_of_systemic_ice_access_errors(options,
                                                              unique_ids,
                                                              parts_by_ice_id)
        if importer.errors:
            return

        ###########################################################################################
        # Search EDD for existing strains using UUID's queried from ICE
        ###########################################################################################

        # query EDD for Strains by UUID's found in ICE (note some may not have been found)
        strain_search_count = len(parts_by_ice_id)
        edd_strains_by_ice_id, non_existent_edd_strains = find_existing_strains(parts_by_ice_id,
                                                                                self)
        performance.end_edd_strain_search(strain_search_count, len(edd_strains_by_ice_id))

        ###########################################################################################
        # Create any missing strains in EDD's database.
        # Even if this is a dry run, we'll go ahead with caching strains in EDD since they're
        # likely to be used below or referenced again soon.
        ###########################################################################################
        self.create_missing_strains(non_existent_edd_strains, edd_strains_by_ice_id,
                                    options.use_ice_part_numbers)
        strains_by_pk = {strain.pk: strain for strain in viewvalues(edd_strains_by_ice_id)}
        performance.end_edd_strain_creation(len(non_existent_edd_strains))

        ###########################################################################################
        # Replace part-number-based strain references in the input with local primary keys usable
        # to create Line entries in EDD's database
        ###########################################################################################
        for input_set in self.combinatorial_inputs:
            input_set.replace_ice_ids_with_edd_pks(edd_strains_by_ice_id, parts_by_ice_id,
                                                   strains_mtype_pk)

        return strains_by_pk

    def create_missing_strains(self, non_existent_edd_strains, edd_strains_by_ice_id,
                               use_ice_part_numbers):
        """
        Creates Strain entries from the associated ICE entries for any parts.

        :param non_existent_edd_strains: a list of ICE entries to use as the basis for EDD
            strain creation
        :return:
        """
        if non_existent_edd_strains:
            logger.info('Creating %d strain entries not found in EDD...' % len(
                non_existent_edd_strains))

        # just do it in a loop. EDD's Strain uses multi-table inheritance, which prevents bulk
        # creation
        for ice_entry in non_existent_edd_strains:
            # as a stopgap, only allow use of non-strains following a user warning. later on,
            # we should do something smarter, e.g. define the study type up front, then check
            # whether it's ex-vivo here
            if not isinstance(ice_entry, IceStrain) and not self.options.allow_non_strains:
                continue

            strain = Strain.objects.create(
                name=ice_entry.name,
                description=ice_entry.short_description,
                registry_id=ice_entry.uuid,
                registry_url=build_entry_ui_url(settings.ICE_URL, ice_entry.id)
            )

            identifier = ice_entry.part_id if use_ice_part_numbers else ice_entry.uuid
            edd_strains_by_ice_id[identifier] = strain

    def _search_ice_entries(self, part_ids, part_id_to_part, use_part_numbers=True):
        """
        Queries ICE for parts with the provided (locally-unique) numbers, logging errors for
        any parts that weren't found into the errors parameter. Note that we're purposefully
        trading off readability for a guarantee of multi-deployment uniqueness, though as in use at
        JBEI the odds are still pretty good that a part number is sufficient to uniquely identify
        an ICE entry.

        :param part_ids: a dictionary whose keys are ids to be queried
            from ICE. Existing entries will be replaced with the Entries read from ICE, or keys
            will be removed for those that aren't found in ICE.  Note that UUIDs, part id's,
            or numeric primary keys will work, though UUID's are preferred where possible as the
            only truly unique identifier.
        :param use_part_numbers: true if input identifiers are ICE part IDs.  Otherwise,
        consistency checks and related error messages will assume they're UUIDs.
        """
        if part_ids:
            logger.info('Searching ICE for %d unique parts...' % len(part_ids))
        else:
            return  # return early if there are no parts to query

        importer = self.importer
        ignore_ice_access_errors = self.options.ignore_ice_access_errors
        fail_for_non_strains = not self.options.allow_non_strains

        # get an ICE connection to look up strain UUID's from part number user input
        ice = create_ice_connection(importer.ice_username)
        # avoid throwing errors if failed to build connection
        if ice is None:
            if ignore_ice_access_errors:
                return
            details = _(
                "Your file contains %(count)d unique ICE part IDs, but EDD is not configured "
                "to connect to an ICE instance. You may proceed with using the uploaded file, "
                "but strain data will be omitted from your study, and you will have to "
                "individually add strain links to the created lines later."
            )
            importer.add_error(
                category_title=constants.SYSTEMIC_ICE_ACCESS_ERROR_CATEGORY,
                subtitle=constants.ICE_NOT_CONFIGURED,
                occurrence_detail=details % {'count': len(part_ids)}
            )
            return

        list_position = 0

        for part_id in part_ids:
            # query ICE for this part
            found_entry = None
            try:
                found_entry = ice.get_entry(part_id)

            # catch only HTTPErrors, which are likely to apply only to a single request/ICE
            # entry.
            # Note that ConnectionErrors and similar that are more likely to be systemic aren't
            # caught here and will immediately abort the remaining ICE queries.
            except requests.exceptions.HTTPError as http_err:
                # Track errors, while providing special-case error handling/labeling for ICE
                # permissions errors that are useful to detect on multiple parts in one
                # attempt.
                # Note that depending on the error type, there may not be a response

                # if error reflects a condition likely to repeat for each entry,
                # or that isn't useful to know individually per entry, abort the remaining
                # queries.
                # Note this test only covers the error conditions known to be produced by
                # ICE, not all the possible HTTP error codes we could handle more
                # explicitly. Also note that 404 is handled above in get_entry().
                if http_err.response.status_code == FORBIDDEN:
                    # aggregate errors that are helpful to detect on a per-part basis
                    if self.strains_required_for_naming:
                        importer.add_error(SINGLE_PART_ACCESS_ERROR_CATEGORY,
                                           STRAINS_ACCESS_REQUIRED_FOR_NAMES, part_id)

                    elif not ignore_ice_access_errors:
                        importer.add_error(SINGLE_PART_ACCESS_ERROR_CATEGORY,
                                           FORBIDDEN_PART_KEY, part_id)
                    continue
                else:
                    self._handle_systemic_ice_error(part_ids, part_id_to_part)
                    return

            if found_entry:
                part_id_to_part[part_id] = found_entry

                if fail_for_non_strains and not isinstance(found_entry, IceStrain):
                    importer.add_error(
                        NON_STRAINS_CATEGORY, NON_STRAIN_ICE_ENTRY,
                        found_entry.part_id
                    )

                # double-check for a coding error that occurred during testing. initial test
                # parts had "JBX_*" part numbers that matched their numeric ID, but this isn't
                # always the case!
                if (use_part_numbers and found_entry.part_id != part_id) or (
                            (not use_part_numbers) and found_entry.uuid != str(part_id)):
                    actual_id = found_entry.part_id if use_part_numbers else found_entry.uuid
                    logger.error(
                        "Couldn't locate ICE entry \"%(input_id)s\" "
                        "(#%(list_position)d in the file). An ICE entry was "
                        "found by searching for ID %(input_id)s, but its returned identifier "
                        "(%(actual_id)s) didn't match the input" % {
                            'input_id': part_id,
                            'list_position': list_position,
                            'numeric_id': found_entry.id,
                            'actual_id':  actual_id,
                        })
                    importer.add_error(INTERNAL_EDD_ERROR_CATEGORY,
                                       FOUND_PART_NUMBER_DOESNT_MATCH_QUERY,
                                       actual_id)

            elif not ignore_ice_access_errors:
                # treat inability to locate an individual part as an error unless specifically
                # requested to ignore on this attempt. Note we purposefully don't return here to
                # collect the full set of missing strains rather than failing after the first
                importer.add_error(SINGLE_PART_ACCESS_ERROR_CATEGORY, PART_NUMBER_NOT_FOUND,
                                   part_id)
            elif self.strains_required_for_naming:
                importer.add_error(NAMING_OVERLAP_CATEGORY, STRAINS_REQUIRED_FOR_NAMES, part_id)

    def _handle_systemic_ice_error(self, part_numbers, ice_entries):
        """
        Handles a systemic ICE communication error according to request parameters set by
        the UI
        """
        logger.exception('Error querying ICE for part number(s)')

        importer = self.importer
        self.exception_interrupted_ice_queries = True

        # If not specifically-requested by the UI, the normal case should be to reject the
        # upload
        # and force the user to acknowledge / override the problem rather than silently working
        # around it. In this unlikely case, this approach is slightly more work for users,
        # but also allows them to prevent creating inconsistencies that they'll have to resolve
        # later using more labor-intensive processes (e.g. potentially expensive manual line
        #  edits)
        if not self.options.ignore_ice_access_errors:
            importer.add_error(
                SYSTEMIC_ICE_ACCESS_ERROR_CATEGORY, GENERIC_ICE_RELATED_ERROR,
                "EDD administrators have been notified of the problem.  You can try again later, "
                "or proceed now and omit strain data from new lines in your study. "
                "If you omit strain data now, you'll have to manually edit your lines later "
                "after the problem is fixed.  Depending on the experiment, manually filling "
                "in the missing strain data later could be more work. \n\n"
                "Do you want to proceed without including the strains you used?")

        else:
            if self.strains_required_for_naming:
                importer.add_error(
                    NAMING_OVERLAP_CATEGORY, STRAINS_REQUIRED_FOR_NAMES,
                    'ICE part information is required input to computing line names as'
                    ' configured, but an error occurred while communicating with ICE. '
                    'You may remove strains from line names or retry when ICE is working again.')

            # If user got feedback re: ICE communication errors and chose to proceed anyway,
            # build a descriptive warning message re: the error, then proceed with line/assay
            # creation
            # TODO: add GET parameter to control whether this gets set (e.g. still helpful in
            # combinatorial GUI, though needs improvement for that case)
            else:

                # build a nice warning message that summarizes the state of the study following
                # creation
                found_entries_count = len(ice_entries)
                unique_part_number_count = len(part_numbers)
                if found_entries_count:
                    percent_found = 100 * (float(found_entries_count) / unique_part_number_count)
                    importer.add_warning(
                        SYSTEMIC_ICE_ACCESS_ERROR_CATEGORY, GENERIC_ICE_RELATED_ERROR,
                        "Lines were added to your study, but some will not be associated with "
                        f"ICE strains. {found_entries_count} of {unique_part_number_count} "
                        f"unique strains ({percent_found:.2f}%) were found before the error "
                        "occurred. The rest will need to be added later after the problem is "
                        "fixed. EDD administrators have been notified of the problem."
                    )

    def _notify_admins_of_systemic_ice_access_errors(self, options, unique_part_numbers,
                                                     ice_parts_by_number):
        """
        If configured, builds and sends a time-saving notification email re: ICE communication
        problems to EDD admins. The email informs admins of problems that should be resolved
        without user involvement, and aggregates/captures relevant context that will be hard to
        remember and extract from log content and complex related code.
        """

        importer = self.importer

        # return early if no notification-worthy errors have occurred
        if ((not importer.has_error(GENERIC_ICE_RELATED_ERROR)) and not importer.has_warning(
                GENERIC_ICE_RELATED_ERROR)):
            return

        logger.info(
            'Notifying system administrators of a systemic error communicating with ICE')

        # even though users may be able to work around the error, email EDD admins since they
        # should look into / resolve systemic ICE communication errors without user
        # intervention. Since communication via the Internet is involved, possible that the
        # errors during a workaround are different than during the first attempt. We'll clearly
        # mark that case in the email subject, but still send the email.
        subject = 'ICE access error during Experiment Description%s' % (
            ': (User Ignored)' if options.ignore_ice_access_errors else '')

        # build traceback string to include in the email
        formatted_lines = traceback.format_exc().splitlines()
        traceback_str = _ADMIN_EMAIL_TRACEBACK_DELIMITER.join(formatted_lines)

        part_numbers_not_found = [part_number for part_number in unique_part_numbers if
                                  part_number not in ice_parts_by_number]
        not_found_part_count = len(part_numbers_not_found)
        desired_part_count = len(unique_part_numbers)
        not_found_part_percent = 100 * ((float(not_found_part_count) / desired_part_count)
                                        if desired_part_count else 0)

        errors_list = json.dumps(
            _build_prioritized_issue_list(importer.errors, ERROR_PRIORITY_ORDER))
        warnings_list = json.dumps(_build_prioritized_issue_list(importer.warnings,
                                                                 WARNING_PRIORITY_ORDER))

        message = (ice_related_err_email_format % {
            'study_pk': importer.study.pk,
            'study_name': importer.study.name,
            'study_url': reverse('main:edd-pk:overview',
                                 kwargs={'pk': importer.study.pk}),
            'username': importer.ice_username,
            'ignore_ice_errors_param': IGNORE_ICE_ACCESS_ERRORS_PARAM,
            'ignore_ice_errors_val': options.ignore_ice_access_errors,
            'allow_duplicate_names_param': ALLOW_DUPLICATE_NAMES_PARAM,
            'allow_duplicate_names_val': options.allow_duplicate_names,
            'dry_run_param': DRY_RUN_PARAM,
            'dry_run_val': options.dry_run,

            'unique_part_number_count': desired_part_count,
            'unique_part_numbers': ', '.join(unique_part_numbers),

            'not_found_part_count': not_found_part_count,
            'not_found_percent': not_found_part_percent,
            'parts_not_found': ', '.join(part_numbers_not_found),

            'errors': pformat(errors_list, indent=_ADMIN_EMAIL_INDENT),
            'warnings': pformat(warnings_list, indent=_ADMIN_EMAIL_INDENT),
            'user_input_source': str(importer._input_summary),
            'traceback_suffix': (traceback_suffix % {'traceback': traceback_str}),
        })

        mail_admins(subject=subject, message=message, fail_silently=True)


class CombinatorialCreationImporter(object):

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

    def add_issue(self, is_error, title, subtitle, occurrence_detail):
        if is_error:
            self.add_error(title, subtitle, occurrence_detail)
        else:
            self.add_warning(title, subtitle, occurrence_detail)

    def add_error(self, category_title, subtitle='', occurrence_detail=None):
        self._append_summary(self.errors, category_title, subtitle, occurrence_detail)

    def add_warning(self, category_title, subtitle='', occurrence_detail=None):
        self._append_summary(self.warnings, category_title, subtitle, occurrence_detail)

    def has_error(self, subtitle):
        for category_title, errors_by_subtitle in viewitems(self.errors):
            if subtitle in errors_by_subtitle:
                return True

        return False

    def has_warning(self, subtitle):
        for category_title, warnings_by_subtitle in viewitems(self.warnings):
            if subtitle in warnings_by_subtitle:
                return True

        return False

    @staticmethod
    def _append_summary(source, category_title, subtitle, occurrence_detail=None):
        summary = source[category_title].get(subtitle)
        if not summary:
            summary = ImportErrorSummary(category_title, subtitle)
            source[category_title][subtitle] = summary

        if occurrence_detail:
            summary.add_occurrence(occurrence_detail)

    def do_import(self, stream, options, excel_filename=None):
        """
        Performs the import or raises an Exception if an unexpected / unhandled error occurred

        :return: a json dict with a summary of import results (for success or failure)
        """

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

        # parse the input contents (should be relatively short since they're likely manual input)
        if excel_filename:
            parser = ExperimentDescFileParser(self.cache)
            parse_input = load_workbook(BytesIO(stream.read()), read_only=True, data_only=True)
        else:
            parser = JsonInputParser(self.cache)
            parse_input = stream.read()

        line_def_inputs = parser.parse(parse_input, self, options)
        self.performance.end_input_parse()

        if (not line_def_inputs) and (not self.errors):
            self.add_error(BAD_GENERIC_INPUT_CATEGORY, NO_INPUT)

        # if there were any file parse errors, return helpful output before attempting any
        # database insertions. Note: returning normally causes the transaction to commit, but that
        # is ok here since no DB changes have occurred yet
        if self.errors:
            return BAD_REQUEST, _build_response_content(self.errors, self.warnings)

        required_naming_meta_pks = self._query_related_object_context(line_def_inputs)
        strains_required_for_naming = self.cache.strains_mtype.pk in required_naming_meta_pks

        # if there were any related object lookup errors, return helpful output before
        # attempting any database insertions
        if self.errors:
            return BAD_REQUEST, _build_response_content(self.errors, self.warnings)

        # cache a human-readable summary of input for possible use in error emails
        if excel_filename:
            self._input_summary = excel_filename
        else:
            self._input_summary = parser.parsed_json

        with transaction.atomic(savepoint=False):
            return self._define_study(line_def_inputs, options, strains_required_for_naming)

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
        cache = self.cache
        related_objects = cache.related_objects

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
            for line_meta_pk, line_meta_type in viewitems(cache.related_object_mtypes):
                if line_meta_pk == cache.strains_mtype.pk:
                    # skip strains! Strain lookup in ICE is a special case handled separately
                    continue

                if line_meta_pk not in required_meta_pks:
                    required_value_pks = line_def_input.get_related_object_ids(line_meta_pk)
                    if required_value_pks:
                        required_meta_pks.add(line_meta_pk)

        if not required_meta_pks:
            logger.info('Skipping related object lookup. No non-Strain related objects are '
                        'required to compute line names or to set foreign key relations '
                        'following line creation.')
            return required_naming_meta_pks

        line_meta_types = cache.line_meta_types
        strains_mtype_pk = cache.strains_mtype.pk

        logger.debug('Looking up related object values: %s' % {
            pk: line_meta_types.get(pk).type_name for pk in required_meta_pks})

        try:
            for line_meta_pk in required_meta_pks:
                # skip strains -- those are a special case handled separately
                if line_meta_pk == strains_mtype_pk:
                    continue

                required_value_ids = set()
                for line_def_input in line_def_inputs:
                    required_value_ids.update(
                        line_def_input.get_related_object_ids(line_meta_pk))

                line_meta_type = line_meta_types[line_meta_pk]
                line_attr_name = line_meta_type.type_field

                # if this metadata is required as input to computing the line name, but isn't
                # a line attribute, then the stored value isn't a pk, it's just a value (e.g. Media
                # in EDD 2.2.0)
                if line_attr_name is None:
                    continue

                line_attr = Line._meta.get_field(line_attr_name)
                related_model_class = line_attr.related_model

                queryset = related_model_class.objects.filter(pk__in=required_value_ids)

                # select related field values along with the query (assumes we aren't crossing
                # M2M relationships)
                related_field_name = ALLOWED_RELATED_OBJECT_FIELDS[line_attr_name]
                related_field = related_model_class._meta.get_field(related_field_name)
                if related_field.is_relation:
                    if related_field.one_to_many or related_field.many_to_many:
                        queryset = queryset.prefetch_related(related_field_name)
                    else:
                        queryset = queryset.select_related(related_field_name)

                found_context = {result.pk: result for result in queryset}
                related_objects[line_meta_pk] = found_context

                if len(found_context) != len(required_value_ids):
                    missing_pks = [str(pk) for pk in required_value_ids if pk not in found_context]
                    logger.error(
                        f'Unable to locate {len(missing_pks)} of {len(required_value_ids)} '
                        f'required inputs for metadata {line_meta_type.type_name}'
                    )
                    pk_str = ', '.join(missing_pks)
                    self.add_error(
                        INTERNAL_EDD_ERROR_CATEGORY, MISSING_REQUIRED_NAMING_INPUT,
                        f'{line_meta_type.type_name}: {pk_str}'
                    )

            logger.debug('Found related object values: %s' % related_objects)

        except Exception as e:
            logger.exception('Error looking up naming context')
            self.add_error(INTERNAL_EDD_ERROR_CATEGORY, UNPREDICTED_ERROR, e.message)

        return required_naming_meta_pks

    def _define_study(self, line_def_inputs, options, strains_required_for_naming):
        """
        Queries EDD and ICE to verify that the required ICE strains have an entry in EDD's
        database. If not, creates them.  Once strains are created, combinatorially creates lines
        and assays within the study as specified by combinatorial_inputs.
        :return: A JSON summary string that summarizes results of the attempted line/assay/strain
            creation
        :raise Exception: if an unexpected error occurs.
        """

        # get some convenient references to unclutter syntax below
        cache = self.cache
        performance = self.performance
        study = self.study

        # TODO: to support JSON with possible mixed known/unknown strains for the combinatorial
        # GUI, test whether input resulted from JSON, then skip initial part number lookup for
        # anything that is an integer (assuming it's a local pk for a known strain).
        # Maybe there's a better solution?

        # build a list of unique strain ids (UUID or ICE part number, depending on input source)
        unique_strain_ids = set()
        for combo in line_def_inputs:
            unique_strain_ids = combo.get_related_object_ids(cache.strains_mtype.pk,
                                                             unique_strain_ids)

        # Resolve ICE part identifiers from the input.  When processing an Experiment Description
        # files, identifiers will be ICE part numbers that must be resolved by querying ICE.
        # For bulk line creation, identifiers will be UUID's that may not have to be resolved by
        # querying ICE if already cached in EDD.  For simplicity, we'll just always query ICE
        # unless we observe a performance problem.
        if unique_strain_ids:
            lookup_strategy = IcePartResolver(self, unique_strain_ids, line_def_inputs,
                                              options, strains_required_for_naming)

            # also updates inputs to use pk's instead of part #'s
            cache.strains_by_pk = lookup_strategy.resolve_strains(cache.strains_mtype.pk)

            if self.errors:
                status_code = (BAD_REQUEST if self.has_error(PART_NUMBER_NOT_FOUND)
                               else INTERNAL_SERVER_ERROR)
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
            performance.end_naming_check()

        # return just the planned line/assay names if we're doing a dry run
        if options.dry_run:
            content = {
                'count': len(planned_names),
                'lines': planned_names
            }

            status = OK
            if self.errors and not options.allow_duplicate_names:
                status = BAD_REQUEST

            elif not planned_names:
                self.add_error(INTERNAL_EDD_ERROR_CATEGORY, EMPTY_RESULTS)
                status = codes.internal_server_error

            _build_response_content(self.errors, self.warnings, val=content)
            return status, content

        # if we've detected errors before modifying the study, fail before attempting db mods
        if self.errors:
            return BAD_REQUEST, _build_response_content(self.errors, self.warnings)

        ###########################################################################################
        # Create requested lines and assays in the study
        ###########################################################################################
        created_lines_list = []
        total_assay_count = 0
        for index, input_set in enumerate(line_def_inputs):

            # test for
            if input_set.replicate_count == 0:
                self.add_error(BAD_GENERIC_INPUT_CATEGORY, ZERO_REPLICATES, index)

            creation_visitor = input_set.populate_study(study, cache, options)
            created_lines_list.extend(creation_visitor.lines_created)
            items = viewitems(creation_visitor.line_to_protocols_to_assays_list)
            for line_pk, protocol_to_assays_list in items:
                for protocol, assays_list in viewitems(protocol_to_assays_list):
                    total_assay_count += len(assays_list)

        ###########################################################################################
        # Package up and return results
        ###########################################################################################
        total_line_count = len(created_lines_list)
        performance.overall_end()

        if self.errors:
            raise RuntimeError('Errors occurred during experiment description upload')

        logger.info('Created %(line_count)d lines and %(assay_count)d assays in %(seconds)0.2f '
                    'seconds' % {
                        'line_count': total_line_count,
                        'assay_count': total_assay_count,
                        'seconds': performance.total_time_delta.total_seconds(), })

        content = {
            'lines_created': total_line_count,
            'assays_created': total_assay_count,
            'runtime_seconds': performance.total_time_delta.total_seconds()
        }

        return OK, _build_response_content(self.errors, self.warnings, content)

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
        logger.info('in determine_names()')

        # get convenient references to unclutter syntax below
        study = self.study

        # Check for uniqueness of planned names so that overlaps can be flagged as an error (e.g.
        # as possible in the combinatorial GUI mockup attached to EDD-257)
        unique_input_line_names = set()
        protocol_to_unique_input_assay_names = defaultdict(dict)
        duplicated_new_line_names = set()
        protocol_to_duplicate_new_assay_names = defaultdict(list)

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
        for input_index, input_set in enumerate(combinatorial_inputs):
            logger.info('Processing combinatorial input %(num)d of %(total)d' % {
                'num': input_index + 1,
                'total': len(combinatorial_inputs),
            })
            names = input_set.compute_line_and_assay_names(study, self.cache, options)
            for line_name in names.line_names:
                protocol_to_assay_names = names.line_to_protocols_to_assays_list.get(line_name)

                if isinstance(input_set, _ExperimentDescriptionFileRow):
                    line_name_to_input_rows[line_name].add(input_set.row_number)

                if line_name in unique_input_line_names:
                    duplicated_new_line_names.add(line_name)
                else:
                    unique_input_line_names.add(line_name)

                # defaultdict, so side effect is assignment
                all_protocol_to_assay_names = all_planned_names[line_name]

                for protocol_pk, assay_names in viewitems(protocol_to_assay_names):
                    all_planned_assay_names = all_protocol_to_assay_names[protocol_pk]

                    for assay_name in assay_names:
                        all_planned_assay_names.append(assay_name)

                        if isinstance(input_set, _ExperimentDescriptionFileRow):
                            protocol_to_assay_name_to_input_rows[protocol_pk][assay_name].add(
                                    input_set.row_number)

                        unique_assay_names = protocol_to_unique_input_assay_names[protocol_pk]

                        if assay_name in unique_assay_names:
                            duplicate_names = protocol_to_duplicate_new_assay_names[protocol_pk]
                            duplicate_names.append(assay_name)
                        else:
                            unique_assay_names[assay_name] = True

        # if we're allowing duplicate names, skip further checking / DB queries for duplicates
        if options.allow_duplicate_names:
            return all_planned_names

        # add error messages for duplicate line names that indicate that the input isn't
        # self-consistent
        for duplicate_name in duplicated_new_line_names:
            message = duplicate_name
            int_row_nums = line_name_to_input_rows[duplicate_name]

            # e.g. this is an Experiment Description file build a bettor error message
            if int_row_nums and int_row_nums is not None:
                # TODO: consider extracting column number too
                sorted_rows = sorted(int_row_nums)
                str_row_nums = [str(row_num) for row_num in sorted_rows]
                if str_row_nums:
                    message = '%(line_name)s (row %(rows_list)s)' % {
                        'line_name': duplicate_name,
                        'rows_list': ', '.join(str_row_nums),
                    }
            self.add_error(NAMING_OVERLAP_CATEGORY, DUPLICATE_INPUT_LINE_NAMES, message)

        # aggregate/add error messages for duplicate assay names that indicate that the input isn't
        # self-consistent. Note that though it isn't all used yet, we purposefully organize the
        # intermediate data in two ways: one for convenient display in the current UI, the other
        # for eventual JSON generation for the following one...see comments in EDD-626.
        duplicate_input_assay_to_cells = defaultdict(set)
        for protocol_pk, duplicates in viewitems(protocol_to_duplicate_new_assay_names):
            for duplicate_name in duplicates:
                message = duplicate_name
                row_nums = [str(row_num) for row_num in
                            protocol_to_assay_name_to_input_rows[protocol_pk][duplicate_name]]
                if row_nums:
                    duplicate_input_assay_to_cells[duplicate_name].update(row_nums)  # TODO: cells!

        for assay_name, cells in viewitems(duplicate_input_assay_to_cells):
            sorted_cells = sorted(cells)
            message = '%(assay_name)s (%(cells_list)s)' % {
                'assay_name': assay_name,
                'cells_list': ', '.join(sorted_cells),
            }
            self.add_error(NAMING_OVERLAP_CATEGORY, DUPLICATE_INPUT_ASSAY_NAMES, message)

        # return early, avoiding extra DB queries if the input isn't self-consistent
        if duplicated_new_line_names or protocol_to_duplicate_new_assay_names:
            return all_planned_names

        # query the database in bulk for any existing lines in the study whose names are the same
        # as lines in the input
        unique_line_names_list = list(unique_input_line_names)
        existing_lines = Line.objects.filter(study__pk=study.pk, name__in=unique_line_names_list)

        for existing in {line.name for line in existing_lines}:
            self.add_error(NAMING_OVERLAP_CATEGORY, EXISTING_LINE_NAMES, existing)

        # do a series of bulk queries to check for uniqueness of assay names within each protocol.
        # TODO: we can do some additional work to provide better (e.g. cell-number based) feedback,
        # but this should be a good stopgap.
        duplicate_existing_assay_names = set()
        for protocol_pk, assay_names_list in viewitems(protocol_to_unique_input_assay_names):
            existing_assays = Assay.objects.filter(
                name__in=assay_names_list,
                line__study__pk=study.pk,
                protocol__pk=protocol_pk
            ).distinct()

            for existing in {assay.name for assay in existing_assays}:
                duplicate_existing_assay_names.add(existing)

        for name in duplicate_existing_assay_names:
            self.add_error(NAMING_OVERLAP_CATEGORY, EXISTING_ASSAY_NAMES, name)

        return all_planned_names

    def send_unexpected_err_email(self, dry_run, ignore_ice_related_errors, allow_duplicate_names):
        """
        Creates and sends a context-specific error email with helpful information
        regarding unexpected errors encountered during Experiment Description processing.
        """
        # build traceback string to include in a bare-bones admin notification email
        formatted_lines = traceback.format_exc().splitlines()
        traceback_str = _ADMIN_EMAIL_TRACEBACK_DELIMITER.join(formatted_lines)

        subject = 'Unexpected Error during Experiment Description processing'
        message = base_email_format % {
            'study_pk': self.study.pk,
            'study_name': self.study.name,
            'study_url': reverse(_STUDY_PK_OVERVIEW_NAME, kwargs={'pk': self.study.pk}),
            'username': self.user.username,
            'dry_run_param': DRY_RUN_PARAM,
            'dry_run_val': dry_run,
            'ignore_ice_errors_param': IGNORE_ICE_ACCESS_ERRORS_PARAM,
            'ignore_ice_errors_val': ignore_ice_related_errors,
            'allow_duplicate_names_param': ALLOW_DUPLICATE_NAMES_PARAM,
            'allow_duplicate_names_val': allow_duplicate_names,
        } + (traceback_suffix % {'traceback': traceback_str})
        mail_admins(subject, message, fail_silently=True)
