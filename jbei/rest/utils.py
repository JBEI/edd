"""
A collection of utility methods for interacting with REST frameworks
"""
import os
import re
import tempfile
import webbrowser
import time

from urlparse import urlparse
import logging

from jbei.utils import DOCKER_HOST_ENV_VARIABLE

logger = logging.getLogger(__name__)


UNSAFE_HTTP_METHODS = ('POST', 'PUT', 'PATCH', 'DELETE')


def show_response_html(response):
    """
    A utility method for debugging REST API calls. Launches a browser window that displays the
    response content. This method generates a several-second delay so to save the response to
    temporary file, wait for the browser to load it, and then delete the file before returning.
    :param response: an HTTP response
    """
    temp_file = tempfile.mkstemp(text=True, suffix='.html')
    temp_file_path = temp_file[1]
    with open(temp_file_path, mode='w+') as response_file:
        response_file.write(response.content)
    webbrowser.open('file://%s' % temp_file_path)
    time.sleep(5)
    os.remove(temp_file_path)


def is_url_secure(uri, print_err_msg=False, app_name=None,):
    """
    Tests whether the input URL is either local, or secured by HTTP. In most circumstances, URL's
    that don't meet these criteria are insecure for sending user credentials to. Note that a secure
    URL in and of itself isn't a guarantee that communication to that endpoint is secure.
    :param uri: the URI to test for security
    :param print_err_msg: True to print an error message if the URL isn't secure, False to return
    silently
    :app_name: the optional application name to print in error output if the URI isn't secure
    :return: true if the URI indicates user credentials will be protected, false otherwise
    """

    # parse the URI and check whether it's secure
    url_parts = urlparse(uri)
    is_secure_url = (url_parts.scheme == 'https' or url_parts.hostname == 'localhost' or
            url_parts.hostname == '127.0.0.1' or is_local_docker_deployment(uri))

    # return early if secure, or if not printing error messages
    if is_secure_url or not print_err_msg:
        return is_secure_url

    # otherwise, print some helpful output
    print("%(app)s%(space)sURL %(url)s is insecure. You must use HTTPS to maintain security for "
          "non-local URL\'s" % {
              'app': app_name if app_name else '', 'space': ' ' if app_name and uri else '',
              'url': uri if uri else '',
          })

    if DOCKER_HOST_ENV_VARIABLE not in os.environ:
        print("It's possible that this security check failed because the %s environment "
              "variable used to detect local Docker deployments isn't set." %
              DOCKER_HOST_ENV_VARIABLE)


def remove_trailing_slash(uri):
    if '/' == uri[(len(uri) - 1)]:
        return uri[0:len(uri) - 1]
    return uri


def is_success_code(http_status_code):
    return (200 <= http_status_code) and (http_status_code < 300)

def verify_edd_cert(edd_url, silence_warning=False):
    """
    Tests whether client code should verify the SSL certificate during communication with an EDD
    deployment. Ordinarily, YES, though we want to allow scripts to be successfully tested on
    developer's machines using self-signed certificates.
    :param edd_url: the URL of the EDD deployment we're communicating with
    :return: True if the SSL cert should be verified, False otherwise
    """
    is_edd_docker_deployment = is_local_docker_deployment(edd_url)
    verify_ssl_cert = not is_edd_docker_deployment
    if not verify_ssl_cert and not silence_warning:
        logger.warning('Skipping EDD certificate verification since %s is a local Docker-based '
                       'deployment (likely for testing)' % edd_url)
    return verify_ssl_cert


def verify_ice_cert(ice_url, silence_warning=False):
    verify_cert = not is_localhost(ice_url)
    if (not verify_cert) and (not silence_warning):
        logger.warning('Skipping ICE SSL certificate validation since %s is running on localhost ('
                       'likely for testing)' % ice_url)
    return verify_cert

EDD_TEST_HOSTNAME_PATTERN = re.compile(r'edd-test(?:\d?).jbei.org', re.IGNORECASE)
ICE_TEST_HOSTNAME_PATTERN = re.compile(r'registry-test(?:\d?).jbei.org', re.IGNORECASE)


def is_edd_test_instance_url(url):
    """
    Tests whether the input URL refers to a test deployment of EDD as deployed at JBEI
    """
    url_parts = urlparse(url)
    hostname = url_parts.hostname
    return bool(EDD_TEST_HOSTNAME_PATTERN.match(hostname))


def is_ice_test_instance_url(url):
    """
    Tests whether the input URL refers to a test deployment of ICE as deployed at JBEI
    """
    url_parts = urlparse(url)
    hostname = url_parts.hostname
    return bool(ICE_TEST_HOSTNAME_PATTERN.match(hostname))


def is_local_docker_deployment(url):
    """
    Tests whether the URL host matches the IP address used by a local Docker deployment,
    as specified by the DOCKER_HOST environment variable.
    """
    url_parts = urlparse(url)
    hostname = url_parts.hostname # guaranteed lower case

    docker_url = os.environ.get('DOCKER_HOST', None)

    if not docker_url:
        return False

    docker_hostname = urlparse(docker_url).hostname # guaranteed lower case
    return hostname == docker_hostname


def is_localhost(url):
    """
    Tests whether the URL references localhost or one of its well-defined IP addresses
    """
    url_parts = urlparse(url)
    hostname = url_parts.hostname.lower()  # guaranteed lower case by urlparse
    return (hostname == 'localhost') or (hostname == '127.0.0.1') or (hostname == '::1')

INTEGER_PATTERN = re.compile(r'^\d+$', re.UNICODE)
def is_numeric_pk(id):
    # print('Pk is of class %s' % id.__class__.__name__) # TODO: remove debug stmt
    # return isinstance(id, (int, long))
    return bool(INTEGER_PATTERN.match(id))

CLIENT_ERROR_NOT_FOUND = 404