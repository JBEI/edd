"""
A collection of utility methods for interacting with REST frameworks
"""

import os
import tempfile
import webbrowser
import time

from urlparse import urlparse


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


def is_url_secure(uri):
    """
    Tests whether the input URL is either local, or secured by HTTP. In most circumstances, URL's
    that don't meet these criteria are insecure for sending user credentials to. Note that a secure
    URL in and of itself isn't a guarantee that communication to that endpoint is secure.
    :param uri: the URI to test for security
    :return: true if the URI indicates user credentials will be protected, false otherwise
    """
    url_parts = urlparse(uri)
    return url_parts.scheme == 'https' or url_parts.hostname == 'localhost' or \
           url_parts.hostname == '127.0.0.1'


def remove_trailing_slash(uri):
    if '/' == uri[(len(uri) - 1)]:
        return uri[0:len(uri) - 1]
    return uri


def is_success_code(http_status_code):
    return (200 <= http_status_code) and (http_status_code < 300)

CLIENT_ERROR_NOT_FOUND = 404
