from __future__ import unicode_literals

import logging
from collections import OrderedDict

from django.conf import settings
from django.db import transaction
from io import BytesIO

from jbei.rest.auth import HmacAuth
from jbei.rest.clients import IceApi
from jbei.rest.clients.ice.api import Strain as IceStrain
from jbei.rest.clients.ice.utils import make_entry_url
from main.importer.experiment_def.utilities import find_existing_strains, \
    CombinatorialCreationPerformance
from .parsers import JsonInputParser
from openpyxl import load_workbook

from main.importer.experiment_def.parsers import ExperimentDefFileParser
from main.models import StudyPermission, User, Protocol, MetadataType, Strain, Assay, Line, Study

logger = logging.getLogger(__name__)

# get repeatable reads within this method, even though writes start much later
@transaction.atomic(savepoint=False)
def define_study_task(input, user_pk, study, is_json, errors, warnings, dry_run=False):
    # TODO: relocate to a Celery task and add related user notifications/context-appropriate
    # error handling following initial testing.
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
    :param input:
    :param user_pk:
    :param study_id:
    :return: A JSON summary string if lines/assays were created successfully, False otherwise
    """

    REQUIRE_STRAINS = True
    performance = CombinatorialCreationPerformance()

    ################################################################################################
    # Gather context from EDD's database
    ################################################################################################
    # get the study first, or throw a 404 if user doesn't have write permission on the study
    user = User.objects.get(pk=user_pk)

    # build up a dictionary of protocols with unique names (guaranteed by Protocol.save())
    protocols_qs = Protocol.objects.all()
    protocols_by_pk = {protocol.pk:protocol for protocol in protocols_qs}

    # build up dictionaries of Line and Assay metadata types with unique names (guaranteed by DB
    # constraints)
    line_metadata_qs = MetadataType.objects.filter(for_context=MetadataType.LINE)  # TODO: I18N
    line_metadata_types_by_pk = {meta_type.pk:meta_type for meta_type in line_metadata_qs}
    assay_metadata_qs = MetadataType.objects.filter(for_context=MetadataType.ASSAY)  # TODO: I18N
    assay_metadata_types_by_pk = {meta_type.pk: meta_type for meta_type in assay_metadata_qs}
    performance.end_context_queries()

    ################################################################################################
    # Parse / validate the input against metadata defined in the database
    ################################################################################################
    # Note: it would be more memory efficient to perform creation after reading each line of the
    # file, but that's not likely to be a problem. Can do that optimization later after enforcing
    # a good separation of concerns with this general layout.

    # read in the file contents (should be relatively short since they're likely manual input)
    if is_json:
        parser = JsonInputParser(protocols_by_pk, line_metadata_types_by_pk,
                                 assay_metadata_types_by_pk, require_strains=REQUIRE_STRAINS)
    else:
        input = load_workbook(BytesIO(input.read()), read_only=True, data_only=True)
        if len(input.worksheets) == 0:
            errors['no_input'] = 'no worksheets in file'

        parser = ExperimentDefFileParser(protocols_by_pk, line_metadata_types_by_pk,
                                         assay_metadata_types_by_pk, require_strains=REQUIRE_STRAINS)
    line_def_inputs = parser.parse(input, errors, warnings)
    performance.end_input_parse()

    if not line_def_inputs:
        errors['no_inputs'] = 'No line definition inputs were read'

    # if there were any file parse errors, return helpful output before attempting any
    # database insertions. Note: returning normally causes the transaction to commit, but that's
    # ok here since
    if errors:
        return _build_errors_dict(errors, warnings)

    # TODO: need to raise an exception here to abort the transaction, or else change the scope
    # of the transaction
    with transaction.atomic(savepoint=False):
        return _define_study(study=study,
                             user=user,
                             combinatorial_inputs=line_def_inputs,
                             protocols_by_pk=protocols_by_pk,
                             line_metadata_types=line_metadata_types_by_pk,
                             assay_metadata_types=assay_metadata_types_by_pk,
                             performance=performance,
                             errors=errors,
                             warnings=warnings,
                             dry_run=dry_run)

ERRORS_KEY = 'errors'
WARNINGS_KEY = 'warnings'


def _build_errors_dict(errors, warnings, val=None):
    if val is None:
        val = {}
    if errors:
        val[ERRORS_KEY] = errors
    if warnings:
        val[WARNINGS_KEY] = warnings
    return val


def _define_study(study, user, combinatorial_inputs, protocols_by_pk, line_metadata_types,
                  assay_metadata_types, performance, errors, warnings, dry_run=False):
    """
    Queries EDD and ICE to verify that the required ICE strains have an entry in EDD's database.
    If not, creates them.  Once strains are created, combinatorially creates lines and assays
    within the study as specified by combinatorial_inputs.
    :return: A JSON summary string that summarizes results of the attempted line/assay/strain
    creation
    :raise Exception: if an unexpected error occurs.
    """

    # TODO: to support JSON with possible mixed known/unknown strains for the combinatorial GUI,
    # test whether input resulted from JSON, then skip initial part number lookup for anything
    # that's an integer. Maybe there's a better solution?

    from pprint import pprint  # TODO: remove debug stmt
    pprint(combinatorial_inputs)

    ################################################################################################
    # Search ICE for entries corresponding to the part numbers in the file
    ################################################################################################
    # get an ICE connection to look up strain UUID's from part number user input
    ice = IceApi(auth=HmacAuth(key_id=settings.ICE_KEY_ID, username=user.email),
                 verify_ssl_cert=settings.VERIFY_ICE_CERT)

    # build a list of unique part numbers found in the input file. we'll query ICE to get references
    # to them. Note: ideally we'd do this externally to the @atomic block, but other EDD queries
    # have to precede this one
    unique_part_numbers_dict = OrderedDict()
    for combo in combinatorial_inputs:
        for part_number in combo.get_unique_strain_ids(unique_part_numbers_dict):
            unique_part_numbers_dict[part_number] = True

    # maps part id -> Entry for those found in ICE
    unique_part_number_count = len(unique_part_numbers_dict)
    ice_entries_dict = unique_part_numbers_dict

    # query ICE for UUID's part numbers found in the input file. EDD doesn't store these (see
    # EDD-431). TODO: possible future optimization: query ICE in parallel
    get_ice_entries(ice, ice_entries_dict, errors)
    performance.end_ice_search(unique_part_number_count)

    ################################################################################################
    # Search EDD for existing strains using UUID's queried from ICE
    ################################################################################################
    # keep parts in same order as input to allow resume following an unanticipated error
    existing_edd_strains = OrderedDict()
    non_existent_edd_strains = []
    strains_by_part_number = OrderedDict()  # maps ICE part # -> EDD Strain

    # query EDD for Strains by UUID's found in ICE
    strain_search_count = len(unique_part_numbers_dict)  # may be different from above
    find_existing_strains(unique_part_numbers_dict, existing_edd_strains, strains_by_part_number,
                          non_existent_edd_strains, errors)
    performance.end_edd_strain_search(strain_search_count)

    ################################################################################################
    # Create any missing strains in EDD's database, but go ahead with caching strain data in EDD
    # since it's likely to be used below or referenced again (even if this is a dry run)
    ################################################################################################
    create_missing_strains(non_existent_edd_strains, strains_by_part_number, errors)
    strains_by_pk = {strain.pk: strain for strain in strains_by_part_number.values()}
    performance.end_edd_strain_creation(len(non_existent_edd_strains))

    ################################################################################################
    # Replace part-number-based strain references in the input with local primary keys usable to
    # create Line entries in EDD's database
    ################################################################################################
    for input_set in combinatorial_inputs:
        input_set.replace_strain_part_numbers_with_pks(strains_by_part_number, errors)
        print('###### Strain IDs: #######')

    ################################################################################################
    # Fail if line/assay creation would create duplicate names within the study
    ################################################################################################
    # Note that line names may contain strain information that has to be looked up above before
    # the name can be determined
    planned_names = prevent_duplicate_naming(study, protocols_by_pk, line_metadata_types,
                                             assay_metadata_types, combinatorial_inputs,
                                             strains_by_pk, errors)
    performance.end_naming_check()

    # return just the planned line/assay names if we're doing a dry run
    if dry_run:
        result = {
            'planned_results': planned_names
        }
        _build_errors_dict(errors, warnings, val=result)
        return result

    # if we've detected errors before modifying the study, fail before attempting db mods
    if errors:
        return _build_errors_dict(errors, warnings)

    ################################################################################################
    # Create requested lines and assays in the study
    ################################################################################################
    created_lines_list = []
    total_assay_count = 0
    for input_set in combinatorial_inputs:

        try:
            creation_visitor = input_set.populate_study(
                    study, errors, warnings, line_metadata_types=line_metadata_types,
                    assay_metadata_types=assay_metadata_types, strains_by_pk=strains_by_pk)
            created_lines_list.extend(creation_visitor.lines_created)

            for line_pk, protocol_to_assays_list in \
                    creation_visitor.line_to_protocols_to_assays_list.items():
                for protocol, assays_list in protocol_to_assays_list.items():
                    total_assay_count += len(assays_list)

        except RuntimeError as rte:
            key = 'creation_exception'
            exceptions_list = errors.get(key, [])
            if not exceptions_list:
                errors[key] = exceptions_list
            summary = '%(cls)s: %(msg)s' % {
                'cls': rte.__class__.__name__, 'msg': rte.message,
            }
            exceptions_list.add(summary)

    ################################################################################################
    # Package up and return results
    ################################################################################################
    total_line_count = len(created_lines_list)
    performance.overall_end()

    if errors:
        raise RuntimeError('Errors occurred during study definition')

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


def prevent_duplicate_naming(study, protocols, line_metadata_types,
                             assay_metadata_types, combinatorial_inputs, strains_by_pk, errors):
    """
    Tests the input for non-unique line/assay naming prior to attempting to insert it into the
    database, then captures errors if any duplicate names would be created during database I/O.
    Testing for inconsistency first should be efficient in may error cases, where it prevents
    unnecessary database I/O for line/assay creation prior to detecting duplicated naming.
    :return a dict with a hierarchical listing of all planned line/assay names (regardless of
    whether some are duplicates)
    """
    # Check for uniqueness of planned names so that overlaps can be flagged as an error (e.g. as
    # possible in the combinatorial GUI mockup attached to EDD-257)
    unique_input_line_names = {}
    protocol_to_unique_input_assay_names = {}
    duplicated_new_line_names = []
    protocol_to_duplicate_new_assay_names = {}

    all_planned_names = {}  # line name -> protocol -> [assay name]. for all combinatorial inputs.

    # loop over the sets of combinatorial inputs, computing names of new lines/assays to be added
    # to the study, and checking for any potential overlap in the input line/assay names.
    # This step doesn't required any database I/O, so we'll do it first to check for
    # self-inconsistent input. While we're at it, merge results from all sets of combinatorial
    # inputs to build a superset of planned results.

    # Note that we're creating two similar dicts here for different purposes:
    # protocol_to_unique_input_assay_names detects assay name uniqueness across all
    # CombinatorialInputDefinitions for a single protocol.  All_planned_names is the union of all
    #  the planned names for each CombinatorialInputDefinition (regardless of uniqueness).
    for input_set in combinatorial_inputs:
        names = input_set.compute_line_and_assay_names(study, protocols, line_metadata_types,
                                                       assay_metadata_types, strains_by_pk)

        for line_name, protocol_to_assay_names in names.line_to_protocols_to_assays_list.items():

            if unique_input_line_names.get(line_name, False):
                duplicated_new_line_names.append(line_name)
            else:
                unique_input_line_names[line_name] = True

            all_protocol_to_assay_names = all_planned_names.get(line_name, {})
            if not all_protocol_to_assay_names:
                all_planned_names[line_name] = all_protocol_to_assay_names

            for protocol_pk, assay_names in protocol_to_assay_names.items():
                all_planned_assay_names = all_protocol_to_assay_names.get(protocol_pk, [])
                if not all_planned_assay_names:
                    all_protocol_to_assay_names[protocol_pk] = all_planned_assay_names

                for assay_name in assay_names:
                    all_planned_assay_names.append(assay_names)

                    unique_assay_names = protocol_to_unique_input_assay_names.get(protocol_pk, {})
                    if not unique_assay_names:
                        protocol_to_unique_input_assay_names[protocol_pk] = unique_assay_names

                    if assay_name in unique_assay_names.keys():
                        duplicate_names = protocol_to_duplicate_new_assay_names.get(protocol_pk, [])
                        if not duplicate_names:
                            protocol_to_duplicate_new_assay_names[protocol_pk] = duplicate_names
                        duplicate_names.append(assay_name)
                    else:
                        unique_assay_names[assay_name] = True

    # return early if the input isn't self-consistent
    if duplicated_new_line_names:
        errors['duplicate_input_line_names'] = duplicated_new_line_names

    if protocol_to_duplicate_new_assay_names:
        errors['duplicate_input_assay_names'] = protocol_to_duplicate_new_assay_names

    if duplicated_new_line_names or protocol_to_duplicate_new_assay_names:
        return False

    # query the database in bulk for any existing lines in the study whose names are the same as
    # lines in the input
    unique_line_names_list = [line_name for line_name in unique_input_line_names.keys()]
    existing_lines = Line.objects.filter(study__pk=study.pk, name__in=unique_line_names_list)

    if existing_lines:
        unique = {line.name: True for line in existing_lines}
        errors['existing_line_names'] = [line_name for line_name in unique.keys()]

    # do a series of bulk queries to check for uniqueness of assay names within each protocol
    for protocol_pk, assay_names_list in protocol_to_unique_input_assay_names.items():
        existing_assays = Assay.objects.filter(name__in=assay_names_list, line__study__pk=study.pk,
                                               protocol__pk=protocol_pk)
        if existing_assays:
            existing_assay_names = 'existing_assay_names'
            existing = errors.get(existing_assay_names, [])
            if not existing:
                errors[existing_assay_names] = existing
            existing.extend([assay.name for assay in existing_assays])

    return all_planned_names


def create_missing_strains(non_existent_edd_strains, strains_by_part_number, errors):
    """
    Creates Strain entries from the associated ICE entries for any parts
    :param non_existent_edd_strains: a list of ICE entries to use as the basis for EDD strain
    creation
    :return:
    """

    # just do it in a loop. EDD's Strain uses multi-table inheritance, which prevents bulk creation
    for ice_entry in non_existent_edd_strains:
        # for now, only allow strain creation in EDD -- non-strains are not currently supported.
        # see EDD-239.
        if not isinstance(ice_entry, IceStrain):
            NON_STRAIN_ICE_ENTRY = 'non_strain_ice_entries'
            non_strains = errors.get(NON_STRAIN_ICE_ENTRY, [])
            if not non_strains:
                errors[NON_STRAIN_ICE_ENTRY] = non_strains
            non_strains.append(ice_entry.part_id)
            continue

        strain = Strain.objects.create(name=ice_entry.name, description=ice_entry.short_description,
                                       registry_id=ice_entry.uuid,
                                       registry_url=make_entry_url(settings.ICE_URL, ice_entry.id))
        strains_by_part_number[ice_entry.part_id] = strain


def get_ice_entries(ice, part_number_to_part_dict, errors):
    """
    Queries ICE for parts with the provided (locally-unique) numbers, logging errors for any
    parts that weren't found into the errors parameter. Note that we're purposefully trading off
    readability for a guarantee of
    multi-deployment uniqueness, though as in use at JBEI the odds are still pretty good that a part
    number is sufficient to uniquely identify an ICE entry.
    :param part_number_to_part_dict: a dictionary whose keys are part numbers to be queried from
    ICE. Existing entries will be replaced with the Entries read from ICE, or keys will be removed
    for those that aren't found in ICE.
    :param errors: a dictionary of error summary information to be returned to the client.
    """

    list_position = 0
    for local_ice_part_number in part_number_to_part_dict.keys():

        found_entry = ice.get_entry(local_ice_part_number)

        if found_entry:
            part_number_to_part_dict[local_ice_part_number] = found_entry

            # double-check for a coding error that occurred during testing. initial test parts
            # had "JBX_*" part numbers that matched their numeric ID, but this isn't always the
            # case!
            if found_entry.part_id != local_ice_part_number:
                logger.error("Couldn't locate ICE entry \"%(csv_part_number)s\" "
                             "(#%(list_position)d in the file) by part number. An ICE entry was "
                             "found with numeric ID %(numeric_id)s, but its part number "
                             "(%(part_number)s) didn't match the search part number" % {
                                   'csv_part_number': local_ice_part_number,
                                   'list_position': list_position, 'numeric_id': found_entry.id,
                                   'part_number': found_entry.part_id
                               })
                FOUND_PART_NUMBER_DOESNT_MATCH_QUERY = 'found_part_number_mismatch'
                mismatch_part_numbers = errors[FOUND_PART_NUMBER_DOESNT_MATCH_QUERY]
                if not mismatch_part_numbers:
                    mismatch_part_numbers = []
                    errors[mismatch_part_numbers] = mismatch_part_numbers
                mismatch_part_numbers.append((local_ice_part_number, found_entry.part_id))
        else:
            del part_number_to_part_dict[local_ice_part_number]

            # make a note that this part number is missing
            PART_NUMBER_MISSING = 'entries_not_found_in_ice'
            entries_not_found = errors[PART_NUMBER_MISSING]
            if not entries_not_found:
                entries_not_found = []
                errors[PART_NUMBER_MISSING] = entries_not_found
            entries_not_found.append(local_ice_part_number)

    return part_number_to_part_dict

