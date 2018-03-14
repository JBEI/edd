# coding: utf8
"""
A sample Python 2 script that demonstrates several anticipated read-only uses of EDD's REST
API. The general process followed by this script is:

1) Query EDD and/or ICE for contextual data based on parameters used to narrow the bounds of the
   search.
2) Query EDD for a subset of studies of interest
3) Drill down into study internals, caching contextual data as needed to help further
    narrow and/or interpret search results. Clients would likely need to create additional
    caches -- this sample focuses just on querying / cacheing the most relevant and
    easily-cacheable EDD data.
4) If requested, write results to CSV file in a similar format to that produced by EDD's file
   export feature.

One notable omission in this example is querying for line/assay metadata that define culture
conditions.  If the first version is helpful, further examples of those queries can be added
here later as the API improves.

For a simpler example of accessing EDD's REST API:
"""

import argparse
import arrow
import collections
import csv
import imp
import logging

from logging.config import dictConfig
from future.utils import viewitems, viewvalues
from os import path
from requests import HTTPError, codes
from six.moves.urllib.parse import urlparse

from jbei.rest.auth import EddSessionAuth, IceSessionAuth
from jbei.rest.clients.edd.api import EddApi
from jbei.rest.clients.ice.api import IceApi
from jbei.rest.clients.ice.api import Strain as IceStrain
from jbei.rest.clients.ice.utils import build_entry_ui_url
from jbei.utils import session_login, UserInputTimer
from . import settings

dictConfig(settings.LOGGING)

logger = logging.getLogger(__name__)

_PAGE_RECEIVED_MSG = ('Received page %(page)d with %(count)d %(class)s (total %(total)d '
                      'found)')

_EDD_URL_ARG = 'edd_url'
_ICE_URL_ARG = 'ice_url'
_USERNAME_ARG = 'username'
_PASSWORD_ARG = 'password'
_IGNORE_ICE_ERRORS_ARG = 'ignore_ice_errors'
_OUTPUT_FILE_ARG = 'output_file'
_OVERWRITE_ARG = 'overwrite'
_ALLOW_CO_CULTURE_ARG = 'allow_co_culture'
_TARGET_ICE_INSTANCE_ARG = 'target_ice_url'
_STUDY_SLUG_ARG = 'study_slug'
_STUDY_ID_ARG = 'study_id'
_ICE_PARTS_ARG = 'ice_parts'
_PROTOCOLS_ARG = 'protocols'
_MTYPES_ARG = 'mtypes'
_UNITS_ARG = 'units'
_MOD_SINCE_ARG = 'mod_since'

_ICE_PARTS_CONFIG = 'ICE_PART_IDS'


class LogIndentAdapter(logging.LoggerAdapter):
    """
    A simple adapter that allows us to set the indent level for log output to help improve
    readability.
    """

    def __init__(self, logger, extra):
        super(LogIndentAdapter, self).__init__(logger, extra)
        self.indent_level = 0

    def process(self, msg, kwargs):
        return '{i}{m}'.format(i='...' * self.indent_level, m=msg), kwargs


logger = LogIndentAdapter(logger, {})


class SearchParameters:
    """
    Captures parameters read from settings file that are used to narrow the bounds of EDD searches
    for this sample program.  While not every possible query can be implemented in a simple example
    program, this script should hit many of the most highly-anticipated filtering options.

    Whenever possible, EDD clients are highly encouraged to filter results for better
    performance / earlier detection of some common errors.
    """
    def __init__(self):
        self.study_slug = None  # URL portion that uniquely identifies the study of interest

        self.study_id = None  # UUID or integer pk used to specify a single study of interest

        # if no study is specified, used to search & process only studies updated after the
        # specified date. Note that at the time of writing, EDD's stored study modification date
        # is misleading and only applies to the study name/description/contact fields.
        self.studies_modified_since = None

        # optional filter parameters...if configured, we'll filter queries to only the ones that
        #  contain one or more of these values
        self.ice_part_ids = []

        # name regular expression searches to filter results by protocols, measurement types, etc.
        # of interest.  Note that for production use, it's better to identify UUID's and do direct
        # lookup rather than name-based searches, but for example purposes this are simplest &
        # most durable across EDD instances
        self.protocol_name_regexes = []
        self.measurement_type_name_regexes = []
        self.unit_name_regexes = []

    def filter_by_studies(self):
        return self.study_slug or self.study_id or self.studies_modified_since

    def filter_by_strains(self):
        return bool(self.ice_part_ids)

    def filter_by_measurement_types(self):
        return bool(self.measurement_type_name_regexes)

    def filter_by_protocols(self):
        return bool(self.protocol_name_regexes)

    def filter_by_units(self):
        return bool(self.unit_name_regexes)

    def has_filters(self):
        return (self.filter_by_studies() or self.filter_by_strains() or
                self.filter_by_measurement_types() or
                self.filter_by_protocols() or self.filter_by_units())

    def print_summary(self):
        logger.info('Search parameters:')
        logger.indent_level += 1
        if self.study_slug:
            logger.info('Study slug:\t%s' % self.study_slug)
        elif self.study_id:
            logger.info('Study id:\t%s' % self.study_id)
        elif self.studies_modified_since:
            logger.info('Studies mod after:\t%s' % self.studies_modified_since)

        if self.ice_part_ids:
            logger.info('ICE part ids: %s' % self.ice_part_ids)

        if self.protocol_name_regexes:
            logger.info('Protocols: %s' % self.protocol_name_regexes)

        if self.measurement_type_name_regexes:
            logger.info('Measurement types: %s' % self.measurement_type_name_regexes)

        if self.unit_name_regexes:
            logger.info('Units: %s' % self.unit_name_regexes)

        logger.indent_level -= 1


def extract_id_from_ui_url(ice_part_ui_url):
    """
    Extracts an ICE identifier for a part from a valid ICE user interface URL.  Note that ICE's
    user interface accepts multiple different identifiers, so prior knowledge is needed to
    distinguish between the identifiers accepted.
    :param ice_part_ui_url:
    :return: the identifier
    """
    url_parts = urlparse(ice_part_ui_url)
    url_path = url_parts.path
    elts = url_path.split('/')
    if elts[-1]:
        return elts[-1]
    elif len(elts) > 1:
        return elts[-2]
    return None


