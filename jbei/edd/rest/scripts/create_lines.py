from __future__ import unicode_literals

####################################################################################################
# set default source for ICE settings BEFORE importing any code from jbei.ice.rest.ice. Otherwise,
# code in that module will attempt to look for a django settings module and fail if django isn't
# installed in the current virtualenv
import os
os.environ.setdefault('ICE_SETTINGS_MODULE', 'settings')
####################################################################################################

import collections
from requests import ConnectionError
import sys
import getpass
import logging

import argparse
import csv
import re

from jbei.rest.utils import is_url_secure
from jbei.ice.rest.ice import Strain as IceStrain

from settings import *

USE_DRF_SERIALIZER = False  # TODO: remove after testing

MIN_COL_NUM = 1
MAX_EXCEL_COLS = 16384 # max number of columns supported by the Excel format ()

# TODO: remove this placeholder and rearrange imports if not using Django model objects
from jbei.edd.rest.edd import EddSessionAuth, EddApi


from jbei.ice.rest.ice import IceApi
from jbei.ice.rest.ice import SessionAuth as IceSessionAuth



####################################################################################################
# configure an INFO-level logger just for our code (avoids INFO messages from supporting frameworks)
####################################################################################################
LOG_LEVEL = logging.INFO
console_handler = logging.StreamHandler(sys.stdout)  # redirect to stdout so log messages appear
                                                     # sequentially
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
####################################################################################################

SEPARATOR_CHARS = 75
OUTPUT_SEPARATOR = ''.join(['*' for index in range(1, SEPARATOR_CHARS)])


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
    def __init__(self, line_generation_inputs, unmatched_non_blank_cell_count, blank_cell_count,
                 total_rows):
        self.line_creation_inputs = line_generation_inputs
        self.unmatched_cell_count = unmatched_non_blank_cell_count
        self.blank_cell_count = blank_cell_count
        self.total_rows = total_rows

