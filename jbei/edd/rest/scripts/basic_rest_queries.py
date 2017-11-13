"""
This sample file shows a simplistic example use of EDD's client-side REST API access. For a more
robust and realistic example, see sample_rest_queries.py. To run this script

To provide the most basic example, this script makes several simplifying assumptions that
aren't likely to hold true in real-world examples:

1) EDD always returns all results in a single REST query rather than needing to page result data
over multiple requests.

2) All the data included in the study are valid / current, and none have been marked "inactive",
e.g. by user experimentation with the study.

3) The study is fully populated with data.

4) There's no need to cross-reference REST API queries while drilling down into the hierarchy of
study data (e.g. filtering for line attributes, then only processing the related assays,
measurements, measurement types, etc.

5) There's no need to look up ICE entries referenced by EDD, e.g. to access detailed strain
information.

For a more full-featured / realistic example, see sample_rest_queries.py, which implements a
more realistic scenario in which all of these simplifying assumptions are accounted for.
"""
import argparse

from jbei.rest.clients import EddApi
from jbei.rest.auth import EddSessionAuth
from logging.config import dictConfig

from . import settings

dictConfig(settings.LOGGING)


def parse_arguments():
    ############################################################################################
    # Configure command line parameters. In this sample, username/password can be provided in a
    # local_settings.py file, overridden at the command line, or the command line user is prompted
    # if they aren't found in any other source.
    ############################################################################################
    parser = argparse.ArgumentParser(description='A sample script that demonstrates anticipated '
                                                 'use of EDD REST API to simplify integration '
                                                 'work for client applications.')
    parser.add_argument('--username', '-u',
                        help='The username used to authenticate the EDD REST API'
                             'APIs. If provided, overrides username in the '
                             'settings file. If not provided, a user prompt will appear.')
    parser.add_argument('--%password', '-p',
                        help='The password used to authenticate with both EDD & ICE APIs. If '
                             'provided, overrides the password provided in the settings file.  '
                             'If not provided, a user prompt will appear.')
    parser.add_argument('--edd_url', '-e', help='the URL to use in contacting EDD.')
    parser.add_argument('--study', '-s', help='the identifier for the study ')

    return parser.parse_args()


def __main__():

    args = parse_arguments()

    study_id = args.study
    base_url = args.edd_url if args.edd_url else getattr(settings, 'EDD_URL')
    username = args.username if args.username else getattr(settings, 'EDD_USERNAME')
    password = args.password if args.password else getattr(settings, 'EDD_PASSWORD')
    verify_ssl = getattr(settings, 'VERIFY_EDD_CERT', True)

    session_auth = EddSessionAuth.login(base_url=base_url, username=username, password=password,
                                        verify_ssl_cert=verify_ssl)

    edd = EddApi(session_auth, base_url)
    study = edd.get_study(study_id)
    lines = edd.search_lines(study_id=study_id)
    assays = edd.search_assays(study_id=study_id)
    measurements = edd.search_measurements(study_id=study_id)
    measurement_values = edd.search_values(study_id=study_id)

    # look up measurement types and units observed in this study
    for meas in measurements.results:
        measurement_type = edd.get_measurement_type(meas.measurement_type)

        # look up units used in the data
        units = edd.get_measurement_unit(meas.y_units)