class ContextCache:
    """
    A cache of contextual query results from EDD/ICE that should be static on a short time scale.

    These queries should be re-executed with client each program run, but provided the run length
    isn't too long, the results can be safely assumed to be static during a single execution. In
    this example, they're useful for things like interpreting and/or filtering out only the
    measurements and strains of interest for a particular client application.

    Depending on use, it may or may not be appropriate for clients to cache all of this
    information, but this example should be a good starting point for future work.
    """
    def __init__(self):
        self.TARGETED_PROTEOMICS_PK = None
        self.protocols_by_pk = {}

        # strain lookup tables. Part ID is a locally-unique identifier used by ICE, and by JBEI/ABF
        # researchers, due to its brevity. EDD exposes minimal strain data in its API,
        # leaving strain tracking to ICE.
        self.ice_entries_by_url = {}  # initially empty if not filtering by strain

        # Measurement type lookup tables
        self.meas_types_by_pk = {}
        self.measurement_types_by_name = {}
        self.units_by_pk = {}

        ################################################################
        # ICE part access problems.
        ################################################################
        # These are most likely due to user error at some stage of the process, but tend to
        # manifest during part lookup in ICE.

        self.missing_part_ids = []  # IDs for parts that ICE informed us are not present

        # ID's for ICE parts where we encountered permission problems during lookup. This happens!!
        self.ice_permission_error_part_ids = []

        # User-provided part numbers for ICE parts where the requested part wasn't a strain as
        # required by EDD.  TODO: recent changes have relaxed this restriction, e.g. for novel
        # enzymes.
        self.non_strain_ice_parts = []

        # measurement type pks encountered during Measurement inspection that need to be looked
        # up afterward
        self.deferred_lookup_measurement_type_pks = set()
        self.deferred_lookup_strain_ids = set()
        self.observed_edd_strain_ids = set()

    def add_measurement_type(self, measurement_type, indent_level=0):
        logger.indent_level += 1
        logger.debug('Caching MeasurementType "%s"' % measurement_type.type_name)
        logger.indent_level -= 1
        self.meas_types_by_pk[measurement_type.pk] = measurement_type
        self.measurement_types_by_name[measurement_type.type_name] = measurement_type

    def add_protocol(self, protocol):
        logger.indent_level += 1
        logger.debug('Caching Protocol "%s"' % protocol.name)
        logger.indent_level -= 1

        self.protocols_by_pk[protocol.pk] = protocol

    def has_measurement_types(self):
        return bool(self.meas_types_by_pk)

    def add_units(self, units):
        logger.indent_level += 1
        logger.debug('Caching MeasurementUnits "%s"' % units.unit_name)
        logger.indent_level -= 1

        self.units_by_pk[units.pk] = units

    def add_observed_strain(self, strain_url):
        id = extract_id_from_ui_url(strain_url)

        self.observed_edd_strain_ids.add(id)

        # if we're filtering by strains and we've already seen this one, we're done
        if strain_url in self.ice_entries_by_url:
            return True

        # otherwise, cache the id and look up the strain in ICE later
        self.deferred_lookup_strain_ids.add(id)
        return False


class ResultCache(object):
    """
    A simple cache of results read from EDD's REST API. As result objects are read from incoming
    JSON and fed into this cache, a graph of related STUDY objects is constructed, overwriting
    pk-based fields received from the JSON.  Note that related context data,
    whose lookup may be deferred, isn't resolved during the caching process (e.g. assay
    protocols, Measurements' MeasurementTypes, MeasurementUnits, etc).

    To facilitate testing, the cache also compares query results against the search parameters
    for consistency and raises an error if any REST query returns results that are inconsistent
    with previous observations.
    """
    def __init__(self, global_search_parameters, context_cache):
        self.studies_by_pk = {}
        self.lines_by_pk = {}

        self.assays_by_pk = {}
        self.measurements_by_pk = {}

        self.observed_assay_protocol_pks = set()

        self.values_observed = 0

        self.global_search_parameters = global_search_parameters
        self.context_cache = context_cache

    def process_studies(self, studies):
        self._cache_by_pk(studies, self.studies_by_pk)

    def process_lines(self, study_pk, lines):
        study = self.studies_by_pk[study_pk]

        for line in lines:
            line.study = study

            if not hasattr(study, 'lines'):
                study.lines = [line]
            else:
                study.lines.append(line)

        # cache by pk to allow lookup from assay & replicate lookup
        self._cache_by_pk(lines, self.lines_by_pk)

    def process_assays(self, assays):
        self._cache_by_pk(assays, self.assays_by_pk)

        for assay in assays:

            line = self.lines_by_pk[assay.line]
            assay.line = line

            self.observed_assay_protocol_pks.add(assay.protocol)

            if (assay.protocol not in self.context_cache.protocols_by_pk and
                    self.global_search_parameters.filter_by_protocols()):
                raise RuntimeError('Assay search returned an assay with protocol %d, which was '
                                   'not included in results from initial protocol search.' %
                                   assay.protocol)

            if not hasattr(line, 'assays'):
                line.assays = [assay]
            else:
                line.assays.append(assay)

    def process_measurements(self, measurements):
        self._cache_by_pk(measurements, self.measurements_by_pk)

        for measurement in measurements:
            assay = self.assays_by_pk[measurement.assay]
            measurement.assay = assay

            if not hasattr(assay, 'measurements'):
                assay.measurements = [measurement]
            else:
                assay.measurements.append(measurement)

            if (self.global_search_parameters.filter_by_measurement_types() and
                    measurement.measurement_type not in self.context_cache.meas_types_by_pk):
                    raise RuntimeError('Measurement search returned a measurement with type %d, '
                                       'which was not included in results from initial '
                                       'measurement type filtering.' % measurement.measurement_type)

            if (self.global_search_parameters.filter_by_units() and measurement.y_units not in
                self.context_cache.units_by_pk):
                raise RuntimeError('Measurement search returned a measurement with y_units %d, '
                                   'which was not included in results from initial '
                                   'MeasurementUnit filtering.' % measurement.y_units)

    def process_values(self, values):

        for value in values:
            measurement = self.measurements_by_pk[value.measurement]

            if not hasattr(measurement, 'values'):
                measurement.values = [value]
            else:
                measurement.values.append(value)

        self.values_observed += len(values)

    @staticmethod
    def _cache_by_pk(input, dest_dict):
        if isinstance(input, collections.Sequence):
            for val in input:
                dest_dict[val.pk] = val
            return
        dest_dict[input.pk] = input

    def print_summary(self):
        logger.info('Query results:')
        logger.indent_level += 1

        logger.info('Studies:\t%d' % len(self.studies_by_pk))
        logger.info('Lines:\t\t%d' % len(self.lines_by_pk))
        logger.info('Assays:\t%d' % len(self.assays_by_pk))
        logger.info('Meas:\t\t%d' % len(self.measurements_by_pk))
        logger.info('Values:\t%d' % self.values_observed)
        logger.info('Protocols:\t%d' % len(self.observed_assay_protocol_pks))
        logger.info('M. Types:\t%d' % len(self.context_cache.meas_types_by_pk))
        logger.info('M. Units:\t%d' % len(self.context_cache.units_by_pk))
        logger.info('Strains (EDD): %d' % len(
            self.context_cache.observed_edd_strain_ids))
        logger.info('ICE Entries:\t%d' % len(self.context_cache.ice_entries_by_url))

        logger.indent_level -= 1


