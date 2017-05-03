"""
A sample Python 2 script that demonstrates several anticipated uses of EDD's work-in-progress REST
API. The general process followed by this script is:

1) Query EDD and/or ICE for contextual data based on parameters used to narrow the bounds of the
   search.
2) Query EDD for studies modified after a given time (e.g. the time of the last search)
3) Drill down into most of the study internals, caching contextual data as needed to help further
    narrow and/or interpret search results. Clients would likely need to create additional
    caches -- this sample focuses just on querying / cacheing the most relevant and
    easily-cacheable EDD data.

One notable omission in this example is querying for line/assay metadata that define culture
conditions.  If the first version is helpful, further examples of those queries can be added.

This initial version should be treated as pseudocode, since it references several API resources
that haven't been implemented/unit tested yet. As a result of dependence on non-existent code,
this example also can't be tested.  For reference, see the draft EDD REST API interface document
created in late 2016, which this example is based on.

This example also doesn't always carefully consider error handling or logging that should be
included in eventual production-level client code. However, code here is derived from initial
working (or at least, recently working) examples in EDD'S get_usage_statistics.py, create_lines.py,
and maintain_ice_links.py, so should bear a strong resemblance to the final sample code.

The intent is to modify this example during development of EDD's REST API and to develop it into
working code.
"""

import argparse
import logging
from builtins import str

import arrow
from requests import HTTPError, codes

from jbei.rest.auth import EddSessionAuth, IceSessionAuth
from jbei.rest.clients import EddApi, IceApi
from jbei.rest.clients.ice import Strain as IceStrain
from jbei.utils import session_login
from . import settings

logger = logging.getLogger(__name__)


class SearchParameters:
    """
    Captures hard-coded parameters used to narrow the bounds of EDD searches for this sample
    program.

    Where possible, EDD clients are highly encouraged to filter results for better performance /
    earlier detection of some common errors.
    """
    def __init__(self):
        self.last_search_time = arrow.utcnow()

        # optional filter parameters...if configured, we'll filter queries to only the ones that
        #  contain one or more of these values
        self.ice_part_ids = ['ABF_123456']  # sample parts we're interested in
        self.protocol_name_regexes = ['^Metabolomics$']
        self.measurement_type_name_regexes = '^Pyruvate$'
        self.unit_name_regexes = ['^g/L$']

    def filter_by_strains(self):
        return bool(self.ice_part_ids)

    def filter_by_measurement_types(self):
        return bool(self.measurement_type_name_regexes)

    def filter_by_protocols(self):
        return bool(self.protocol_name_regexes)

    def filter_by_units(self):
        return bool(self.unit_name_regexes)


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
        # researchers, due to its brevity. EDD has its own primary key for the subset of ICE
        # strains it's aware of.
        self.edd_strains_by_part_id = {}  # empty if not filtering by strain
        self.ice_entries_by_part_id = {}  # empty if not filtering by strain
        self.edd_strains_by_pk = {}  # cache for EDD strains of interest

        # Measurement type lookup tables
        self.measurement_types_by_pk = {}
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

    def add_measurement_type(self, measurement_type):
        self.measurement_types_by_pk[measurement_type.pk] = measurement_type
        self.measurement_types_by_name[measurement_type.type_name] = measurement_type

    def add_protocol(self, protocol):
        self.protocols_by_pk[protocol.pk] = protocol

    def has_measurement_types(self):
        return bool(self.measurement_types_by_pk)

    def add_units(self, units):
        self.units_by_pk = units

    def add_edd_strain(self, strain, ice_part_id=None):
        self.edd_strains_by_pk[strain.pk] = strain
        if ice_part_id:
            self.edd_strains_by_part_id[ice_part_id] = strain


