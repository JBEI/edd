from jbei.rest.utils import remove_trailing_slash


class RestApiClient(object):
    """
    The generic parent class for REST API implementations
    """
    def __init__(self, application_name, base_url, request_generator, result_limit=None):
        # chop off the trailing '/', if any, so we can write easier-to-read URL snippets in our code
        # (starting w '%s/'). also makes our code trailing-slash agnostic.
        self._application_name = application_name
        self._base_url = remove_trailing_slash(base_url)
        self._enable_write = False
        self._request_generator = request_generator
        self.result_limit = result_limit

    @property
    def request_generator(self):
        return self._request_generator

    @property
    def write_enabled(self):
        """
        Tests whether data changes are enabled via this RestApiClient instance. When False,
        all attempts to call methods that could change data will result in an Exception
        """
        return self._enable_write

    @property
    def base_url(self):
        return self._base_url

    @property
    def application_name(self):
        return self._application_name

    @write_enabled.setter
    def write_enabled(self, enabled):
        """
        Enables data changes via method calls made from this RestApiClient instance. Data changes
        are disabled by default to prevent accidental data loss or corruption.
        :param enabled: True to enable data changes, False to disable changes
        """
        self._enable_write = enabled

    @property
    def result_limit(self):
        return self.request_generator.result_limit

    @result_limit.setter
    def result_limit(self, limit):
        self.request_generator.result_limit = limit

    def _prevent_write_while_disabled(self):
        """
        Throws a RuntimeException if self._enable_write is false. This is part of a
        belt-AND-suspenders check for preventing data loss, especially if this code eventually
        makes its way into the hands of researchers inexperienced in programming. It's already
        prevented at least one accidental data change during EDD script development!
        """
        if not self._enable_write:
            raise RuntimeError('To prevent accidental data loss or corruption, data changes to '
                               '%(application_name)s are disabled. Use write_enabled to allow '
                               'writes, but please use carefully!' % {
                                    'application_name': self.application_name,})