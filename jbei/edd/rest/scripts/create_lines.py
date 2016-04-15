from __future__ import unicode_literals

####################################################################################################
# set default source for ICE settings BEFORE importing any code from jbei.ice.rest.ice. Otherwise,
# code in that module will attempt to look for a django settings module and fail if django isn't
# installed in the current virtualenv
import os
import arrow

from jbei.utils import to_human_relevant_delta, UserInputTimer

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
#  logger "jbei.edd.rest.edd""
edd_logger = logging.getLogger('jbei.edd.rest.edd')
edd_logger.setLevel(logging.ERROR)
edd_logger.addHandler(console_handler)
####################################################################################################

import collections
from requests import ConnectionError
import getpass
import argparse
import csv
import re
from jbei.rest.utils import is_url_secure, show_response_html
from jbei.ice.rest.ice import Strain as IceStrain
from .settings import EDD_URL, ICE_URL, PRINT_FOUND_ICE_PARTS, PRINT_FOUND_EDD_STRAINS, \
    SIMULATE_STRAIN_CREATION
from jbei.edd.rest.edd import EddSessionAuth, EddApi
from jbei.ice.rest.ice import IceApi
from jbei.ice.rest.ice import SessionAuth as IceSessionAuth

DEBUG = True

MIN_COL_NUM = 1
MAX_EXCEL_COLS = 16384  # max number of columns supported by the Excel format ()
SEPARATOR_CHARS = 75
OUTPUT_SEPARATOR = ''.join(['*' for index in range(1, SEPARATOR_CHARS)])

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
    def __init__(self, local_ice_part_number, name, description=None):
        self.local_ice_part_number = local_ice_part_number
        self.name = name
        self.description = description


class CsvSummary:
    """
    Defines the set of line creation inputs read from CSV file, as well as some other helpful
    context that may help catch parsing or data entry errors.
    """
    def __init__(self, line_generation_inputs, unique_part_numbers, unmatched_non_blank_cell_count,
                 blank_cell_count,
                 total_rows):
        self.line_creation_inputs = line_generation_inputs
        self.unique_part_numbers = unique_part_numbers
        self.unmatched_cell_count = unmatched_non_blank_cell_count
        self.blank_cell_count = blank_cell_count
        self.total_rows = total_rows


def parse_csv(path):
    """
    Parses a comma-separated values (CSV) file to extract ICE part numbers and other EDD line
    creation inputs. Also generates helpful output regarding areas of the file where parsing
    failed or encountered unexpected values
    :param path: the path to the CSV file
    :return: a CsvSummary object with the list of part numbers (now with consistent capitalization),
    as well as counts of cells that were skipped during the parsing process.
    """
    col_index = 0
    row_number = 1

    part_number_col = None
    line_name_col = None
    line_desc_col = None

    # open the CSV file and read its contents
    with open(path, 'rU') as csv_file:
        csv_row_reader = csv.reader(csv_file)

        # loop over rows in the CSV, growing a list of ICE part numbers found in each row
        line_creation_inputs = []
        blank_cell_count = 0
        unmatched_cell_count = 0
        unique_part_numbers_dict = collections.OrderedDict()

        line_name_col_label_regex = r'\s*Line Name\s*'
        line_name_col_pattern = re.compile(line_name_col_label_regex, re.IGNORECASE)
        line_desc_col_label_regex = r'\s*Line Description\s*'
        line_desc_col_label_pattern = re.compile(line_desc_col_label_regex, re.IGNORECASE)

        part_number_col_label_pattern = re.compile(r'\s*Part ID\s*', re.IGNORECASE)

        found_col_labels = False

        for cols_list in csv_row_reader:

            # identify columns of interest first by looking for required labels
            if not found_col_labels:

                # loop over columns, looking for labels that identify the columns we want
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

                    # stop looking if all columns are found, or if only the required columns are
                    # found, but we've reached the end of the row
                    if (part_number_col is not None) and (line_name_col is not None) and \
                       ((line_desc_col is not None) or (col_index == len(cols_list)-1)):
                        found_col_labels = True
                        break

                if(not found_col_labels) and ((part_number_col is None) or (line_name_col is None)):
                    logger.debug('Couldn\'t find the minimum required column labels ("%s", '
                                 '%s) in row  %d. Skipping this row.')
                    part_number_col = None
                    line_name_col = None
                    line_desc_col = None

                    continue

            # if column labels have been identified, look for line creation input data
            else:
                part_number = None
                line_name = None
                line_desc = None

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
                    logger.warning('Cell content "%(content)s"in row %(row)d, column %(col)d '
                                   'didn\'t match the expected ICE part number pattern. Skipping '
                                   'this row.' %
                                   {
                                       'content': cell_content,
                                       'row': row_number,
                                       'col': col_index+1,
                                   })
                    unmatched_cell_count += 1
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
                    unmatched_cell_count += 1
                    continue

                ###################################################
                # line description
                ###################################################

                if line_desc_col is not None:
                    cell_content = cols_list[line_desc_col].strip()

                    if cell_content:
                        line_desc = cell_content

                unique_part_numbers_dict[part_number] = True
                line_creation_inputs.append(LineCreationInput(part_number, line_name, line_desc))

            row_number += 1

    if not found_col_labels:
        print("The minimum set of required column labels wasn't found in this CSV file. Required "
              "column labels are ['Part ID', 'Line Name']. A 'Line Description' column is "
              "optional.")
    unique_part_numbers_list = unique_part_numbers_dict.keys()
    return CsvSummary(line_creation_inputs, unique_part_numbers_list, unmatched_cell_count,
                      blank_cell_count, row_number)

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


