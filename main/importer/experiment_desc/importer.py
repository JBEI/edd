# coding: utf-8
from __future__ import unicode_literals

import logging

from collections import defaultdict
from django.conf import settings
from django.db import transaction
from io import BytesIO
from openpyxl import load_workbook

from .constants import (
    FOUND_PART_NUMBER_DOESNT_MATCH_QUERY,
    NON_STRAIN_ICE_ENTRY,
    PART_NUMBER_MISSING,
)
from .parsers import ExperimentDefFileParser, JsonInputParser
from .utilities import CombinatorialCreationPerformance, find_existing_strains
from jbei.rest.auth import HmacAuth
from jbei.rest.clients import IceApi
from jbei.rest.clients.ice.api import Strain as IceStrain
from jbei.rest.clients.ice.utils import make_entry_url
from main.models import Protocol, MetadataType, Strain, Assay, Line


logger = logging.getLogger(__name__)

ERRORS_KEY = 'errors'
WARNINGS_KEY = 'warnings'

_ALLOW_DUPLICATE_NAMES_DEFAULT = False
_DRY_RUN_DEFAULT = False


# for safety / for now get repeatable reads within this method, even though writes start much later
# possibility of long-running transactions as a result, but should be infrequent
@transaction.atomic(savepoint=False)
def define_study(stream, user, study, is_json,
                 allow_duplicate_names=_ALLOW_DUPLICATE_NAMES_DEFAULT, dry_run=_DRY_RUN_DEFAULT):
    # TODO: relocate to a Celery task and add related user notifications/context-appropriate
    # error handling following initial testing/deployment.
    # This function's parameters are structured in a similar form to the Celery task, though
    # initial testing / UI work should be easier to test with it executing synchronously. Unlikely
    # that very large inputs will be provided often, so asynchronous processing is desirable
    # here, but not required for the anticipated majority of use cases.

    """
    Defines a study from the set of lines / assays provided in the template file parameter. Study
    lines / assays, and are all created atomically, so any failure
    prevents  changes from taking hold.  Known sources of error are exhaustively checked and
    summarized in JSON output, even in the event of failure. Any strains
    specified in the input file, and not already
    present in EDD's local cache of ICE strains, will be automatically added iff they can be
    uniquely identified in ICE. Several caveats are:
    1) Line names must be unique within the study, or the creation task will be aborted.

    Note that this method performs work very similar to EDD's bulk line creation script,
    create_lines.py.
    :return: A JSON summary string if lines/assays were created successfully,
    raises an Exception otherwise
    """
    importer = CombinatorialCreationImporter(study, user)
    return importer.do_import(stream, is_json, allow_duplicate_names, dry_run)


def _build_errors_dict(errors, warnings, val=None):
    if val is None:
        val = {}
    if errors:
        val[ERRORS_KEY] = errors
    if warnings:
        val[WARNINGS_KEY] = warnings
    return val