def main():

    ############################################################################################
    # Configure command line parameters. In this sample, username/password can be provided in a
    # local_settings.py file, overridden at the command line, or the command line user is prompted
    # if they aren't found in any other source.
    ############################################################################################
    parser = argparse.ArgumentParser(description='A sample script that demonstrates anticipated '
                                                 'use of EDD REST API to simplify integration '
                                                 'work for client applications.')
    parser.add_argument('-password', '-p', help='provide a password via the command '
                                                'line (helps with repeated use / testing). If not '
                                                'provided, a user prompt will appear.')
    parser.add_argument('-username', '-u', help='provide username via the command line ('
                                                'helps with repeated use / testing). If not '
                                                'provided, a user prompt will appear.')

    args = parser.parse_args()

    # if not overridden by command line arguments, look in settings for EDD/ICE credentials
    password = args.password
    if hasattr(settings, 'password') and not password:
        password = settings.password
    username = args.username
    if hasattr(settings, 'username') and not username:
        username = settings.username

    ######################################################################################
    # If not already provided, prompt terminal user for credentials and log into EDD
    ######################################################################################
    edd_login_details = session_login(EddSessionAuth, settings.EDD_URL, 'EDD',
                                      username_arg=username,
                                      password_arg=password,
                                      print_result=True,
                                      timeout=settings.EDD_REQUEST_TIMEOUT)

    edd_session_auth = edd_login_details.session_auth

    # instantiate and configure an EddApi client instance
    edd = EddApi(base_url=settings.EDD_URL, auth=edd_session_auth,
                 result_limit=settings.EDD_PAGE_SIZE)
    edd.timeout = settings.EDD_REQUEST_TIMEOUT

    ######################################################################################
    # If anticipated size is reasonable, query for / cache  the EDD contextual data of interest for
    # our application (may be different for each client application). Where possible,
    # this should help identify errors early and also help significantly narrow the number of
    # results processed later on.
    ######################################################################################
    search_params = SearchParameters()
    context_cache = query_context(edd, edd_login_details, search_params)

    # return early if context metadata queries failed due to data entry error(s) somewhere
    # in the chain that become visible when querying ICE for part IDs
    if not context_cache:
        return 1

    ######################################################################################
    # Search EDD for studies modified since our last query.
    ######################################################################################
    # Suggest narrowing results first by study modification date to avoid expensive multi-table
    # joins of Study/Line/Strain/Assay/Measurement tables, which are already large after limited
    # use at JBEI, and will only grow over time.

    # TODO: API resource not fully implemented/tested yet, nor is aggregate study modification
    # date as implied here
    studies_page = edd.search_studies(updated_after=search_params.last_query_time)

    # process a single page of studies returned by the most recent query
    while studies_page and not is_aborted():
        logger.info('Processing a page of %d studies' % studies_page.current_result_count)

        for study in studies_page.results:
            query_and_process_study_internals(edd, study, search_params, context_cache)

        # get the next page (if any) of studies
        if studies_page.next_page and not is_aborted():
            studies_page = edd.search_studies(query_url=studies_page.next_page)
        else:
            studies_page = None

    # TODO: client code would likely do context-specific processing here after extracting relevant
    # data from EDD


def query_context(edd, edd_login_details, search_params):
    """
    Queries EDD, and possibly ICE, for contextual data (e.g. unique identifiers) that are
    important for filtering and interpreting study results.

    Note that because they're user-maintained, contextual data are likely to be different
    across EDD / ICE instances. We should take care to consider how often contextual
    data are likely to change by comparison with our program run.  Probably safe in many cases
    to query once per run to pick up infrequent changes, then assume the data are static during
    execution time.

    :param edd: the EddApi instance to use in querying EDD for contextual data
    :param edd_login_details: edd login details to be used for subsequent ICE API access, if needed
    :param search_params: search parameters used to identify contextual data of interest
    :return: a Context instance that contains results from the API queries, or None if one or more
    predicted errors occurred during attempts to query ICE for part numbers
    """
    context = ContextCache()

    ###############################################################################################
    # Get measurement / sample prep. protocols and measurement units
    ###############################################################################################
    query_protocols(edd, search_params, context)
    query_units(edd, search_params, context)

    ###############################################################################################
    # Get measurement types of interest for our application. EDD currently has thousands of
    # these, so consider up-front cacheing only if narrowing results to a few of interest.
    ###############################################################################################
    if search_params.filter_by_measurement_types():
        query_measurement_types(edd, [search_params.measurement_type_name_regexes], context)

    ###############################################################################################
    # Get strains of interest if there are few enough to warrant up-front cacheing.
    ###############################################################################################
    if search_params.filter_by_strains():
        success = query_strains_by_part_id(edd, search_params.ice_part_ids, context)
        if not success:
            return None

    return context