def main():

    ############################################################################################
    # Configure command line parameters. In this sample, username/password can be provided in a
    # local_settings.py file, overridden at the command line, or the command line user is prompted
    # if they aren't found in any other source.
    ############################################################################################
    parser = argparse.ArgumentParser(description='A sample script that demonstrates anticipated '
                                                 'use of EDD REST API to simplify integration '
                                                 'work for client applications.')
    parser.add_argument(('--%s' % _EDD_URL_ARG), help='the URL to use in accessing EDD'),
    parser.add_argument(('--%s' % _ICE_URL_ARG), help='the URL to use in accessing ICE'),
    parser.add_argument(('--%s' % _USERNAME_ARG), '-u',
                        help='The username used to authenticate with both EDD & ICE '
                             'APIs. If provided, overrides username in the '
                             'settings file. If not provided, a user prompt will appear.')
    parser.add_argument(('--%s' % _PASSWORD_ARG), '-p',
                        help='The password used to authenticate with both EDD & ICE APIs. If '
                             'provided, overrides the password provided in the settings file.  '
                             'If not provided, a user prompt will appear.')
    parser.add_argument('--settings', '-s',
                        help='The path to a search-specific Python file containing settings for '
                             'this script. If not provided, the script will search for a file '
                             'named "sample_query_settings.py" in the current working directory.'
                             'Note that this is distinct from the more general "local.py" used '
                             'to configure general settings shared by multiple scripts.')
    parser.add_argument('--%s' % _STUDY_SLUG_ARG,
                        help='The URL portion, or "slug" that uniquely identifies this study '
                             'within the EDD deployment. Overrides "%s" if both are present'
                             % _STUDY_ID_ARG)
    parser.add_argument('--%s' % _STUDY_ID_ARG, '-S',
                        help='The integer primary key or UUID of the study whose data should be '
                             'queried.')
    parser.add_argument('--%s' % _ICE_PARTS_ARG, '-i', nargs='*',
                        help='The integer primary key or UUID of the study whose data should be '
                             'queried.')
    parser.add_argument('--%s' % _PROTOCOLS_ARG, '-P', nargs='*',
                        help='One or more regular expressions for Protocol names to filter study '
                             'data by.')
    parser.add_argument('--%s' % _MTYPES_ARG, '-m', nargs='*',
                        help='One ore more regular expressions for measurement types to filter '
                             'data by')
    parser.add_argument('--%s' % _UNITS_ARG, '-U', nargs='*',
                        help='One or more regular expressions for measurement units to filter '
                             'results by.')
    parser.add_argument('--%s' % _MOD_SINCE_ARG, '-M',
                        help='The modification date and time to filter studies by, '
                             'e.g. "2017-10-26:04:54:00:US/Pacific".  If provided, '
                             'this sample script will search for all studies modified on or after '
                             'the provided timestamp.  This parameter is ignored if the %s '
                             'parameter is provided.' % _STUDY_ID_ARG)
    parser.add_argument(('--%s' % _OUTPUT_FILE_ARG), '-o',
                        help="The optional path to an output file where search results will be "
                             "written using a CSV format similar to EDD's export files")
    parser.add_argument(('--%s' % _ALLOW_CO_CULTURE_ARG), '-a', action='store_true',
                        help='A flag that indicates that this sample program should allow for '
                             'co-culture of multiple strains within the same EDD Line.  If this '
                             'flag is not set and the script is configured to filter lines by '
                             'strains, results containing any strain not specified in the filter '
                             'options are treated as an error and will cause the script to abort '
                             'early'),
    parser.add_argument(('--%s' % _OVERWRITE_ARG), '-O', action='store_true',
                        help='If writing an output file and the file already exists, overwrite it '
                             'without a confirmation prompt.')
    parser.add_argument('--%s' % _IGNORE_ICE_ERRORS_ARG, '-I', action='store_true',
                        help='A flag that causes any ICE-related error to result in '
                             'skipping all future communication attempts with ICE. This allows '
                             'the script to extract useful information from EDD even if ICE is '
                             'down and some or all related strain information stored in ICE is '
                             'inaccessible (e.g. during off-site testing of this script).')
    parser.add_argument(('--%s' % _TARGET_ICE_INSTANCE_ARG), '-t',
                        help='A testing workaround for URL mismatches between the URL used by '
                             'this script to access ICE and the ICE strain URLs published by '
                             'EDD.  Use this parameter to provide the base URL of the ICE '
                             'instance referenced by EDD strains when it doesnt match '
                             'the base URL of ICE this script connects to.'),

    args = parser.parse_args()
    user_input = UserInputTimer()

    ############################################################################################
    # Parse settings for the EDD / ICE search(es)
    ############################################################################################
    search_params = parse_search_settings(args)

    if not search_params:
        return 0

    search_params.print_summary()

    output_file = getattr(args, _OUTPUT_FILE_ARG, None)
    overwrite_output_file = getattr(args, _OVERWRITE_ARG, False)
    if output_file and path.exists(output_file) and not overwrite_output_file:
        result = user_input.user_input('Output file already exists at %s. Overwrite? (Y/n):' %
                                       path.abspath(output_file)).upper()
        if result not in ('Y', 'YES'):
            print('Aborting REST query process.')
            return 0
        overwrite_output_file = True

    if not output_file:
        logger.debug('Skipping output file write...no value provided for %s param' %
                     _OUTPUT_FILE_ARG)

    ###############################################################################################
    # Authenticate with EDD and ICE
    ###############################################################################################
    edd, ice = authenticate_with_apis(args, user_input)

    ###############################################################################################
    # Configure search and execute initial context queries
    ###############################################################################################
    ignore_ice_errors = getattr(args, _IGNORE_ICE_ERRORS_ARG, _IGNORE_ICE_ERRORS_DEFAULT)
    target_ice_instance = getattr(args, _TARGET_ICE_INSTANCE_ARG, settings.ICE_URL)
    sample = SampleQuery(search_params, edd, ice, ignore_ice_errors, target_ice_instance)
    success = sample.query_initial_context()

    # return early if context metadata queries failed due to data entry error(s) somewhere
    # in the chain.  For example, frequent data entry errors for ICE part numbers become visible
    # only after querying ICE for part IDs)
    if not success:
        logger.error('An error occurred in querying EDD FOR context data.  Aborting.')
        return 1

    success = sample.run_sample_queries()
    if not success:
        return 0

    ###############################################################################################
    # Search EDD for any additional context encountered during study inspection that
    # wasn't found during initial context queries. Deferring queries to the end should be faster
    # since it will take fewer requests to query in bulk.
    ###############################################################################################
    success = sample.do_deferred_context_queries(edd)

    if not success:
        return 1

    sample.print_summary()

    # TODO: client code would likely do context-specific processing here after extracting relevant
    # data from EDD
    if output_file:
        logger.info('Writing results to file at ' + path.abspath(output_file))
        sample.write_output_file(args.output_file, overwrite_output_file)


