from __future__ import unicode_literals
from __future__ import division

####################################################################################################
# set default source for ICE settings BEFORE importing any code from jbei.rest.clients.ice. Otherwise,
# code in that module will attempt to look for a django settings module and fail if django isn't
# installed in the current virtualenv
import os
import arrow
import requests
from django.utils.translation import ugettext
from requests.packages.urllib3.exceptions import InsecureRequestWarning

from jbei.rest.clients.edd.constants import METADATA_CONTEXT_LINE
from jbei.rest.clients.ice.utils import make_entry_url
from jbei.utils import to_human_relevant_delta, UserInputTimer, session_login, TerminalFormats

os.environ.setdefault('ICE_SETTINGS_MODULE', 'jbei.edd.rest.scripts.settings')
####################################################################################################

####################################################################################################
# configure an INFO-level logger just for our code (avoids INFO messages from supporting frameworks)
# Note: needs to be before importing other modules that get a logger reference
####################################################################################################
import logging
import sys
LOG_LEVEL = logging.INFO
# redirect to stdout so log messages appear sequentially
console_handler = logging.StreamHandler(sys.stdout)
console_handler.setLevel(LOG_LEVEL)
formatter = logging.Formatter('%(asctime)s - %(name)s - %(levelname)s - %(message)s')
console_handler.setFormatter(formatter)
logger = logging.getLogger(__name__)
logger.setLevel(LOG_LEVEL)
logger.addHandler(console_handler)

# set a higher log level for supporting frameworks to help with debugging
# TODO: comment out?
root_logger = logging.getLogger('root')
root_logger.setLevel(logging.DEBUG)
root_logger.addHandler(console_handler)

# TODO: why isn't this inherited from root? without these lines, get "No handlers could be found for
#  logger "jbei.rest.clients.edd""
edd_logger = logging.getLogger('jbei.rest.clients.edd')
edd_logger.setLevel(logging.ERROR)
edd_logger.addHandler(console_handler)
####################################################################################################

import collections
import getpass
import argparse
import csv
import locale
import re
from collections import namedtuple
from jbei.rest.auth import EddSessionAuth, IceSessionAuth
from jbei.rest.clients import EddApi, IceApi
from jbei.rest.clients.ice import Strain as IceStrain
from jbei.rest.utils import is_url_secure, show_response_html
from .settings import (
    DEFAULT_LOCALE, EDD_REQUEST_TIMEOUT, EDD_URL, ICE_REQUEST_TIMEOUT, ICE_URL,
    PRINT_FOUND_ICE_PARTS, PRINT_FOUND_EDD_STRAINS, SIMULATE_STRAIN_CREATION, VERIFY_EDD_CERT,
    VERIFY_ICE_CERT,
)

locale.setlocale(locale.LC_ALL, DEFAULT_LOCALE)

MIN_COL_NUM = 1
MAX_EXCEL_COLS = 16384  # max number of columns supported by the Excel format ()
SEPARATOR_CHARS = 75
OUTPUT_SEPARATOR = ('*' * SEPARATOR_CHARS)

LINE_NAME_COL_LABEL = 'Line Name'
LINE_DESCRIPTION_COL_LABEL = 'Line Description'
PART_ID_COL_LABEL = 'Part ID'
PART_NUMBER_REGEX = r'\s*([A-Z]+_[A-Z]?\d{4,6}[A-Z]?)\s*'  # tested against all strains in ICE!
                                                           # 3/31/16
PART_NUMBER_PATTERN = re.compile(PART_NUMBER_REGEX, re.IGNORECASE)


class LineCreationInput:
    """
    Defines the minimal set of EDD line creation inputs supported by this script.
    :param local_ice_part_number: the ICE part number (NOT globally unique) used to look the
    line's strain up in ICE. This approach should work because this script will only be used on
    JBEI's local EDD and ICE instances.
    """
    def __init__(self, local_ice_part_number, name, description=None, metadata={}):
        self.local_ice_part_number = local_ice_part_number
        self.name = name
        self.description = description
        self.metadata = metadata


class CsvSummary:
    """
    Defines the set of line creation inputs read from CSV file, as well as some other helpful
    context that may help catch parsing or data entry errors.
    """
    def __init__(self, line_generation_inputs, unique_part_numbers, unmatched_data_row_count,
                 blank_cell_count, total_rows, metadata_columns):
        self.line_creation_inputs = line_generation_inputs
        self.unique_part_numbers = unique_part_numbers
        self.unmatched_data_row_count = unmatched_data_row_count
        self.blank_cell_count = blank_cell_count
        self.total_rows = total_rows
        self.metadata_columns = metadata_columns


def parse_csv(path, line_metadata_types):
    """
    Parses a comma-separated values (CSV) file to extract ICE part numbers and other EDD line
    creation inputs. Also generates helpful output regarding areas of the file where parsing
    failed or encountered unexpected values
    :param path: the path to the CSV file
    :return: a CsvSummary object with the list of part numbers (now with consistent capitalization),
    as well as counts of cells that were skipped during the parsing process.
    """
    col_index = 0
    row_number = 0

    part_number_col = None
    line_name_col = None
    line_desc_col = None
    # keep order read from file for convenient print output from the script
    line_metadata_cols = collections.OrderedDict()

    # open the CSV file and read its contents
    with open(path, 'rU') as csv_file:
        csv_row_reader = csv.reader(csv_file)

        # loop over rows in the CSV, growing a list of ICE part numbers found in each row
        line_creation_inputs = []
        blank_cell_count = 0
        unmatched_data_row_count = 0
        unique_part_numbers_dict = collections.OrderedDict()

        line_name_col_label_regex = r'\s*%s\s*' % LINE_NAME_COL_LABEL
        line_name_col_pattern = re.compile(line_name_col_label_regex, re.IGNORECASE)
        line_desc_col_label_regex = r'\s*%s\s*' % LINE_DESCRIPTION_COL_LABEL
        line_desc_col_label_pattern = re.compile(line_desc_col_label_regex, re.IGNORECASE)

        part_number_col_label_pattern = re.compile(r'\s*%s\s*' % PART_ID_COL_LABEL, re.IGNORECASE)

        found_col_labels = False

        for row_number, cols_list in enumerate(csv_row_reader):

            # identify columns of interest first by looking for required labels
            if not found_col_labels:

                # loop over columns in the first row, looking for labels that identify the columns
                # of interest to us
                for col_index in range(len(cols_list)):
                    cell_content = cols_list[col_index].strip()
                    # print a warning message and skip this row if the cell has no non-whitespace
                    # content
                    if not cell_content:
                        blank_cell_count += 1
                        break

                    # if cell is a column label, skip it (while printing a warning message)
                    elif part_number_col_label_pattern.match(cell_content):
                        part_number_col = col_index
                    elif line_name_col_pattern.match(cell_content):
                        line_name_col = col_index
                    elif line_desc_col_label_pattern.match(cell_content):
                        line_desc_col = col_index
                    else:
                        upper_content = cell_content.upper()
                        for metadata_type_name in line_metadata_types.keys():
                            if upper_content == metadata_type_name.upper():
                                line_metadata_cols[col_index] = metadata_type_name
                                # print('Found metadata column %s in col %d' % (metadata_type_name,
                                #                                               col_index+1))

                found_col_labels = ((part_number_col is not None) and (line_name_col is not None))
                if not found_col_labels:
                    logger.debug('Couldn\'t find the minimum required column labels '
                                 '("%(line_name)s", %(part_number)s) in row %(row)d. Skipping this '
                                 'row.' % {
                                     'line_name': LINE_NAME_COL_LABEL,
                                     'part_number': PART_ID_COL_LABEL,
                                     'row': row_number
                    })
                    part_number_col = None
                    line_name_col = None
                    line_desc_col = None
                    line_metadata_cols = {}

                    continue

            # if column labels have been identified, look for line creation input data
            else:
                part_number = None
                line_name = None
                line_desc = None
                metadata = {}

                ###################################################
                # part number
                ###################################################
                cell_content = cols_list[part_number_col].strip()
                match = PART_NUMBER_PATTERN.match(cell_content)

                # if cell contains a recognized part number, append it to the list
                if match:
                    part_number = match.group(1)

                # print a separate warning message
                else:
                    logger.warning('Cell content "%(content)s" in row %(row)d, column %(col)d '
                                   "didn't match the expected ICE part number pattern. Skipping "
                                   "this row." %
                                   {
                                       'content': cell_content,
                                       'row': row_number,
                                       'col': col_index+1,
                                   })
                    unmatched_data_row_count += 1
                    continue

                ###################################################
                # line name
                ###################################################
                cell_content = cols_list[line_name_col].strip()

                # if cell contains a recognized part number, append it to the list
                if cell_content:
                    line_name = cell_content

                # print a separate warning message
                else:
                    logger.warning('Cell in row %(row)d, column %(col)d was empty, but was expected'
                                   ' to contain a name for the EDD line. Skipping this row.' %
                                   {
                                       'row': row_number,
                                       'col': col_index+1,
                                   })
                    unmatched_data_row_count += 1
                    continue

                ###################################################
                # line description
                ###################################################

                if line_desc_col is not None:
                    cell_content = cols_list[line_desc_col].strip()

                    if cell_content:
                        line_desc = cell_content

                ###################################################
                # line metadata
                ###################################################
                if line_metadata_cols:
                    for col_index, metadata_type_name in line_metadata_cols.items():
                        cell_content = cols_list[col_index].strip()
                        line_metadata_pk = line_metadata_types[metadata_type_name].pk
                        metadata[line_metadata_pk] = cell_content

                unique_part_numbers_dict[part_number] = True
                line_creation_inputs.append(LineCreationInput(part_number, line_name, line_desc,
                                                              metadata))

    if not found_col_labels:
        print("The minimum set of required column labels wasn't found in this CSV file. Required "
              "column labels are ['Part ID', 'Line Name']. A 'Line Description' column is "
              "optional.")
    unique_part_numbers_list = unique_part_numbers_dict.keys()
    return CsvSummary(line_creation_inputs, unique_part_numbers_list, unmatched_data_row_count,
                      blank_cell_count, row_number, line_metadata_cols)


