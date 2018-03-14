"""
A script that searches EDD and ICE and corrects inconsistencies in the ICE experiment links to EDD.
This script was authored to address a known need due to the path/scheduling of the EDD/ICE
development processes, but some or all of it should also be maintained for future use (SYNBIO-1190)

This script is designed to run while EDD and ICE are both up, so there is a small chance
that users of one or both systems are modifying relevant data during the run.  The script is
designed to minimize the chances of concurrent modifications affecting the end results, but it does
not take explicit (and complicated / effort-intensive) steps to protect against them.
In the worst case, in the unlikely event that a race condition affects the results, a second run
of the script should detect and correct remaining inconsistencies, with a small chance of creating
new ones.

It's safest to schedule runs of this script during off-hours when users are less likely to be
making changes.
"""

from __future__ import division
from __future__ import unicode_literals

####################################################################################################
# set default source for ICE settings BEFORE importing any code from jbei.rest.clients.ice. Otherwise,
# code in that module will attempt to look for a django settings module and fail if django isn't
# installed in the current virtualenv
import json
import os

from collections import OrderedDict
import argparse
import arrow
import locale
import logging
import re
import requests
from logging.config import dictConfig
from requests.packages.urllib3.exceptions import InsecureRequestWarning
from requests.exceptions import HTTPError
from urllib.parse import urlparse

from jbei.rest.auth import EddSessionAuth, IceSessionAuth
from jbei.rest.clients.edd.api import EddApi
from jbei.rest.clients.ice.api import IceApi, Strain as IceStrain
from jbei.rest.clients.ice.api import ICE_ENTRY_TYPES
from jbei.rest.utils import is_url_secure
from jbei.utils import to_human_relevant_delta, UserInputTimer, session_login, TYPICAL_UUID_PATTERN

from . import settings
from .settings import (EDD_URL, EDD_PRODUCTION_HOSTNAMES, ICE_PRODUCTION_HOSTNAMES, ICE_URL,
                       VERIFY_EDD_CERT, VERIFY_ICE_CERT, EDD_REQUEST_TIMEOUT, ICE_REQUEST_TIMEOUT)

dictConfig(settings.LOGGING)

logger = logging.getLogger(__name__)


###################################################################################################
# Performance tuning parameters
###################################################################################################
# process large-ish result batches in the hope that we've stumbled on an good size to make
# processing efficient in aggregate
EDD_RESULT_PAGE_SIZE = ICE_RESULT_PAGE_SIZE = 100

###################################################################################################

SEPARATOR_CHARS = 75
OUTPUT_SEPARATOR = ''.join(['*' for index in range(1, SEPARATOR_CHARS)])
fill_char = b'.'

# link processing outcomes for do_initial_run_entry_link_processing
NOT_PROCESSED_OUTCOME = 'NOT_PROCESSED'
REMOVED_DEVELOPMENT_URL_OUTCOME = 'REMOVED_DEV_URL'
# edd.lvh.me
REMOVED_TEST_URL_OUTCOME = 'REMOVED_TEST_URL'
UPDATED_PERL_URL_OUTCOME = 'UPDATED_PERL_URL'
REMOVED_BAD_STUDY_LINK = 'REMOVED_NON_EXISTENT_STUDY_LINK'
REMOVED_DUPLICATE_STUDY_LINK = 'REMOVED_DUPLICATE_STUDY_LINK'
UPDATED_WRONG_HOSTNAME_OUTCOME = 'UPDATED_WRONG_HOSTNAME'
UPDATED_OLD_LINK_OUTCOMES = (UPDATED_PERL_URL_OUTCOME, UPDATED_WRONG_HOSTNAME_OUTCOME)

# detect & fix links resulting from an incorrect hostname value briefly in place in EDD's
# production database following deployment of SYNBIO-1105 / corrected in SYNBIO-1312.
WRONG_HOSTNAME_PATTERN = re.compile('^http(?:s?)://edd.jbei.lbl.gov/study/(?P<study_id>\d+)/?$',
                                    re.IGNORECASE)

_DEVELOPER_MACHINE_NAMES = ['gbirkel-mr.dhcp.lbl.gov', 'mforrer-mr.dhcp.lbl.gov',
                           'jeads-mr.dhcp.lbl.gov', 'wcmorrell-mr.dhcp.lbl.gov', 'edd.lvh.me',
                           'localhost', '127.0.0.1']


class Performance(object):
    """
    Tracks simple runtime performance metrics for this script. We can get a lot more granular,
    but this should be a good initial basis for further investigation/optimization if needed.
    """

    def __init__(self):
        #######################################
        # time tracking
        #######################################
        now = arrow.utcnow()
        zero_timedelta = now - now

        self._overall_start_time = now
        self._overall_end_time = None
        self._total_time = None
        self.ice_communication_time = zero_timedelta
        self.edd_communication_time = zero_timedelta
        self.ice_entry_scan_start_time = None
        self.ice_entry_scan_time = zero_timedelta
        self.edd_strain_scan_time = zero_timedelta

    def completed_edd_strain_scan(self):
        self.edd_strain_scan_time = arrow.utcnow() - self._overall_start_time

    def started_ice_entry_scan(self):
        self.ice_entry_scan_start_time = arrow.utcnow()

    @property
    def overall_end_time(self):
        return self._overall_end_time

    @overall_end_time.setter
    def overall_end_time(self, value):
        self._overall_end_time = value
        self._total_time = self.overall_end_time - self._overall_start_time
        if self.ice_entry_scan_start_time:
            self.ice_entry_scan_time = value - self.ice_entry_scan_start_time

    def print_summary(self):
        print(OUTPUT_SEPARATOR)
        print('Performance Summary')
        print(OUTPUT_SEPARATOR)

        # build up a dictionary of result titles -> values
        total_runtime = self._overall_end_time - self._overall_start_time
        print('Total run time: %s' % to_human_relevant_delta(total_runtime.total_seconds()))
        values_dict = OrderedDict()

        edd_duration_key = 'EDD strain scan duration'
        ice_duration_key = 'ICE entry scan duration:'
        values_dict[edd_duration_key] = 'Not performed'
        values_dict[ice_duration_key] = 'Not performed'

        if self.edd_strain_scan_time:
            values_dict[edd_duration_key] = (to_human_relevant_delta(
                self.edd_strain_scan_time.total_seconds()))

        if self.ice_entry_scan_time:
            values_dict[ice_duration_key] = (to_human_relevant_delta(
                self.ice_entry_scan_time.total_seconds()))

        values_dict['Total EDD communication time'] = to_human_relevant_delta(
                self.edd_communication_time.total_seconds())
        values_dict['Total ICE communication time'] = to_human_relevant_delta(
                self.ice_communication_time.total_seconds())

        # compute column widths for readable display
        space = 2
        title_col_width = max(len(title) for title in values_dict.keys()) + space
        value_col_width = max(len(value) for value in values_dict.values()) + space
        for title, value in values_dict.items():
            indented_title = "\t\t%s" % title.ljust(title_col_width, fill_char)
            print(fill_char.join((indented_title, value.rjust(value_col_width, fill_char))))


class StrainProcessingPerformance:
    """
    Tracks simple runtime performance metrics for processing of a single EDD strain
    """

    def __init__(self, strain, start_time, starting_ice_communication_delta,
                 starting_edd_communication_delta, scan_percent_when_complete=None):
        self.strain = strain
        self.start_time = start_time
        self._total_time = None
        self._end_time = None

        self.edd_study_search_time = None
        self.strain_processing_start = start_time

        self._starting_ice_communication_delta = starting_ice_communication_delta
        self._starting_edd_communication_delta = starting_edd_communication_delta
        self._edd_communication_delta = None
        self._ice_communication_delta = None

        self.ice_link_search_delta = None
        self.ice_link_cache_lifetime = None
        self.links_updated = 0
        self.links_removed = 0
        self.links_skipped = 0
        self.links_unprocessed = 0
        self.studies_unprocessed = 0
        self.scan_percent_when_complete = scan_percent_when_complete

    def print_summary(self):
        ###########################################################################################
        # Print a summary of runtime
        ###########################################################################################

        print('Run time for strain "%(name)s" (pk=%(pk)d): %(time)s' % {
            'name': self.strain.name, 'pk': self.strain.pk,
            'time': to_human_relevant_delta(self._total_time.total_seconds()),
        })
        # print('\tTotal EDD communication: %s' % to_human_relevant_delta(
        #         self._edd_communication_delta.total_seconds()))
        # print('\tTotal ICE communication: %s' % to_human_relevant_delta(
        #         self._ice_communication_delta.total_seconds()))
        # print('\tICE strain experiments cache lifetime: %s' % to_human_relevant_delta(
        #         self.ice_link_cache_lifetime.total_seconds()))
        # print('\tICE links processed: %d' % (self.links_updated + self.links_removed +
        #                                      self.links_skipped))

        if self.links_unprocessed:
            print('\tICE links UNprocessed: %d' % self.links_unprocessed)

        if self.scan_percent_when_complete is not None:
            print('EDD Scan %0.2f%% complete' % self.scan_percent_when_complete)

    @property
    def end_time(self):
        return self._end_time

    def set_end_time(self, value, end_edd_communication_delta, end_ice_communation_delta):
        self._end_time = value
        self._total_time = self.end_time - self.start_time
        self._edd_communication_delta = (end_edd_communication_delta -
                                         self._starting_edd_communication_delta)
        self._ice_communication_delta = (end_ice_communation_delta -
                                         self._starting_ice_communication_delta)


