"""
Defines utility classes for use in HTTP request generation.
"""
import importlib
import os

import requests

# TODO: remove
# # dynamically import the settings module configured via environment variable OR specific command
# # within the host script. Note that we can't use django.conf.settings here, since we're only
# # importing custom EDD settings that unfortunately aren't persisted by django.conf.settings as are
# #  the django-defined settings (although we define both in the same file).
# settings_module = os.environ['DJANGO_SETTINGS_MODULE']
# custom_settings = importlib.import_module(settings_module)

class RequestGenerator(object):
    """
    HTTP request generation strategy for client code that wants to transparently
    create HTTP requests without the need to worry about whether or not they're part of a session,
    need to track a CSRF token, etc.
    The default implementation is to just wrap the methods of the requests library, along with
    configuring some additional useful defaults such as a consistent timeout and SSL verification
    settings that are automatically applied to each request.
    """

    VERIFY_SSL_DEFAULT = True
    DEFAULT_TIMEOUT = None

    def __init__(self, timeout=DEFAULT_TIMEOUT, verify_ssl_cert=VERIFY_SSL_DEFAULT):
        self._timeout = timeout
        self._verify_ssl_cert = verify_ssl_cert

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        # no-op...no persistent resources to close
        pass

    ################################################################################################
    # Same method signatures as static methods in the requests library. Strategy pattern! :-)
    ################################################################################################
    def request(self, method, url, **kwargs):
        self._set_defaults(**kwargs)
        return requests.request(method, url, **kwargs)

    def head(self, url, **kwargs):
        self._set_defaults(**kwargs)
        return requests.head(url, **kwargs)

    def get(self, url, **kwargs):
        self._set_defaults(**kwargs)
        return requests.get(url, **kwargs)

    def post(self, url, data=None, **kwargs):
        self._set_defaults(**kwargs)
        return requests.post(url, data, **kwargs)

    def put(self, url, data=None, **kwargs):
        self._set_defaults(**kwargs)
        return requests.put(url, data, **kwargs)

    def patch(self, url, data=None, **kwargs):
        self._set_defaults(**kwargs)
        return requests.patch(url, data, **kwargs)

    def delete(self, url, **kwargs):
        self._set_defaults(**kwargs)
        return requests.delete(url, **kwargs)

    def _set_defaults(self, **kwargs):
        # if not explicitly provided, use the default timeout configured in the constructor
        if TIMEOUT_KEY not in kwargs:
            kwargs[TIMEOUT_KEY]=self._timeout

        # if not explicitly providid, use the default setting configured in the constructor
        if VERIFY_KEY not in kwargs:
            kwargs[VERIFY_KEY]=self._verify_ssl_cert

    def set_timeout(self, timeout):
        """
        Sets the default communication timeout used for all subsequent REST HTTP requests, which can
        also be specified on a per-request basis
        :param timeout: a tuple of (connection timeout, read timeout) in seconds
        """
        self._timeout = timeout


class SessionRequestGenerator(RequestGenerator):
    """
    Defines the default implementation for HTTP clients that want to transparently create
    HTTP requests without the need to worry about whether or not the generated requests
    are part of a session. The default implementation is to generate all HTTP requests from the
    session context.
    """

    def __init__(self, session, timeout=RequestGenerator.DEFAULT_TIMEOUT,
                 verify_ssl_cert=RequestGenerator.VERIFY_SSL_DEFAULT):
        super(SessionRequestGenerator, self).__init__(timeout=timeout,
                                              verify_ssl_cert=verify_ssl_cert)
        self._session = session

    ############################################
    # 'with' context manager implementation ###
    ############################################
    def __enter__(self):
        return self

    def __exit__(self, type, value, traceback):
        self._session.__exit__(type, value, traceback)
    ############################################

    def request(self, method, url, **kwargs):
        return self._session.request(method, url, **kwargs)

    def head(self, url, **kwargs):
        return self._session.head(url, **kwargs)

    def get(self, url, **kwargs):
        return self._session.get(url, **kwargs)

    def post(self, url, data=None, **kwargs):
        return self._session.post(url, data, **kwargs)

    def put(self, url, data=None, **kwargs):
        return self._session.put(url, data, **kwargs)

    def patch(self, url, data=None, **kwargs):
        return self._session.patch(url, data, **kwargs)

    def delete(self, url, **kwargs):
        return self._session.delete(url, **kwargs)


VERIFY_KEY = 'verify'
TIMEOUT_KEY = 'timeout'