def replace_newlines(str):
    return str.replace('\n', r' \ ')


def print_found_ice_parts(part_number_to_part_dict):
    if not part_number_to_part_dict:
        return

    # compute width for columnar output
    space = 3
    col1_width = max(len(str(search_id)) for search_id in part_number_to_part_dict.keys()) + space
    col2_width = max(len(str(part.id)) for part in part_number_to_part_dict.values()) + space
    col3_width = max(len(part.part_id) for part in part_number_to_part_dict.values()) + space
    col4_width = max(len(part.name) for part in part_number_to_part_dict.values()) + space
    col5_width = max(
        len(replace_newlines(part.short_description)) for part in
        part_number_to_part_dict.values()) + space
    col6_width = max(len(part.uuid) for part in part_number_to_part_dict.values()) + space

    col1_lbl = 'Search id:'
    col2_lbl = 'Found Part id: '
    col3_lbl = 'Part id:'
    col4_lbl = 'Name:'
    col5_lbl = 'Description:'
    col6_lbl = 'UUID:'

    col1_width = max([col1_width, len(col1_lbl) + space])
    col2_width = max([col2_width, len(col2_lbl) + space])
    col3_width = max([col3_width, len(col3_lbl) + space])
    col4_width = max([col4_width, len(col4_lbl) + space])
    col5_width = max([col5_width, len(col5_lbl) + space])
    col6_width = max([col6_width, len(col6_lbl) + space])

    # print column headers
    print(''.join(
        [col1_lbl.ljust(col1_width), col2_lbl.ljust(col2_width), col3_lbl.ljust(col3_width),
         col4_lbl.ljust(col4_width), col5_lbl.ljust(col5_width), col6_lbl.ljust(col6_width)]))

    # print output
    for search_id in part_number_to_part_dict.keys():
        part = part_number_to_part_dict[search_id]
        short_description = replace_newlines(part.short_description)
        print(''.join([str(search_id).ljust(col1_width), str(part.id).ljust(col2_width),
                       part.part_id.ljust(col3_width), part.name.ljust(col4_width),
                       short_description.ljust(col5_width), part.uuid.ljust(col6_width)]))


class NonStrainPartsError(RuntimeError):
    pass


def get_ice_entries(ice, part_numbers_list, print_search_comparison=False):
    """
    Queries ICE for parts with the provided (locally-unique) numbers, logging warnings for any
    parts that weren't found, as well as a follow-on summary of the parts that were found vs. the
    number expected.
    """
    csv_part_number_count = len(part_numbers_list)
    part_number_to_part_dict = collections.OrderedDict()  # order for easy comparison against CSV


    print('')
    print(OUTPUT_SEPARATOR)
    print('Searching ICE for %d parts... ' % csv_part_number_count)
    print(OUTPUT_SEPARATOR)
    list_position = 0
    for list_position, local_ice_part_number in enumerate(part_numbers_list):
        # get just the numeric part of the part number. for unknown reasons that I can't
        # reproduce in PostMan, searching for the whole part number seems to produce the
        # wrong result.
        match = PART_NUMBER_PATTERN.match(local_ice_part_number)
        if not match:  # NOTE: can remove this check, but left in place in case we resurrect
                       # prior attempt to extract local ID's from part numbers (Seems to only
                       #  work for newer parts, but not for some older ones)
            logger.warning("Couldn't parse part number \"%s\". Unable to query ICE for this "
                           "part.")
            continue
        search_id = local_ice_part_number
        part = ice.get_entry(search_id)
        if not part:
            logger.warning("Couldn't locate part \"%s\" (#%d)" % (local_ice_part_number,
                                                                  list_position))
        # double-check for a coding error that occurred during testing. initial test parts
        # had "JBX_*" part numbers that matched their numeric ID, but this isn't always the
        # case!
        elif part.part_id != local_ice_part_number:
            logger.warning("Couldn't locate part \"%(csv_part_number)s\" (#%(list_position)d "
                           "in the file) by part number. An ICE entry was found with numeric "
                           "ID %(numeric_id)s, but its part number (%(part_number)s) didn't "
                           "match the search part number" %
                            {
                            'csv_part_number': local_ice_part_number,
                            'list_position': list_position,
                            'numeric_id': part.id,
                            'part_number': part.part_id
                            })
        else:
            part_number_to_part_dict[local_ice_part_number] = part

    found_parts_count = len(part_number_to_part_dict)

    # add a blank line to separate summary from warning output
    if found_parts_count != csv_part_number_count:
        print('')

    print('Found %(found)d of %(total)d parts in ICE.' %
          {
              'found': found_parts_count,
              'total': csv_part_number_count,
          })

    # enforce the restriction that only ICE Strains may be used to create EDD lines. Plasmids
    #  / Parts should cause the script to abort
    non_strain_parts = {}
    for part in part_number_to_part_dict.values():
        if not isinstance(part, IceStrain):
            non_strain_parts[part.id] = part
    if non_strain_parts:
        print('')
        print('Error: only ICE entries defines as Strains may be used to create EDD lines.')
        print('The following non-Strains must be removed from or replaced in the CSV file before '
              'line creation can continue:')
        print('')
        print_found_ice_parts(non_strain_parts)
        print('')
        raise NonStrainPartsError()

    if print_search_comparison:
        print_found_ice_parts(part_number_to_part_dict)

    print('')
    print('Found %(found)d of %(total)d parts in ICE. See found part summary and/or '
          'related warnings above' % {
        'found': found_parts_count, 'total': csv_part_number_count,
    })

    return part_number_to_part_dict