class IceTestStub(IceApi):
    """
    A variant of IceAPI that masks all capability to change data in ICE, allowing us to test code
    that would otherwise produce changes. Note that this class needs to be maintained with
    IceApi in order to remain safe/effective!
    """

    def unlink_entry_from_study(self, ice_entry_id, study_id, study_url, logger):
        self._prevent_write_while_disabled()
        return True

    def link_entry_to_study(self, ice_entry_id, study_id, study_url, study_name, logger,
                            old_study_name=None, old_study_url=None):
        self._prevent_write_while_disabled()
        pass

    def remove_experiment_link(self, ice_entry_id, link_id):
        self._prevent_write_while_disabled()
        pass


class EddTestStub(EddApi):
    """
    A variant of EddApi that masks all capability to change data in EDD, allowing us to test code
    that would otherwise produce changes. Note that this class needs to be maintained with EDD in
    order to remain safe/effective!
    """

    def update_strain(self, name=None, description=None, local_pk=None, registry_id=None,
                      registry_url=None):
        self._prevent_write_while_disabled()
        pass

    def create_strain(self, name, description, registry_id, registry_url):
        self._prevent_write_while_disabled()
        pass


def build_study_url_pattern(edd_link_target_hostname):
    return re.compile(
            r'^http(?:s?)://%s/study/(?P<study_id>\d+)/?$' % re.escape(edd_link_target_hostname),
            re.IGNORECASE)


def build_perl_study_url_pattern(edd_link_target_hostname):
    return re.compile(r'^http(?:s?)://%s/study\.cgi\?studyid=(?P<study_id>\d+)/?$' % re.escape(
        edd_link_target_hostname), re.IGNORECASE)


def build_perl_study_url(local_study_pk, edd_hostname, https=False):
    """
    Builds a Perl-style study URL created by the older Perl version of EDD.
    :param local_study_pk:  the numeric study primary key
    :param https: True to use HTTPS, False for plain HTTP
    :param edd_hostname: the host name for EDD
    """
    scheme = 'https' if https else 'http'
    return '%(scheme)s://%(hostname)s/Study.cgi?studyID=%(study_pk)s' % {
        'hostname': edd_hostname, 'scheme': scheme, 'study_pk': local_study_pk
    }


def is_edd_production_url(url):
    """
    Tests whether the input URL references a known list of production host names.
    """
    url_parts = urlparse(url)
    hostname = url_parts.hostname.lower()
    return hostname in EDD_PRODUCTION_HOSTNAMES


def is_ice_production_url(url):
    """
    Tests whether the input URL references a known list of production host names.
    """
    url_parts = urlparse(url)
    hostname = url_parts.hostname.lower()
    return hostname in ICE_PRODUCTION_HOSTNAMES


def is_ice_admin_user(ice, username):
    """
    Contacts ICE to test whether the provided username has administrative privileges in ICE
    """
    try:
        page_result = ice.search_users(search_string=username)
        user_email_pattern = re.compile('%s@.+' % username, re.IGNORECASE)

        while page_result:

            for user in page_result.results:
                if user_email_pattern.match(user.email):
                    return user.is_admin

            if page_result.next_page:
                page_result = ice.search_users(query_url=page_result.next_page)
    except HTTPError as h:
        if h.response.code == 403:
            return False

        if h.response.code == 500:  # work around ICE's imprecise return codes,at the cost of
            # masking actual internal server errors (SYNBIO-1359)
            return False

    return None


def is_aborted():
    # TODO: placeholder for aborting execution early. If possible, use Celery's AbortableTask,
    # assuming the documentation that states it doesn't support our back-end is outdated (
    # http://docs.celeryproject.org/en/latest/reference/celery.contrib.abortable.html ).
    # See EDD-187.
    return False