def parse_search_settings(args):
    """
    Loads search parameters for this script from a custom settings file.  If the path is
    provided via the command line, settings are read from that path.  Otherwise a default path
    is inspected.
    """

    settings_file = getattr(args, 'settings', None)
    if settings_file:
        if not path.isfile(settings_file):
            print("""Settings file "%s" doesn't not exist or isn't a file.""" % settings_file)
            return None
    else:
        default_file = './sample_query_settings.py'
        if path.isfile(default_file):
            print('Found a settings file at the default path %s' % path.abspath(default_file))
            settings_file = default_file

    global_search_params = SearchParameters()
    if settings_file:
        search_settings = imp.load_source('jbei.edd.rest.scripts.sample_query_settings',
                                          settings_file)

        _STUDY_SLUG_SETTING = 'STUDY_SLUG'
        _STUDY_ID_SETTING = 'STUDY_ID'

        global_search_params.study_slug = getattr(search_settings, 'STUDY_SLUG', None)

        if global_search_params.study_slug:
            if hasattr(search_settings, _STUDY_ID_SETTING):
                logger.warning('Ignored %(id)s settings, which was overridden by %(slug)s' % {
                    'id': _STUDY_ID_SETTING,
                    'slug': _STUDY_SLUG_SETTING
                })
        else:
            global_search_params.study_id = getattr(search_settings, _STUDY_ID_SETTING, None)

        global_search_params.studies_modified_since = getattr(
            search_settings, 'STUDIES_MODIFIED_SINCE', None)
        global_search_params.measurement_type_name_regexes = getattr(
            search_settings, 'MEASUREMENT_NAME_REGEXES', [])
        global_search_params.ice_part_ids = getattr(search_settings, _ICE_PARTS_CONFIG, [])
        global_search_params.protocol_name_regexes = getattr(search_settings,
                                                             'PROTOCOL_NAME_REGEXES',[])
        global_search_params.measurement_type_name_regexes = getattr(
            search_settings, 'MEASUREMENT_TYPE_NAME_REGEXES', [])
        global_search_params.unit_name_regexes = getattr(search_settings, 'UNIT_NAME_REGEXES', [])

    # read command line args, overriding any in script-specific config file (if present)
    if hasattr(args, _STUDY_SLUG_ARG):
        global_search_params.study_slug = args.study_slug

        if args.study_slug and getattr(args, _STUDY_ID_ARG, None):
            logger.warning('Ignoring %(id)s argument, which is overridden by %(slug)s' % {
                                'id': _STUDY_ID_ARG,
                                'slug': _STUDY_SLUG_ARG, })

    elif hasattr(args, _STUDY_ID_ARG):
        global_search_params.study_id = args.study

    if getattr(args, _MOD_SINCE_ARG):
        global_search_params.studies_modified_since = arrow.get(
            getattr(args, _MOD_SINCE_ARG), ['YYYY-MM-DD:HH:mm:ss:ZZZ'])

    if getattr(args, _ICE_PARTS_ARG):
        global_search_params.ice_part_ids = getattr(args, _ICE_PARTS_ARG, [])

    if getattr(args, _PROTOCOLS_ARG):
        global_search_params.protocol_name_regexes = getattr(args, _PROTOCOLS_ARG, [])

    if hasattr(args, _MTYPES_ARG):
        global_search_params.measurement_type_name_regexes = getattr(args, _MTYPES_ARG, [])

    if hasattr(args, _UNITS_ARG):
        global_search_params.unit_name_regexes = getattr(args, _UNITS_ARG, [])

    if not global_search_params.has_filters():
        logger.info('No search-narrowing parameters were found in the settings file. At least '
              'one filter must be applied to limit the expense of querying EDD')
        return None

    return global_search_params


_IGNORE_ICE_ERRORS_DEFAULT = False


def authenticate_with_apis(args, user_input):
    # if not overridden by command line arguments, look in settings for EDD/ICE config
    # and credentials. Only a limit number of settings from file are supported for override via
    # the command line.
    # Note assumption that credentials are the same for both EDD & ICE, which holds true for
    # JBEI/ABF, but maybe not others
    edd_url = getattr(args, _EDD_URL_ARG, None)
    if (not edd_url) and hasattr(settings, 'EDD_URL'):
        edd_url = settings.EDD_URL
    ice_url = getattr(args, _ICE_URL_ARG, None)
    if (not ice_url) and hasattr(settings, 'ICE_URL'):
        ice_url = settings.ICE_URL
    password = getattr(args, _PASSWORD_ARG, None)
    if (not password) and hasattr(settings, 'EDD_PASSWORD'):
        password = settings.EDD_PASSWORD
    username = getattr(args, _USERNAME_ARG, None)
    if (not username) and hasattr(settings, 'EDD_USERNAME'):
        username = settings.EDD_USERNAME

    ######################################################################################
    # If not already provided, prompt terminal user for credentials and log into EDD
    ######################################################################################
    logger.info('Logging into EDD at %s...' % edd_url)
    edd_login_details = session_login(EddSessionAuth, edd_url, 'EDD',
                                      username_arg=username,
                                      password_arg=password,
                                      user_input=user_input,
                                      print_result=False,
                                      timeout=settings.EDD_REQUEST_TIMEOUT)

    edd_session_auth = edd_login_details.session_auth

    # instantiate and configure an EddApi client instance
    edd = EddApi(base_url=edd_url, auth=edd_session_auth,
                 result_limit=settings.EDD_PAGE_SIZE)
    edd.timeout = settings.EDD_REQUEST_TIMEOUT

    ##############################
    # Log into ICE.
    # Note this only works for LDAP users who have the same credentials in both EDD and ICE.
    # Also note that logging into ICE early helps prevent access problems from surfacing later when
    # trying to query strain data
    ##############################
    ice = None
    try:
        logger.info('Logging into ICE at %s...' % ice_url)
        login_application = 'ICE'
        ice_login_details = session_login(IceSessionAuth, ice_url, login_application,
                                          username_arg=edd_login_details.username,
                                          password_arg=edd_login_details.password,
                                          print_result=False,
                                          user_input=user_input,
                                          timeout=settings.ICE_REQUEST_TIMEOUT,
                                          verify_ssl_cert=settings.VERIFY_ICE_CERT)

        ice_session_auth = ice_login_details.session_auth
        ice = IceApi(ice_session_auth, ice_url, result_limit=settings.ICE_PAGE_SIZE,
                     verify_ssl_cert=settings.VERIFY_ICE_CERT)
        ice.timeout = settings.ICE_REQUEST_TIMEOUT

        # remove password from memory as soon as possible
        ice_login_details.password = None
    except Exception as e:
        if not getattr(args, _IGNORE_ICE_ERRORS_ARG, _IGNORE_ICE_ERRORS_DEFAULT):
            logger.exception('Error logging into ICE. All further ICE communication attempts will '
                             'be skipped.')
        else:
            raise e
    finally:
        # remove passwords from memory as soon as possible
        edd_login_details.password = None

    return edd, ice


