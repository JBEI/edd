# -*- coding: utf-8 -*-
"""
A collection of utility methods for interacting with REST frameworks
"""
import logging
import os
import tempfile
import webbrowser

from six import string_types
from six.moves.urllib.parse import urlparse
from threading import Timer

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
        response_file.write(response.text)
    webbrowser.open('file://%s' % temp_file_path)
    # non-blocking wait 5 seconds, then delete the temp file
    Timer(5, os.remove, args=[temp_file_path, ])


def is_url_secure(uri, print_err_msg=False, app_name=None,):
    """
    Tests whether the input URL is either local, or secured by TLS. In most circumstances, URL's
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
    is_secure_url = (
        url_parts.scheme == 'https' or
        url_parts.hostname == 'localhost' or
        url_parts.hostname == '127.0.0.1' or
        is_local_docker_deployment(uri)
    )

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


def is_local_docker_deployment(url):
    """
    Tests whether the URL host matches the IP address used by a local Docker deployment,
    as specified by the DOCKER_HOST environment variable.
    """
    url_parts = urlparse(url)
    hostname = url_parts.hostname  # guaranteed lower case

    docker_url = os.environ.get('DOCKER_HOST', None)

    if not docker_url:
        return False

    docker_hostname = urlparse(docker_url).hostname  # guaranteed lower case
    return hostname == docker_hostname


def is_localhost(url):
    """
    Tests whether the URL references localhost or one of its well-defined IP addresses
    """
    url_parts = urlparse(url)
    hostname = url_parts.hostname.lower()  # guaranteed lower case by urlparse
    return (hostname == 'localhost') or (hostname == '127.0.0.1') or (hostname == '::1')


def is_numeric_pk(input_id):
    return isinstance(input_id, int) or (
        isinstance(input_id, string_types) and input_id.isdigit()
    )