class ProcessingSummary:
    """
    Tracks processing results for the known inconsistencies detected by this script.
    """

    def __init__(self):
        self._total_ice_entries_processed = 0
        self._total_edd_strains_found = 0
        self._total_ice_entries_found = 0
        self._existing_links_processed = 0
        self._invalid_links_pruned = 0
        self._development_links_pruned = 0
        self._test_links_pruned = 0
        self._unmaintained_links_renamed = 0
        self._duplicate_links_removed = 0
        self._valid_links_skipped = 0
        self._missing_links_created = 0
        self._non_strain_ice_parts_referenced = 0
        self._perl_links_updated = 0
        self._wrong_hostname_links_updated = 0
        self._skipped_external_links = 0

        self._previously_processed_strains_skipped = {}

        self._up_to_date_strains = []
        self._strains_with_changes = []
        self._orphaned_edd_strains = []
        self._stepchild_edd_strains = []
        self._non_strain_ice_parts_referenced = []
        self._updated_edd_strain_text = []
        self._edd_strains_w_different_text = []

        self._processed_edd_strain_uuids = {}
        self._processed_edd_strain_lookup_counts = {}

    ################################################################################################
    # Read-only properties where we want to force additional data capture
    ################################################################################################

    def skipped_external_link(self, ice_entry, link):
        self._existing_links_processed += 1
        self._skipped_external_links += 1

        logger.warning('Leaving external or malformed link to %(link_url)s in place from ICE part '
                       '%(part_id)s (uuid %(entry_uuid)s)' % {
                           'link_url': link.url, 'part_id': ice_entry.part_id,
                           'entry_uuid': ice_entry.uuid,
                       })

    @property
    def orphaned_edd_strain_count(self):
        return len(self._orphaned_edd_strains)

    @property
    def total_edd_strains_processed(self):
        return len(self._processed_edd_strain_uuids) + self.orphaned_edd_strain_count

    @property
    def total_ice_entries_processed(self):
        return self._total_ice_entries_processed

    @property
    def valid_links_skipped(self):
        return self._valid_links_skipped

    @property
    def unmaintained_links_renamed(self):
        return self._unmaintained_links_renamed

    @property
    def development_links_pruned(self):
        return self._development_links_pruned

    @property
    def invalid_links_pruned(self):
        return self._invalid_links_pruned

    ################################################################################################

    def is_edd_strain_processed(self, entry_uuid):
        # TODO: remove debug block & helping dict data member
        lookup_count = self._processed_edd_strain_lookup_counts.get(entry_uuid, 0)
        self._processed_edd_strain_lookup_counts[entry_uuid] = lookup_count + 1
        if lookup_count > 1:
            logger.warning('Looked up processing status for entry %s %d times' % (entry_uuid,
                                                                                  lookup_count))

        processed = self._processed_edd_strain_uuids.get(entry_uuid, False)
        return processed

    def updated_edd_strain_text(self, edd_strain, ice_entry, old_name=None, new_name=None,
                                old_description=None, new_description=None):
        self._updated_edd_strain_text.append(edd_strain)
        name_change = 'old_name = "%s", new_name="%s"' % (old_name, new_name) if new_name else ''
        description_change = 'old_desc = "%s", new_desc="%s"' % (old_description, new_description)
        logger.info('Updated name and/or description to make EDD strain match ICE. %s %s' % (
            name_change, description_change))

    def found_strain_text_diff(self, edd_strain, ice_entry, edd_name=None, ice_name=None,
                               edd_description=None, ice_description=None):
        self._edd_strains_w_different_text.append(edd_strain)
        name_diff = 'edd_name = "%s", ice_name="%s"' % (edd_name, ice_name) if ice_name else ''
        description_diff = 'edd_desc = "%s", ice_desc="%s"' % (edd_description, ice_description)
        logger.warning("Strain name and/or description don't match ICE. %s %s" % (
            name_diff, description_diff))

    @property
    def total_edd_strains_found(self):
        return self._total_edd_strains_found

    @total_edd_strains_found.setter
    def total_edd_strains_found(self, found_count):
        self._total_edd_strains_found = found_count

    @property
    def total_ice_entries_found(self):
        return self._total_ice_entries_found

    @total_ice_entries_found.setter
    def total_ice_entries_found(self, entries_found):
        self._total_ice_entries_found = entries_found

    # TODO: this needs to be used! See _DEVELOPER_MACHINE_NAMES above for detecting known links to
    # developer's machines that should be removed from prod/test databases
    def removed_development_link(self, ice_entry, experiment_link):
        self._existing_links_processed += 1
        self._development_links_pruned += 1

        logger.info('Removed development link %(link_url)s from ICE entry %(entry_uuid)s' % {
            'link_url': experiment_link.url, 'entry_uuid': ice_entry.uuid,
        })

    def removed_test_link(self, ice_entry, experiment_link):
        self._existing_links_processed += 1
        self._test_links_pruned += 1

        logger.info('Removed test link %(link_url)s from ICE entry %(entry_uuid)s' % {
            'link_url': experiment_link.url, 'entry_uuid': ice_entry.uuid,
        })

    def removed_invalid_link(self, ice_entry, experiment_link):
        self._existing_links_processed += 1
        self._invalid_links_pruned += 1

        logger.info(
            'Removed invalid link %(link_url)s from ICE entry %(part_id)s %(entry_uuid)s' % {
                'link_url': experiment_link.url, 'part_id': ice_entry.part_id,
                'entry_uuid': ice_entry.uuid,
            })

    def found_edd_strain_with_up_to_date_links(self, edd_strain, ice_entry):
        self.processed_edd_strain(edd_strain)
        self._up_to_date_strains.append(edd_strain)
        logger.info('Strain has up-to-date ICE links %(strain_pk)d / %(part_id)s / '
                    '%(entry_uuid)s' % {
                        'strain_pk': edd_strain.pk, 'part_id': ice_entry.part_id,
                        'entry_uuid': ice_entry.uuid,
                    })

    def renamed_unmaintained_link(self, ice_entry, existing_link, new_link_name):
        self._existing_links_processed += 1
        self._unmaintained_links_renamed += 1

        logger.info('Renamed unmaintained link from %(old_name)s to %(new_name)s to %(link_url)s '
                    'from ICE entry %(part_id)s (uuid %(entry_uuid)s)' % {
                        'part_id': ice_entry.part_id, 'old_name': existing_link.name,
                        'new_name': new_link_name, 'link_url': existing_link.url,
                        'entry_uuid': ice_entry.uuid,
                    })

    def skipped_valid_link(self, ice_entry, experiment_link):
        self._existing_links_processed += 1
        self._valid_links_skipped += 1

        logger.info('Skipped valid link %(link_url)s from ICE entry %(part_number)s '
                    '(uuid %(entry_uuid)s)' % {
                        'part_number': ice_entry.part_id, 'link_url': experiment_link.url,
                        'entry_uuid': ice_entry.uuid,
                    })

    def updated_perl_link(self, ice_entry, experiment_link):
        self._existing_links_processed += 1
        self._perl_links_updated += 1

        logger.info('Updated perl link %(link_url)s from ICE entry %(part_number)s '
                    '(uuid %(entry_uuid)s)' % {
                        'part_number': ice_entry.part_id, 'link_url': experiment_link.url,
                        'entry_uuid': ice_entry.uuid,
                    })

    def removed_duplicate_link(self, ice_entry, experiment_link):
        self._existing_links_processed += 1
        self._duplicate_links_removed += 1

        logger.info('Removed duplicate link %(link_url)s from ICE entry %(part_number)s '
                    '(uuid %(entry_uuid)s). Duplicates include old-format URLs that resolve to '
                    'the the same up-to-date URL as an existing link.' % {
                        'part_number': ice_entry.part_id, 'link_url': experiment_link.url,
                        'entry_uuid': ice_entry.uuid,
                    })

    def updated_wrong_hostname_link(self, ice_entry, experiment_link):
        self._existing_links_processed += 1
        self._wrong_hostname_links_updated += 1

        logger.info('Updated wrong hostname link %(link_url)s from ICE entry %(part_number)s '
                    '(uuid %(entry_uuid)s)' % {
                        'part_number': ice_entry.part_id, 'link_url': experiment_link.url,
                        'entry_uuid': ice_entry.uuid,
                    })

    def found_orphaned_edd_strain(self, strain):
        logger.warning("EDD strain %(strain_pk)d has no UUID for the associated ICE entry. "
                       "Skipping this incomplete strain." % {
                           'strain_pk': strain.pk,
                       })
        self.processed_edd_strain(strain)  # no effect at present, but keep in case we change
        # implementation
        self._orphaned_edd_strains.append(strain)

    def found_stepchild_edd_strain(self, edd_strain):
        self.processed_edd_strain(edd_strain)
        self._stepchild_edd_strains.append(edd_strain)
        logger.warning("EDD strain %(strain_pk)d references an ICE entry that couldn't be found. "
                       "No ICE entry was found with uuid %(uuid)s . Skipping this strain (probably "
                       "referenced from the wrong ICE instance)." % {
                           'strain_pk': edd_strain.pk, 'uuid': edd_strain.registry_id,
                       })

    def found_non_strain_entry(self, edd_strain, ice_entry):
        self.processed_edd_strain(edd_strain)
        self._non_strain_ice_parts_referenced.append(ice_entry)

        logger.warning('EDD *strain* %(edd_strain_pk)d references ICE entry "%(ice_entry_name)s", '
                       'but is defined as a %(entry_type)s. Links will be examined for this '
                       'part, but some manual curation is probably also required. ICE entry is '
                       '%(part_number)s (uuid %(entry_uuid)s)' % {
                           'edd_strain_pk': edd_strain.pk, 'ice_entry_name': ice_entry.name,
                           'entry_type': ice_entry.__class__.__name__,
                           'part_number': ice_entry.part_id, 'entry_uuid': ice_entry.uuid,
                       })

    def created_missing_link(self, ice_entry, study_url):
        self._missing_links_created += 1

        logger.info('Created missing link %(link_url)s from ICE entry %(part_number)s '
                    '(%(entry_uuid)s)' % {
                        'link_url': study_url, 'part_number': ice_entry.part_id,
                        'entry_uuid': ice_entry.uuid,
                    })

    def processed_edd_strain_with_changes(self, strain, ice_entry):
        self.processed_edd_strain(strain)
        self._strains_with_changes.append(strain)

    def processed_edd_strain(self, strain):
        if not strain.registry_id:
            return  # should be captured by orphaned strains...don't count it twice!
        self._processed_edd_strain_uuids[strain.registry_id] = True

    @property
    def existing_links_processed(self):
        return self._existing_links_processed

    @property
    def previously_processed_strains_skipped(self):
        return len(self._previously_processed_strains_skipped)

    def skipped_previously_processed_entry(self, uuid):
        print('Already processed entry %s earlier in the run...skipping it' % uuid)
        if uuid in self._previously_processed_strains_skipped:
            logger.error('ICE entry has been skipped twice! This indicates a logic error.')
        self._previously_processed_strains_skipped[uuid] = True
        self._total_ice_entries_processed += 1

    def print_edd_summary(self, space):
        """
        Prints a summary data detected from examining some or all of the EDD strains.
        """
        ############################################################
        # build and print summary output subsection header
        ############################################################
        found = self.total_edd_strains_found if self.total_edd_strains_found else \
            self.total_edd_strains_processed
        percent_strains_processed = (self.total_edd_strains_processed / found) * 100

        subsection_header = ('EDD strains (processed/found): %(strains_processed)s / '
                             '%(strains_found)s (%(percent_processed)0.2f%%)' % {
                                 'strains_processed':
                                     locale.format('%d', self.total_edd_strains_processed,
                                                   grouping=True),
                                 'strains_found': locale.format('%d', found, grouping=True),
                                 'percent_processed': percent_strains_processed,
                             })
        subsection_separator = '-'.rjust(len(subsection_header), '-')
        print(subsection_separator)
        print(subsection_header)
        print(subsection_separator)

        ############################################################
        # build dictionaries mapping output row title -> value
        ############################################################
        follow_up_items = OrderedDict({
            'Non-strain ICE entries referenced by EDD': locale.format('%d', len(
                    self._non_strain_ice_parts_referenced), grouping=True),
            "Orphaned EDD strains (don't reference an ICE entry)": locale.format('%d', len(
                    self._orphaned_edd_strains), grouping=True),
            "Stepchild EDD strains (reference a UUID not found in this ICE deployment)":
                locale.format(
                    '%d', len(self._stepchild_edd_strains), grouping=True)

        })
        updated_edd_strain_text = bool(self._updated_edd_strain_text)
        if not updated_edd_strain_text:
            follow_up_items["Strains whose name/desc. don't match ICE"] = locale.format('%d',
                                len(self._edd_strains_w_different_text))

        rollup_result_items = OrderedDict()
        rollup_result_items['Strains with current links:'] = locale.format('%d', len(
                self._up_to_date_strains))
        rollup_result_items['Strains with one or more links maintained:'] = locale.format('%d', len(
                self._strains_with_changes), grouping=True)
        rollup_result_items['Known follow-up items:'] = locale.format('%d', len(
                self._non_strain_ice_parts_referenced) + len(self._orphaned_edd_strains) + len(
                self._stepchild_edd_strains), grouping=True)

        ############################################################
        # compute column widths and print summary output
        ############################################################
        main_title_col_width = max(len(title) for title in rollup_result_items.keys()) + space
        main_value_col_width = max(len(value) for value in rollup_result_items) + space
        for title, value in rollup_result_items.items():
            aligned_title = title.ljust(main_title_col_width, fill_char)
            print(fill_char.join((aligned_title, value.rjust(main_value_col_width, fill_char))))

        ############################################################
        # compute column widths and print follow-up items
        ############################################################
        title_col_width = max(len(title) for title in follow_up_items.keys()) + space
        value_col_width = max(len(value) for value in follow_up_items.values()) + space
        for title, value in follow_up_items.items():
            aligned_title = '\t%s' % title.ljust(title_col_width, fill_char)
            print(fill_char.join((aligned_title, value.rjust(value_col_width, fill_char))))

        ############################################################
        # strains updated from ICE (print last since this overlaps with other items that
        # otherwise total to the number processed)
        ############################################################
        if updated_edd_strain_text:
            title = 'Strains with name/desc. updated to match ICE'
            aligned_title = title.ljust(main_title_col_width, fill_char)
            value = str(len(self._updated_edd_strain_text))
            print(fill_char.join((aligned_title, value.rjust(main_value_col_width, fill_char))))

    def print_summary(self):
        did_processing = self.total_edd_strains_processed or self.total_ice_entries_processed

        print(OUTPUT_SEPARATOR)
        print('Processing Summary')
        print(OUTPUT_SEPARATOR)

        if not did_processing:
            print('No processing was completed (though some may have been attempted)')
            return

        space = 3

        ############################################################################################
        # Print summary of EDD strain processing
        ############################################################################################
        if self.total_edd_strains_processed:
            if self.total_ice_entries_processed:
                print('')
                print("Note: there's potential for overlap between subsections here! ICE entries "
                      "referenced by EDD strains are "
                      "examined while scanning EDD strains during the first step. If configured, "
                      "ICE entries not examined during the first step will also be "
                      "scanned/processed independently of EDD to catch any dangling links to "
                      "studies that no longer exist in EDD, or that no longer reference linked "
                      "ICE entries.")
                print('')

            self.print_edd_summary(space)

        ############################################################################################
        # Print summary of ICE entry processing (some is performed even if ICE isn't scanned
        # independently of EDD)
        ############################################################################################

        if not self.total_ice_entries_processed:
            return

        # account for configurability of whether ICE entries are scanned independent of their
        # relation to what's directly referenced from EDD
        entries_found = (self.total_ice_entries_found if self.total_ice_entries_found else
                         self.total_ice_entries_processed)
        percent_processed = ((self.total_ice_entries_processed / entries_found) * 100
                             if entries_found else 0)
        scanned_ice_entries = bool(self.total_ice_entries_found)
        scanned = 'were NOT' if not scanned_ice_entries else 'WERE'

        print('')
        subsection_header = ('ICE entries (processed/found): %(entries_processed)s / '
                             '%(entries_found)s (%(percent_processed)0.2f%%)' % {
                                 'entries_processed':
                                     locale.format('%d', self.total_ice_entries_processed,
                                                   grouping=True),
                                 'entries_found': locale.format('%d', entries_found, grouping=True),
                                 'percent_processed': percent_processed,
                             })
        subsection_separator = '-'.rjust(len(subsection_header), '-')

        print(subsection_separator)
        print(subsection_header)
        print(subsection_separator)

        print('ICE entries %s scanned independently of those referenced from EDD' % scanned)
        if scanned_ice_entries:
            print('Previously-processed EDD strains skipped during ICE entry scan: %s' %
                  locale.format('%d', self.previously_processed_strains_skipped))

        print('')
        subsection_header = 'ICE experiment link processing:'
        subsection_separator = '-'.rjust(len(subsection_header), '-')
        print(subsection_separator)
        print(subsection_header)
        print(subsection_separator)

        first_level_summary = OrderedDict()
        first_level_summary['Missing EDD links created'] = (
            locale.format('%d', self._missing_links_created, grouping=True))
        first_level_summary['Existing links processed'] = (
            locale.format('%d', self._existing_links_processed, grouping=True))
        title_col_width = max(len(title) for title in first_level_summary.keys()) + space
        value_col_width = max(len(value) for value in first_level_summary.values()) + space
        for title, value_str in first_level_summary.items():
            aligned_title = title.ljust(title_col_width, fill_char)
            print(fill_char.join((aligned_title, value_str.rjust(value_col_width, fill_char))))

        ############################################################################################
        # build a dict of other results to be displayed so we can justify them in columns for
        # printing
        links_processed = OrderedDict()
        links_processed['Unmaintained links renamed'] = locale.format(
                '%d', self._unmaintained_links_renamed, grouping=True)
        links_processed['Perl-style links updated'] = locale.format(
                '%d', self._perl_links_updated, grouping=True)
        links_processed['Wrong hostname links updated'] = locale.format(
                '%d', self._wrong_hostname_links_updated, grouping=True)
        links_processed['Invalid links pruned'] = locale.format(
                '%d', self._invalid_links_pruned, grouping=True)
        links_processed['Development links pruned'] = locale.format(
                '%d', self._development_links_pruned, grouping=True)
        links_processed['Test links pruned'] = locale.format(
                '%d', self._test_links_pruned, grouping=True)
        links_processed['Valid links skipped'] = locale.format(
                '%d', self._valid_links_skipped, grouping=True)
        links_processed['External or malformed links skipped'] = locale.format(
                '%d', self._skipped_external_links, grouping=True)
        links_processed['Duplicate links removed'] = locale.format(
                '%d', self._duplicate_links_removed, grouping=True)

        # compute column widths
        sub_title_col_width = max(len(title) for title in links_processed.keys()) + space
        sub_value_col_width = max(len(digits) for digits in links_processed.values()) + space

        # print output
        for title, count_str in links_processed.items():
            aligned_title = '\t\t%s' % title.ljust(sub_title_col_width, fill_char)
            print(''.join((aligned_title, count_str.rjust(sub_value_col_width, fill_char))))


