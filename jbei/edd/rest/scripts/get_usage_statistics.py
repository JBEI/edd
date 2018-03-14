"""
A script that gathers and prints simple usage statistics for EDD when executed from an EDD
administrator account.

This initial version is mostly a cut-and-paste job from other scripts, and serves mainly as a
simple test of EDD's new supporting REST API features and a simplification for repeatedly
computing these statistics.
Usage statistics should likely eventually be integrated into EDD's UI.
"""
import argparse
import arrow
import os
import requests

from collections import defaultdict
from dateutil import tz
from requests.packages.urllib3.exceptions import InsecureRequestWarning

from jbei.rest.auth import EddSessionAuth
from jbei.rest.clients.edd.api import EddApi
from jbei.rest.utils import is_url_secure
from jbei.utils import session_login, TerminalFormats, UserInputTimer
from . import settings

now = arrow.utcnow()
zero_time_delta = now - now

input_timer = UserInputTimer(default_format=TerminalFormats.OKGREEN)
edd = None
ice = None

SEPARATOR_CHARS = 75
OUTPUT_SEPARATOR = ('*' * SEPARATOR_CHARS)


def main():

    ############################################################################################
    # Configure command line parameters
    ############################################################################################
    parser = argparse.ArgumentParser(
            description="Queries EDD's REST API to for the quarterly number of studies created.",
            usage='python -m jbei.edd.rest.scripts.%(prog)s [options]',)

    parser.add_argument('-username',
                        '-u',
                        help='Provide an EDD username via the command line (helps with repeated '
                             'use / testing of this script)')
    parser.add_argument('-password',
                        '-p',
                        help='Provide an EDD password via the command line (user is prompted '
                             'otherwise). A convenience for repeated use / testing of '
                             'this script.')
    parser.add_argument('-start',
                        help='The first year whose usage statistics should be queried',
                        default=2014)
    parser.add_argument('-end', help='The last year whose usage statistics should be queried.',
                        default=arrow.utcnow().year+1)
    parser.add_argument('-timezone',
                        '-tz',
                        help='Time zone for which date queries apply',
                        default='US/Pacific')
    args = parser.parse_args()

    username = args.username if args.username else getattr(settings, 'EDD_USERNAME', None)
    password = args.password if args.password else getattr(settings, 'EDD_PASSWORD', None)

    ############################################################################################
    # Repeat back important parameters
    ############################################################################################
    print(OUTPUT_SEPARATOR)
    print(os.path.basename(__file__))
    print(OUTPUT_SEPARATOR)
    print('\tSettings module:\t%s' % os.environ['ICE_SETTINGS_MODULE'])
    print('\tEDD URL:\t%s' % settings.EDD_URL)
    if username:
        print('\tEDD Username:\t%s' % username)
    print(OUTPUT_SEPARATOR)

    ############################################################################################
    # Verify that URL's start with HTTP*S* for non-local use. Don't allow mistaken config to
    # expose access credentials! Local testing requires insecure http, so this mistake is
    # easy to make!
    ############################################################################################

    if not is_url_secure(settings.EDD_URL, print_err_msg=True, app_name='EDD'):
        return 0

    # silence library warnings if we're skipping SSL certificate verification for local
    # testing. otherwise the warnings will swamp useful output from this script
    if not settings.VERIFY_EDD_CERT:
        requests.packages.urllib3.disable_warnings(InsecureRequestWarning)

    ############################################################################################
    # Prompt user to verify we've targeted the correct EDD / ICE instances.
    # Related configuration data gets changed a lot during development / testing, and we don't
    # want to accidentally apply data changes from a test to production, or waste time making
    # changes in the wrong environment.
    ############################################################################################
    print('')
    print("Please verify the inputs above, particularly the EDD URL!")
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

    years = range(args.start, args.end)
    timeout = settings.EDD_REQUEST_TIMEOUT
    edd_login_details = session_login(EddSessionAuth, settings.EDD_URL, 'EDD',
                                      username_arg=username,
                                      password_arg=password, user_input=input_timer,
                                      print_result=True, verify_ssl_cert=settings.VERIFY_EDD_CERT,
                                      timeout=settings.EDD_REQUEST_TIMEOUT)
    edd_session_auth = edd_login_details.session_auth

    # remove password from memory ASAP
    password = None
    edd_login_details.password = None

    edd = EddApi(base_url=settings.EDD_URL, auth=edd_session_auth, verify=settings.VERIFY_EDD_CERT)
    edd.timeout = settings.EDD_REQUEST_TIMEOUT

    # query EDD for studies created each quarter within requested years
    time_zone = tz.gettz(args.timezone)
    for year in years:
        print('%d:' % year)

        q1_start = arrow.get(year, 1, 1, tzinfo=time_zone)
        q2_start = arrow.get(year, 4, 1, tzinfo=time_zone)
        q3_start = arrow.get(year, 7, 1, tzinfo=time_zone)
        q4_start = arrow.get(year, 10, 1, tzinfo=time_zone)
        q4_end = arrow.get(year + 1, 1, 1, tzinfo=time_zone)

        quarterly_bounds = [(q1_start, q2_start), (q2_start, q3_start), (q3_start, q4_start),
                            (q4_start, q4_end)]
        quarterly_creations = defaultdict(list)
        for start, end in quarterly_bounds:

            results_page = edd.search_studies(created_after=start, created_before=end)
            quarterly_creations[year].append(results_page)

            created_count = results_page.total_result_count if results_page else 0
            print('\t%d' % created_count)


if __name__ == '__main__' or __name__ == 'jbei.edd.rest.scripts.get_usage_statistics':
    result = main()
    exit(result)
