from jbei.rest.utils import remove_trailing_slash


class RestApiClient(object):
    """
    The generic parent class for REST API implementations
    """
    write_enabled = False
    """ Flag enabling data changes via this RestApiClient instance. When False, any attempts
        to change data will result in an Exception. Data changes are disabled by default to
        prevent accidental data loss or corruption."""

    def __init__(self, application_name, base_url, request_generator, result_limit=None):

        # chop off the trailing '/', if any, so we can write easier-to-read URL snippets in our code
        # (starting w '%s/'). also makes our code trailing-slash agnostic.
        self._base_url = remove_trailing_slash(base_url)

        self._application_name = application_name
        self._request_generator = request_generator
        self.result_limit = result_limit
        """
        The requested upper limit for the number of results returned from a single API call. Note
        that the server may not respect the upper limit, for instance if it has its own hard upper
        limit
        """

    @property
    def result_limit(self):
        return self._request_generator.result_limit

    @result_limit.setter
    def result_limit(self, limit):
        self._request_generator.result_limit = limit

    @property
    def timeout(self):
        return self._request_generator.timeout

    @timeout.setter
    def timeout(self, timeout):
        self._request_generator.timeout = timeout

    @property
    def base_url(self):
        """
        The base URL of the application this client communicates with. The URL is immutable for
        each instance of RestApiClient.
        """
        return self._base_url

    @property
    def request_generator(self):
        """
        The object responsible for low-level generation of HTTP requests to the remote application
        :return:
        """
        return self._request_generator

    @property
    def application_name(self):
        """
        The short, human-readable name of the application this client connects to.
        """
        return self._application_name

    def _prevent_write_while_disabled(self):
        """
        Throws a RuntimeException if self._enable_write is false. This is part of a
        belt-AND-suspenders check for preventing data loss, especially if this code eventually
        makes its way into the hands of researchers inexperienced in programming. It's already
        prevented at least one accidental data change during EDD script development!
        """
        if not self.write_enabled:
            raise RuntimeError('To prevent accidental data loss or corruption, data changes to '
                               '%(application_name)s are disabled. Use write_enabled to allow '
                               'writes, but please use carefully!' % {
                                    'application_name': self.application_name,})