def print_shared_entry_processing_summary(entry, initial_entry_experiment_links_count,
                                          runtime_seconds):
    print('Processed %(link_count)d preexisting entry experiment '
          'links in %(runtime)s' % {
              'link_count': initial_entry_experiment_links_count,
              'runtime': to_human_relevant_delta(runtime_seconds),
          })

INTEGER_PATTERN = re.compile(r'^\d+$')


def parse_entry_types_arg(arg_value):
    str_list = json.loads(arg_value)

    entry_types = []

    for item in str_list:
        item = item.upper()
        if item in ICE_ENTRY_TYPES:
            entry_types.append(item)
        else:
            raise argparse.ArgumentTypeError(
                    '%(str)s is not a valid list of ICE entry types. A valid example value is '
                    '%(sample)s' % {
                        'str': arg_value,
                        'sample': arg_value(list(ICE_ENTRY_TYPES)), })
    return entry_types


def parse_int_or_uuid_arg(arg_value):
    if INTEGER_PATTERN.match(arg_value):
        return int(arg_value)
    elif TYPICAL_UUID_PATTERN.match(arg_value):
        return arg_value

    raise argparse.ArgumentTypeError('%s is not an integer primary key or a UUID of the form '
                                     'XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXXXXXX' % arg_value)


def main():
    """
    Executes the script
    """

    ############################################################################################
    # Configure command line parameters
    ############################################################################################
    parser = argparse.ArgumentParser(description='Scans EDD and ICE to locate and repair missing '
                                                 'or unmaintained links from ICE to EDD as a '
                                                 'result of temporary feature gaps in older EDD '
                                                 'versions, or as a result of communication '
                                                 'failures between EDD and ICE.')
    parser.add_argument('-password', '-p', help='provide a password via the command '
                                                'line (helps with repeated use / testing). If not '
                                                'provided, a user prompt will appear.')
    parser.add_argument('-username', '-u', help='provide username via the command line ('
                                                'helps with repeated use / testing). If not '
                                                'provided, a user prompt will appear.')
    edd_strain_arg_name = '-edd_strain'
    ice_entry_arg_name = '-ice_entry'
    scan_ice_entries_arg_name = '-scan_ice_entries'

    parser.add_argument(scan_ice_entries_arg_name, action='store_true',
                        help='a flag that indicates ICE entries should be scanned independently '
                             'of those referenced from EDD. This allows us to catch '
                             'ICE entries that have stale associations to EDD (most likely during '
                             'the initial run of this script). This parameter is ignored if '
                             '%(edd_strain)s or %(ice_entry)s is provided.' % {
                                 'edd_strain': edd_strain_arg_name, 'ice_entry': ice_entry_arg_name,
                             })
    include_entry_types_arg_name = '-include_entry_types'
    parser.add_argument(include_entry_types_arg_name, type=parse_entry_types_arg,
                        help='a JSON-formatted string containing a list of ICE entry types to be '
                             'included in the scan of ICE entries, or if omitted, all ICE entries'
                             ' will be scanned. This value is ignored if %(scan_ice)s '
                             'is missing, or if %(edd_strain)s or %(ice_entry)s is provided. An '
                             'example value that includes all ICE entries in the scan is '
                             '"%(entry_types)s"' % {
                                 'entry_types': str(list(ICE_ENTRY_TYPES)),
                                 'scan_ice': scan_ice_entries_arg_name,
                                 'edd_strain': edd_strain_arg_name, 'ice_entry': ice_entry_arg_name,
                             })
    no_warn_param_name = '-no_warn'
    dry_run_param_name = '-dry_run'

    parser.add_argument(edd_strain_arg_name, type=parse_int_or_uuid_arg,
                        help='the optional integer primary key or UUID for the EDD strain whose '
                             'ICE links will be examined/repaired in lieu of scanning all EDD '
                             'strains (and possibly ICE parts). If present, no scans will be '
                             'performed, but both %(edd_strain)s and  %(ice_entry)s may '
                             'be used simultaneously.' % {
                                 'edd_strain': edd_strain_arg_name, 'ice_entry': ice_entry_arg_name,
                             })

    parser.add_argument(ice_entry_arg_name, type=parse_int_or_uuid_arg,
                        help='the optional identifier (either UUID or local integer primary key '
                             'for the ICE part whose experiment links will be verified in lieu of '
                             'scanning all EDD strains (and possible ICE parts). If present, '
                             'no scans will be performed, but both %(ice_entry)s and '
                             '%(edd_strain)s may be used simultaneously.' % {
                                 'edd_strain': edd_strain_arg_name, 'ice_entry': ice_entry_arg_name,
                             })
    parser.add_argument('-update_edd_strain_text', action='store_true',
                        help="a flag that indicates that EDD strains should have their "
                             "names/descriptions updated in cases where they don't exactly"
                             "match the values stored in ICE. At present, ICE doesn't yet have"
                             "a feature to update EDD strains, so this can happen. See "
                             "SYNBIO-1330.")

    parser.add_argument(dry_run_param_name, action='store_true',
                        help='prevents data changes to ICE and EDD, simulating them instead to '
                             'show what the results of a run are likely to be')

    parser.add_argument(no_warn_param_name, action='store_true',
                        help='silences the confirmation prompt regarding the '
                             'potential risk in using the %(dry_run)s parameter. '
                             'Use with care!' % {'dry_run': dry_run_param_name})

    parser.add_argument('-test_edd_url', help='the URL to count during testing as a match '
                                              'for the connected EDD instance, regardless of the '
                                              'URL we use to access it')

    parser.add_argument('-test_edd_strain_limit', type=int,
                        help='the maximum number of EDD strains to scan')
    parser.add_argument('-test_ice_entry_limit', type=int,
                        help='the maximum number of ICE entries to scan')

    args = parser.parse_args()

    perform_scans = not (args.edd_strain or args.ice_entry)

    ############################################################################################
    # Print out important parameters
    ############################################################################################
    print(OUTPUT_SEPARATOR)
    print(os.path.basename(__file__))
    print(OUTPUT_SEPARATOR)
    print('\tSettings module:\t%s' % os.environ['ICE_SETTINGS_MODULE'])
    print('\t\tEDD URL:\t%s' % EDD_URL)
    print('\t\tICE URL:\t%s' % ICE_URL)
    if not VERIFY_EDD_CERT:
        print('\t\tVerify EDD SSL cert:\t%s' % ('Yes' if VERIFY_EDD_CERT else 'No'))
    if not VERIFY_ICE_CERT:
        print('\t\tVerify ICE SSL cert:\t%s' % ('Yes' if VERIFY_ICE_CERT else 'No'))
    print('\tCommand-line arguments:')
    if args.username:
        print('\t\tEDD/ICE Username:\t%s' % args.username)
    if args.password:
        print('\t\tEDD/ICE Password:\tprovided')
    if args.edd_strain:
        print('\t\tSingle-EDD Strain Search: %s' % args.edd_strain)
    if args.ice_entry:
        print('\t\tSingle ICE Entry Search: %s' % args.ice_entry)
    if args.scan_ice_entries:
        if perform_scans:
            print('\t\tScan ICE Entries Independently of EDD: Yes')
        else:
            print('\t\tScan ICE Entries Independently of EDD: %s ignored because a single ICE '
                  'entry '
                  'or EDD strain id was provided' % scan_ice_entries_arg_name)
    print('\t\tUpdate EDD strain name/desc. to match ICE: %s' % ('Yes' if
          args.update_edd_strain_text else 'No'))
    if args.dry_run:
        print('\t\tDry run: Yes')
    if args.test_edd_url:
        print('\t\tTest EDD Link Target URL:\t%s' % args.test_edd_url)
    if args.test_edd_strain_limit:
        print('\t\tTest EDD Strain Limit:\t%s' % args.test_edd_strain_limit)
    if args.test_ice_entry_limit:
        print('\t\tTest ICE Entry Limit:\t%s' % args.test_ice_entry_limit)
    print('')
    print(OUTPUT_SEPARATOR)

    overall_performance = Performance()
    processing_summary = ProcessingSummary()

    user_input = UserInputTimer()
    edd = None
    ice = None

    cleaning_edd_test_instance = not is_edd_production_url(EDD_URL)
    cleaning_ice_test_instance = not is_ice_production_url(ICE_URL)

    ############################################################################################
    # Verify that URL's start with HTTP*S* for non-local use. Don't allow mistaken config to
    # expose access credentials! Pre-Docker local testing required insecure http, so this mistake
    # is easy to make!
    ############################################################################################
    if not is_url_secure(EDD_URL, print_err_msg=True, app_name='EDD'):
        return 0
    if not is_url_secure(ICE_URL, print_err_msg=True, app_name='ICE'):
        return 0

    if cleaning_edd_test_instance != cleaning_ice_test_instance:
        print("Input settings reference ICE/EDD deployments that are deployed in different "
              "environments (e.g. development/test/production)")
        return 0

    # determine whether or not to verify EDD's / ICE's SSL certificate. Ordinarily, YES,
    # though we want to allow for local testing of this script on developers' machines using
    # self-signed certificates.
    # silence library warnings if we're skipping SSL certificate verification for local testing.
    # otherwise the warnings will swamp useful output from this script.
    if not (VERIFY_EDD_CERT and VERIFY_ICE_CERT):
        requests.packages.urllib3.disable_warnings(InsecureRequestWarning)

    # force user to confirm dry-run risks, or else print a warning if they've chosen to silence the
    # prompt
    if args.dry_run:
        if args.no_warn:
            logger.warning('Proceeding with potentially risky dry-run (confirmation '
                           'prompt silenced via %s)' % no_warn_param_name)
        else:
            print("WARNING: RISKY OPERATION!!! You've requested a dry run of this script, "
                  "but the dry run feature depends on proper maintenance of test stub classes "
                  "defined in this script along with the production code in IceApi and EddApi. "
                  "Both production classes were under active development at the time this script "
                  "was implemented, so there's a significant risk that the dry run feature will be "
                  "broken by future development work. Before proceeding, you should inspect the "
                  "code to double-check that this feature still works as intended. You can "
                  "short-circuit this prompt using the %s parameter" % no_warn_param_name)
            reply = user_input.user_input("Do you want to proceed and risk "
                                          "unintended data changes? (Y/n): ").strip().lower()
            if not ('y' == reply or 'yes' == reply):
                return 0

    # build URL patterns

    # Set experiment link target URL for EDD. For testing, it may be different than the URL we're
    # connected to. Allows for local testing against a copy of the production EDD database without
    # risking any changes to production.
    edd_link_target_hostname = urlparse(EDD_URL).hostname if not args.test_edd_url else \
        urlparse(args.test_edd_url).hostname

    perl_study_url_pattern = build_perl_study_url_pattern(edd_link_target_hostname)
    study_url_pattern = build_study_url_pattern(edd_link_target_hostname)

    # package up inputs that determine how processing is performed. There are too
    #  many / they change too often during development to pass around individually as method
    # parameters
    processing_inputs = ProcessingInputs(study_url_pattern=study_url_pattern,
                                         perl_study_url_pattern=perl_study_url_pattern,
                                         test_edd_base_url=args.test_edd_url,
                                         cleaning_edd_test_instance=cleaning_edd_test_instance,
                                         cleaning_ice_test_instance=cleaning_ice_test_instance,
                                         test_edd_strain_limit=args.test_edd_strain_limit,
                                         test_ice_entry_limit=args.test_ice_entry_limit,
                                         update_edd_strain_text=args.update_edd_strain_text)

    try:
        ##############################
        # log into EDD
        ##############################
        login_application = 'EDD'
        edd_login_details = session_login(EddSessionAuth, EDD_URL, login_application,
                                          username_arg=args.username, password_arg=args.password,
                                          user_input=user_input, print_result=True,
                                          timeout=EDD_REQUEST_TIMEOUT,
                                          verify_ssl_cert=VERIFY_EDD_CERT)
        edd_session_auth = edd_login_details.session_auth

        edd = (EddApi(edd_session_auth, EDD_URL, verify=VERIFY_EDD_CERT) if not
        args.dry_run else
               EddTestStub(edd_session_auth, EDD_URL, verify=VERIFY_EDD_CERT))
        edd.write_enabled = args.update_edd_strain_text
        edd.result_limit = EDD_RESULT_PAGE_SIZE
        edd.timeout = EDD_REQUEST_TIMEOUT
        processing_inputs.edd = edd

        # TODO: consider adding a REST API resource & use it to test whether this user
        # has admin access to EDD. provide an
        # early / graceful / transparent failure

        ##############################
        # log into ICE
        ##############################
        login_application = 'ICE'
        ice_login_details = session_login(IceSessionAuth, ICE_URL, login_application,
                                          username_arg=edd_login_details.username,
                                          password_arg=edd_login_details.password,
                                          user_input=user_input, print_result=True,
                                          timeout=ICE_REQUEST_TIMEOUT,
                                          verify_ssl_cert=VERIFY_ICE_CERT)

        ice_session_auth = ice_login_details.session_auth

        # remove password(s) from memory as soon as used
        edd_login_details.password = None
        ice_login_details.password = None

        ice = (IceApi(ice_session_auth, ICE_URL, result_limit=ICE_RESULT_PAGE_SIZE,
                      verify_ssl_cert=VERIFY_ICE_CERT) if not args.dry_run
               else
               IceTestStub(ice_session_auth, ICE_URL, result_limit=ICE_RESULT_PAGE_SIZE,
                           verify_ssl_cert=VERIFY_ICE_CERT))
        ice.write_enabled = True
        processing_inputs.ice = ice
        ice.timeout = ICE_REQUEST_TIMEOUT

        # test whether this user is an ICE administrator. If not, we won't be able
        # to proceed until EDD-177 is resolved (if then, depending on the solution)
        user_is_ice_admin = is_ice_admin_user(ice=ice, username=ice_login_details.username)
        if not user_is_ice_admin:
            return 0

        # if no specific EDD strain or ICE entry identifier was provided as a parameter,
        # scan all EDD strains, and possibly ICE entries, as configured
        if perform_scans:
            scan_edd_strains(processing_inputs, processing_summary, overall_performance)
            overall_performance.ice_entry_scan_start_time = arrow.utcnow()

            # if configured, process entries in ICE that weren't just examined above.
            # This is probably only necessary during the initial few runs to correct for
            # link maintenance gaps in earlier versions of EDD/ICE
            if args.scan_ice_entries:
                scan_ice_entries(processing_inputs, args.include_entry_types,
                                 processing_summary)
                overall_performance.ice_entry_scan_time = (
                    arrow.utcnow() - overall_performance.ice_entry_scan_start_time)

        # if specific EDD strain and/or ICE entry ID's were provided, only examine the
        # requested Things in lieu of an expensive scan
        else:
            edd_strain_id = args.edd_strain
            if edd_strain_id:
                edd_strain = edd.get_strain(edd_strain_id)
                processing_summary.total_edd_strains_found = 1 if edd_strain else 0

                if edd_strain:
                    process_all_ice_entry_links = False
                    process_edd_strain(edd_strain, processing_inputs,
                                       process_all_ice_entry_links, processing_summary)
                else:
                    print('INVALID INPUT: No EDD strain was found with id %(id)s at %(url)s'
                          % {'id': edd_strain_id, 'url': EDD_URL, })

            ice_entry_id = args.ice_entry
            if ice_entry_id:
                entry = ice.get_entry(ice_entry_id)
                processing_summary.total_ice_entries_found = 1 if entry else 0
                if entry:
                    process_ice_entry(entry, processing_inputs, processing_summary)
                else:
                    print('INVALID INPUT: No ICE entry was found with identifier '
                          '%(entry_id)s at %(ice_url)s' % {
                              'entry_id': ice_entry_id, 'ice_url': ICE_URL,
                          })

    except Exception as e:
        logger.exception('An error occurred')
    finally:
        print('')
        processing_summary.print_summary()

        overall_performance.overall_end_time = arrow.utcnow()
        if edd:
            overall_performance.edd_communication_time = edd.session.wait_time
        if ice:
            overall_performance.ice_communication_time = ice.session.wait_time

        print('')
        overall_performance.print_summary()