class SampleQuery:
    def __init__(self, global_search_params, edd, ice, ignore_ice_errors, target_ice_instance):
        self.edd = edd
        self.ice = ice
        self.ignore_ice_errors = ignore_ice_errors
        self.global_search_params = global_search_params
        self.context_cache = ContextCache()
        self.result_cache = ResultCache(global_search_params, self.context_cache)
        self.log_page_receipt = True  # helpful for viewing progress as queries progress
        self.target_ice_instance = target_ice_instance

    def query_initial_context(self):
        """
        Queries EDD, and possibly ICE, for contextual data (e.g. unique identifiers) that are
        important for filtering and interpreting study results.

        Note that because they're user-maintained, contextual data are likely to be different
        across EDD / ICE instances. We should take care to consider how often contextual
        data are likely to change by comparison with our program run.  Probably safe in many cases
        to query once per run to pick up infrequent changes, then assume the data are static during
        execution time.

        :param edd: the EddApi instance to use in querying EDD for contextual data
        :return: a Context instance that contains results from the API queries, or None if one or more
        predicted errors occurred during attempts to query ICE for part numbers
        """

        ###########################################################################################
        # Get ICE strains of interest if there are few enough to warrant up-front caching. Note
        # that we query ICE first, since user error is common in part ID lookup. Best to
        # identify user error as early as possible. EDD doesn't store ICE part ID's, so initial
        # lookup in ICE is required first.
        ###########################################################################################
        # TODO: restore following implementation of strain-related searches to the EDD API
        if self.global_search_params.filter_by_strains():
            if not (self.search_ice_strains(self.global_search_params.ice_part_ids)):
                return False
        else:
            logger.info('Deferring ICE part lookup until a relevant subset of ICE parts are '
                        'defined via other search parameters.')

        ######################################################################################
        # If anticipated size is reasonable, query for / cache  the EDD contextual data of
        # interest for our application (may be different for each client application). Where
        # possible, this should help identify errors early and also help to significantly narrow
        # the number of results processed later on.
        ######################################################################################
        logger.info('Querying EDD for initial context (MeasurmentTypes, MeasurementUnits, '
                    'Protocols, '
                    'etc)...')
        logger.indent_level += 1

        ###########################################################################################
        # Get measurement all / sample prep. protocols and measurement units.  There likely won't
        # be very many.
        ###########################################################################################
        if not self._query_protocols():
            return False

        if not self._query_units():
            return False

        ###########################################################################################
        # Get measurement types of interest for our application. EDD currently has thousands of
        # these, do up-front caching only if narrowing results to a few of interest.
        ###########################################################################################
        if self.global_search_params.filter_by_measurement_types():
            self.query_measurement_types()
        else:
            logger.info('Deferring MeasurementType lookup until a relevant subset of '
                        'MeasurementTypes are defined via other search parameters.')

        logger.indent_level -= 1

        logger.info('Done with initial EDD context query')

        return True

    def _query_protocols(self):
        """
        Queries EDD for the sample prep / measurement protocols configured in the system,
        then caches them for subsequent use in interpreting study data. If a subset of protocols
        of interest is identified, only those will be found within EDD, otherwise all protocols
        from the instance will be cached.

        Note that this example may be useful for initial location of a subset of protocols of
        interest
        within an EDD instance, but repeated use will be more efficient if clients use protocol
        primary key or UUID for lookup on subsequent runs.

        :param edd: the EddApi instance to use in performing queries.
        """

        search_params = self.global_search_params
        cache = self.context_cache
        edd = self.edd

        # if filtering by protocol, get only the protocols of interest
        if search_params.filter_by_protocols():
            name_regexes = search_params.protocol_name_regexes
            logger.info('Searching EDD for %d protocols of interest...' % len(name_regexes))
            logger.indent_level += 1
            for name_regex in search_params.protocol_name_regexes:
                self._query_all_result_pages(edd.search_protocols, {
                    'name_regex': name_regex}, cache.add_protocol, 'Protocols')

            logger.indent_level -= 1
            if len(name_regexes) != len(cache.protocols_by_pk):
                logger.error('Number of protocols found (%(found)s) does not match the number '
                             'requested (%(requested)s)' % {
                                'found': len(cache.protocols_by_pk),
                                'requested': len(name_regexes),
                })
                return False
            logger.info('Found all %d requested protocols' % len(name_regexes))

        # otherwise, just cache all the protocols (there shouldn't be very many any time soon)
        else:
            logger.info('Searching EDD for all defined protocols...')
            logger.indent_level += 1
            self._query_all_result_pages(edd.search_protocols, {}, cache.add_protocol, 'Protocols')
            logger.indent_level -= 1
            if not len(cache.protocols_by_pk):
                logger.error('Found zero protocols')
                return False

            logger.info('Done searching EDD for protocols (total found = %d)' % len(
                cache.protocols_by_pk))

        return True

    def _query_units(self):
        """
            Queries EDD for the sample measurement units configured in the system, then
            caches them for subsequent use. If a subset of units of interest is identified, only
            those will be found within EDD, otherwise all units from the instance will be cached.

            Note that this example may be useful for initial location of a subset of units of
            interest within an EDD instance, but repeated use will be more efficient if clients use
            unit primary key or UUID for lookup on subsequent runs.

            :param edd: the EddApi instance to use in performing queries
        """
        search_params = self.global_search_params
        cache = self.context_cache

        # if filtering by units, only get the units of interest
        if search_params.filter_by_units():
            unit_name_regexes = search_params.unit_name_regexes
            logger.info('Searching EDD for %d MeasurementUnits of interest...' % len(
                unit_name_regexes))
            for unit_name_regex in unit_name_regexes:
                self.do_units_query(unit_name_regex=unit_name_regex)

            if len(unit_name_regexes) != len(cache.units_by_pk):
                logger.error('The number of MeasurementUnits found (%(found)d) does not match '
                             'the number requested (%(input)d)' % {
                                'found': len(cache.units_by_pk),
                                'input': len(unit_name_regexes),})
                return False

            logger.info('Found all %d MeasurementUnits' % len(unit_name_regexes))

        # otherwise, just get all the units known to the system.  To start with, there shouldn't be
        # many.
        else:
            logger.info('Searching EDD for all defined MeasurementUnits...')
            self.do_units_query()
            if not cache.units_by_pk:
                logger.error('No MeasurementUnits found in EDD')
                return False
            logger.info('Found %d MeasurementUnits' % len(cache.units_by_pk))

        return True

    def do_units_query(self, unit_name_regex=None):
        """
        A helper method for performing the units query
        """
        cache = self.context_cache
        edd = self.edd

        logger.indent_level += 1
        search_params = {}
        if unit_name_regex:
            search_params = {'unit_name_regex': unit_name_regex}
        self._query_all_result_pages(edd.search_measurement_units, search_params, cache.add_units,
                                     'MeasurementUnits')
        logger.indent_level -= 1

    def _query_all_result_pages(self, search_method, resource_search_params, cache_method,
                                result_desc):
        results_page = search_method(**resource_search_params)

        if not results_page:
            raise ValueError('No %s were found in EDD matching the search parameters' %
                             result_desc)

        page_num = 1
        while results_page:
            if self.log_page_receipt:
                logger.debug(_PAGE_RECEIVED_MSG % {
                    'page': page_num,
                    'count': results_page.current_result_count,
                    'total': results_page.total_result_count,
                    'class': result_desc})

            for result_item in results_page.results:
                cache_method(result_item)

            if results_page.next_page:
                results_page = search_method(query_url=results_page.next_page)
                page_num += 1
            else:
                results_page = None

    def search_ice_strains(self, ice_ids):
        """
        Queries ICE to find parts associated with the requested part IDs to enable subsequent
        EDD line filtering by strain.  Note that several distinct error types are
        expected to occur during this lookup process as a result of user error during data entry
        into ICE/EDD.  Sample error handling code in this method is patterned after the code
        used by EDD during the Experiment Description file processing, and accounts for the
        errors observed to date.
        :param ice_ids: ICE identifiers for the parts of interest.  These may by any of 1)
        locally-unique part numbers (e.g. when provided as search params), 2) local ICE primary
        keys (e.g. as extracted from strain URL's in EDD line queries), or 3) Part UUID's (
        preferred, but only available to code rather than users).
        """
        ice = self.ice
        ignore_ice_errors = self.ignore_ice_errors
        cache = self.context_cache

        # return immediately if earlier ICE login attempt failed & failure was ignored
        if not ice:
            logger.warning('Skipping part ID lookups in ICE due to prior failed login attempt')
            return None

        logger.info('Searching ICE for %(count)d parts of interest%(suffix)s' % {
            'count': len(ice_ids),
            'suffix': ((': [%s]' % ', '.join(ice_ids)) if len(ice_ids) <= 10
                       else '.'),
        })

        for id in ice_ids:
            try:
                entry = ice.get_entry(id)

                if entry:
                    # detect non-strain entries (likely user error at some stage of the process)
                    if not isinstance(entry, IceStrain):
                        cache.non_strain_ice_parts.append(entry)

                    ui_url = build_entry_ui_url(self.target_ice_instance, entry.id)
                    cache.ice_entries_by_url[ui_url] = entry
                else:
                    # aggregate the list of missing parts (likely user error in accessing /
                    # referencing the wrong EDD/ICE instance)
                    cache.missing_part_ids.append(id)

            # catch only HttpErrors, which more likely imply a problem accessing this specific
            # part. Note that ConnectionErrors and similar that are more likely to be systemic
            # aren't caught here and will immediately abort the remaining ICE queries.
            except HTTPError as http_err:

                # aggregate ICE part permission errors, which are currently common enough to
                # warrant aggregating them as a user/administrator convenience
                if http_err.response.status_code == codes.forbidden:
                    cache.ice_permission_error_part_ids.append(id)
                    continue

                # abort search for all other errors, which we have no way of processing
                else:
                    if ignore_ice_errors:
                        logger.exception('Error querying ICE for part %s' % id)
                        return None
                    else:
                        raise http_err

        ice_part_err_abort = False

        # inspect aggregated ICE lookup errors and log a message / abort early if any were detected
        if cache.missing_part_ids:
            logger.error('Unable to locate %(missing)d of %(total)d ICE parts: %(ids)s' % {
                'missing': len(cache.missing_part_ids),
                'total': len(ice_ids),
                'ids': ', '.join(cache.missing_part_ids),
            })
            ice_part_err_abort = True

        if cache.ice_permission_error_part_ids:
            logger.error('Permissions error accessing %(err_count)d of %(total)d ICE parts: '
                         '%(ids)s' %
                         {
                             'err_count': len(cache.ice_permission_error_part_ids),
                             'total': len(ice_ids),
                             'ids': ', '.join(cache.ice_permission_error_part_ids),
                         })
            ice_part_err_abort = True

        if cache.non_strain_ice_parts:
            logger.error('Non-strain ICE entries detected for %(err_count)d of %(total)d '
                         'requested parts: %(ids)s' % {
                             'err_count': len(cache.ice_permission_error_part_ids),
                             'total': len(ice_ids),
                             'ids': ', '.join(cache.ice_permission_error_part_ids)
                         })
            logger.error('At the time of writing, EDD does not support use of non-strain ICE '
                         'entries. See EDD-239 or EDD-543 and required precursor ICE-10.')
            ice_part_err_abort = True

        if ice_part_err_abort and not ignore_ice_errors:
            return False

        return True

    def query_measurement_types(self):
        """
        Queries EDD for measurement types with names that match the requested regular expressions. Note
        that name is used to keep this example simple, but production code should probably use UUID
        to look up measurement types for repetitive use.
        """
        type_name_regexes = self.global_search_params.measurement_type_name_regexes,
        if not type_name_regexes:
            return

        edd = self.edd
        cache = self.context_cache

        logger.info('Searching EDD for %d MeasurementTypes of interest...' %
                    len(type_name_regexes))

        # if requested, search for a subset of measurement types.  There are likely many more
        # defined in EDD than client code will need to reference.

        for name_regex in type_name_regexes:

            types_page = edd.search_measurement_types(type_name_regex=name_regex)

            if not types_page:
                raise ValueError('No result returned for measurement type named "%s"' %
                                 name_regex)

            if types_page.total_result_count != 1:
                raise ValueError('Search was unsuccessful for measurement type named '
                                 '"%(name)s". Expected 1 result but found %(count)d' % {
                                     'name': name_regex,
                                     'count': types_page.total_result_count})

            measurement_type = types_page.results[0]
            cache.add_measurement_type(measurement_type)

        logger.info('Found all %d MeasurementTypes.' % len(type_name_regexes))
        return True

    def run_sample_queries(self):
        if not self.context_cache:
            raise RuntimeError('No context cache is available. Run query_context() first.')

        ######################################################################################
        # Search EDD for studies modified since our last query.
        ######################################################################################
        # Suggest narrowing results first by study modification date to avoid expensive multi-table
        # joins of Study/Line/Strain/Assay/Measurement tables, which are already large after
        # limited use at JBEI, and will only grow over time.
        edd = self.edd
        search_params = self.global_search_params
        study_slug = search_params.study_slug
        study_id = search_params.study_id

        if study_slug:
            logger.info('Searching EDD studies for a study with slug "%s"' % study_slug)
            studies_page = edd.search_studies(slug=study_slug)
            if not studies_page:
                logger.info('No studies were found with slug "%s"' % study_slug)
                return False
            if studies_page.current_result_count != 1:
                logger.info('Expected 1 study with slug "%(slug)s", but found %(count)d' % {
                                'slug': study_slug,
                                'count': studies_page.current_result_count, })
                return False
            study_id = studies_page.results[0].pk

        if study_id:
            logger.info('Querying EDD for data in study %s' % study_id)
            logger.indent_level += 1
            study = edd.get_study(study_id)
            if not study:
                logger.error('No study was found in EDD matching identifier %s' % study_id)
                return False
            self.result_cache.process_studies(study)
            self.query_and_process_study_internals(study)

        else:
            mod_since = search_params.studies_modified_since
            logger.info('Searching EDD for all studies updated after %s..' % mod_since)
            logger.indent_level += 1

            studies_page = edd.search_studies(updated_after=mod_since)

            if not studies_page:
                logger.indent_level -= 1
                logger.info('No studies were found that match the search parameters')
                return False

            # process a single page of studies returned by the most recent query
            while studies_page:
                logger.info('Processing a page of %d studies' % studies_page.current_result_count)
                self.result_cache.process_studies(studies_page.results)

                for study in studies_page.results:
                    self.query_and_process_study_internals(study)

                # get the next page (if any) of studies
                if studies_page.next_page:
                    studies_page = edd.search_studies(query_url=studies_page.next_page)
                else:
                    studies_page = None

        logger.indent_level -= 1
        return True

    def query_and_process_study_internals(self, study):
        """
        Queries EDD for internals of the specified study and leaves a placeholder for client code
        that would be responsible to do processing based on it.
        :param edd: the EddApi instance to use in querying EDD
        :param study: the study whose internals will be accessed by queries
        """

        edd = self.edd
        search_params = self.global_search_params
        cache = self.context_cache

        ###########################################################################################
        # Search for lines associated with this study, optionally filtering only those that use
        # strains of interest.  Since line names are almost always needed in output (e.g. in the
        # sample file produced by this script), we'll always query for them even though we could
        #  potentialy go straight to assays or below.
        ###########################################################################################
        line_pks = self.search_study_lines(study.pk)
        lines_filter_msg = (' for %d filtered lines' % len(line_pks) if
                            search_params.filter_by_strains() else '')

        if not line_pks:
            logger.warning('No lines found matching search criteria')
            return

        # TODO: remove!
        logger.debug('line pks = %s' % line_pks)

        ###########################################################################################
        # Search for assays associated with this study, using discovered lines to filter for
        # strains of interest, if configured.
        ###########################################################################################

        # based on search parameters / discovered context, build up a list of filter parameters for
        # assays within the study.
        assay_search_params = {'active': True,
                               'lines': line_pks}

        # filter by protocols of interest, if configured.
        if search_params.filter_by_protocols():
            protocols_by_pk = cache.protocols_by_pk

            if len(protocols_by_pk) <= 10:
                log_suffix = ': %s ' % ', '.join(map(str, cache.protocols_by_pk))
            else:
                log_suffix = '.'

            logger.info('Searching for assays in study %(study)s%(lines)s that match %(count)d '
                        'protocols of interest%(suffix)s' % {
                            'study': study.pk,
                            'lines': lines_filter_msg,
                            'count': len(protocols_by_pk),
                            'suffix': log_suffix})
            assay_search_params['protocols'] = set(protocols_by_pk)
        else:
            logger.info('Searching for all assays in study %(study_id)s%(lines)s...' % {
                'study_id': study.pk, 'lines': lines_filter_msg})

        logger.indent_level += 1

        # search for / process each page of assays
        assays_page = edd.search_assays(study_id=study.pk, **assay_search_params)

        page_num = 1
        while assays_page:
            logger.debug(_PAGE_RECEIVED_MSG % {'page': page_num,
                                               'count': assays_page.current_result_count,
                                               'total': assays_page.total_result_count,
                                               'class': 'Assays'})
            assay_pks = [assay.pk for assay in assays_page.results]
            self.result_cache.process_assays(assays_page.results)

            logger.indent_level += 1
            self.query_and_process_measurements(study.pk, assay_pks=assay_pks)
            logger.indent_level -= 1

            if assays_page.next_page:
                assays_page = edd.search_assays(query_url=assays_page.next_page)
                page_num += 1
            else:
                assays_page = None

        logger.indent_level -= 1

        if not self.result_cache.assays_by_pk:
            logger.warning('No assays found matching search criteria')

    def search_study_lines(self, study_pk):
        """
        Queries EDD for the lines within a single study.  If configured to filter results by
        strain, only lines for the requested strains will be processed. Otherwise, strains
        associated with each discovered line are cached to simplify future processing.

        :param edd: the EddApi instance to use for queries
        :param study_pk: the primary key of the study whose lines should be processed
        :return: a list of line primary keys if needed to limit query results to only the lines for
            configured strains of interest. Otherwise, an empty list.
        """

        edd = self.edd
        global_search_params = self.global_search_params
        cache = self.context_cache

        # We'll want to either limit our search to lines that include our strains of interest,
        # or else we'll need to look up the strains associated with them so we know how to
        # interpret the data
        line_search_params = {'active': True, 'study_id': study_pk}

        # if search parameters included strains to filter results for, filter the study for lines
        # that measure only the strains of interest (which were already located during initial
        # context queries)
        line_pks = []
        if global_search_params.filter_by_strains():
            logger.info('Searching for lines in study %(study_id)s that match %(strain_count)d '
                        'strains of interest...' % {
                            'study_id': study_pk,
                            'strain_count': len(global_search_params.ice_part_ids)})
            strain_uuids = [strain.uuid for strain in viewvalues(cache.ice_entries_by_url)]
            line_search_params['strains'] = strain_uuids
        else:
            logger.info('Searching for all lines in study %s...' % study_pk)

        lines_page = edd.search_lines(**line_search_params)

        logger.indent_level += 1
        page_num = 1
        while lines_page:
            logger.debug(_PAGE_RECEIVED_MSG % {
                'page': page_num,
                'count': lines_page.current_result_count,
                'total': lines_page.total_result_count,
                'class': 'Lines'})

            self.result_cache.process_lines(study_pk, lines_page.results)

            for line in lines_page.results:
                line_pks.append(line.pk)

                # track strains so we can look them up later if needed
                for strain_url in line.strains:
                    known_strain = cache.add_observed_strain(strain_url)

                    # do a simple consistency check to ensure strain-based filtering is working
                    if (not known_strain) and global_search_params.filter_by_strains():
                        logger.error('Inconsistent strain results!')
                        logger.indent_level += 1
                        logger.error("Line %(line_pk)d has a strain that wasn't found during "
                                     "lookup of ICE parts specified by the %(ice_parts_filter)s "
                                     "configuration data (%(strain_url)s)." % {
                                        'line_pk': line.pk,
                                        'ice_parts_filter': _ICE_PARTS_ARG,
                                        'strain_url': strain_url,
                        })
                        logger.error("This can occur when multiple strains are used in "
                                     "co-culture, in which case you can turn off this check by "
                                     "setting the --%(co_culture_param)s parameter." % {
                                        'co_culture_param': _ALLOW_CO_CULTURE_ARG,
                        })
                        logger.error("For testing purposes only, consider using the --%(param)s "
                                     "parameter to avoid mismatches between EDD's strain URLs "
                                     "and the ICE instance contacted by this script." % {
                                        'param': _TARGET_ICE_INSTANCE_ARG})
                        logger.indent_level -= 1
                        raise RuntimeError('Inconsistent strain results!')

            # get the next page of line results (if any)
            if lines_page.next_page:
                lines_page = edd.search_lines(query_url=lines_page.next_page)
                page_num += 1
            else:
                lines_page = None

        logger.indent_level -= 1

        return line_pks

    def query_and_process_measurements(self, study_pk, assay_pks=[]):
        """
        Queries EDD for measurements within the specified assay, subject to result filtering already
        applied.
        """
        meas_search_params = {'active': True, 'assays': assay_pks}
        if assay_pks:
            meas_search_params['assays'] = assay_pks
            prefix = ('Searching for Measurements in %(assay_count)d assays' % {
                'assay_count': len(assay_pks),
                'study': study_pk
            })
        else:
            prefix = ('Searching for Measurements in study %(study)s' % {
                'study': study_pk
            })

        # if configured, filter query results by measurement type
        search_params = self.global_search_params
        cache = self.context_cache
        if search_params.filter_by_measurement_types():

            # configure pks of measurement types to filter for.  If global search params dictated
            # only searching for a subset of measurement types, they should already be cached
            type_pks = set(cache.meas_types_by_pk)
            meas_search_params['measurement_types'] = type_pks
            prefix = ('%(prefix)s (of %(count)d MeasurementTypes)' % {
                            'prefix': prefix,
                            'count': len(type_pks), })

        if search_params.filter_by_units():
            unit_pks = [pk for pk in cache.units_by_pk]
            meas_search_params['y_units'] = unit_pks
            prefix = ('%(prefix)s (of %(count)d MeasurementUnits)' % {
                'prefix': prefix,
                'count': len(unit_pks), })

        logger.info('%(prefix)s...' % {'prefix': prefix})

        logger.indent_level += 1

        edd = self.edd
        context_cache = self.context_cache
        measurements_page = edd.search_measurements(**meas_search_params)

        if not measurements_page:
            return

        page_num = 1
        while measurements_page:
            logger.debug(_PAGE_RECEIVED_MSG % {
                'page': page_num,
                'count': measurements_page.current_result_count,
                'total': measurements_page.total_result_count,
                'class': 'Measurements'})

            self.result_cache.process_measurements(measurements_page.results)

            for measurement in measurements_page.results:

                # if we didn't search EDD for a subset of interesting MeasurementTypes and cache
                # those early on in the process, query for and cache all the ones discovered in
                # the measurements we're interested in
                mtype = measurement.measurement_type
                if mtype not in cache.meas_types_by_pk:
                    context_cache.deferred_lookup_measurement_type_pks.add(mtype)

                # TODO: client code would likely want to create a context-specific measurement
                # cache at this point

                logger.indent_level += 1
                self.query_and_process_values(study_pk, measurement.pk)
                logger.indent_level -= 1

            if measurements_page.next_page:
                measurements_page = edd.search_measurements(query_url=measurements_page.next_page)
                page_num += 1
            else:
                measurements_page = None

        logger.indent_level -= 1

        if not self.result_cache.measurements_by_pk:
            logger.warning('No measurements found matching search criteria')

    def query_and_process_values(self, study_pk, measurement_pk):
        logger.info('Querying MeasurementValues for Measurement %d' % measurement_pk)
        logger.indent_level += 1

        edd = self.edd
        values_page = edd.search_values(study_id=study_pk, measurements=measurement_pk)

        if not values_page:
            return

        page_num = 1
        while values_page:
            logger.debug(_PAGE_RECEIVED_MSG % {
                'page': page_num,
                'count': values_page.current_result_count,
                'total': values_page.total_result_count,
                'class': 'MeasurementValues'})

            self.result_cache.process_values(values_page.results)

            if values_page.next_page:
                values_page = edd.search_values(query_url=values_page.next_page)
                page_num += 1
            else:
                values_page = None

        logger.indent_level -= 1

        if not self.result_cache.values_observed:
            logger.warning('No MeasurementValues found matching search criteria')

    def do_deferred_context_queries(self, edd):
        unknown_mtype_pks = self.context_cache.deferred_lookup_measurement_type_pks
        if unknown_mtype_pks:
            logger.info(
                'Querying EDD for %d observed MeasurementTypes' % len(unknown_mtype_pks))

            for type_pk in unknown_mtype_pks:
                mtype = edd.get_measurement_type(type_pk)
                if not mtype:
                    logger.error('Unable to find MeasurementType %s' % type_pk)
                    return False
                self.context_cache.add_measurement_type(mtype)

        if self.context_cache.deferred_lookup_strain_ids:
            return self.search_ice_strains(self.context_cache.deferred_lookup_strain_ids)

        return True

    def write_output_file(self, file_path, overwrite_output_file):
        """
        Writes a simple example file needed as input to the Automated Recommendation Tool (ART).
        This example code is written for very small test data sets, and can obviously be improved
        for production use.
        """

        # re-test output file existence, since significant time may have passed following the
        # initial startup-time check
        if path.exists(file_path) and not overwrite_output_file:
            raise RuntimeError('Output file already exists at %s' % path.abspath(file_path))

        # grabbing the first pk
        study_pk = next(iter(self.result_cache.studies_by_pk))

        DEFAULT_COLUMN_HEADERS = ['Line Name', 'Strain', 'Protocol Name', 'Measurement Type',
                                  'Time (h)', 'Value', 'Units']
        mult_studies = len(self.result_cache.studies_by_pk) > 1
        col_headers = DEFAULT_COLUMN_HEADERS if not mult_studies else ['Study'].extend(
            DEFAULT_COLUMN_HEADERS)

        # if we've cached values from more than one study, just pick the first study and output
        # its data to file
        if len(self.result_cache.studies_by_pk) > 1:
            logger.info('Arbitrarily picking study %s to output to file' % study_pk)

        with open(file_path, 'w') as csvfile:
            writer = csv.writer(csvfile)

            writer.writerow(col_headers)

            for study_pk, study in viewitems(self.result_cache.studies_by_pk):

                if not hasattr(study, 'lines'):
                    continue

                for line in study.lines:
                    strains = [self.context_cache.ice_entries_by_url.get(url) for url in
                               line.strains]
                    strain_names = [strain.name if strain else 'Not found' for strain in strains]
                    strains_val = ', '.join(strain_names)

                    if not hasattr(line, 'assays'):
                        continue

                    for assay in line.assays:
                        protocol = self.context_cache.protocols_by_pk[assay.protocol]

                        if not hasattr(assay, 'measurements'):
                            continue

                        for measurement in assay.measurements:
                            meas_type = self.context_cache.meas_types_by_pk[
                                measurement.measurement_type]
                            y_units = self.context_cache.units_by_pk[measurement.y_units]

                            for value in measurement.values:

                                if len(value.x) != len(value.y):
                                    raise NotImplementedError('Processing is not implemented for '
                                                              'unpaired x/y measurement values ('
                                                              'value.pk = %d)' % value.pk)

                                for index, time in enumerate(value.x):

                                    y = value.y[index]

                                    if mult_studies:
                                        writer.writerow([line.study.pk, line.name,
                                                         strains_val, protocol.name,
                                                        meas_type.name, time, y,
                                                         y_units.unit_name])
                                    else:
                                        writer.writerow([line.name, strains_val, protocol.name,
                                                        meas_type.type_name, time, y,
                                                         y_units.unit_name])

    def print_summary(self):
        self.result_cache.print_summary()


if __name__ == '__main__' or __name__ == 'jbei.edd.rest.scripts.sample_rest_queries':
    result = main()
    exit(result)