def get_ice_parts(base_url, ice_username, password, part_numbers_list,
                  print_search_comparison=False):
    """
    Queries ICE for parts with the provided (locally-unique) numbers, logging warnings for any
    parts that weren't found, as well as a follow-on summary of the parts that were found vs. the
    number expected.
    :param base_url: the base ICE URL to use in REST API calls
    :param ice_username: the ice username
    :param password: the ice password
    :return:
    """
    csv_part_number_count = len(part_numbers_list)
    part_number_to_part_dict = collections.OrderedDict()  # order for easy comparison against CSV
    print 'Logging into ICE at %s ...' % ICE_URL,
    with IceSessionAuth.login(ice_username=ice_username, password=password,
                              base_url=ICE_URL) as ice_session_auth:
        print('success!')

        ice = IceApi(auth=ice_session_auth)

        print('')
        print(OUTPUT_SEPARATOR)
        print('Searching ICE for %d parts... ' % csv_part_number_count)
        print(OUTPUT_SEPARATOR)
        list_position = 0
        for local_ice_part_number in part_numbers_list:
            list_position += 1

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
            part = ice.fetch_part(search_id)

            if not part:
                logger.warning("Couldn't locate part \"%s\" (#%d)" % (local_ice_part_number,
                                                                      list_position))

            # double-check for a coding error that occurred during testing. initial test parts
            # had "JBX_*" part numbers that matched their numeric ID, but this isn't always the
            # case!
            elif part.part_id != local_ice_part_number:
                logger.warning("Couldn't locate part \"%(csv_part_number)s\" (#%(list_position)d "
                               "in the file) by part number. An ICE part was found with numeric "
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
        print ''

    print ('Found %(found)d of %(total)d parts in ICE.' %
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

    return part_number_to_part_dict


def find_existing_strains(edd, ice_parts, existing_edd_strains, strains_by_part_number,
                          non_existent_edd_strains):
    """
    Searches EDD for existing Strains that match the UUID in each ICE part. To help ensure
    consistency, EDD is also searched for existing strains with a similar URL or name before a
    strain is determined to be missing.
    :param edd: an authenticated EddApi instance
    :param ice_parts: a list of Ice Part objects for which matching EDD Strains should be located
    :param existing_edd_strains: an empty list that will be populated with strains found to
    already exist in EDD's database
    :param strains_by_part_number: an empty dictionary that maps part number -> Strain. Each
    previously-existing strain will be added here.
    :param non_existent_edd_strains: an empty list that will be populated with
    :return:
    """
    for ice_part in ice_parts.values():

            # search for the strain by registry ID
            edd_strains = edd.search_strains(registry_id=ice_part.uuid)

            # if one or more strains are found with this UUID
            if edd_strains:
                if edd_strains.get_current_result_count() > 1 or edd_strains.is_paged():
                    print('More than one existing EDD strain was found for part %(part_number)s ('
                          'registry_id %(uuid)s). Please see the EDD team to resolve the '
                          'discrepancy before continuing.' % {
                              'part_number': ice_part.part_id,
                              'uuid': ice_part.record_id
                          })
                    return False

                existing_strain = edd_strains.results[0]
                existing_edd_strains[ice_part.part_id] = existing_strain
                strains_by_part_number[ice_part.part_id] = existing_strain

            # if no EDD strains were found with this UUID, look for candidate strains by URL
            else:
                print("ICE part %s couldn't be located in EDD's database by UUID. Searching by "
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
                    print('Found %(strain_count)d EDD strains that lacked proper identification, '
                          'but whose name(s) contained the name of ICE part %(part_number)s ("%('
                          'part_name)s"). Please contact the EDD team to correct this issue before '
                          'you proceed.' % {
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
    :param non_existent_edd_strains: a list of ICE Part objects representing ICE parts for which
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


    print('Warning: %(non_existent)d of %(total)d ICE parts did not have an '
          'existing strain in EDD.' % {
              'non_existent': len(non_existent_edd_strains),
              'total': ice_part_count,
          })

    # loop while gathering user input -- gives user a chance to list strains that will
    # be created
    while True:
        result = input_timer.user_input('Do you want to create EDD strains for all %d of these '
                                     'parts? (Y/n/list): ' % non_existent_strain_count).upper()

        if 'Y' == result or 'YES' == result:
            break

        elif 'LIST' == result:
            print('')
            space = 2
            col1_width = max(len(part.name) for part in non_existent_edd_strains) + space
            col2_width = max(len(part.part_id) for part in non_existent_edd_strains) + space
            col3_width = max(len(part.short_description)
                             for part in non_existent_edd_strains) + space
            print("EDD strains weren't found for the following ICE parts: ")
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
                                               registry_url='%(base_url)s/entry/%(local_part_id)d' %
                                               {
                                                   'base_url': ICE_URL,
                                                   'local_part_id': ice_part.id,
                                               })
                strains_by_part_number[ice_part.part_id] = new_strain
            created_strain_count += 1
        print('Created %d new strains in EDD' % created_strain_count)
        return STRAINS_CREATED
    except Exception:
        logger.exception('Error creating new EDD strains. Successfully created %d of %d '
                         'strains before the error occurred.' % (
                             created_strain_count, non_existent_strain_count))
        return STRAINS_NOT_CREATED


def create_lines(edd, study_id, csv_summary, strains_by_part_number):
    """
    Creates lines in an EDD study, then prints summary output
    :param study_id: numeric primary key identifying the EDD study that lines should be
    associated with
    :param csv_summary: the data read from CSV input. Allows us to print out the requested input
    for any lines whose creation was skipped/aknowleged early in the process
    :param strains_by_part_number: the list of EDD strains the lines will be created from
    """
    created_lines = []  # in same order as line creation inputs. None for skipped lines.
    created_line_count = 0

    line_name = None
    ice_part_number = None
    line_index = 0
    strain_col_width = 0
    skipped_some_strains = False

    try:
        # loop over lines, attempting to create them in EDD
        for line_creation_input in csv_summary.line_creation_inputs:
            ice_part_number = line_creation_input.local_ice_part_number
            strain = strains_by_part_number.get(ice_part_number)

            # skip any lines whose EDD strain couldn't be created because the relevant ICE part
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
                                   line_creation_input.description)

            # save state to help print good summary output / error messages
            created_line_count += 1
            created_lines.append(line)
            line_index += 1

        if skipped_some_strains:
            print ''
        print('All %d lines were created in EDD. BAM!' % created_line_count)
        print('')

        # determine sizing for columnar summary output
        col1_lbl = 'EDD ID'
        col2_lbl = 'Name:'
        col3_lbl = 'Description:'
        col4_lbl = 'Strain ID:'

        space = 3
        col1_width = len(col1_lbl) + space
        col2_width = max([len(csv_line.name) for csv_line in csv_summary.line_creation_inputs]) + \
                     space
        col3_width = max(
            [len(line2.description) if line2.description else 0 for line2 in
             csv_summary.line_creation_inputs]) + space

        col3_width = max([col3_width, len(col3_lbl) + space])

        # print column headers
        print(''.join(
            [col1_lbl.ljust(col1_width), col2_lbl.ljust(col2_width), col3_lbl.ljust(col3_width),
             col4_lbl.ljust(strain_col_width)]))

        # print created lines, also reiterating inputs for any lines that weren't created because
        # the associated ICE parts couldn't be found
        for line_index, line_creation_input in enumerate(csv_summary.line_creation_inputs):
            ice_part_number = line_creation_input.local_ice_part_number
            strain = strains_by_part_number.get(ice_part_number)
            strain_id = strain.pk if strain else '[ Not found in ICE ]'

            created_line = created_lines[line_index]

            # assume line creation errors were handled properly above in that code.
            # just ignore missing lines for printing purposes here
            if not created_line:
                continue

            edd_id = created_line.pk if created_line else '*****'
            description = created_line.description if created_line.description else ' '
            print(''.join([str(edd_id).ljust(col1_width), created_line.name.ljust(col2_width),
                           description.ljust(col3_width), str(strain_id).ljust(strain_col_width)]))

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

    if not non_existent_edd_strains:
        print('Found all %d ICE parts already defined as strains in EDD' % len(
            existing_edd_strains))
    else:
        found_strains = len(existing_edd_strains)
        total_strains = found_strains + len(non_existent_edd_strains)
        print('Found %d of %d ICE parts defined as strains in EDD' % (found_strains, total_strains))

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


class Performance(object):
    """
    Defines performance tracking for elapsed time the script uses in performing the anticipated
    most expensive tasks.
    """

    def __init__(self, overall_start_time):
        self._overall_start_time = overall_start_time

        zero_time_delta = overall_start_time - overall_start_time

        self.csv_parse_delta = None
        self.ice_communication_delta = None
        self.edd_communication_delta = None
        self.edd_login_delta = None
        self.waiting_for_user_delta = None
        self._overall_end_time = None
        self._total_time = None

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
    total_csv_duplication_count = 0 # duplications internal to the CSV document
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
    print('Line creation inputs in this CSV file would produce duplicate line names for %('
          'existing_dupes)d existing lines in the study, and %(csv_dupes)d other lines within the '
          'same CSV file. It will be difficult or impossible to distinguish between lines with '
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


def main():
    now = arrow.utcnow()
    zero_time_delta = now - now
    performance = Performance(arrow.utcnow())

    input_timer = UserInputTimer()
    edd = None

    try:

        ############################################################################################
        # Configure command line parameters
        ############################################################################################
        parser = argparse.ArgumentParser(description='Create EDD lines/strains from a list of ICE '
                                                     'entries')
        parser.add_argument('file_name', help='A CSV file containing strains exported from ICE')

        parser.add_argument('-p', '-password', help='provide a password via the command '
                                                    'line (helps with repeated use / testing)')
        parser.add_argument('-u', '-username', help='provide username via the command line ('
                                                    'helps with repeated use / testing)')
        parser.add_argument('-s', '-silent', action='store_const', const=True,
                            help='skip user prompts to verify CSV content')
        parser.add_argument('-study', type=int, help='the number of the EDD study to create the new '
                                                     'lines in')
        args = parser.parse_args()

        # print out important parameters
        print(OUTPUT_SEPARATOR)
        print(os.path.basename(__file__))
        print(OUTPUT_SEPARATOR)
        print('\tSettings module:\t%s' % os.environ['ICE_SETTINGS_MODULE'])
        print('\tEDD URL:\t%s' % EDD_URL)
        print('\tICE URL:\t%s' % ICE_URL)
        print('\tCSV File:\t%s' % args.file_name)
        if args.u:
            print('\tEDD/ICE Username:\t%s' % args.u)
        if args.study:
            print('\tEDD Study ID:\t%d' % args.study)
        print('')
        print(OUTPUT_SEPARATOR)

        ############################################################################################
        # Verify that URL's start with HTTP*S* for non-local use. Don't allow mistaken config to
        # expose access credentials! Local testing requires insecure http, so this mistake is
        # easy to make!
        ############################################################################################
        if not is_url_secure(EDD_URL):
            print('EDD_BASE_URL %s is insecure. You must use HTTPS to maintain security for non-'
                  'local URL\'s')
            return 0

        if not is_url_secure(ICE_URL):
            print('ICE_BASE_URL %s is insecure. You must use HTTPS to maintain security for non-'
                  'local URL\'s')
            return 0

        ############################################################################################
        # Read in part numbers from the CSV
        ############################################################################################
        print('Reading CSV file...')
        print(OUTPUT_SEPARATOR)
        csv_parse_start_time = arrow.utcnow()
        csv_summary = parse_csv(args.file_name)
        performance.csv_parse_delta = arrow.utcnow() - csv_parse_start_time
        csv_line_creation_count = len(csv_summary.line_creation_inputs)
        csv_unique_part_numbers = csv_summary.unique_part_numbers
        csv_part_number_count = len(csv_unique_part_numbers)

        print('Done reading file %s:' % os.path.basename(args.file_name))
        print('\tUnique ICE part numbers read: %d ' % len(csv_unique_part_numbers))
        print('\tLine creation inputs read: %d ' % csv_line_creation_count)
        print('\tTotal rows in file: %d' % csv_summary.total_rows)

        if not csv_line_creation_count:
            print('Aborting line creation. No lines to create!')
            return 0

        if not args.s:
            result = input_timer.user_input('Do these totals make sense [Y/n]: ').upper()
            if ('Y' != result) and ('YES' != result):
                print('Aborting line creation. Please verify that your CSV file has the correct '
                      'content before proceeding with this tool.')
                return 0

        ############################################################################################
        # Gather user credentials and verify by logging into EDD, then
        # looping until successful login
        ############################################################################################

        print('')
        print(OUTPUT_SEPARATOR)
        print('Authenticating...')
        print(OUTPUT_SEPARATOR)

        attempted_login = False
        edd_session_auth = None
        performance.edd_login_delta = zero_time_delta

        while not edd_session_auth:

            # gather user credentials from command line arguments and/or user prompt
            if args.u and not attempted_login:
                username = args.u
            else:
                if not attempted_login:
                    username = getpass.getuser()
                username_input = input_timer.user_input('Username [%s]: ' % username)
                username = username_input if username_input else username

            if args.p and not attempted_login:
                password = args.p
            else:
                append_prompt = ' [enter to use existing entry]' if attempted_login else ''
                password_input = getpass.getpass('Password for %s%s: ' % (username, append_prompt))
                password = password_input if password_input else password

            attempted_login = True

            # attempt EDD login
            try:
                print 'Logging into EDD at %s... ' % EDD_URL,
                edd_login_start_time = arrow.utcnow()
                workaround_request_timeout = 20  # workaround for lack of paging support in the
                                                 # initial client-side REST API library. requests to
                                                 # studies with an  existing large num of lines seem
                                                 # to take too long to service since they're all
                                                 # being included.
                edd_session_auth = EddSessionAuth.login(base_url=EDD_URL, username=username,
                                                        password=password, timeout=workaround_request_timeout)
                performance.edd_login_delta += (edd_login_start_time - arrow.utcnow())
                if(edd_session_auth):
                    print('success!')
                else:
                    print('failed :-{')

            except ConnectionError as e:
                # if no connection could be made, stop looping uselessly
                raise e

            except Exception as e:
                logger.exception('Error logging into EDD')

        with edd_session_auth:

            edd = EddApi(base_url=EDD_URL, session_auth=edd_session_auth)
            edd.set_write_enabled(True)

            ########################################################################################
            # Query user for the study to create lines in, verifying that the study exists / the
            # user has access to it
            ########################################################################################
            study = None

            study_number = str(args.study) if args.study else None
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

                print 'Searching EDD for study %s...' % study_number,
                study_number = int(match.group(1))
                study = edd.get_study(study_number)

                if not study:
                    print(' failed! :-<')
                    print("Study %(study_num)d couldn't be found in EDD at %(edd_url)s. "
                          "Maybe this study number is from a different EDD deployment, or has the "
                          "wrong access privileges for user %(username)s?"
                          % {'study_num': study_number,
                             'edd_url': EDD_URL,
                             'username': username})

                    study_number = input_timer.user_input(STUDY_PROMPT)
                else:
                    print('Success!')

            if study:
                print('Found study %d in EDD, named "%s "' % (study_number, study.name))

            continue_creation = prevent_duplicate_line_names(edd, study_number, csv_summary,
                                                             input_timer)
            if not continue_creation:
                print('Aborting line creation.')
                return 0


            ########################################################################################
            # Loop over part numbers in the spreadsheet, looking each one up in ICE to get its UUID
            # (the only identifier currently stored in EDD)
            ########################################################################################

            # extract only the unique part numbers referenced from the CSV. it's likely that many
            # lines will reference the same strains
            ice_communication_start = arrow.utcnow()
            ice_parts_dict = get_ice_parts(ICE_URL, username, password, csv_unique_part_numbers,
                                           print_search_comparison=PRINT_FOUND_ICE_PARTS)
            performance.ice_communication_delta = arrow.utcnow() - ice_communication_start

            ice_part_count = len(ice_parts_dict)

            if not ice_part_count:
                print ''
                print('No ICE parts were found for the part numbers listed in the CSV file. '
                      'Aborting line creation since there\'s insufficient input to create any '
                      'lines in EDD.')
                return 0

            if ice_part_count < csv_part_number_count:
                print ''
                print("WARNING: Not all parts listed in the CSV file were found in ICE (see part "
                      "numbers above)")
                print("Do you want to create EDD lines for the parts that were found? You'll "
                      "have to create the rest manually, using output above as a reference.")
                result = input_timer.user_input("Create EDD lines for %(found)d of %(total)d parts? "
                                             "Recall that "
                                   "each ICE part may have many associated lines ("
                                   "Y/n): " %
                                          {
                                        'found': len(ice_parts_dict),
                                        'total': len(csv_unique_part_numbers)
                                   }).upper()
                if ('Y' != result) and ('YES' != result):
                    print('Aborting line creation.')
                    return 0

            print('')
            print(OUTPUT_SEPARATOR)
            print('Searching for pre-existing strains in EDD...')
            print(OUTPUT_SEPARATOR)

            ########################################################################################
            # search EDD for existing strains using UUID's queried from ICE
            ########################################################################################
            # keep parts in same order as spreadsheet to allow resume following an unanticipated
            # error
            existing_edd_strains = collections.OrderedDict()
            non_existent_edd_strains = []
            strains_by_part_number = collections.OrderedDict()

            # for consistency, print out part numbers from the CSV that we won't be looking for in
            # EDD because they couldn't be found in ICE
            if ice_part_count != csv_part_number_count:
                for part_number in csv_unique_part_numbers:
                    if not part_number in ice_parts_dict:
                        logger.warning('Skipping EDD strain creation for part number "%s" that '
                                       'wasn\'t found in ICE' % part_number)
                print ''  # add space between the warnings and summary output

            success = find_existing_strains(edd, ice_parts_dict, existing_edd_strains,
                                            strains_by_part_number, non_existent_edd_strains)
            if not success:
                return 0

            if PRINT_FOUND_EDD_STRAINS:
                print_edd_strains(existing_edd_strains, non_existent_edd_strains)

            # If some strains were missing in EDD, confirm with user, and then create them
            strains_created = create_missing_strains(edd, non_existent_edd_strains,
                                                     strains_by_part_number, ice_part_count, input_timer)
            if not strains_created:
                return 1

            ########################################################################################
            # Create new lines!
            ########################################################################################

            print('')
            print(OUTPUT_SEPARATOR)
            print('Creating %d new lines in EDD study %d...' % (csv_line_creation_count,
                                                                study_number))
            print(OUTPUT_SEPARATOR)

            create_lines(edd, study_number, csv_summary, strains_by_part_number)
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
            performance.edd_communication_delta = edd.request_generator.wait_time
        performance.overall_end_time = arrow.utcnow()
        performance.print_summary()

if __name__ == '__main__' or __name__=='jbei.edd.rest.scripts.create_lines':
    result = main()
    exit(result)