def scan_edd_strains(processing_inputs, processing_summary, overall_performance):
    ############################################################
    # Search EDD for strains, checking each one against ICE
    ############################################################
    # get convenient references to inputs
    edd = processing_inputs.edd
    test_edd_strain_limit = processing_inputs.test_edd_strain_limit

    print('')

    print(OUTPUT_SEPARATOR)
    quantity = 'all' if not test_edd_strain_limit else '%d Test' % test_edd_strain_limit
    print('Comparing %s EDD strains to ICE... ' % quantity)
    print(OUTPUT_SEPARATOR)

    tested_edd_strain_count = 0
    hit_test_limit = False

    # loop over EDD strains, processing a page of strains at a time
    strains_page = edd.search_strains()
    page_num = 1
    while strains_page and strains_page.current_result_count:

        print('EDD: received %(received)s of %(total)s strains (page %(page_num)s)' % {
            'received': locale.format('%d', strains_page.current_result_count, grouping=True),
            'total': locale.format('%d', strains_page.total_result_count, grouping=True),
            'page_num': locale.format('%d', page_num, grouping=True),
        })

        if page_num == 1:
            processing_summary.total_edd_strains_found = strains_page.total_result_count

        # loop over strains in this results page, updating ICE's links to each one
        for strain_index, edd_strain in enumerate(strains_page.results):
            process_all_ice_entry_links = True
            overall_result_index = float(edd.get_overall_result_index(strain_index, page_num))+1
            scan_percent_when_complete = ((overall_result_index /
                                          strains_page.total_result_count) * 100
                                          if overall_result_index else 0)
            process_edd_strain(edd_strain, processing_inputs, process_all_ice_entry_links,
                               processing_summary, scan_percent_when_complete)

            # enforce a small number of tested strains for starters so tests complete
            # quickly
            tested_edd_strain_count += 1
            hit_test_limit = tested_edd_strain_count == test_edd_strain_limit
            if hit_test_limit or is_aborted():
                print('')
                print('Hit test limit of %d EDD strains. Ending strain processing '
                      'early.' % test_edd_strain_limit)
                break

        if hit_test_limit or is_aborted():
            break

        # get another page of strains from EDD
        if strains_page.is_paged() and strains_page.next_page:
            strains_page = edd.search_strains(query_url=strains_page.next_page)
            page_num += 1
        else:
            strains_page = None

    overall_performance.completed_edd_strain_scan()
    if not hit_test_limit:
        print('')
    print('Done processing %(strain_count)d EDD strains in %(elapsed_time)s' % {
        'strain_count': processing_summary.total_edd_strains_processed,
        'elapsed_time': to_human_relevant_delta(
                overall_performance.edd_strain_scan_time.total_seconds())
    })