def find_existing_strains(edd, ice_parts, existing_edd_strains, strains_by_part_number,
                          non_existent_edd_strains):
    """
    Searches EDD for existing Strains that match the UUID in each ICE entry. To help ensure
    consistency, EDD is also searched for existing strains with a similar URL or name before a
    strain is determined to be missing.
    :param edd: an authenticated EddApi instance
    :param ice_parts: a list of Ice Entry objects for which matching EDD Strains should be located
    :param existing_edd_strains: an empty list that will be populated with strains found to
    already exist in EDD's database
    :param strains_by_part_number: an empty dictionary that maps part number -> Strain. Each
    previously-existing strain will be added here.
    :param non_existent_edd_strains: an empty list that will be populated with
    :return:
    """
    for ice_part in ice_parts.values():

            # search for the strain by registry ID. Note we use search instead of .get() until the
            # database consistently contains/requires ICE UUID's and enforces uniqueness constrains for
            # them (EDD-158)
            edd_strains = edd.search_strains(registry_id=ice_part.uuid)

            # if one or more strains are found with this UUID
            if edd_strains:
                if edd_strains.current_result_count > 1 or edd_strains.is_paged():
                    print('More than one existing EDD strain was found for part %(part_number)s ('
                          'registry_id %(uuid)s). Please see the EDD team to resolve the '
                          'discrepancy before continuing.' % {
                              'part_number': ice_part.part_id,
                              'uuid': ice_part.uuid
                          })
                    print('%(total)d EDD strains were found with this UUID. The first '
                          '%(first_page)d are displayed below:' % {
                            'total': edd_strains.total_result_count,
                            'first_page': len(edd_strains.results)})

                    print('Name\tpk\tdescription')
                    for edd_strain in edd_strains.results:
                        print('"%(name)s"\t%(pk)d\t%(description)s' % {
                            'name': edd_strain.name,
                            'pk': edd_strain.pk,
                            'description': edd_strain.description
                        })
                    return False

                existing_strain = edd_strains.results[0]
                existing_edd_strains[ice_part.part_id] = existing_strain
                strains_by_part_number[ice_part.part_id] = existing_strain

            # if no EDD strains were found with this UUID, look for candidate strains by URL.
            # Code from here forward is workarounds to for EDD-158
            else:
                print("ICE entry %s couldn't be located in EDD's database by UUID. Searching by "
                      "name and URL to help avoid strain curation problems." % ice_part.part_id)

                # look for candidate strains by URL (if present, more static / reliable than name)
                edd_strains = edd.search_strains(registry_url_regex=r".*/parts/%d(?:/?)" %
                                                                    ice_part.id)

                if edd_strains:
                    print("Found an existing, but malformed, EDD strain for part %s (registry_id "
                          "%s). Please have the EDD team correct this issue before you proceed."
                          % (ice_part.part_id, ice_part.uuid))
                    return False

                # look for candidate strains by UUID-based URL
                edd_strains = edd.search_strains(registry_url_regex=r".*/parts/%s(?:/?)" %
                                                                    ice_part.uuid)
                if edd_strains:
                    if edd_strains:
                        print("Found an existing, but malformed, EDD strain for part %s "
                              "(registry_id  %s). Please have the EDD team correct this issue "
                              "before you proceed."
                              % (ice_part.part_id, ice_part.uuid))
                        return False

                # if no strains were found by URL, search by name
                edd_strains = edd.search_strains(name=ice_part.name)

                if edd_strains:
                    print('Found %(strain_count)d EDD strain(s) that lacked proper identification, '
                          'but whose name(s) contained the name of ICE entry %(part_number)s '
                          '("%(part_name)s"). Please contact the EDD team to correct this issue '
                          'before you proceed.' % {
                              'strain_count': edd_strains.total_result_count,
                              'part_number': ice_part.part_id,
                              'part_name': ice_part.name,
                          })
                    return False

                non_existent_edd_strains.append(ice_part)
    return True


def create_missing_strains(edd, non_existent_edd_strains, strains_by_part_number, ice_part_count,
                           input_timer):
    """
    Creates any missing EDD strains, storing the resulting new strains in strains_by_part_number
    :param edd: an authenticated instance of EddApi
    :param non_existent_edd_strains: a list of ICE Entry objects representing ICE entries for which
    no EDD strain could be found
    :param strains_by_part_number: a dictionary that maps ICE part number -> EDD strain.
    Newly-created strains will be added here, replacing any previous values
    :return: True if all missing strains were created, False if the user aborted the creation
    process or if an Exception was raised while trying to create strains.
    """
    STRAINS_CREATED = True
    STRAINS_NOT_CREATED = False
    if not non_existent_edd_strains:
        return STRAINS_CREATED

    non_existent_strain_count = len(non_existent_edd_strains)

    print('')
    print(OUTPUT_SEPARATOR)
    print('Creating %d EDD Strains...' % non_existent_strain_count)
    print(OUTPUT_SEPARATOR)

    print('Warning: %(non_existent)d of %(total)d ICE entries did not have an '
          'existing strain in EDD.' % {
              'non_existent': len(non_existent_edd_strains),
              'total': ice_part_count,
          })
    print("You may proceed with creating the required strains, provided that your account has "
          "permission to create strains in EDD. If not, you'll get an error message.")

    # loop while gathering user input -- gives user a chance to list strains that will
    # be created
    while True:
        result = input_timer.user_input(
                'Do you want to create EDD strains for all %d of these ICE entries? Do you have '
                'permission to create EDD strains? (Y/n/list): ' %
                non_existent_strain_count).upper()

        if 'Y' == result or 'YES' == result:
            break

        elif 'LIST' == result:
            print('')
            space = 2
            col1_width = max(len(part.name) for part in non_existent_edd_strains) + space
            col2_width = max(len(part.part_id) for part in non_existent_edd_strains) + space
            col3_width = max(len(part.short_description)
                             for part in non_existent_edd_strains) + space
            print("EDD strains weren't found for the following ICE entries: ")
            print ''.join(('Name'.ljust(col1_width), 'Part Number'.ljust(col2_width),
                          'Description'.ljust(col3_width)))

            for ice_part in non_existent_edd_strains:
                print(''.join((ice_part.name.ljust(col1_width), ice_part.part_id.ljust(col2_width),
                              ice_part.short_description.ljust(col2_width))))
            print('')

        elif ('N' == result) or ('NO' == result):
            print('Aborting line creation')
            return STRAINS_NOT_CREATED

    # attempt strain creation, aborting after the first failure
    created_strain_count = 0
    try:
        for ice_part in non_existent_edd_strains:
            if not SIMULATE_STRAIN_CREATION:
                new_strain = edd.create_strain(name=ice_part.name,
                                               description=ice_part.short_description,
                                               registry_id=ice_part.uuid,
                                               registry_url=make_entry_url(ICE_URL, ice_part.id))
                strains_by_part_number[ice_part.part_id] = new_strain
            created_strain_count += 1
        print('Created %d new strains in EDD' % created_strain_count)
        return STRAINS_CREATED
    except Exception:
        logger.exception('Error creating new EDD strains. Successfully created %d of %d '
                         'strains before the error occurred.' % (
                             created_strain_count, non_existent_strain_count))
        return STRAINS_NOT_CREATED


def cache_archival_well_locations(ice, sample_label_pattern, ice_parts_dict):
    """
    Searches ICE for archival well locations for each part in ice_parts_dict. For each ICE entry
    where exactly one plate/well location is found adds a PlateAndWellLocation object to the
    returned dictionary.
    :param ice: an authenticated instance of IceApi
    :param sample_label_pattern: an optional regular expression pattern to use in narrowing down the
    available samples so that exactly one is found per ICE entry
    :param ice_parts_dict: a dictionary mapping ice part number -> Entry
    :return: a dictionary that maps ICE part number -> sample location for each part where
    exactly one plate/well sample was found
    """
    # loop over parts actually found in ICE (may be fewer than listed in the CSV), looking for
    # archival sample locations for each one
    part_number_to_location_dict = {}
    for part_number, ice_entry in ice_parts_dict.items():
        if not ice_entry:
            logger.warning("Skipping part %s, which wasn't found in ICE" % part_number)
            continue

        sample_well_locations = get_archival_well_location(ice, ice_entry,
                                                           sample_label_pattern)

        sample_location_count = len(sample_well_locations) if sample_well_locations else 0
        if sample_location_count != 1:
            print('Found %(location_count)d sample locations for ICE entry %(part_number)s, '
                  'but exactly 1 is required to support copying archival sample locations to the EDD '
                  'experimental lines. Consider using the %(pattern_param_name)s parameter to '
                  'narrow the samples to exactly one plate/well combination per entry' % {
                        'part_number': part_number,
                        'location_count': sample_location_count,
                        'pattern_param_name': SAMPLE_LABEL_PATTERN_PARAM, })
        else:
            part_number_to_location_dict[part_number] = sample_well_locations[0]

    return part_number_to_location_dict