class CombinatorialCreationImporter(object):
    REQUIRE_STRAINS = True

    def __init__(self, study, user):

        self.performance = CombinatorialCreationPerformance()
        self.errors = defaultdict(list)
        self.warnings = defaultdict(list)

        ###########################################################################################
        # Gather context from EDD's database
        ###########################################################################################

        # TODO: these should be queried separately when this code gets relocated to a Celery task
        self.user = user
        self.study = study

        # build up a dictionary of protocols with unique names (guaranteed by Protocol.save())
        protocols_qs = Protocol.objects.all()
        self.protocols_by_pk = {protocol.pk: protocol for protocol in protocols_qs}

        # build up dictionaries of Line and Assay metadata types with unique names (guaranteed by
        # DB constraints)
        # TODO: I18N
        line_metadata_qs = MetadataType.objects.filter(for_context=MetadataType.LINE)
        self.line_metadata_types_by_pk = {
            meta_type.pk: meta_type
            for meta_type in line_metadata_qs
        }
        # TODO: I18N
        assay_metadata_qs = MetadataType.objects.filter(for_context=MetadataType.ASSAY)

        self.assay_metadata_types_by_pk = {
            meta_type.pk: meta_type
            for meta_type in assay_metadata_qs
        }
        self.performance.end_context_queries()

    def add_error(self, error_type, error_value):
        self.errors[error_type].append(error_value)

    def add_warning(self, warning_type, warning_value):
        self.warnings[warning_type].append(warning_value)

    def do_import(self, input_data, is_json, allow_duplicate_names=_ALLOW_DUPLICATE_NAMES_DEFAULT,
                  dry_run=_DRY_RUN_DEFAULT):
        """
        Performs the import, or raises an Exception if an unrecoverable error occurred.

        :return: a json dict with a summary of import results (on success only)
        """

        ###########################################################################################
        # Parse / validate the input against metadata defined in the database
        ###########################################################################################
        # Note: it would be more memory efficient to perform creation after reading each line of
        # the file, but that's not likely to be a problem. Can do that optimization later after
        # enforcing a good separation of concerns with this general layout.
        protocols_by_pk = self.protocols_by_pk
        line_metadata_types_by_pk = self.line_metadata_types_by_pk
        assay_metadata_types_by_pk = self.assay_metadata_types_by_pk

        # read in the file contents (should be relatively short since they're likely manual input)
        if is_json:
            parser = JsonInputParser(protocols_by_pk, line_metadata_types_by_pk,
                                     assay_metadata_types_by_pk,
                                     require_strains=self.REQUIRE_STRAINS)
        else:
            input_data = load_workbook(BytesIO(input_data.read()), read_only=True, data_only=True)
            if len(input_data.worksheets) == 0:
                self.add_error('no_input', 'no worksheets in file')

            parser = ExperimentDefFileParser(protocols_by_pk, line_metadata_types_by_pk,
                                             assay_metadata_types_by_pk,
                                             require_strains=self.REQUIRE_STRAINS)

        line_def_inputs = parser.parse(input_data, self)
        self.performance.end_input_parse()

        if not line_def_inputs:
            self.add_error('no_inputs', 'No line description inputs were read')

        # if there were any file parse errors, return helpful output before attempting any
        # database insertions. Note: returning normally causes the transaction to commit, but that
        # is ok here since
        if self.errors:
            return _build_errors_dict(self.errors, self.warnings)

        with transaction.atomic(savepoint=False):
            return self._define_study(
                combinatorial_inputs=line_def_inputs,
                allow_duplicate_names=allow_duplicate_names,
                dry_run=dry_run
            )

    def _define_study(self, combinatorial_inputs,
                      allow_duplicate_names=_ALLOW_DUPLICATE_NAMES_DEFAULT,
                      dry_run=_DRY_RUN_DEFAULT):
        """
        Queries EDD and ICE to verify that the required ICE strains have an entry in EDD's
        database. If not, creates them.  Once strains are created, combinatorially creates lines
        and assays within the study as specified by combinatorial_inputs.
        :return: A JSON summary string that summarizes results of the attempted line/assay/strain
            creation
        :raise Exception: if an unexpected error occurs.
        """

        # get some convenient references to unclutter syntax below
        line_metadata_types = self.line_metadata_types_by_pk
        assay_metadata_types = self.assay_metadata_types_by_pk
        performance = self.performance
        user = self.user
        study = self.study

        # TODO: to support JSON with possible mixed known/unknown strains for the combinatorial
        # GUI, test whether input resulted from JSON, then skip initial part number lookup for
        # anything that is an integer. Maybe there's a better solution?

        ###########################################################################################
        # Search ICE for entries corresponding to the part numbers in the file
        ###########################################################################################
        # get an ICE connection to look up strain UUID's from part number user input
        ice = IceApi(auth=HmacAuth(key_id=settings.ICE_KEY_ID, username=user.email),
                     verify_ssl_cert=settings.VERIFY_ICE_CERT)

        # build a list of unique part numbers found in the input file. we'll query ICE to get
        # references to them. Note: ideally we'd do this externally to the @atomic block, but other
        # EDD queries have to precede this one
        unique_part_numbers = set()
        part_lookup = {}

        for combo in combinatorial_inputs:
            unique_part_numbers = combo.get_unique_strain_ids(unique_part_numbers)

        # maps part id -> Entry for those found in ICE
        unique_part_number_count = len(unique_part_numbers)

        # query ICE for UUID's part numbers found in the input file
        # NOTE: to work around issues with ICE, putting this in try-catch and ignoring
        #    communication errors; strains will not be added but everything else will continue
        #    to work.
        try:
            part_lookup = self.get_ice_entries(ice, unique_part_numbers)
        except:
            pass
        performance.end_ice_search(unique_part_number_count)

        ###########################################################################################
        # Search EDD for existing strains using UUID's queried from ICE
        ###########################################################################################

        # query EDD for Strains by UUID's found in ICE
        strain_search_count = len(part_lookup)
        strains_by_part_number, non_existent_edd_strains = find_existing_strains(part_lookup, self)
        performance.end_edd_strain_search(strain_search_count)

        ###########################################################################################
        # Create any missing strains in EDD's database, but go ahead with caching strain data in
        # EDD since it's likely to be used below or referenced again (even if this is a dry run)
        ###########################################################################################
        self.create_missing_strains(non_existent_edd_strains, strains_by_part_number)
        strains_by_pk = {strain.pk: strain for strain in strains_by_part_number.itervalues()}
        performance.end_edd_strain_creation(len(non_existent_edd_strains))

        ###########################################################################################
        # Replace part-number-based strain references in the input with local primary keys usable
        # to create Line entries in EDD's database
        ###########################################################################################
        for input_set in combinatorial_inputs:
            input_set.replace_strain_part_numbers_with_pks(strains_by_part_number, self)

        ###########################################################################################
        # Compute line/assay names if needed as output for a dry run, or if needed to proactively
        # check for duplicates
        ###########################################################################################
        # For maintenance: Note that line names may contain strain information that has to be
        # looked up above before the name can be determined
        planned_names = []
        if dry_run or (not allow_duplicate_names):
            planned_names = self._compute_and_check_names(combinatorial_inputs, strains_by_pk,
                                                          allow_duplicate_names)
            performance.end_naming_check()

        # return just the planned line/assay names if we're doing a dry run
        if dry_run:
            result = {
                'planned_results': planned_names
            }
            _build_errors_dict(self.errors, self.warnings, val=result)
            return result

        # if we've detected errors before modifying the study, fail before attempting db mods
        if self.errors:
            return _build_errors_dict(self.errors, self.warnings)

        ###########################################################################################
        # Create requested lines and assays in the study
        ###########################################################################################
        created_lines_list = []
        total_assay_count = 0
        for input_set in combinatorial_inputs:

            creation_visitor = input_set.populate_study(
                study,
                line_metadata_types=line_metadata_types,
                assay_metadata_types=assay_metadata_types,
                strains_by_pk=strains_by_pk
            )
            created_lines_list.extend(creation_visitor.lines_created)
            items = creation_visitor.line_to_protocols_to_assays_list.iteritems()
            for line_pk, protocol_to_assays_list in items:
                for protocol, assays_list in protocol_to_assays_list.iteritems():
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

        return {
            'lines_created': total_line_count,
            'assays_created': total_assay_count,
            'runtime_seconds': performance.total_time_delta.total_seconds()
        }

    def _compute_and_check_names(self, combinatorial_inputs, strains_by_pk, allow_duplicate_names):
        """
        Tests the input for non-unique line/assay naming prior to attempting to insert it into the
        database, then captures errors if any duplicate names would be created during database I/O.
        Testing for inconsistency first should be efficient in may error cases, where it prevents
        unnecessary database I/O for line/assay creation prior to detecting duplicated naming.
        :return a dict with a hierarchical listing of all planned line/assay names (regardless of
        whether some are duplicates)
        """
        logger.info('in determine_names()')

        # get convenient references to unclutter syntax below
        line_metadata_types = self.line_metadata_types_by_pk
        assay_metadata_types = self.assay_metadata_types_by_pk
        study = self.study

        # Check for uniqueness of planned names so that overlaps can be flagged as an error (e.g.
        # as possible in the combinatorial GUI mockup attached to EDD-257)
        unique_input_line_names = set()
        protocol_to_unique_input_assay_names = defaultdict(dict)
        duplicated_new_line_names = set()
        protocol_to_duplicate_new_assay_names = defaultdict(list)

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
        for input_set in combinatorial_inputs:
            names = input_set.compute_line_and_assay_names(study, line_metadata_types,
                                                           assay_metadata_types, strains_by_pk)
            for line_name in names.line_names:
                protocol_to_assay_names = names.line_to_protocols_to_assays_list.get(line_name)

                if line_name in unique_input_line_names:
                    duplicated_new_line_names.add(line_name)
                else:
                    unique_input_line_names.add(line_name)

                # defaultdict, so side effect is assignment
                all_protocol_to_assay_names = all_planned_names[line_name]

                for protocol_pk, assay_names in protocol_to_assay_names.items():
                    all_planned_assay_names = all_protocol_to_assay_names[protocol_pk]

                    for assay_name in assay_names:
                        all_planned_assay_names.append(assay_names)

                        unique_assay_names = protocol_to_unique_input_assay_names[protocol_pk]

                        if assay_name in unique_assay_names.keys():
                            duplicate_names = protocol_to_duplicate_new_assay_names[protocol_pk]
                            duplicate_names.append(assay_name)
                        else:
                            unique_assay_names[assay_name] = True

        # if we're allowing duplicate names, skip further checking / DB queries for duplicates
        if allow_duplicate_names:
            return all_planned_names

        # return early if the input isn't self-consistent
        for dupe in duplicated_new_line_names:
            self.add_error('duplicate_input_line_names', dupe)

        for dupe in protocol_to_duplicate_new_assay_names:
            self.add_error('duplicate_input_assay_names', dupe)

        if duplicated_new_line_names or protocol_to_duplicate_new_assay_names:
            return all_planned_names

        # query the database in bulk for any existing lines in the study whose names are the same
        # as lines in the input
        unique_line_names_list = list(unique_input_line_names)
        existing_lines = Line.objects.filter(study__pk=study.pk, name__in=unique_line_names_list)

        for existing in {line.name for line in existing_lines}:
            self.add_error('existing_line_names', existing)

        # do a series of bulk queries to check for uniqueness of assay names within each protocol
        for protocol_pk, assay_names_list in protocol_to_unique_input_assay_names.iteritems():
            existing_assays = Assay.objects.filter(
                name__in=assay_names_list,
                line__study__pk=study.pk,
                protocol__pk=protocol_pk
            )
            for existing in {assay.name for assay in existing_assays}:
                self.add_error('existing_assay_names', existing)

        return all_planned_names

    def create_missing_strains(self, non_existent_edd_strains, strains_by_part_number):
        """
        Creates Strain entries from the associated ICE entries for any parts.

        :param non_existent_edd_strains: a list of ICE entries to use as the basis for EDD
            strain creation
        :return:
        """
        # just do it in a loop. EDD's Strain uses multi-table inheritance, which prevents bulk
        # creation
        for ice_entry in non_existent_edd_strains:
            # for now, only allow strain creation in EDD -- non-strains are not currently
            # supported. see EDD-239.
            if not isinstance(ice_entry, IceStrain):
                self.add_error(NON_STRAIN_ICE_ENTRY, ice_entry.part_id)
                continue
            strain = Strain.objects.create(
                name=ice_entry.name,
                description=ice_entry.short_description,
                registry_id=ice_entry.uuid,
                registry_url=make_entry_url(settings.ICE_URL, ice_entry.id)
            )
            strains_by_part_number[ice_entry.part_id] = strain

    def get_ice_entries(self, ice, part_numbers):
        """
        Queries ICE for parts with the provided (locally-unique) numbers, logging errors for any
        parts that weren't found into the errors parameter. Note that we're purposefully trading
        off readability for a guarantee of multi-deployment uniqueness, though as in use at JBEI
        the odds are still pretty good that a part number is sufficient to uniquely identify an ICE
        entry.

        :param part_numbers: a dictionary whose keys are part numbers to be queried
            from ICE. Existing entries will be replaced with the Entries read from ICE, or keys
            will be removed for those that aren't found in ICE.
        """
        list_position = 0
        results = {}
        for local_ice_part_number in part_numbers:
            found_entry = ice.get_entry(local_ice_part_number)
            if found_entry:
                results[local_ice_part_number] = found_entry
                # double-check for a coding error that occurred during testing. initial test parts
                # had "JBX_*" part numbers that matched their numeric ID, but this isn't always the
                # case!
                if found_entry.part_id != local_ice_part_number:
                    logger.error(
                        "Couldn't locate ICE entry \"%(csv_part_number)s\" "
                        "(#%(list_position)d in the file) by part number. An ICE entry was "
                        "found with numeric ID %(numeric_id)s, but its part number "
                        "(%(part_number)s) didn't match the search part number" % {
                            'csv_part_number': local_ice_part_number,
                            'list_position': list_position, 'numeric_id': found_entry.id,
                            'part_number': found_entry.part_id
                        })
                    self.add_error(FOUND_PART_NUMBER_DOESNT_MATCH_QUERY, found_entry.part_id)
            elif hasattr(settings, 'EDD_ICE_FAIL_MODE') and settings.EDD_ICE_FAIL_MODE == 'fail':
                self.add_error(PART_NUMBER_MISSING, local_ice_part_number)
            else:
                # make a note that this part number is missing
                self.add_warning(PART_NUMBER_MISSING, local_ice_part_number)
        return results