def scan_ice_entries(processing_inputs, search_ice_part_types, processing_summary):
    """
    Searches ICE for entries of the specified type(s), then examines experiment links for each part
    whose ID isn't in processed_edd_strain_uuids, comparing any EDD-referencing experiment links to
    EDD and maintaining the links as appropriate.
    :param processing_inputs: inputs that control the processing performed
    :param search_ice_part_types: a list of entry types to be examined in ICE, or None to examine
    all entries.

    """

    ice = processing_inputs.ice
    test_entry_limit = processing_inputs.test_ice_entry_limit

    print('')
    print(OUTPUT_SEPARATOR)
    entries_summary = '' if not test_entry_limit else '%d Test' % test_entry_limit
    print('Comparing %s ICE entries to EDD... ' % entries_summary)
    print(OUTPUT_SEPARATOR)

    search_results_page = ice.search_entries(entry_types=search_ice_part_types)
    page_num = 1
    tested_entry_count = 0
    hit_test_limit = False

    # loop over ICE entries, finding and pruning stale links to EDD strains / studies
    # that no longer reference them. We'll skip ICE entries that we just examined from
    # the EDD perspective above, since there's a low probability they've been updated since
    while search_results_page and search_results_page.current_result_count:
        print('ICE: received %(received)s of %(total)s entries (page %(page_num)s)' % {
            'received': locale.format('%d', search_results_page.current_result_count,
                                      grouping=True),
            'total': locale.format('%d', search_results_page.total_result_count, grouping=True),
            'page_num': locale.format('%d', page_num, grouping=True)
        })

        if page_num == 1:
            processing_summary.total_ice_entries_found = search_results_page.total_result_count
        elif search_results_page.total_result_count != processing_summary.total_ice_entries_found:
            total_entries_found = processing_summary.total_ice_entries_found
            logger.warning('Search result total for page %(page_num)s (%(new_total)s)is different '
                           'from the total reflected by page 1 (%(initial_total)s. It appears that '
                           'some entries have been added or removed while this script was '
                           'running' % {
                               'page_num': locale.format('%d', page_num, grouping=True),
                               'initial_total': locale.format('%d', total_entries_found,
                                                              grouping=True),
                               'new_total': locale.format('%d',
                                                          search_results_page.total_result_count,
                                                          grouping=True)
                           })

        # loop over ICE entries in the current results page
        for result_index, search_result in enumerate(search_results_page.results):
            entry = search_result.entry

            print('')
            subheading = 'Processing ICE entry %(part_number)s (uuid %(uuid)s)...' % {
                'part_number': entry.part_id, 'uuid': entry.uuid,
            }
            separator = '-'.ljust(len(subheading), '-')
            print(separator)
            print(subheading)
            print(separator)

            print('Entry %(result_num)s of %(page_size)s in results page %(page_num)s.' % {
                    'result_num': locale.format('%d', result_index + 1, grouping=True),
                    'page_size': locale.format('%d', search_results_page.current_result_count,
                                               grouping=True),
                    'page_num': locale.format('%d', page_num, grouping=True),
            })

            overall_result_index = float(ice.get_overall_result_index(result_index, page_num))
            scan_percent_when_complete = ((
                                     overall_result_index /
                                     search_results_page.total_result_count) * 100 if
                                     overall_result_index else 0)

            # skip entries that we just processed when examining EDD strains. Possible these
            # relationships have changed since our pass through EDD, but most likely that
            # nothing has changed or that EDD properly maintained the ICE links in the interim
            if processing_summary.is_edd_strain_processed(entry.uuid):
                processing_summary.skipped_previously_processed_entry(entry.uuid)
                print_ice_scan_completion(scan_percent_when_complete)
                continue

            process_ice_entry(entry, processing_inputs, processing_summary,
                              scan_percent_when_complete=scan_percent_when_complete)
            tested_entry_count += 1

            hit_test_limit = tested_entry_count == test_entry_limit

            if hit_test_limit:
                print("Hit test limit of %d ICE entries. Ending ICE entry processing early." %
                      tested_entry_count)
                break

        if hit_test_limit:
            break

        # if available, get another page of results
        if search_results_page.is_paged() and search_results_page.next_page:
            page_num += 1
            search_results_page = ice.search_entries(entry_types=search_ice_part_types,
                                                     page_number=page_num)

    if not search_results_page:
        logger.warning("Didn't find any ICE parts in the search")