PlateAndWellLocation = namedtuple('PlateAndWellLocation', ['plate', 'well'])


def get_archival_well_location(ice, ice_entry, sample_label_pattern):
    """
    Queries ICE for the archival sample location(s) for a given entry, then extracts the sample
    plate and well number for each
    :param ice: an authenticated instance of ICE
    :param ice_entry: the ICE entry to get archival well locations for
    :param sample_label_pattern: the pattern to apply filter ICE samples by label
    :return: a list of named tuples containing plate and well number for this ICE entry
    """
    # use the local numeric part ID as a workaround for SYNBIO-1207, which as of 5/9/16 is giving
    #  a 404 for samples when queried using UUID
    workaround_lookup_id = ice_entry.id
    results_page = ice.get_entry_samples(workaround_lookup_id)

    if not results_page:
        return None

    found_locations = []

    while results_page:
        for sample in results_page.results:
            plate = None
            well = None

            err_msg_prefix = ('ICE entry %(part_number)s has sample %(sample_id)d '
                              '("%(sample_label)s") that matches the input pattern, ' % {
                                  'part_number': ice_entry.part_id, 'sample_id': sample.id,
                                  'sample_label': sample.label,
                              })

            uuid_postfix = '(uuid %s)' % ice_entry.uuid

            if (not sample_label_pattern) or sample_label_pattern.match(sample.label):
                location = sample.location

                if not sample.location:
                    logger.warning(
                                   '%s but that has no specified location.')

                # drill down into location parent/child relationships until we find the plate/well
                # location we're looking for, or hit one that can't contain it, or hit the end
                while location:

                    if (not plate) and location.is_plate():
                        plate = location
                        location = location.child
                    elif (not well) and (location.is_well()):
                        well = location
                        break
                    elif (not plate) and location.can_contain_plates():
                        location = location.child
                    else:
                        logger.warning("%(prefix)s but doesn't contain the required plate/well "
                                       "locations. %(postfix)s" % {
                                            'prefix': err_msg_prefix,
                                            'postfix': uuid_postfix, })

            if plate and well:
                found_locations.append(PlateAndWellLocation(plate=plate.display, well=well.display))

        # get another page of results (if any)
        if results_page.next_page:
            results_page = ice.get_entry_samples(results_page.next_page)
        else:
            results_page = None

    return found_locations


def create_lines(edd, ice, study_id, csv_summary, strains_by_part_number, line_metadata_types):
    """
    Creates lines in an EDD study, then prints summary output
    :param ice: an authenticated instance of IceApi
    :param study_id: numeric primary key identifying the EDD study that lines should be
    associated with
    :param csv_summary: the data read from CSV input (and possibly supplemented with other
    metadata if --copy_archival_well_locations was used). Allows us to print out the requested
    input for any lines whose creation was skipped/aknowleged early in the process
    :param strains_by_part_number: the list of EDD strains the lines will be created from
    """
    created_lines = []  # in same order as line creation inputs. None for skipped lines.
    created_line_count = 0

    line_name = None
    ice_part_number = None
    line_index = 0
    strain_col_width = 0
    skipped_some_strains = False

    line_creation_inputs = csv_summary.line_creation_inputs

    try:
        ############################################################################################
        # loop over inputs attempting to create lines in EDD
        ############################################################################################
        for line_creation_input in line_creation_inputs:
            ice_part_number = line_creation_input.local_ice_part_number
            strain = strains_by_part_number.get(ice_part_number)

            # skip any lines whose EDD strain couldn't be created because the relevant ICE entry
            # wasn't found. User has already acknowledged this and chosen to proceed
            if not strain:
                logger.warning("Skipping line creation for part number \"%s\" that wasn't found "
                               "in ICE" % ice_part_number)
                skipped_some_strains = True
                created_lines.append(None)
                continue

            strain_col_width = max([len(str(strain.pk)), strain_col_width])

            # create the line in EDD, or raise an Exception if creation can't occur
            line_name = line_creation_input.name
            line = edd.create_line(study_id, strain.pk, line_name,
                                   description=line_creation_input.description,
                                   metadata=line_creation_input.metadata)

            # save state to help print good summary output / error messages
            created_line_count += 1
            created_lines.append(line)
            line_index += 1

        summary_msg = None
        if skipped_some_strains:
            summary_msg = ("Created %(created)d of %(planned)d lines in EDD. See above for a "
                           "summary of lines that couldn't be created because the matching part "
                           "numbers weren't found in ICE" % {
                                'created': created_line_count,
                                'planned': len(csv_summary.line_creation_inputs)})
        else:
            summary_msg = 'All %d lines were created in EDD. BAM!' % created_line_count

        print(summary_msg)
        print('')

        ############################################################################################
        # determine sizing for columnar summary output
        ############################################################################################

        metadata_col_labels = csv_summary.metadata_columns.values()
        fixed_col_labels = ['EDD PK', 'Name:', 'Description:', 'Strain ID:']
        col_labels = fixed_col_labels + metadata_col_labels

        pk_col_index = 0
        name_col_index = 1
        desc_col_index = 2
        strain_id_col_index = 3

        # compute widths of hard-coded columns
        space = 3
        col_widths = [0] * len(col_labels)  # initialize to the correct size
        col_widths[pk_col_index] = len(col_labels[pk_col_index]) + space
        col_widths[name_col_index] = (max([len(csv_line.name) for csv_line in
                                      line_creation_inputs] + [len(col_labels[name_col_index])]) +
                                      space)
        desc_content_width = max( [len(line2.description) if line2.description else 0 for line2 in
             csv_summary.line_creation_inputs])

        col_widths[desc_col_index] = (max([desc_content_width, len(col_labels[desc_col_index])]) +
                                      space)
        col_widths[strain_id_col_index] = max((len(col_labels[strain_id_col_index]),
                                               strain_col_width))

        # compute widths of metadata columns
        metadata_start_col = len(fixed_col_labels)
        for index, metadata_col_label in enumerate(metadata_col_labels):
            metadata_pk = line_metadata_types[metadata_col_label].pk
            max_value_width = max([len(line_creation_input.metadata[metadata_pk]) for
                                   line_creation_input in line_creation_inputs])
            col_width = max((max_value_width, len(metadata_col_label))) + space
            col_widths[index+metadata_start_col] = col_width

        print('Col widths: %s' % col_widths)

        ############################################################################################
        # print column headers
        ############################################################################################
        print(''.join([label.ljust(col_widths[index]) for index, label in enumerate(col_labels)]))

        ############################################################################################
        # print created lines, also reiterating inputs for any lines that weren't created because
        # the associated ICE entries couldn't be found
        ############################################################################################
        # get a list of metadata_type primary keys in the same order the related metadata
        # columns were read from the CSV column headers. Makes for better output that can be
        # compared directly to the spreadsheet
        ordered_metadata_pks = [line_metadata_types[metadata_type_name].pk for metadata_type_name in
                                csv_summary.metadata_columns.values()]

        for line_index, line_creation_input in enumerate(csv_summary.line_creation_inputs):
            ice_part_number = line_creation_input.local_ice_part_number
            strain = strains_by_part_number.get(ice_part_number)
            strain_id = strain.pk if strain else '[ Not found in ICE ]'

            created_line = created_lines[line_index]

            # assume line creation errors were handled properly above in that code.
            # just ignore missing lines for printing purposes here
            if not created_line:
                continue

            edd_pk = created_line.pk if created_line else '*****'
            description = created_line.description if created_line.description else ' '
            ordered_metadata_values = [line_creation_input.metadata[pk] for pk in
                                       ordered_metadata_pks]
            spaced_metadata_values = [meta_value.ljust(col_widths[metadata_start_col + idx]) for
                                      idx, meta_value in enumerate(ordered_metadata_values)]

            print(''.join([str(edd_pk).ljust(col_widths[pk_col_index]), created_line.name.ljust(
                    col_widths[name_col_index]),
                           description.ljust(col_widths[desc_col_index]), str(strain_id).ljust(
                        strain_col_width)] + spaced_metadata_values))

        print(summary_msg)
        print('')

    except Exception:
        line_creation_input_count = len(csv_summary.line_creation_inputs)
        logger.exception('An error occurred during line creation. At least %(created)d of %('
                         'total)d lines were created before the error occurred for line "%('
                         'line_name)s" '
                         '(part number %(part_num)s).',
                         {
                             'created': line_index,
                             'total': line_creation_input_count,
                             'line_name': line_name,
                             'part_num': ice_part_number
                         })