def parse_csv(path):
    """
    Parses a comma-separated values (CSV) file to extract ICE part numbers and other EDD line
    creation inputs. Also generates helpful output regarding areas of the file where parsing
    failed or encountered unexpected values
    :param path: the path to the CSV file
    :param col_num: the column number that contains ICE part numbers
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

        part_number_regex = r'\s*([A-Z]+_\d{6})\s*'
        part_number_pattern = re.compile(part_number_regex, re.IGNORECASE)

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
                    # print a warning message and skip this row if the cell has no non-whitespace content
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
                       ((line_desc_col is not None ) or (col_index == len(cols_list)-1)):
                        found_col_labels = True
                        break

                if(not found_col_labels) and ((part_number_col is None) or (line_name_col is
                        None)):
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
                match = part_number_pattern.match(cell_content)

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

                line_creation_inputs.append(LineCreationInput(part_number, line_name, line_desc))

            row_number += 1

    if not found_col_labels:
        print("The minimum set of required column labels wasn't found in this CSV file. Required "
              "column labels are ['Part ID', 'Line Name']. A 'Line Description' column is "
              "optional.")
    return CsvSummary(line_creation_inputs, unmatched_cell_count, blank_cell_count, row_number)

def print_found_ice_parts(part_number_to_part_dict):
    # compute width for columnar output
    space = 3
    col1_width = max(len(str(search_id)) for search_id in part_number_to_part_dict.keys()) + space
    col2_width = max(len(str(part.id)) for part in part_number_to_part_dict.values()) + space
    col3_width = max(len(part.part_id) for part in part_number_to_part_dict.values()) + space
    col4_width = max(len(part.name) for part in part_number_to_part_dict.values()) + space
    col5_width = max(
        len(part.short_description) for part in part_number_to_part_dict.values()) + space

    col1_lbl = 'Search id:'
    col2_lbl = 'Found Part id: '
    col3_lbl = 'Part id:'
    col4_lbl = 'Name:'
    col5_lbl = 'Description:'

    col1_width = max([col1_width, len(col1_lbl) + space])
    col2_width = max([col2_width, len(col2_lbl) + space])
    col3_width = max([col3_width, len(col3_lbl) + space])
    col4_width = max([col4_width, len(col4_lbl) + space])
    col5_width = max([col5_width, len(col5_lbl) + space])

    # print column headers
    print(''.join(
        [col1_lbl.ljust(col1_width), col2_lbl.ljust(col2_width), col3_lbl.ljust(col3_width),
         col4_lbl.ljust(col4_width), col5_lbl.ljust(col5_width)]))

    # print output
    for search_id in part_number_to_part_dict.keys():
        part = part_number_to_part_dict[search_id]
        print(''.join([str(search_id).ljust(col1_width), str(part.id).ljust(col2_width),
                       part.part_id.ljust(col3_width), part.name.ljust(col4_width),
                       part.short_description.ljust(col5_width)]))

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
    ice_parts = []
    part_number_to_part_dict = collections.OrderedDict()  # order for easy comparison against CSV
    print 'Logging into ICE at %s ...' % ICE_URL,
    with IceSessionAuth.login(ice_username=username, password=password,
                              base_url=ICE_URL) as ice_session_auth:
        print('success!')

        ice = IceApi(auth=ice_session_auth)

        print('')
        print(OUTPUT_SEPARATOR)
        print('Searching ICE for %d parts... ' % csv_part_number_count)
        print(OUTPUT_SEPARATOR)
        list_position = 0
        part_number_regex = re.compile(r'\s*[A-Za-z]+_(\d+)\s*$')
        for local_ice_part_number in part_numbers_list:
            list_position += 1

            # get just the numeric part of the part number. for unknown reasons that I can't
            # reproduce in PostMan, searching for the whole part number seems to produce the
            # wrong result.
            match = part_number_regex.match(local_ice_part_number)

            if not match:
                logger.warning("Couldn't parse part number \"%s\". Unable to query ICE for this "
                               "part.")
                continue

            numeric_part_number = int(match.group(1))
            search_id = local_ice_part_number
            part = ice.fetch_part(search_id)

            if not part:
                logger.warning("Couldn't locate part \"%s\" (#%d)" % (local_ice_part_number,
                                                               list_position))
            else:
                ice_parts.append(part)

                if print_search_comparison:
                    part_number_to_part_dict[search_id] = part

    print ('Found %(found)d of %(total)d parts in ICE.' % {'found': len(ice_parts),
        'total': csv_part_number_count})

    # enforce the restriction that only ICE Strains may be used to create EDD lines. Plasmids
    #  / Parts should cause the script to abort
    non_strain_parts = {}
    for part in ice_parts:
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
        exit(0)


    if print_search_comparison:
        print_found_ice_parts(part_number_to_part_dict)


    return ice_parts


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
    for ice_part in ice_parts:

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
                    exit(0)

                existing_strain = edd_strains.results[0]
                existing_edd_strains[ice_part.part_id] = existing_strain
                strains_by_part_number[ice_part.part_id] = existing_strain


            # if no EDD strains were found with this UUID, look for candidate strains by URL
            else:

                # look for candidate strains by URL (if present, more static / reliable than name)
                edd_strains = edd.search_strains(registry_url_regex=r".*/parts/%d(?:/?)" %
                                                                    ice_part.id)

                if edd_strains:
                    print("Found an existing, but malformed, EDD strain for part %s (registry_id "
                          "%s). Please have the EDD team correct this issue before you proceed."
                          % (ice_part.part_id, ice_part.uuid))
                    exit(0)

                # look for candidate strains by UUID-based URL
                edd_strains = edd.search_strains(registry_url_regex=r".*/parts/%s(?:/?)" %
                                                                    ice_part.uuid)
                if edd_strains:
                    if edd_strains:
                        print("Found an existing, but malformed, EDD strain for part %s (registry_id "
                              "%s). Please have the EDD team correct this issue before you proceed."
                              % (ice_part.part_id, ice_part.uuid))
                        exit(0)

                # if no strains were found by URL, search by name
                edd_strains = edd.search_strains(name=ice_part.name)

                if edd_strains:
                    print('Found %(strain_count)d EDD strains that lacked proper identification, '
                          'but whose name contained the name of ICE part %(part_number)s ("%('
                          'part_name)s". Please contact the EDD team to correct this issue before '
                          'you proceed.)' % {
                            'strain_count': edd_strains.count,
                            'part_number': ice_part.part_id,
                            'part_name': ice_part.name,
                           })
                    exit(0)

                non_existent_edd_strains.append(ice_part)

def create_missing_strains(edd, non_existent_edd_strains, strains_by_part_number, ice_part_count):
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

    print('')
    print(OUTPUT_SEPARATOR)
    print('Creating EDD Strains...')
    print(OUTPUT_SEPARATOR)

    non_existent_strain_count = len(non_existent_edd_strains)
    print('Warning: %(non_existent)d of %(total)d ICE parts did not have an '
          'existing strain in EDD.' % {'non_existent': len(non_existent_edd_strains),
                                       'total': ice_part_count,})

    while True:
        result = raw_input('Do you want to create EDD strains for all of these %d parts? ('
                           'Y/n/list): ' % non_existent_strain_count).upper()

        if 'Y' == result or 'YES' == result:
            break

        elif 'LIST' == result:
            print('')
            space = 2
            col1_width = max(len(part.name) for part in non_existent_edd_strains) + space
            col2_width = max(len(part.part_id) for part in non_existent_edd_strains) + space
            col3_width = max(len(part.short_description) for part in non_existent_edd_strains) + \
                         space
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

    created_strain_count = 0
    try:
        for ice_part in non_existent_edd_strains:
            if not SIMULATE_STRAIN_CREATION:
                new_strain = edd.create_strain(name=ice_part.name,
                                               description=ice_part.short_description,
                                               registry_id=ice_part.uuid,
                                               registry_url='%(base_url)sentry/%(local_part_id)d' %
                                               {
                                                   'base_url': ICE_URL,
                                                   'local_part_id': ice_part.id,
                                               })
                strains_by_part_number[ice_part.part_id] = new_strain
            created_strain_count += 1
        print('Created %d new strains in EDD' % created_strain_count)
        return STRAINS_CREATED
    except Exception as e:
        logger.exception('Error creating new EDD strains. Successfully created %d of %d '
                         'strains before the error occurred.' % (
                             created_strain_count, non_existent_strain_count))
        return STRAINS_NOT_CREATED


def create_lines(study_id, csv_summary, strains_by_part_number):
    """
    Creates lines in an EDD study, then prints summary output
    :param study_id: numeric primary key identifying the EDD study that lines should be
    associated with
    :param csv_summary: the data read from CSV input. Allows us to print out the requested input
    for any lines whose creation was skipped/aknowleged early in the process
    :param strains_by_part_number: the list of EDD strains the lines will be created from
    """
    lines_by_part_number = collections.OrderedDict()

    ice_part_number = None
    line_index = 0
    strain_col_width = 0

    try:
        # loop over lines, attempting to create them in EDD
        for line_input in csv_summary.line_creation_inputs:
            ice_part_number = line_input.local_ice_part_number
            strain = strains_by_part_number.get(ice_part_number)

            strain_col_width = max([len(str(strain.pk)), strain_col_width])

            # skip any lines whose EDD strain couldn't be created because the relevant ICE part
            # wasn't found. User has already aknowleged this and chosen to proceed
            if not strain:
                continue

            # create the line in EDD, or raise an Exception if creation can't occur
            line = edd.create_line(study_number, strain.pk, line_input.name, line_input.description)

            # save state to help print good summary output / error messages
            lines_by_part_number[ice_part_number] = line
            line_index += 1

        print('All %d lines were created in EDD. BAM!' % len(lines_by_part_number))
        print('')

        # determine sizing for columnar summary output
        col1_lbl = 'EDD ID'
        col2_lbl = 'Name:'
        col3_lbl = 'Description:'
        col4_lbl = 'Strain ID:'

        space = 3
        col1_width = len(col1_lbl) + space
        col2_width = max([len(line.name) for line in csv_summary.line_creation_inputs]) + space
        col3_width = max(
            [len(line.description) if line.description else 0 for line in
             csv_summary.line_creation_inputs]) + space

        col3_width = max([col3_width, len(col3_lbl) + space])

        # print column headers
        print(''.join(
            [col1_lbl.ljust(col1_width), col2_lbl.ljust(col2_width), col3_lbl.ljust(col3_width),
             col4_lbl.ljust(strain_col_width)]))

        # print created lines, also reiterating inputs for any lines that weren't created
        # because the associated ICE parts couldn't be found
        for line_input in csv_summary.line_creation_inputs:
            ice_part_number = line_input.local_ice_part_number
            strain = strains_by_part_number.get(ice_part_number)
            strain_id = strain.pk if strain else '[ Not found in ICE ]'

            created_line = lines_by_part_number.get(ice_part_number)
            edd_id = created_line.pk if created_line else '*****'
            description = created_line.description if created_line.description else ' '
            print(''.join([str(edd_id).ljust(col1_width), created_line.name.ljust(col2_width),
                description.ljust(col3_width), str(strain_id).ljust(strain_col_width)]))

    except Exception as e:
        logger.exception('An error occurred during line creation. %(created)d of %(total)d '
                         'lines were created '
                         'before the error occurred for part number %(part_num)s.',
                         {'created': line_index, 'total': ice_part_count,
                             'part_num': ice_part_number})

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
        print('Found all %d ICE parts already defined as strains in EDD' %
                  len(existing_edd_strains))
    else:
        print('Found %d of %d ICE parts defined as strains in EDD')

    # print column labels
    print(''.join([col1_lbl.ljust(col1_width), col2_lbl.ljust(col2_width), col3_lbl.ljust(
        col3_width), col4_lbl.ljust(col4_width), col5_lbl.ljust(col5_width)]))

    # print values
    for local_ice_part_number in existing_edd_strains.keys():
        strain = existing_edd_strains[local_ice_part_number]

        print(''.join([local_ice_part_number.ljust(col1_width), strain.name.ljust(col2_width),
                       strain.registry_url.ljust(col3_width), str(strain.registry_id).ljust(
                col4_width),
                       strain.description.ljust(col5_width)]))



#
# client = APIClient()
#
try:
    ################################################################################################
    # Configure command line parameters
    ################################################################################################
    parser = argparse.ArgumentParser(description='Create EDD lines/strains from a list of ICE '
                                                 'entries')
    parser.add_argument('file_name', help='A CSV file containing strains exported from ICE')

    parser.add_argument('-p', '-password', help='provide a password via the command '
                                                          'line (helps with testing)')
    parser.add_argument('-u', '-username', help='provide username via the command line ('
                                                      'helps with testing)')
    parser.add_argument('-s', '-silent', action='store_const', const=True,
                        help='skip user prompts to verify CSV content')
    parser.add_argument('-study', type=int, help='the number of the EDD study to create the new '
                                              'lines in')
    args = parser.parse_args()

    # print out important parameters
    print(OUTPUT_SEPARATOR)
    print(os.path.basename(__file__))
    print(OUTPUT_SEPARATOR)
    if USE_DRF_SERIALIZER:
        # if not provided by the environment, set default source for settings
        settings_module = os.environ.setdefault('DJANGO_SETTINGS_MODULE', "edd.settings")
        print('\tSettings module:\t%s' % settings_module)
    else:
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

    ################################################################################################
    # Verify that URL's start with HTTP*S* for non-local use. Don't allow mistaken config to expose
    # access credentials! Local testing requires insecure http, so this mistake is easy to make!
    ################################################################################################
    if not is_url_secure(EDD_URL):
        print('EDD_BASE_URL %s is insecure. You must use HTTPS to maintain security for non-local URL\'s')
        exit(0)

    if not is_url_secure(ICE_URL):
        print('ICE_BASE_URL %s is insecure. You must use HTTPS to maintain security for non-local '
              'URL\'s')
        exit(0)

    ################################################################################################
    # Read in part numbers from the CSV
    ################################################################################################
    print('Reading CSV file...')
    print(OUTPUT_SEPARATOR)
    csv_summary = parse_csv(args.file_name)
    csv_part_number_count = len(csv_summary.line_creation_inputs)

    print('Done reading file %s:' % os.path.basename(args.file_name))
    print('\tTotal rows in file: %d' % csv_summary.total_rows)
    print('\tLine creation inputs read: %d ' % csv_part_number_count)

    if not csv_part_number_count:
        print('Aborting line creation. No lines to create!')
        exit(0)

    if not args.s:
        result = raw_input('Do these totals make sense [Y/n]: ').upper()
        if ('Y' != result) and ('YES' != result):
            print('Aborting line creation. Please verify that your CSV file has the correct content '
                  'before proceeding with this tool.')
            exit(0)


    ################################################################################################
    # Gather user credentials and verify by logging into EDD, then
    # looping until successful login
    ################################################################################################

    print('')
    print(OUTPUT_SEPARATOR)
    print('Authenticating...')
    print(OUTPUT_SEPARATOR)

    attempted_login= False
    edd_session_auth = None

    while not edd_session_auth:

        # gather user credentials from command line arguments and/or user prompt
        if args.u and not attempted_login:
            username = args.u
        else:
            if not attempted_login:
                username = getpass.getuser()
            username_input = raw_input('Username [%s]: '% username)
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
            edd_session_auth = EddSessionAuth.login(base_url=EDD_URL, username=username,
                                                    password=password)
            print('success!')
        except ConnectionError as e:
            # if no connection could be made, stop looping uselessly
            raise e

        except Exception as e:
            logger.exception('Error logging into EDD')


    with edd_session_auth:

        edd = EddApi(base_url=EDD_URL, session_auth=edd_session_auth)
        edd.set_write_enabled(True)

        ############################################################################################
        # Query user for the study to create lines in, verifying that the study exists / the user
        # has access to it
        ############################################################################################
        study = None

        study_number = str(args.study) if args.study else None
        STUDY_PROMPT = 'Which EDD study number should lines be created in? '
        if not study_number:
            study_number = raw_input(STUDY_PROMPT)

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

                study_number = raw_input(STUDY_PROMPT)
            else:
                print('Success!')

        if study:
            print('Found study %d in EDD, named "%s "' % (study_number, study.name))


        ############################################################################################
        # Loop over part numbers in the spreadsheet, looking each one up in ICE to get its UUID (
        # the only identifier currently stored in EDD)
        ############################################################################################
        ice_part_numbers = [input.local_ice_part_number for input in csv_summary.line_creation_inputs]
        ice_parts = get_ice_parts(ICE_URL, username, password, ice_part_numbers,
                                  print_search_comparison=PRINT_FOUND_ICE_PARTS)



        ice_part_count = len(ice_parts)

        if not ice_part_count:
            print('No ICE parts were found for the part numbers listed in the CSV file. Aborting '
                  'line creation since there\'s insufficient input to create any lines in EDD.')
            exit(0)

        if ice_part_count < csv_part_number_count:
            print("Not all parts listed in the CSV file were found in ICE (see part numbers "
                  "above). Do you want to create EDD lines for the parts that were found? You'll "
                  "have to create the rest manually, using output above as a reference.")
            result = raw_input("Create EDD lines for %(found)d of %(total)d parts? (Y/n)").upper()
            if not ('Y' == result) or ('YES' == result):
                print('Aborting line creation.')
                exit(0)



        print('')
        print(OUTPUT_SEPARATOR)
        print('Searching for pre-existing strains in EDD...')
        print(OUTPUT_SEPARATOR)

        ############################################################################################
        # search EDD for existing strains using UUID's queried from ICE
        ############################################################################################
        existing_edd_strains = collections.OrderedDict()
        non_existent_edd_strains = []
        strains_by_part_number = collections.OrderedDict()  # keep same order as spreadsheet to
                                                            # allow resume following an unanticipated
                                                            # error

        find_existing_strains(edd, ice_parts, existing_edd_strains, strains_by_part_number,
                              non_existent_edd_strains)

        if PRINT_FOUND_EDD_STRAINS:
            print_edd_strains(existing_edd_strains, non_existent_edd_strains)


        # If some strains were missing in EDD, confirm with user, and then create them
        strains_created = create_missing_strains(edd, non_existent_edd_strains,
                                               strains_by_part_number, ice_part_count)
        if not strains_created:
            exit(1)


        ############################################################################################
        # Create new lines!
        ############################################################################################

        print('')
        print(OUTPUT_SEPARATOR)
        print('Creating new lines in EDD study %d...' % study_number)
        print(OUTPUT_SEPARATOR)

        create_lines(study_number, csv_summary, strains_by_part_number)


except Exception as e:
    logger.exception('Error')