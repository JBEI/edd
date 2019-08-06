"""
Defines utility classes for use in HTTP request generation.
"""
import logging

from requests.sessions import Session as SessionApi

logger = logging.getLogger(__name__)


class Session(SessionApi):
    """
    Wrapper class to the requests library. Changes defaults for timeouts and
    TLS verification, and sets a default Authorization to add to each request.
    """

    def __init__(self, timeout=None, verify_ssl_cert=True, auth=None):
        super().__init__()
        self.timeout = timeout
        self.verify = verify_ssl_cert
        self.auth = auth

    def request(self, method, url, **kwargs):
        # Override to set default arguments and track time taken with requests
        kwargs = self._set_defaults(**kwargs)
        return super().request(method, url, **kwargs)

    def _set_defaults(self, **kwargs):
        """
        For any defaults specified in this Session and explicitly set via
        kwargs parameters, applies the default value.
        """
        if self.timeout and "timeout" not in kwargs:
            kwargs["timeout"] = self.timeout
        if self.verify is not None and "verify" not in kwargs:
            kwargs["verify"] = self.verify
        if self.auth and "auth" not in kwargs:
            kwargs["auth"] = self.auth
        return kwargs