UUID_CHAR_COUNT = 36


def print_edd_strains(existing_edd_strains, non_existent_edd_strains):

    col1_lbl = 'Part Number:'
    col2_lbl = 'Name:'
    col3_lbl = 'URL:'
    col4_lbl = 'UUID'
    col5_lbl = 'Description:'

    # compute column widths
    col1_width = 0
    col2_width = 0
    col3_width = 0
    col4_width = UUID_CHAR_COUNT
    col5_width = 0
    for local_ice_part_number in existing_edd_strains.keys():
        col1_width = max((col1_width, len(local_ice_part_number)))

        strain = existing_edd_strains[local_ice_part_number]

        col2_width = max(col2_width, len(strain.name))
        col3_width = max(col3_width, len(str(strain.registry_url)))
        col5_width = max(col5_width, len(strain.description))

    col1_width = max([col1_width, len(col1_lbl)])
    col2_width = max([col2_width, len(col2_lbl)])
    col3_width = max([col3_width, len(col3_lbl)])
    col4_width = max([col4_width, len(col4_lbl)])
    col5_width = max([col5_width, len(col5_lbl)])

    space = 3
    col1_width += space
    col2_width += space
    col3_width += space
    col4_width += space
    col5_width += space

    search_summary_msg = None
    print('')
    if not non_existent_edd_strains:
        search_summary_msg = 'Found all %d ICE entries already defined as strains in EDD' % len(
            existing_edd_strains)
        print('%s:' % search_summary_msg)
    else:
        found_strains = len(existing_edd_strains)
        total_strains = found_strains + len(non_existent_edd_strains)

        search_summary_msg = ("Found %(found)d of %(total)d ICE entries defined as strains in "
                              "EDD. See output above for %(not_found)d entries that weren't "
                              "found." % {
                                'found': found_strains,
                                'total': total_strains,
                                'not_found': (total_strains - found_strains)})
        print(search_summary_msg)
        print('')
        print('Found strains:')

    # print column labels
    print(''.join([col1_lbl.ljust(col1_width), col2_lbl.ljust(col2_width), col3_lbl.ljust(
        col3_width), col4_lbl.ljust(col4_width), col5_lbl.ljust(col5_width)]))

    # print values
    for local_ice_part_number in existing_edd_strains.keys():
        strain = existing_edd_strains[local_ice_part_number]

        print(''.join([local_ice_part_number.ljust(col1_width), strain.name.ljust(col2_width),
                       strain.registry_url.ljust(col3_width),
                       str(strain.registry_id).ljust(col4_width),
                       strain.description.ljust(col5_width)]))

    print('--End of ICE entries found already defined as EDD strains--')
    print('')
    print(search_summary_msg)


class Performance(object):
    """
    Defines performance tracking for elapsed time the script uses in performing the anticipated
    most expensive tasks.
    """

    def __init__(self, overall_start_time):
        self._overall_start_time = overall_start_time

        zero_time_delta = overall_start_time - overall_start_time

        self.csv_parse_delta = zero_time_delta
        self.ice_communication_delta = zero_time_delta
        self.edd_communication_delta = zero_time_delta
        self.edd_login_delta = zero_time_delta
        self.waiting_for_user_delta = zero_time_delta
        self._overall_end_time = None
        self._total_time = zero_time_delta

    @property
    def overall_end_time(self):
        return self._overall_end_time

    @overall_end_time.setter
    def overall_end_time(self, value):
        self._overall_end_time = value
        self._total_time = self.overall_end_time - self._overall_start_time

    @property
    def unaccounted_for_delta(self):

        unaccounted_for = self._total_time

        if self.waiting_for_user_delta:
            unaccounted_for -= self.waiting_for_user_delta

        if self.csv_parse_delta:
            unaccounted_for -= self.csv_parse_delta
        if self.edd_login_delta:
            unaccounted_for -= self.edd_login_delta
            if self.edd_communication_delta:
                unaccounted_for -= self.edd_communication_delta
        if self.ice_communication_delta:
            unaccounted_for -= self.ice_communication_delta

        return unaccounted_for

    def print_summary(self):
        ############################################################################################
        # Print a summary of runtime
        ############################################################################################

        print('')
        print('')
        print(OUTPUT_SEPARATOR)
        print('Total run time: %s' % to_human_relevant_delta(self._total_time.total_seconds()))
        print(OUTPUT_SEPARATOR)

        if self.csv_parse_delta:
            print('\tParsing CSV file: %s' % to_human_relevant_delta(
                    self.csv_parse_delta.total_seconds()))

        if self.edd_login_delta:

            if self.ice_communication_delta:
                print('\tCommunicating with ICE: %s' % to_human_relevant_delta(
                        self.ice_communication_delta.total_seconds()))
            print('\tCommunicating with EDD: %s' % to_human_relevant_delta(
                    (self.edd_communication_delta + self.edd_login_delta).total_seconds()))

        if self.waiting_for_user_delta:
            print('\tWaiting on user input: %s' % to_human_relevant_delta(
                    self.waiting_for_user_delta.total_seconds()))
        print('\tOtherwise unaccounted for: %s' % to_human_relevant_delta(
                self.unaccounted_for_delta.total_seconds()))

        print('')


