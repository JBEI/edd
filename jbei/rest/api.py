# -*- coding: utf-8 -*-

from .utils import remove_trailing_slash


class RestApiClient(object):
    """
    The generic parent class for REST API implementations
    """
    write_enabled = False
    """ Flag enabling data changes via this RestApiClient instance. When False, any attempts
        to change data will result in an Exception. Data changes are disabled by default to
        prevent accidental data loss or corruption."""

    def __init__(self, application_name, base_url, session, result_limit=None):
        # chop off the trailing '/', if any, so we can write easier-to-read URL snippets in our
        # code (starting w '%s/'). also makes our code trailing-slash agnostic.
        self._base_url = remove_trailing_slash(base_url)

        self._application_name = application_name
        self.session = session
        self.result_limit = result_limit
        """
        The requested upper limit for the number of results returned from a single API call. Note
        that the server may not respect the upper limit, for instance if it has its own hard upper
        limit
        """

    @property
    def result_limit(self):
        return self.session.result_limit

    @result_limit.setter
    def result_limit(self, limit):
        self.session.result_limit = limit

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
            raise RuntimeError(
                'To prevent accidental data loss or corruption, data changes to '
                '%(application_name)s are disabled. Use write_enabled to allow writes, but '
                'please use carefully!' % {
                    'application_name': self.application_name,
                }
            )

    def _verify_page_number(self, page_number):
        """
        Checks that results page numbering is consistently 1-indexed for RestApiClient
        implementations, regardless of how the underlying application indexes pages
        :param page_number: the requested results page number
        :raises ValueError: if page_number < 1
        """
        if (page_number is not None) and (page_number < 1):
            raise ValueError('Page number must be an integer >= 1')

    def get_overall_result_index(self, page_rel_index, page_number):
        """
        Gets the overall index for a page-relative result.
        :param page_rel_index: the page-relative index of a specific result
        :param page_number: the result page number (1-indexed)
        :return: the overall index, or None if result_limit is None
        """
        if self.result_limit is None:
            return None

        return page_rel_index + ((page_number - 1) * self.result_limit)