def query_protocols(edd, search_params, cache):
    """
    Queries EDD for the sample prep / measurement protocols configured in the system, then caches
    them for subsequent use in interpreting study data. If a subset of protocols of interest is
    identified, only those will be found within EDD, otherwise all protocols from the instance
    will be cached.

    Note that this example may be useful for initial location of a subset of protocols of interest
    within an EDD instance, but repeated use will be more efficient if clients use protocol
    primary key or UUID for lookup on subsequent runs.

    :param edd: the EddApi instance to use in performing queries.
    :param search_params: search parameters for the query.
    :param cache: a cache to store query results in
    """

    # TODO: REST API resource used by this method is not fully implemented / tested yet

    # if filtering by protocol, get only the protocols of interest
    if search_params.filter_by_protocols():
        for protocol_name in search_params.protocol_name_regexes:

            protocols_page = edd.search_protocols(name_regex=search_params.edd_protocol_name)

            if not protocols_page or len(protocols_page.results) > 1 or protocols_page.next_page:
                raise ValueError('Unable to locate required protocol "%(protocol_name)s" in EDD '
                                 'at %(edd_url)s' % {
                                     'protocol_name': protocol_name,
                                     'edd_url': settings.EDD_URL,
                                 })
            protocol = protocols_page.results[0]
            cache.add_protocol(protocol)

    # otherwise, just cache all the protocols (there shouldn't be very many any time soon)
    else:
        protocols_page = edd.search_protocols()

        while protocols_page and not is_aborted():

            for protocol in protocols_page.results:
                cache.add_protocol(protocol)

            if protocols_page.next_page and not is_aborted():
                protocols_page = edd.search_protocols(query_url=protocols_page.next_page)
            else:
                protocols_page = None


def query_units(edd, search_params, cache):
    """
        Queries EDD for the sample measurement units configured in the system, then
        caches them for subsequent use. If a subset of units of interest is identified, only those
        will be found within EDD, otherwise all units from the instance will be cached.

        Note that this example may be useful for initial location of a subset of units of
        interest within an EDD instance, but repeated use will be more efficient if clients use
        unit primary key or UUID for lookup on subsequent runs.

        :param edd: the EddApi instance to use in performing queries
        :param search_params: search parameters for the query
        :param cache: a cache to store query results in
        """

    # if filtering by units, only get the units of interest
    if search_params.filter_by_units():
        for unit_name_regex in search_params.unit_name_regexes:
            do_units_query(edd, cache, unit_name_regex=unit_name_regex)

    # otherwise, just get all the units known to the system.  To start with, there shouldn't be
    # many.
    else:
        do_units_query(edd, cache)


def do_units_query(edd, cache, unit_name_regex=None):
    """
    A helper method for performing the units query
    """
    kwargs = {}
    if unit_name_regex:
        kwargs['name_regex'] = unit_name_regex

    units_page = edd.search_measurement_units(name_regex=unit_name_regex)

    while units_page and not is_aborted():

        for units in units_page.results:
            cache.add_units(units)

        if units_page.next_page and not is_aborted():
            units_page = edd.search_measurement_units(query_url=units_page.next_page)
        else:
            units_page = None