def prevent_duplicate_line_names(edd, study_number, csv_summary, input_timer):
    """
    Queries EDD for existing lines in the study, then compares line names in the CSV against
    existing lines in the study, and with other rows in the CSV to help detect / prevent creation
    of difficult-to-distinguish lines with the same, or very similiar names. It's considered
    duplication when line names differ only by case or leading/trailing whitespace.
    :param edd: the EddApi instance to use for querying EDD
    :param study_number: the EDD study number whose lines should be examined.
    :param csv_summary: line creation inputs read from the CSV file
    :param input_timer: user input timer
    :return:
    """
    print('')
    print(OUTPUT_SEPARATOR)
    print("Checking for duplicate line names...")
    print(OUTPUT_SEPARATOR)

    # build a list existing line names in this study so we can compare names to help catch
    # user error in line creation.
    study_line_name_duplication_counts = {}
    existing_lines_page = edd.get_study_lines(study_number)
    while existing_lines_page and existing_lines_page.results:
        # initialize the list of line name duplications in the CSV file (ignoring any
        # already present in the study)
        for existing_line in existing_lines_page.results:
            line_name = existing_line.name.lower().strip()
            study_line_name_duplication_counts[line_name] = 0
        if existing_lines_page.next_page:
            existing_lines_page = edd.get_study_lines(study_number,
                                                            query_url=existing_lines_page.next_page)
        else:
            existing_lines_page = None

    # iterate over line creation inputs in the CSV spreadsheet, testing line names against
    # existing lines in the study and against other lines in the CSV
    total_study_line_duplication_counts = 0  # duplications of the CSV for existing lines in the
                                             # study (ignoring pre-existing duplicates)
    total_csv_duplication_count = 0  # duplications internal to the CSV document
    csv_line_duplication_counts = {}
    max_existing_duplication_count = 0
    max_csv_line_duplication_count = 0
    max_line_name_width = max(len(line.name) for line in csv_summary.line_creation_inputs)

    # TODO: sub-optimal efficiency for dictionary lookups here
    for line_creation_input in csv_summary.line_creation_inputs:
        line_name = line_creation_input.name.lower().strip()
        if line_name in study_line_name_duplication_counts.keys():
            duplicate_use_count = study_line_name_duplication_counts.get(line_name)
            duplicate_use_count += 1
            study_line_name_duplication_counts[line_name] = duplicate_use_count
            total_study_line_duplication_counts += 1
            max_existing_duplication_count = max(duplicate_use_count, max_existing_duplication_count)
        if line_name in csv_line_duplication_counts.keys():
            duplicate_use_count = csv_line_duplication_counts[line_name] + 1
            csv_line_duplication_counts[line_name] = duplicate_use_count
            total_csv_duplication_count += 1
            max_csv_line_duplication_count = max(duplicate_use_count, max_csv_line_duplication_count)
        else:
            csv_line_duplication_counts[line_name] = 0

    if not (total_study_line_duplication_counts or total_csv_duplication_count):
        print("No duplicate line names detected")
        return True

    print('')
    print('Found duplicate line names!')
    print('Line creation inputs in this CSV file would produce duplicate line names for '
          '%(existing_dupes)d existing lines in the study, and %(csv_dupes)d other lines within '
          'the same CSV file. It will be difficult or impossible to distinguish between lines with '
          'duplicate names in EDD.' % {
                'existing_dupes': total_study_line_duplication_counts,
                'csv_dupes': total_csv_duplication_count,
    })

    while True:

        response = input_timer.user_input('Do you want to create lines with duplicated names? ['
                                          'Y/n/list]: ')
        response = response.lower()

        if ('y' == response) or ('yes' == response):
            return True

        if ('n' == response) or ('no' == response):
            return False

        if 'list' == response:
            line_name_lbl = 'Line Name:'
            existing_lbl = ' # Duplicates of existing lines:'
            other_csv_lbl = '# Duplicates of other rows in CSV:'

            space = 3
            name_col_width = max(max_line_name_width, len(line_name_lbl)) + space
            existing_col_width = max(len(str(max_existing_duplication_count)), len(existing_lbl)) \
                                 + space
            csv_col_width = max(len(str(max_csv_line_duplication_count)), len(other_csv_lbl)) + \
                            space

            print('')
            print(''.join(((line_name_lbl.ljust(name_col_width)), existing_lbl.ljust(
                    name_col_width), other_csv_lbl.rjust(csv_col_width))))

            for line_name, study_duplication_count in \
                    study_line_name_duplication_counts.iteritems():

                csv_duplication_count = csv_line_duplication_counts.get(line_name)

                if not (study_duplication_count or csv_duplication_count):
                    continue

                print(''.join((line_name.ljust(name_col_width),
                              str(study_duplication_count).ljust(existing_col_width),
                              str(csv_duplication_count).ljust(csv_col_width))))

            for line_name, csv_duplication_count in csv_line_duplication_counts.iteritems():
                if not csv_duplication_count:
                    continue

                if study_line_name_duplication_counts.has_key(line_name):
                    continue # already printed out above

                print(''.join((line_name.ljust(name_col_width),
                              str(0).ljust(existing_col_width),
                              str(csv_duplication_count).ljust(csv_col_width))))

WELL_LOCATION_METADATA_NAME = 'Sample Position'
PLATE_LOCATION_METADATA_NAME = 'Plate Name'


def get_line_metadata_types(edd):
    """
    Queries EDD to get the definitions of all line-specific metadata types
    :param edd: an authenticated instance of EddApi
    :return metadata_dict: a dictionary with metadata type names as keys. Values will be MetadataTypes returned by EDD.
    """

    metadata_dict = {}
    first_request = True
    next_page_url = None
    while first_request or next_page_url:
        first_request = False

        search_results = edd.search_metadata_types(context=METADATA_CONTEXT_LINE, )

        for metadata_type in search_results.results:
            metadata_dict[metadata_type.type_name] = metadata_type

        next_page_url = search_results.next_page

    return metadata_dict

SAMPLE_LABEL_PATTERN_PARAM = '-sample_label_pattern'