def process_ice_entry(entry, processing_inputs, processing_summary,
                      scan_percent_when_complete=None):
    """
    Processes a single ICE entry, checking its experiment links and creating / maintaining any
    included links to EDD.
    """
    start_time = arrow.utcnow()
    ice = processing_inputs.ice
    edd = processing_inputs.edd

    # check for a matching EDD strain. This is the desired use case if we're doing a run that only
    # checks a single ICE entry, and if this is part of a longer run (an ICE scan following an EDD
    # scan), it's good to double-check since several tens of minutes may have passed since we
    # scanned EDD
    edd_strain = edd.get_strain(entry.uuid)
    preexisting_entry_links_dict = {}

    # if this entry matches an EDD strain, maintain its links against EDD
    if edd_strain:
        strain_performance = StrainProcessingPerformance(edd_strain, arrow.utcnow(),
                                                         edd.session.wait_time,
                                                         ice.session.wait_time)

        if not isinstance(entry, IceStrain):
            processing_summary.found_non_strain_entry(edd_strain, entry)

        # compare links against EDD, updating as necessary
        process_matching_strain(edd_strain, entry, True, processing_inputs, processing_summary,
                                strain_performance)

    # if this entry doesn't match an EDD strain (likely during the ICE scan, since we skip all
    # strains that were just checked against EDD),  get its experiment links and remove any that
    # reference this EDD deployment
    else:

        preexisting_entry_links_dict = build_ice_entry_links_cache(ice, entry.uuid)

        # remove all EDD links from this entry, if any
        for url, experiment_link in preexisting_entry_links_dict.items():
            perl_link_pattern = processing_inputs.perl_study_url_pattern
            study_url_pattern = processing_inputs.study_url_pattern
            if (study_url_pattern.match(url) or perl_link_pattern.match(url) or
                    WRONG_HOSTNAME_PATTERN.match(url)):

                # TODO: SYNBIO-1350: use entry.uuid after prerequisite SYNBIO-1207 is complete.
                ice.remove_experiment_link(entry.uuid, experiment_link.id)

    processing_summary.total_ice_entries_processed += 1
    run_duration = arrow.utcnow() - start_time
    preexisting_links_count = len(preexisting_entry_links_dict)
    print_shared_entry_processing_summary(entry, preexisting_links_count,
                                          run_duration.total_seconds())

    if scan_percent_when_complete is not None:
        print_ice_scan_completion(scan_percent_when_complete)


def print_ice_scan_completion(percent_complete):
    print('ICE scan %0.2f%% complete' % percent_complete)


def build_ice_entry_links_cache(ice, entry_uuid):
    """
    Queries ICE and creates a local cache of experiment links for this ICE entry. To reduce the
    chances of
    encountering a race condition during ongoing user modifications to EDD / ICE, the lifetime of
    this cache data should be minimized. Thankfully, if a race condition is encountered and EDD /
    ICE experiments get out-of-sync, we should be able to re-run this script to correct problems
    (and with low probability, create some new ones).

     For absolute consistency with EDD, we'd have to temporarily disable or delay
     creations/edits for lines so we don't create a race condition for
     updates to this strain that occur while the script is inspecting this
     it. Instead, we'll opt for simplicity and tolerate a small chance of
     creating new inconsistencies with the script, since we can just run it
     again to correct errors / potentially create new ones :-)

      :returns a map of lower-case link url -> ExperimentLink for all links associated with this
      entry
    """
    all_experiment_links = {}

    results_page = ice.get_entry_experiments(entry_uuid)
    while results_page and not is_aborted():
        for link in results_page.results:
            all_experiment_links[link.url.lower()] = link

        # get another page of results
        if results_page.next_page:
            results_page = ice.get_entry_experiments(query_url=results_page.next_page)
        else:
            results_page = None

    return all_experiment_links


class ProcessingInputs(object):
    def __init__(self, study_url_pattern, perl_study_url_pattern, test_edd_base_url,
                 cleaning_edd_test_instance, cleaning_ice_test_instance, test_edd_strain_limit,
                 test_ice_entry_limit, update_edd_strain_text):
        """
        :param cleaning_ice_test_instance: true if the ICE instance being maintained is a test
        instance. If False, all reverences to EDD test instances will be removed on the assumption
         that they were accidental artifacts of software testing with improperly configured URLs.
        """
        self.edd = None
        self.ice = None
        self.scan_ice_entries = scan_ice_entries
        self.study_url_pattern = study_url_pattern
        self.perl_study_url_pattern = perl_study_url_pattern
        self.test_edd_base_url = test_edd_base_url
        self.cleaning_edd_test_instance = cleaning_edd_test_instance
        self.cleaning_ice_test_instance = cleaning_ice_test_instance
        self.test_edd_strain_limit = test_edd_strain_limit
        self.test_ice_entry_limit = test_ice_entry_limit
        self.update_edd_strain_text = update_edd_strain_text


def build_dated_url_variations(study_pk, processing_inputs):
    """
    Builds the set of known URL variations for this study that are no longer current. This is
    very similar to processing performed in do_initial_run_ice_entry_link_processing(),
    but should be more efficient to use during the initial phase of the EDD strain processing.
    :param study_pk: the numeric primary key for the study
    :param processing_inputs:
    :return: a tuple with all the known lower-case variations of dated URLs for this study
    """
    # look for an unmaintained link to the study URL from the older
    # perl version of EDD (these exist!). If found, update it.
    alternate_base_url = processing_inputs.test_edd_base_url
    link_target_hostname = urlparse(
            alternate_base_url).hostname if alternate_base_url else urlparse(EDD_URL).hostname

    # Perl-style links
    perl_http_study_url = build_perl_study_url(study_pk, link_target_hostname).lower()
    perl_https_study_url = build_perl_study_url(study_pk, link_target_hostname, https=True).lower()

    # wrong hostname link (we only need one protocol variation here since data was only present
    # for a short time)
    wrong_host_url = 'https://edd.jbei.lbl.gov/study/%d/' % study_pk

    return (perl_http_study_url, perl_https_study_url, wrong_host_url)