def query_strains_by_part_id(edd, edd_login_details, strain_part_ids, cache):
    """
    Queries ICE to find parts associated with the requested part IDs, then uses UUID's found in ICE
    to query EDD for related strain entries.  Note that several distinct error types are
    expected to occur during this lookup process as a result of user error during data entry into
    ICE/EDD.  Sample error handling code in this method is patterned after the code used by EDD
    during the Experiment Description file processing, and accounts for the errors observed to
    date.

    :param edd: the EddApi instance to use for EDD queries.
    :param edd_login_details: user credentials entered during prior EDD login. The same
    credentials will be used to log into ICE. Note this assumes LBL affiliate status used to
    access both systems.
    :param strain_part_ids: locally-unique ICE part IDs for the strains of interest.
    :param cache: a cache to store strain information in
    :return: True if all queries were successful, False if they failed for any reason
    """
    ##############################
    # Log into ICE.
    # Note this only works for LDAP users who have the same credentials in both EDD and ICE.
    ##############################
    login_application = 'ICE'
    ice_login_details = session_login(IceSessionAuth, settings.ICE_URL, login_application,
                                      username_arg=edd_login_details.username,
                                      password_arg=edd_login_details.password,
                                      print_result=True,
                                      timeout=settings.ICE_REQUEST_TIMEOUT,
                                      verify_ssl_cert=settings.VERIFY_ICE_CERT)

    ice_session_auth = ice_login_details.session_auth

    # remove password(s) from memory as soon as used
    edd_login_details.password = None
    ice_login_details.password = None

    ice = IceApi(ice_session_auth, settings.ICE_URL, result_limit=settings.ICE_PAGE_SIZE,
                 verify_ssl_cert=settings.VERIFY_ICE_CERT)
    ice.timeout = settings.ICE_REQUEST_TIMEOUT

    ##############################
    # Search ICE for parts by part ID, which is the identifier researchers normally use.
    # EDD doesn't store ICE part ID's, so initial lookup in ICE is required first.
    ##############################
    # TODO: consider extracting a general-purpose method for doing these queries...very similar
    # to processing in EDD's Experiment Description file importer
    for part_id in strain_part_ids:

        try:
            entry = ice.get_entry(part_id)

            if entry:

                # detect non-strain entries (user error at some stage of the process)
                if not isinstance(entry, IceStrain):
                    cache.non_strain_ice_parts.append(entry)

                cache.ice_entries_by_part_id[part_id] = entry
            else:
                # aggregate the list of missing parts (likely user error in accessing /
                # referencing the wrong EDD/ICE instance)
                cache.missing_part_ids.append(part_id)

        # catch only HttpErrors, which more likely imply a problem accessing this specific
        # part. Note that ConnectionErrors and similar that are more likely to be systemic aren't
        # caught here and will immediately abort the remaining ICE queries.
        except HTTPError as http_err:
            # TODO: improve example here based on ICE error handling in EDD's internals
            logger.exception('Error querying ICE for part %s' % part_id)

            # aggregate ICE part permission errors, which are currently common enough to warrant
            # aggregating them as a user/administrator convenience
            if http_err.response.status_code == codes.forbidden:
                cache.error_part_ids[part_id] = http_err.response.status_code
                continue

            # re-raise all other errors, which we have no way of processing
            else:
                raise http_err

    ice_part_err_abort = False

    # inspect aggregated ICE lookup errors and print a message / abort early if any were detected
    if cache.missing_part_ids:
        logger.error('Unable to locate %(missing)d of %(total)d ICE parts: %(ids)s' % {
            'missing': len(cache.missing_part_ids),
            'total': len(strain_part_ids),
            'ids': ', '.join(cache.missing_part_ids),
        })
        ice_part_err_abort = True

    if cache.ice_permission_error_part_ids:
        logger.error('Permissions error accessing %(err_count)d of %(total)d ICE parts: %(ids)s' %
                     {
                         'err_count': len(cache.ice_permission_error_part_ids),
                         'total': len(strain_part_ids),
                         'ids': ', '.join(cache.ice_permission_error_part_ids),
                     })
        ice_part_err_abort = True

    if cache.non_strain_ice_parts:
        logger.error('Non-strain ICE entries detected for %(err_count)d of %(total)d '
                     'requested parts: '
                     '%(ids)s' % {
                         'err_count': len(cache.ice_permission_error_part_ids),
                         'total': len(strain_part_ids),
                         'ids': ', '.join(cache.ice_permission_error_part_ids)
                     })
        logger.error('At the time of writing, EDD does not support use of non-strain ICE entries. '
                     'See EDD-239 or EDD-543 and required precursor ICE-10.')
        ice_part_err_abort = True

    if ice_part_err_abort:
        return False

    ##############################
    # Search EDD for strains using UUID's found in ICE
    ##############################
    return query_edd_for_strains(edd, [ice_strain.uuid for ice_strain in
                                       cache.ice_entries_by_part_id.itervalues()], cache)


