class RestApiClient:
    """Generic parent class for REST API implementations."""

    def __init__(self, base_url, session, result_limit=None):
        # chop off the trailing '/', if any, so we can write easier-to-read URL snippets in our
        # code (starting w '%s/'). also makes our code trailing-slash agnostic.
        self._base_url = base_url if "/" != base_url[-1] else base_url[:-1]
        self.session = session
        # The requested upper limit for the number of results returned from a single API call.
        # Note that the server may not respect the upper limit, for instance if it has its own
        # hard upper limit.
        self.result_limit = result_limit

    @property
    def timeout(self):
        return self.session.timeout

    @timeout.setter
    def timeout(self, timeout):
        self.session.timeout = timeout

    @property
    def base_url(self):
        """
        The base URL of the application this client communicates with. The URL is immutable for
        each instance of RestApiClient.
        """
        return self._base_url
