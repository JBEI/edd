"""
Defines utility classes for use in HTTP request generation.
"""
import arrow
import logging

from requests.compat import urlsplit
from requests.sessions import Session as SessionApi
from six.moves.urllib.parse import parse_qs

logger = logging.getLogger(__name__)


class Session(SessionApi):
    """
    Wrapper class to the requests library. Changes some of the defaults for timeouts, SSL
    verification, and tracks the amount of time requests take.
    """

    VERIFY_SSL_DEFAULT = True
    DEFAULT_TIMEOUT = None

    def __init__(self, timeout=DEFAULT_TIMEOUT, verify_ssl_cert=VERIFY_SSL_DEFAULT, auth=None):
        super(Session, self).__init__()
        self._timeout = timeout
        self._verify_ssl_cert = verify_ssl_cert
        self.auth = auth

        # initialize wait time to timedelta zero
        now = arrow.utcnow()
        self._wait_time = now - now

    @property
    def wait_time(self):
        """
        Gets the decimal time in seconds spent waiting on communication using this Session
        :return: total time waiting (in milliseconds?)
        """
        return self._wait_time

    def _update_wait_time(self, start_time, end_time):
        """
        Updates the total wait time tracked by this instance. Helps clients with identifying
        bottlenecks.
        """
        delta = end_time - start_time
        self._wait_time += delta

    def reset_wait_time(self):
        """
        Zeroes out the total wait time tracked by this instance.
        """
        self._wait_time = 0

    def request(self, method, url, **kwargs):
        # Override to set default arguments and track time taken with requests
        kwargs = self._set_defaults(**kwargs)
        start_time = arrow.utcnow()
        try:
            return super(Session, self).request(method, url, **kwargs)
        finally:
            self._update_wait_time(start_time, arrow.utcnow())

    def _set_defaults(self, **kwargs):
        """
        For any defaults specified in this Session and explicitly set via kwargs parameters,
        applies the default value.
        :param kwargs: dictionary of keyword arguments to the request that's about to be made.
            kwargs is never modified in case clients construct their own dictionaries for use
            across multiple HTTP requests.
        :return: a dictionary with defaults applied as appropriate. If there are any defaults to
            apply, this will be a different dictionary that kwargs.
        """

        # if not explicitly provided, use the default timeout configured in the constructor
        if self._timeout and TIMEOUT_KEY not in kwargs:
            kwargs[TIMEOUT_KEY] = self._timeout

        # if not explicitly provided, use the default setting configured in the constructor
        # if self._verify_ssl_cert and VERIFY_KEY not in kwargs:
        kwargs[VERIFY_KEY] = self._verify_ssl_cert

        if self.auth and AUTH_KEY not in kwargs:
            kwargs[AUTH_KEY] = self.auth

        return kwargs

    @property
    def timeout(self):
        return self._timeout

    @timeout.setter
    def timeout(self, timeout):
        """
        Sets the default communication timeout used for all subsequent REST HTTP requests, which
        can also be specified on a per-request basis
        :param timeout: a tuple of (connection timeout, read timeout) in seconds
        """
        self._timeout = timeout


class PagedSession(Session):
    # TODO: consider generalizing to include result/offset based paging for requests that's
    # different in ICE vs. EDD
    """
    Provides support for clients of paged REST API resources to control the number of results
    returned from any pageable request, as well as which page is return, within the limits
    allowed by the REST resources.

    PagedSession wraps an existing request API and makes certain that request parameters
    for controlling the page number and size are sent with every outgoing request (the assumption
    is that the API will ignore them when irrelevant).
    """
    DEFAULT_TIMEOUT = Session.DEFAULT_TIMEOUT
    VERIFY_SSL_DEFAULT = Session.VERIFY_SSL_DEFAULT

    def __init__(self, result_limit_param_name, result_limit=None, timeout=DEFAULT_TIMEOUT,
                 verify_ssl_cert=VERIFY_SSL_DEFAULT, auth=None):
        super(PagedSession, self).__init__(
            timeout=timeout, verify_ssl_cert=verify_ssl_cert, auth=auth
        )
        self.result_limit_param_name = result_limit_param_name
        self.result_limit = result_limit

    def request(self, method, url, **kwargs):
        url, kwargs = self._add_pagination_params(url, **kwargs)
        return super(PagedSession, self).request(method, url, **kwargs)

    def _add_pagination_params(self, url, **kwargs):
        """
        If a result limit is configured, enforces it by copying kwargs and inserting the request
        parameter that controls page size.
        :return: a copy of kwargs that contains the request parameter to control page size
        """
        param_name = self.result_limit_param_name
        result_limit = self.result_limit

        original_url = url

        # return early if this session isn't configured to auto-set pagination parameters
        if not (result_limit and param_name):
            return url, kwargs

        # look for  / replace pagination parameters encoded in the URL itself. Note this may be
        # a common use case, e.g. in DRF where each paged response includes the full URL of the
        # next results page

        url_parts = urlsplit(url)
        url_query_params = parse_qs(url_parts.query)

        found_in_url = param_name in url_query_params
        if found_in_url:
            url_param_val = url_query_params.get(param_name)
            updated_value = [str(self.result_limit)]
            if url_param_val != updated_value:
                logger.warning(
                    'An existing request parameter named "%(param)s" was present in the URL. This '
                    'value (%(url_val)s) will be overridden to %(new_val)s' % {
                        'param': param_name,
                        'url_val': url_param_val,
                        'new_val': updated_value, })
                url_query_params[param_name] = updated_value
                url = url_parts.geturl()
                logger.debug('......Original URL: %s, Updated URL: %s' % (original_url, url))

        # look for & replace pagination parameter explicitly provided via request kwargs
        params = kwargs.get('params')
        if not params:
            params = {}
            if not found_in_url:
                params[param_name] = result_limit
                kwargs['params'] = params
        elif param_name in params.keys():
            existing_value = params.get(param_name)
            if existing_value != self.result_limit:
                logger.warning('An existing request parameter named "%(param)s" was present. '
                               'This value (%(existing)s) will be overridden to (%(new)s)' % {
                                    'param': param_name,
                                    'existing': existing_value,
                                    'new': self.result_limit, })
                params[param_name] = result_limit
        elif not found_in_url:
            params[param_name] = result_limit

        return url, kwargs


class PagedResult(object):
    """
    Defines storage for results from a REST API call that may be paged. For consistency,
    PagedResults should always be used to return results from potentially paged resources, even
    if the actual results returned aren't paged.
    """
    def __init__(self, results, total_result_count, next_page=None, previous_page=None):
        self._total_result_count = total_result_count
        self.results = results
        self.next_page = next_page
        self.previous_page = previous_page

    def is_paged(self):
        """
        Tests whether this PagedResult contains a subset of the full dataset
        :return: True if this is only one page of a larger dataset, False if these are all the
            data.
        """
        return self.next_page or self.previous_page

    def __str__(self):
        return '<PagedResult count=%(count)d, next_page=%(next)s, previous_page=%(prev)s' % {
            'count': len(self.results) if self.results else None,
            'next': self.next_page,
            'prev': self.previous_page,
        }

    @property
    def current_result_count(self):
        """
        Gets the number of results contained in this PagedResult object, which may or may not be
        the full dataset.
        """
        if isinstance(self.results, list):
            return len(self.results)
        return 1

    @property
    def total_result_count(self):
        """
        Gets the total number of results found, regardless of whether all the results are included
        in the current page
        :return: the number of results
        """
        return self._total_result_count


VERIFY_KEY = 'verify'
TIMEOUT_KEY = 'timeout'
AUTH_KEY = 'auth'