def query_edd_for_strains(edd, strain_unique_ids, cache):
    """
    Queries EDD for strains with the requested unique identifiers (either pk or UUID)
    """

    ##############################
    # Search EDD for strains using UUID's found in ICE
    ##############################
    for part_id in strain_unique_ids:
        if is_aborted():
            return False

        ice_entry = cache.ice_entries_by_part_id[part_id]
        edd_strain = edd.get_strain(ice_entry.uuid)

        if edd_strain:
            cache.edd_strains_by_part_id[part_id] = edd_strain
        else:
            cache.missing_edd_strains.append((part_id, ice_entry.uuid))

    if cache.missing_edd_strains:
        logger.warning(
                "%(not_found_strain_count)d of %(total)d strains of interest were not found in "
                "EDD, and thus can't be included in any uploaded measurements. You may want to "
                "look into this: %(part_ids)s" % {
                    'not_found_strain_count': len(cache.missing_edd_strains),
                    'total': len(strain_unique_ids),
                    'part_ids': ', '.join(cache.missing_edd_strains)})


def query_measurement_types(edd, name_regexes, cache):
    """
    Queries EDD for measurement types with names that match the requested regular expressions. Note
    that name is used to keep this example simple, but production code should probably use UUID
    to look up measurement types for repetitive use.
    """

    if not name_regexes:
        return

    # if requested, search for only the single requested measurement type. In this example,
    # we're only inspecting measurements of Pyruvate

    for name_regex in name_regexes:

        # TODO: REST API resource not yet implemented
        measurement_types_page = edd.search_measurement_types(name_regex)

        if not measurement_types_page:
            raise ValueError('No result returned for measurement type named "%s"' %
                             name_regex)

        if measurement_types_page.total_result_count != 1:
            raise ValueError(
                'Search was unsuccessful for measurement type named "%s"' %
                name_regex)

        measurement_type = measurement_types_page.results[0]
        cache.add_measurement_type(measurement_type)


def query_and_process_study_internals(edd, study, search_params, cache):
    """
    Queries EDD for internals of the specified study and leaves a placeholder for client code
    that would be responsible to do processing based on it.
    :param edd: the EddApi instance to use in querying EDD
    :param study: the study whose internals will be accessed
    :param cache: a cache of context data to help in interpreting study results
    :param search_params: search parameters that may be used to limit the subset of study data
    examined by queries
    """

    ###############################################################################################
    # Search for lines associated with this study, optionally filtering only those that use strains
    # of interest.
    ###############################################################################################
    line_pks_filter = query_study_lines_and_strains(study.pk, search_params, cache)

    ###############################################################################################
    # Search for assays associated with this study, using discovered lines to filter for strains of
    # interest, if configured.
    ###############################################################################################

    # based on search parameters / discovered context, build up a list of filter parameters for
    # assays within the study.
    assay_kwargs = {'active_status': True}

    # if we filtered to a subset of lines above based on strains of interest, only get assays
    # for the lines of interest
    if line_pks_filter:
        assay_kwargs['line_pks'] = line_pks_filter

    # filter by protocols of interest, if configured.
    if search_params.edd_protocol_name:
        assay_kwargs['protocol_pks'] = [protocol_pk for protocol_pk in
                                        cache.protocols_by_pk.iteritems()]

    # TODO: API resource not implemented yet
    study_assays_page = edd.search_study_assays(study.pk, **assay_kwargs)

    while study_assays_page and not is_aborted():

        for assay in study_assays_page.results:
            # if we didn't narrow our cache to a subset of protocols that were found during
            # initial context queries, look up protocol associated with this assay
            if not search_params.filter_by_protocol():
                protocol_pk = assay.protocol_pk
                protocol = edd.get_protocol(protocol_pk)
                cache.add_protocol(protocol)

            query_and_process_assay_measurements(edd, assay.pk, cache)

        if study_assays_page.next_page and not is_aborted():
            study_assays_page = edd.search_study_assays(study.pk,
                                                        query_url=study_assays_page.next_page)
        else:
            study_assays_page = None


