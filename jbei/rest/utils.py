"""
A collection of utility methods for interacting with REST frameworks
"""

import os
import tempfile
import webbrowser
import time

import re


def show_response_html(response):
    """
    A utility method for debugging REST API calls. Launches a browser window that displays the
    response content. This method generates a several-second delay so to save the response to
    temporary file, wait for the browser to load it, and then delete the file before returning.
    :param response: an HTTP response
    """
    temp_file = tempfile.mkstemp(text=True, suffix='.html')
    temp_file_handle = temp_file[0]
    temp_file_path = temp_file[1]
    with open(temp_file_path, mode='w+') as response_file:
        response_file.write(response.content)
    webbrowser.open('file://%s' % temp_file_path)
    time.sleep(5)
    os.remove(temp_file_path)

port_n_suffix = r'(?:(:\d+)?)/.*'
local_uri_pattern = re.compile(r'http://localhost%s' % port_n_suffix, re.IGNORECASE)
http_uri_pattern = re.compile(r'^https://.*', re.IGNORECASE)
local_uri_address_pattern = re.compile(r'^http://127.0.0.1%s' % port_n_suffix, re.IGNORECASE)

def is_url_secure(uri):
    """
    Tests whether the input URL is either local, or secured by HTTP. In most circumstances, URL's
    that don't meet these criteria are insecure for sending user credentials to.
    :param uri: the URI to test for security
    :return: true if the URI indicates user credentials will be protected, false otherwise
    """
    return http_uri_pattern.match(uri) or local_uri_pattern.match(uri) or \
           local_uri_address_pattern.match(uri)