def main():
    now = arrow.utcnow()
    zero_time_delta = now - now
    performance = Performance(arrow.utcnow())

    input_timer = UserInputTimer(default_format=TerminalFormats.OKGREEN)
    edd = None
    ice = None

    copy_location_param = '-copy_archival_well_locations'

    try:

        ############################################################################################
        # Configure command line parameters
        ############################################################################################
        parser = argparse.ArgumentParser(
                description='Creates EDD lines/strains in bulk with input from a CSV file.',
                # usage='python -m jbei.edd.rest.scripts.%(prog)s file.csv [options]',
        )
        parser.add_argument(
                'file_name', help=
                'The input file (must be a CSV file). With the exception of the first column '
                'header row, each subsequent row in the file represents the input for creating a '
                'single line in an EDD study.  The minimum required columns are '
                '"%(line_name_col)s" and "%(part_id_col)s", but optional support is also provided '
                'for a "%(line_desc_col)s" column, as well as for any column whose name exactly '
                'matches line metadata defined in EDD\'s database. "%(line_name_col)s" is an '
                'arbitrary name for each line to be created in EDD, but should be unique within '
                'the file, and also avoid duplicating the names of any lines already added to '
                'the EDD study. "%(part_id_col)s" is the ICE part ID for the strain '
                'measured in the EDD line.' % {
                                             'line_name_col': LINE_NAME_COL_LABEL,
                                             'part_id_col': PART_ID_COL_LABEL,
                                             'line_desc_col': LINE_DESCRIPTION_COL_LABEL, })

        parser.add_argument('-password', '-p', help='Provide an EDD/ICE password via the command '
                                                    'line (user is prompted otherwise) '
                                                    'A convenience for repeated use / '
                                                    'testing of this script.')
        parser.add_argument('-username', '-u', help='Provide an EDD/ICE username via the command '
                                                    'line (helps with repeated use / testing of '
                                                    'this script)')

        silent_param = '-silent'
        parser.add_argument(silent_param, '-s', action='store_const', const=True,
                            help='Skip user prompts to verify CSV content and study write '
                                 'permissions. This option should only be used during testing of '
                                 'the script.')
        parser.add_argument('-study', type=int, help="The number of the EDD study to create the "
                                                     "new lines in. The user is prompted if this "
                                                     "isn't present. This option is primarily a "
                                                     "convenience for testing the script.")
        parser.add_argument(copy_location_param, action='store_const', const=True,
                            help="Copy archival sample well locations from ICE to the "
                                 "newly-created EDD lines. This option should only be used when "
                                 "experimental plate/well locations exactly match those of the "
                                 "archival samples (e.g. when processing samples from a well-"
                                 "defined library that share the same plate layout as the archival "
                                 "copies). "
                                 "Also note that this option won't work if there's more than one "
                                 "sample for each ICE entry used to create the EDD lines, or if " 
                                 "the provided pattern matches more than one plate/well "
                                 "combination. A maximum of one sample per ICE entry must exist "
                                 "for this option to work, or else a pattern must be supplied "
                                 "using %s to limit the number of samples to one per ICE entry." %
                                 SAMPLE_LABEL_PATTERN_PARAM)
        parser.add_argument(SAMPLE_LABEL_PATTERN_PARAM,
                            help="An optional regular expression used to narrow down which "
                                 "plates' archival sample well locations to copy to the "
                                 "experimental lines created in EDD (in cases where there are "
                                 "multiple archival plates). Ignored when %s is missing."
                                 % copy_location_param)

        args = parser.parse_args()

        ############################################################################################
        # Print out important parameters
        ############################################################################################
        print(OUTPUT_SEPARATOR)
        print(os.path.basename(__file__))
        print(OUTPUT_SEPARATOR)
        print('\tSettings module:\t%s' % os.environ['ICE_SETTINGS_MODULE'])
        print('\tEDD URL:\t%s' % EDD_URL)
        print('\tICE URL:\t%s' % ICE_URL)
        print('\tCSV File:\t%s' % args.file_name)
        if args.username:
            print('\tEDD/ICE Username:\t%s' % args.username)
        if args.study:
            print('\tEDD Study ID:\t%d' % args.study)
        if args.copy_archival_well_locations:
            print('\tCopy archival well locations:\tYes')
        if args.sample_label_pattern:
            print('\tArchival sample label pattern:\t%s' % args.sample_label_pattern)
        print('')
        print(OUTPUT_SEPARATOR)

        ############################################################################################
        # Verify that URL's start with HTTP*S* for non-local use. Don't allow mistaken config to
        # expose access credentials! Local testing requires insecure http, so this mistake is
        # easy to make!
        ############################################################################################

        if not is_url_secure(EDD_URL, print_err_msg=True, app_name='EDD'):
            return 0

        if not is_url_secure(ICE_URL, print_err_msg=True, app_name='ICE'):
            return 0

        # silence library warnings if we're skipping SSL certificate verification for local
        # testing. otherwise the warnings will swamp useful output from this script
        if not (VERIFY_EDD_CERT and VERIFY_ICE_CERT):
            requests.packages.urllib3.disable_warnings(InsecureRequestWarning)

        # compile the input pattern to catch problems early
        sample_label_pattern = (re.compile(args.sample_label_pattern) if args.sample_label_pattern
                                                            else None)

        ############################################################################################
        # Prompt user to verify we've targeted the correct EDD / ICE instances.
        # Related configuration data gets changed a lot during development / testing, and we don't
        # want to accidentally apply data changes from a test to production, or waste time making
        # changes in the wrong environment.
        ############################################################################################
        print('')
        print("Please verify the inputs above, particularly the EDD and ICE URL's! It's vital to "
              "target line creation to the correct EDD / ICE instances.")
        result = input_timer.user_input('Are the inputs listed above correct? (Y/n): ').upper()
        if not (('Y' == result) or ('YES' == result)):
            print('Line creation aborted. Please fix inputs and re-run this script.')
            return 0


        ############################################################################################
        # Gather user credentials and verify by logging into EDD, then
        # looping until successful login
        ############################################################################################

        print('')
        print(OUTPUT_SEPARATOR)
        print('Authenticating...')
        print(OUTPUT_SEPARATOR)

        ##############################
        # log into EDD
        ##############################
        # workaround for lack of paging support in the initial client-side REST API library.
        # requests to studies with an existing large num of lines seem to take too long to
        # service since they're all being included. TODO: support should be in place now to
        # optimize this out
        performance.edd_login_delta = zero_time_delta
        login_start_time = arrow.utcnow()
        prior_user_input_delta = input_timer.wait_time
        edd_login_details = session_login(EddSessionAuth, EDD_URL, 'EDD',
                                          username_arg=args.username, password_arg=args.password,
                                          user_input=input_timer, print_result=True,
                                          verify_ssl_cert=VERIFY_EDD_CERT,
                                          timeout=EDD_REQUEST_TIMEOUT)
        edd_session_auth = edd_login_details.session_auth
        performance.edd_login_delta = (arrow.utcnow() - login_start_time) + \
                                      (input_timer.wait_time - prior_user_input_delta)

        edd = EddApi(base_url=EDD_URL, auth=edd_session_auth, verify=VERIFY_EDD_CERT)
        edd.write_enabled = True
        edd.timeout = EDD_REQUEST_TIMEOUT

        ############################
        # log into ICE
        ############################
        # ( as early as possible to prevent asking for other user input prior to login failure)
        ice_login_details = session_login(IceSessionAuth, ICE_URL, 'ICE',
                                      username_arg=edd_login_details.username,
                                      password_arg=edd_login_details.password,
                                      user_input=input_timer, print_result=True,
                                      verify_ssl_cert=VERIFY_ICE_CERT,
                                      timeout=ICE_REQUEST_TIMEOUT)

        ice_session_auth = ice_login_details.session_auth

        ice = IceApi(ice_session_auth, ICE_URL, verify_ssl_cert=VERIFY_ICE_CERT)
        ice.timeout = ICE_REQUEST_TIMEOUT

        print('')
        print(OUTPUT_SEPARATOR)
        print('Checking prerequisites...')
        print(OUTPUT_SEPARATOR)

        # Get EDD deployment-specific metadata types requested for line creation. At
        # present, we've hard-coded known JBEI values for the -copy-sample-locations
        # parameter, but in the future we'll probably allow for arbitrary metadata
        # additions based on CSV input. Note: we should do this early to detect input errors
        # Python 2/3 cross-compatible print *without* a line break

        sys.stdout.write('Querying EDD for line metatadata types...')
        line_metadata_types = get_line_metadata_types(edd)
        print('done')
        has_required_metadata_types = False
        if not line_metadata_types:
            print('No line metadata types were found in EDD. As a result, no metadata can '
                  'be copied to the lines created by this script, including archival '
                  'plate/well locations.')
            result = input_timer.user_input('Do you want to continue and create lines '
                                            'without any metadata? (Y/n): ')
            if 'Y' != result and 'YES' != result:
                return 0
        else:
            print('Found %(count)d line metadata types: \n\t%(type_names)s' % {
                'count': len(line_metadata_types),
                'type_names': '\n\t'.join(line_metadata_types.keys())
            })

            if args.copy_archival_well_locations:

                has_required_metadata_types = (line_metadata_types[
                                                   PLATE_LOCATION_METADATA_NAME]) and (
                                        line_metadata_types[WELL_LOCATION_METADATA_NAME])

                if not has_required_metadata_types:
                    result = input_timer.user_input(
                            "EDD line metadata types couldn't be found matching the search "
                            'names "%s" and "%s". \nAs a result, archival plate/well locations '
                            "can't be copied to experimental lines in EDD as they're "
                            "created. \nDo you want to continue without copying archival "
                            "sample locations to the experimental lines? (Y/n): " % (
                                PLATE_LOCATION_METADATA_NAME,
                                WELL_LOCATION_METADATA_NAME)).upper()
                    if 'Y' != result and 'YES' != result:
                        return 0

        ####################################################################################
        # Read in line creation inputs from the CSV, comparing with metadata from EDD
        ####################################################################################
        print('')
        print('Reading CSV file...')
        print(OUTPUT_SEPARATOR)
        csv_parse_start_time = arrow.utcnow()
        csv_summary = parse_csv(args.file_name, line_metadata_types)
        performance.csv_parse_delta = arrow.utcnow() - csv_parse_start_time
        csv_line_creation_count = len(csv_summary.line_creation_inputs)
        csv_unique_part_numbers = csv_summary.unique_part_numbers
        csv_part_number_count = len(csv_unique_part_numbers)
        metadata_columns = csv_summary.metadata_columns.values()

        print('')
        print('Done reading file "%s":' % os.path.basename(args.file_name))
        print('\tLine creation inputs read: %d ' % csv_line_creation_count)
        print('\tUnique ICE part numbers read: %d ' % len(csv_unique_part_numbers))
        print('\tMetadata columns found: %(count)d %(list)s' % {
            'count': len(csv_summary.metadata_columns),
            'list': str(metadata_columns) if metadata_columns else ''})
        print('\tIgnored line creation rows (missing line name or unparseable part '
              'number): %d' % csv_summary.unmatched_data_row_count)
        full_plate_count = ((csv_line_creation_count + csv_summary.unmatched_data_row_count)
                            / 96)
        unmatched = ' (incl. unmatched)' if csv_summary.unmatched_data_row_count else ''
        print('\t# 96-well plates these lines would fit into%(unmatched)s: '
              '%(plate_count).2f' % {
                    'unmatched': unmatched,
                    'plate_count': full_plate_count,
                })
        print('\tTotal rows in file: %d' % csv_summary.total_rows)

        if not csv_line_creation_count:
            print('Aborting line creation. No lines to create!')
            return 0

        if not args.silent:
            # force user to verify the expected # of lines in the study
            print('')
            result = input_timer.user_input(
                'Does this file summary match your expectations [Y/n]: ').upper()
            if ('Y' != result) and ('YES' != result):
                print(
                'Aborting line creation. Please verify that your CSV file has '
                'the correct content before proceeding with this tool.')
                return 0
        else:
            print(
            'User confirmation of study write permissions and line creation totals was '
            'silenced via %s' % silent_param)


        ####################################################################################
        # Query user for the study to create lines in, verifying that the study exists /
        # the user has access to it
        ####################################################################################
        study = None

        study_number = str(args.study) if args.study else None
        print("You'll need to provide the number of the EDD study to create lines in.")
        print('You can find the study number by loading the study in a browser and looking '
              'at the URL (e.g. https://edd.jbei.org/study/{study number}/')
        STUDY_PROMPT = 'Which EDD study number should lines be created in? '
        if not study_number:
            study_number = input_timer.user_input(STUDY_PROMPT)

        # query user regarding which study to use, then verify it exists in EDD
        digit = re.compile(r'^\s*(\d+)\s*$')
        while not study:
            match = digit.match(study_number)
            if not match:
                print('"%s" is not an integer' % study_number)
                continue

            sys.stdout.write('Searching EDD for study %s...' % study_number)
            study_number = int(match.group(1))
            study = edd.get_study(study_number)

            if not study:
                print(' failed! :-<')
                print("Study %(study_num)d couldn't be found in EDD at %(edd_url)s. "
                      "Maybe this study number is from a different EDD deployment, or has "
                      "the wrong access privileges for user %(username)s?"
                      % {'study_num': study_number,
                         'edd_url': EDD_URL,
                         'username': edd_login_details.username})

                study_number = input_timer.user_input(STUDY_PROMPT)
            else:
                print('Success!')

        if study:
            print('Found study %d in EDD, named "%s "' % (study_number, study.name))

        # force user to manually verify study permissions, which we don't have REST API
        # support for yet. prevents a line creation error much later in the process after
        # all the initial communication / checks have finished
        if not args.silent:
            print("Write permissions on the EDD study are required to create lines in it, "
                  "but this stopgap script doesn't have support for checking for study "
                  "permissions. \nYou should manually verify study write permissions to "
                  "prevent an error later in the process (typically in ~20-30 mins from "
                  "now). ")
            result = input_timer.user_input("Have you set/verified write permissions on "
                                           "study %d? (Y/n): " % study_number).upper()
            if ('Y' != result) and ('YES' != result):
                print('Aborting line creation. Please set study permissions and re-run '
                      'this script.')
                return 0

        continue_creation = prevent_duplicate_line_names(edd, study_number, csv_summary,
                                                         input_timer)
        if not continue_creation:
            print('Aborting line creation.')
            return 0

        ####################################################################################
        # Loop over part numbers in the spreadsheet, looking each one up in ICE to get its
        # UUID (the only identifier currently stored in EDD)
        ####################################################################################

        # extract only the unique part numbers referenced from the CSV. it's likely that
        # many lines will reference the same strains
        ice_entries_dict = get_ice_entries(ice, csv_unique_part_numbers,
                                           print_search_comparison=PRINT_FOUND_ICE_PARTS)

        found_ice_entry_count = len(ice_entries_dict)

        if not found_ice_entry_count:
            print('')
            print('No ICE entries were found for the part numbers listed in the CSV file. '
                  'Aborting line creation since there\'s insufficient input to create any '
                  'lines in EDD.')
            return 0

        if found_ice_entry_count < csv_part_number_count:
            print('')
            print("WARNING: Not all parts listed in the CSV file were found in ICE (see "
                  "part numbers above)")
            print("Do you want to create EDD lines for the entries that were found? You'll "
                  "have to create the rest manually, using output above as a reference.")
            result = input_timer.user_input("Create EDD lines for %(found)d of %(total)d "
                                           "ICE entries? Recall that each ICE entry may "
                                           "have many associated lines (Y/n): " % {
                                                'found': len(ice_entries_dict),
                                                'total': len(csv_unique_part_numbers)
                                           }).upper()
            if ('Y' != result) and ('YES' != result):
                print('Aborting line creation.')
                return 0

        ####################################################################################
        # Search ICE for archival well locations if requested.
        ####################################################################################
        # note: we should do this first to catch input / ICE data consistency errors first
        # before we consider making any data changes below
        if args.copy_archival_well_locations:
            print('')
            print(OUTPUT_SEPARATOR)
            print('Searching for archival well locations...')
            print(OUTPUT_SEPARATOR)

            if has_required_metadata_types:

                well_locations_by_part = cache_archival_well_locations(ice,
                                                                 sample_label_pattern,
                                                                 ice_entries_dict)

                # prompt user if any archival sample locations were'nt found
                found_sample_location_count = len(well_locations_by_part)
                if not well_locations_by_part or (found_sample_location_count !=
                                                  found_ice_entry_count):
                    print('')
                    print("Unique archival well locations couldn't be found for all of "
                          "the ICE entries. Do you want to proceed with line creation, "
                          "only copying sample locations for %(found)d of %(total)d "
                          "ICE strains? Recall that each strain may be used as the basis "
                          "for many experimental lines in EDD." % {
                             'found': found_sample_location_count,
                             'total': found_ice_entry_count, })
                    reply = input_timer.user_input('Create lines with partial or missing '
                                                  'location data? (Y/n): ')
                    reply = reply.lower()
                    if ('y' != reply) and ('yes' != reply):
                        return 0

                else:
                    print('')
                    print("Found unique archival well locations for all %(total)d ICE "
                          "entries. " % {
                              'total': found_ice_entry_count, })

                # copy archival sample location to experimental lines about to be created
                plate_location_pk = line_metadata_types[PLATE_LOCATION_METADATA_NAME].pk
                well_location_pk = line_metadata_types[WELL_LOCATION_METADATA_NAME].pk
                for line_creation_input in csv_summary.line_creation_inputs:
                    part_number = line_creation_input.local_ice_part_number
                    sample_location = well_locations_by_part.get(part_number)
                    if sample_location:
                        line_creation_input.metadata[plate_location_pk] = \
                            sample_location.plate
                        line_creation_input.metadata[well_location_pk] = \
                            sample_location.well


            else:
                print("Skipping search for archival well locations since "
                      "required metadata types weren't found earlier in the process.")

        print('')
        print(OUTPUT_SEPARATOR)
        print('Searching for pre-existing strains in EDD...')
        print(OUTPUT_SEPARATOR)

        ####################################################################################
        # Search EDD for existing strains using UUID's queried from ICE
        ####################################################################################
        # keep parts in same order as spreadsheet to allow resume following an unanticipated
        # error
        existing_edd_strains = collections.OrderedDict()
        non_existent_edd_strains = []
        strains_by_part_number = collections.OrderedDict()  # maps ICE part # -> EDD Strain

        # for consistency, print out part numbers from the CSV that we won't be looking for
        # in EDD because they couldn't be found in ICE
        if found_ice_entry_count != csv_part_number_count:
            for part_number in csv_unique_part_numbers:
                if part_number not in ice_entries_dict:
                    logger.warning('Skipping EDD strain creation for part number "%s" that '
                                   'wasn\'t found in ICE' % part_number)
            print('')  # add space between the warnings and summary output

        success = find_existing_strains(edd, ice_entries_dict, existing_edd_strains,
                                        strains_by_part_number, non_existent_edd_strains)
        if not success:
            return 0

        if PRINT_FOUND_EDD_STRAINS:
            print_edd_strains(existing_edd_strains, non_existent_edd_strains)

        # If some strains were missing in EDD, confirm with user, and then create them
        strains_created = create_missing_strains(edd, non_existent_edd_strains,
                                                 strains_by_part_number,
                                                 found_ice_entry_count, input_timer)
        if not strains_created:
            return 1

        ####################################################################################
        # Create new lines!
        ####################################################################################

        print('')
        print(OUTPUT_SEPARATOR)
        print('Creating %d new lines in EDD study %d...' % (csv_line_creation_count,
                                                            study_number))
        print(OUTPUT_SEPARATOR)

        create_lines(edd, ice, study_number, csv_summary, strains_by_part_number,
                     line_metadata_types)
    except NonStrainPartsError as nsp:
        # user output already handled above
        return 1
    except Exception as e:
        logger.exception('Error')

    finally:
        # compute and print a summary of ellapsed time on various expensive tasks
        if input_timer:
            performance.waiting_for_user_delta = input_timer.wait_time
        if edd:
            performance.edd_communication_delta = edd.session.wait_time
        if ice:
            performance.ice_communication_delta = ice.session.wait_time
        performance.overall_end_time = arrow.utcnow()
        performance.print_summary()

if __name__ == '__main__' or __name__ == 'jbei.edd.rest.scripts.create_lines':
    result = main()
    exit(result)
