# -*- coding: utf-8 -*-
"""
A collection of utility methods for interacting with REST frameworks
"""
import os
import tempfile
import webbrowser

from threading import Timer


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


def remove_trailing_slash(uri):
    if '/' == uri[-1]:
        return uri[:-1]
    return uri
