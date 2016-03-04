"""
Defines utility classes for use in HTTP request generation.
"""

import requests


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

    def __init__(self, timeout=DEFAULT_TIMEOUT, verify_ssl_cert=VERIFY_SSL_DEFAULT, auth=None):
        self._timeout = timeout
        self._verify_ssl_cert = verify_ssl_cert
        self._auth = auth
        self._request_api = requests

    ############################################
    # 'with' context manager implementation ###
    ############################################
    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        # no-op...no persistent resources to close
        pass
    ############################################

    ################################################################################################
    # Same method signatures as static methods in the requests library. Strategy pattern! :-)
    ################################################################################################
    def request(self, method, url, **kwargs):
        kwargs = self._set_defaults(**kwargs)
        return self._request_api.request(method, url, **kwargs)

    def head(self, url, **kwargs):
        kwargs = self._set_defaults(**kwargs)
        return self._request_api.head(url, **kwargs)

    def get(self, url, **kwargs):
        kwargs = self._set_defaults(**kwargs)
        return self._request_api.get(url, **kwargs)

    def post(self, url, data=None, **kwargs):
        kwargs = self._set_defaults(**kwargs)
        return self._request_api.post(url, data, **kwargs)

    def put(self, url, data=None, **kwargs):
        kwargs = self._set_defaults(**kwargs)
        return self._request_api.put(url, data, **kwargs)

    def patch(self, url, data=None, **kwargs):
        kwargs = self._set_defaults(**kwargs)
        return self._request_api.patch(url, data, **kwargs)

    def delete(self, url, **kwargs):
        kwargs = self._set_defaults(**kwargs)
        return self._request_api.delete(url, **kwargs)

    def _set_defaults(self, **kwargs):
        """
        For any defaults specified in this RequestGenerator and explicitly set via kwargs
        parameters, applies the default value
        :param kwargs: dictionary of keyword arguments to the request that's about to be made.
        kwargs is never modified in case clients construct their own dictionaries for use across
        multiple HTTP requests.
        :return: a dictionary with defaults applied as appropriate. If there are any defaults to
        apply, this will be a different dictionary that kwargs.
        """
        temp = None

        # if not explicitly provided, use the default timeout configured in the constructor
        if self._timeout and TIMEOUT_KEY not in kwargs:
            if not temp:
                temp = kwargs.copy()
            temp[TIMEOUT_KEY] = self._timeout

        # if not explicitly provided, use the default setting configured in the constructor
        if self._verify_ssl_cert and VERIFY_KEY not in kwargs:
            if not temp:
                temp = kwargs.copy()
            temp[VERIFY_KEY] = self._verify_ssl_cert

        if self._auth and AUTH_KEY not in kwargs:
            if not temp:
                temp = kwargs.copy()
            temp[AUTH_KEY] = self._auth

        if temp:
            return temp
        return kwargs

    def set_timeout(self, timeout):
        """
        Sets the default communication timeout used for all subsequent REST HTTP requests, which can
        also be specified on a per-request basis
        :param timeout: a tuple of (connection timeout, read timeout) in seconds
        """
        self._timeout = timeout

    def set_auth(self, auth):
        self.auth=auth


class SessionRequestGenerator(RequestGenerator):
    """
    Defines the default implementation for HTTP clients that want to transparently create
    HTTP requests without the need to worry about whether or not the generated requests
    are part of a session. The default implementation is to generate all HTTP requests from the
    session context.
    """

    def __init__(self, session, auth=None, timeout=RequestGenerator.DEFAULT_TIMEOUT,
                 verify_ssl_cert=RequestGenerator.VERIFY_SSL_DEFAULT):
        super(SessionRequestGenerator, self).__init__(timeout=timeout,
                                                      verify_ssl_cert=verify_ssl_cert,
                                                      auth=auth)
        self._request_api = session
        self._session = session

    ############################################
    # 'with' context manager implementation ###
    ############################################
    def __enter__(self):
        return self

    def __exit__(self, type, value, traceback):
        self._session.__exit__(type, value, traceback)
    ############################################


VERIFY_KEY = 'verify'
TIMEOUT_KEY = 'timeout'
AUTH_KEY = 'auth'