def query_study_lines_and_strains(edd, study_pk, search_params, cache):
    """
    Queries EDD for the lines within a single study.  If configured to filter results by strain,
    only lines for the requested strains will be processed. Otherwise, strains associated with
    each discovered line are cached to simplify future processing.

    :param edd: the EddApi instance to use for queries
    :param study_pk: the primary key of the study whose lines should be processed
    :param search_params: search parameters to limit query results and further downstream
        processing
    :param cache: the cache to populate with observed strains, if not already done due to strain
        filtering
    :return: a list of line primary keys if needed to limit query results to only the lines for
        configured strains of interest. Otherwise, an empty list.
    """

    # We'll want to either limit our search to lines that include our strains of interest,
    # or else we'll need to look up the strains associated with them so we know how to interpret
    #  the data
    line_kwargs = {'active': True}

    # if search parameters included strains to filter results for, filter the study for lines
    # that measure only the strains of interest (which were already located during initial
    # context queries)
    line_pks = []
    if search_params.filter_by_strains():
        edd_strain_pks = [strain.pk for strain in cache.edd_strains_by_part_id.itervalues()]
        line_kwargs['strain_pks'] = edd_strain_pks

    # TODO: API resource not implemented yet.
    lines_page = edd.search_lines(study_pk, **line_kwargs)

    while lines_page and not is_aborted():
        logger.info('Processing a page of %(result_count)d lines in study %(study_pk)d' % {
            'result_count': lines_page.current_result_count, 'study_pk': study_pk
        })

        # if we're filtering lines by strains of interest (which should have been found during
        # initial queries), build up a list of line pk's for future use in filtering assays.
        if search_params.filter_by_strains():
            line_pks.extend([line.pk for line in lines_page.results])

        # otherwise, make sure the strains observed in this study are cached so we know how
        # to interpret the data later on.
        else:
            for line in lines_page:
                for strain_pk in line.strains:
                    if strain_pk not in cache.edd_strains_by_pk:
                        strain = edd.get_strain(strain_pk)
                        cache.add_edd_strain(strain)

        # get the next page of line results (if any)
        if lines_page.next_page and not is_aborted():
            line_kwargs['page_number'] = lines_page.next_page
            lines_page = edd.search_lines(**line_kwargs)
        else:
            lines_page = None

    return line_pks


def query_and_process_assay_measurements(edd, study_pk, assay_pk, search_params, cache):
    """
    Queries EDD for measurements within the specified assay.
    """

    measurement_query_kwargs = {'active': True,
                                'include_values': True, }

    # if configured, filter query results by measurement type
    if search_params.filter_by_measurement_type():

        # iterate over measurement types, querying / processing each type individually
        for measurement_type_pk in cache.measurement_types_by_pk:
            measurement_query_kwargs['type'] = measurement_type_pk
            _query_measurements(edd, assay_pk, measurement_query_kwargs, cache)

    # otherwise, query results for all measurement types associated with this assay
    else:
        _query_measurements(edd, assay_pk, measurement_query_kwargs, cache)


def _query_measurements(edd, assay_pk, kwargs, cache):
    """
    A helper method that performs the actual query for measurements associated with the specified
    assay.
    """
    measurements_page = edd.search_assay_measurements(assay_pk, **kwargs)

    while measurements_page and not is_aborted():

        for measurement in measurements_page.results:

            if measurement.measurement_type not in cache:
                measurement_type = edd.get_measurement_type(measurement.measurement_type)
                cache.add_measurement_type(measurement_type)

            # TODO: client code would likely want to create a context-specific measurement cache
            # at this point

        if measurements_page.next_page and not is_aborted():
            measurements_page = edd.search_assay_measurements(
                    assay_pk,
                    query_url=measurements_page.next_page)
        else:
            measurements_page = None


def is_aborted():
    # placeholder for gracefully aborting execution early when using multiple threads. If using
    # Celery, consider using Celery's AbortableTask, assuming the ~3.1.25-era documentation that
    # states it doesn't support our back-end is now outdated (
    # http://docs.celeryproject.org/en/latest/reference/celery.contrib.abortable.html ).
    # See EDD-187.
    return False


if __name__ == '__main__' or __name__ == 'jbei.edd.rest.scripts.sample_rest_queries':
    result = main()
    exit(result)