def process_matching_strain(edd_strain, ice_entry, process_all_ice_entry_links,
                            processing_inputs, processing_summary, strain_performance):
    """
    Compares matching EDD strains and ICE entries, updating the ICE strain's experiment links to
    reference studies where the strain is used in EDD.
    :param edd_strain: EDD's cached reference to the strain
    :param ice_entry: the ICE entry for this strain
    :param process_all_ice_entry_links: True to process all of the links from this ICE strain, False
    to only process the ones that match EDD. TODO: can probably remove this
    :param processing_inputs: processing inputs. Many / variable contents during development
    :param processing_summary: the processing summary for this script
    :param strain_performance: tracks performance in updating this strain
    :return:
    """
    edd = processing_inputs.edd
    ice = processing_inputs.ice

    # build a cache of all experiment links from this ICE entry. The cache should be fairly
    # short-lived, so unlikely to create race conditions
    ice_entry_uuid = edd_strain.registry_id
    all_strain_experiment_links = build_ice_entry_links_cache(ice, ice_entry_uuid)
    strain_performance.ice_link_search_time = (arrow.utcnow() - strain_performance.start_time)
    unprocessed_strain_experiment_links = all_strain_experiment_links.copy()

    # detect whether the EDD/ICE strain names & descriptions match. If not, conditionally apply
    # those in ICE to EDD, since EDD strains should be derived from those in ICE
    name_changed = ice_entry.name != edd_strain.name
    description_changed = ice_entry.short_description != edd_strain.description
    if name_changed or description_changed:
        old_name = edd_strain.name if name_changed else None
        new_name = ice_entry.name if name_changed else None
        old_description = edd_strain.description if description_changed else None
        new_description = ice_entry.short_description if description_changed else None

        if processing_inputs.update_edd_strain_text:
            edd.update_strain(name=ice_entry.name, description=ice_entry.short_description,
                              registry_id=ice_entry.uuid)
            processing_summary.updated_edd_strain_text(edd_strain, ice_entry, old_name, new_name,
                                                       old_description, new_description)
        else:
            processing_summary.found_strain_text_diff(edd_strain, ice_entry, old_name, new_name,
                                                      old_description, new_description)

    # query EDD for all studies that reference this strain
    changed_links = False
    strain_studies_page = edd.get_strain_studies(edd_strain.pk) if not is_aborted() else None
    while strain_studies_page and not is_aborted():

        for study in strain_studies_page.results:
            existing_valid_study_links = {}
            found_dated_urls = {}

            # if is_aborted(): # TODO: consider re-adding if we can't use Celery's AbortableTask,
            # and therefore don't have to worry about the performance hit for testing aborted
            # status
            #       break

            alternate_base_url = processing_inputs.test_edd_base_url
            study_url = edd.get_abs_study_browser_url(study.pk,
                                                      alternate_base_url=alternate_base_url).lower()
            strain_to_study_link = all_strain_experiment_links.get(study_url)
            unprocessed_strain_experiment_links.pop(study_url, None)

            # if no up-to-date link was found to this EDD study, find all links to the study
            # that are using dated URL schemes, then update or remove them as appropriate.
            if not strain_to_study_link:
                dated_url_variations = build_dated_url_variations(study.pk, processing_inputs)

                for dated_url_variant in dated_url_variations:
                    dated_link = unprocessed_strain_experiment_links.pop(dated_url_variant, None)

                    # if we found a dated link, update it to use EDD's new URL scheme
                    if dated_link:

                        found_dated_urls[dated_url_variant] = dated_link

                        # updated only the first dated URL that refers to this study. If updated,
                        # others would be duplicates, so we'll remove them.
                        if len(found_dated_urls) == 1:
                            old_study_name = (dated_link.label if dated_link else None)

                            # TODO: possible optimization here...this method was written on the
                            # assumption that no prior processing was performed,
                            # so it's re-querying/checking the existing ICE links that we just
                            # cached. Used in multiple places in this script, though during
                            # testing, ICE communication during the scan is by far the biggest
                            # offender in terms of execution time when the ICE scan is performed.
                            # TODO: SYNBIO-1350: use entry.uuid to remove workaround after
                            # prerequisite SYNBIO-1207 is complete.
                            workaround_ice_id = ice_entry.id
                            ice.link_entry_to_study(workaround_ice_id, study.pk, study_url,
                                                    study.name, old_study_name=old_study_name,
                                                    old_study_url=dated_link.url, logger=logger)
                            if processing_inputs.perl_study_url_pattern.match(dated_url_variant):
                                processing_summary.updated_perl_link(ice_entry, dated_link)
                            elif WRONG_HOSTNAME_PATTERN.match(dated_url_variant):
                                processing_summary.updated_wrong_hostname_link(ice_entry,
                                                                               dated_link)
                            else:
                                logger.warning(
                                    'Updated dated link %s not captured in metrics' %
                                    dated_url_variant)
                        else:
                            # TODO: SYNBIO-1350: use entry.uuid to remove workaround after
                            # prerequisite SYNBIO-1207 is complete.
                            workaround_ice_id = ice_entry.id
                            ice.remove_experiment_link(workaround_ice_id, dated_link.id)
                            processing_summary.removed_duplicate_link(ice_entry, dated_link)

                        strain_performance.links_updated += 1
                        changed_links = True

                        # otherwise, track how many existing valid links we skipped over
            if found_dated_urls:
                continue

            if strain_to_study_link and (strain_to_study_link.label == study.name):
                        existing_valid_study_links[
                            strain_to_study_link.url.lower()] = strain_to_study_link
                        processing_summary.skipped_valid_link(ice_entry, strain_to_study_link)

            # if no link to the study has been found, or if one exists with an unmaintained
            # name, create / update the link
            else:
                old_study_name = strain_to_study_link.label if strain_to_study_link else None
                ice.link_entry_to_study(ice_entry_uuid, study.pk, study_url, study.name, logger,
                                        old_study_name)
                if old_study_name:
                    processing_summary.renamed_unmaintained_link(ice_entry, strain_to_study_link,
                                                                 study.name)
                else:
                    processing_summary.created_missing_link(ice_entry, study_url)
                changed_links = True
                strain_performance.links_updated += 1

        # get the next page (if any) of studies associated with this strain
        if strain_studies_page.next_page:
            strain_studies_page = edd.get_strain_studies(query_url=strain_studies_page.next_page)
        else:
            strain_studies_page = None

    # look over ICE experiment links for this entry that we didn't add, update, or remove as a
    # result of up-to-date study/strain associations in EDD. If any remain that match the
    # pattern of EDD URL's, they're invalid and need to be removed. This complete processing
    # of the ICE entry's experiment links will also allow us to skip over this entry later
    # in the process if we scan ICE to look for other entries with outdated links to EDD
    if process_all_ice_entry_links:
        for link_url, experiment_link in unprocessed_strain_experiment_links.items():
            # don't modify any experiment URL that doesn't directly map to
            # a known EDD URL. Researchers can create these manually, and we
            # don't want to remove any that EDD didn't create. Valid-but-dated EDD URL
            # patterns should  already have been handled above
            study_url_pattern = processing_inputs.study_url_pattern
            perl_study_url_pattern = processing_inputs.perl_study_url_pattern
            invalid_edd_url_match = (study_url_pattern.match(experiment_link.url) or
                                     perl_study_url_pattern.match(link_url) or
                                     WRONG_HOSTNAME_PATTERN.match(link_url))
            if invalid_edd_url_match:
                # TODO: SYNBIO-1350: use entry.uuid after prerequisite SYNBIO-1207 is complete.
                workaround_ice_id = ice_entry.id
                ice.remove_experiment_link(workaround_ice_id, experiment_link.id)
                processing_summary.removed_invalid_link(ice_entry, experiment_link)
                changed_links = True
            else:
                processing_summary.skipped_external_link(ice_entry, experiment_link)
        unprocessed_strain_experiment_links.clear()
    else:
        runtime_seconds = (arrow.utcnow() - strain_performance.start_time).total_seconds()
        if unprocessed_strain_experiment_links:
            print('Skipped %d experiment links from the associated ICE part that did not '
                  'reference this EDD strain' % len(unprocessed_strain_experiment_links))
            print_shared_entry_processing_summary(ice_entry, len(all_strain_experiment_links) - len(
                    unprocessed_strain_experiment_links), runtime_seconds)
        else:
            print("No experiment links found for this ICE entry that didn't reference this "
                  "EDD strain")

    # keep track of whether strain links were modified
    if changed_links:
        processing_summary.processed_edd_strain_with_changes(edd_strain, ice_entry)
    else:
        processing_summary.found_edd_strain_with_up_to_date_links(edd_strain, ice_entry)

    # track performance for completed processing
    strain_performance.ice_link_cache_lifetime = arrow.utcnow() - strain_performance.start_time
    strain_performance.set_end_time(arrow.utcnow(), edd.session.wait_time,
                                    ice.session.wait_time)
    print_shared_entry_processing_summary(ice_entry, len(all_strain_experiment_links) - len(
        unprocessed_strain_experiment_links), (
                                           strain_performance.end_time -
                                           strain_performance.start_time).total_seconds())
    strain_performance.print_summary()


def process_edd_strain(edd_strain, processing_inputs, process_all_ice_entry_links,
                       processing_summary, scan_percent_when_complete=None):
    """
    Processes a single EDD strain, verifying that ICE already has links to its associated
    studies, or creating / maintaining them as needed to bring ICE up-to-date.
    :param scan_percent_when_complete:
    :param edd_strain: the edd Strain to process
    :param process_all_ice_entry_links: True to process all experiment links associated with the
    linked ICE entry. This enables us to optimize a later scan of ICE by skipping this ICE entry
    entirely.
    it doesn't have the required ICE URL / UUID
    during the (long) execution time of the whole program
    :return True if the strain was successfully processed, False if something prevented it from
    being processed
    """
    edd = processing_inputs.edd
    ice = processing_inputs.ice

    # print a subheader for this part of the process
    print('')
    subheader = 'Processing EDD strain "%(strain_name)s" (pk=%(strain_pk)d)...' % {
        'strain_name': edd_strain.name, 'strain_pk': edd_strain.pk,
    }

    separator = '-'.ljust(len(subheader), '-')
    print(separator)
    print(subheader)
    print(separator)

    strain_performance = (
        StrainProcessingPerformance(edd_strain, arrow.utcnow(), edd.session.wait_time,
                                    ice.session.wait_time,
                                    scan_percent_when_complete=scan_percent_when_complete))
    if not edd_strain.registry_id:
        processing_summary.found_orphaned_edd_strain(edd_strain)
        strain_performance.set_end_time(arrow.utcnow(), edd.session.wait_time,
                                        ice.session.wait_time)
        strain_performance.print_summary()
        return False

    # get a reference to the ICE entry referenced from this EDD strain. because
    # of some initial gaps in EDD's strain creation process, it's possible that
    # a few non-strains snuck in here that we need to detect.
    # Additionally, looking up the ICE part gives us a cleaner way of working
    #  around SYNBIO-XXX, which causes ICE to return 500 error instead of 404
    # when experiments can't be found for a non-existent part
    ice_entry = ice.get_entry(edd_strain.registry_id)
    if not ice_entry:
        processing_summary.found_stepchild_edd_strain(edd_strain)
        strain_performance.set_end_time(arrow.utcnow(), edd.session.wait_time,
                                        ice.session.wait_time)
        strain_performance.print_summary()
        return False

    if not isinstance(ice_entry, IceStrain):
        processing_summary.found_non_strain_entry(edd_strain, ice_entry)

    # if there's an Ice entry associated with this EDD strain, compare links
    process_matching_strain(edd_strain, ice_entry, process_all_ice_entry_links,
                            processing_inputs, processing_summary, strain_performance)

    return True


def verify_ice_admin_privileges(ice, ice_username):
    ice_admin_user = is_ice_admin_user(ice, ice_username)
    if ice_admin_user is None:
        print('Unable to determine whether user "%s" has administrative privileges on'
              'ICE. Administrative privileges are required to update links to strains '
              'users don\'t have direct write access to.' % ice_username)
        print('Aborting the link maintenance process.')
        return False
    if not ice_admin_user:
        print('User "%s" doesn\'t have administrative privileges on ICE. S\he won\'t be'
              'able to update links for strains s\he doesn\'t have write access to.' % ice_username)
        print('Aborting the link maintenance process.')
        return False
    return True


if __name__ == '__main__' or __name__ == 'jbei.edd.rest.scripts.maintain_ice_links':
    result = main()
    exit(result)
