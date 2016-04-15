"""
Defines utility classes for use in HTTP request generation.
"""
import arrow
import logging
import requests

logger = logging.getLogger(__name__)

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

    def __init__(self, request_api=requests, timeout=DEFAULT_TIMEOUT,
                 verify_ssl_cert=VERIFY_SSL_DEFAULT,
                 auth=None):
        self._timeout = timeout
        self._verify_ssl_cert = verify_ssl_cert
        self._auth = auth
        self._request_api = request_api

        # initialize wait time to timedelta zero
        now = arrow.utcnow()
        self._wait_time = now - now

    @property
    def wait_time(self):
        """
        Gets the decimal time in seconds spent waiting on communication using this RequestGenerator
        """
        return self._wait_time

    def _update_wait_time(self, start_time, end_time):
        """
        Updates the total wait time tracked by this instance of IceApi. Helps clients with
        identifying bottlenecks.
        :return:
        """
        delta = end_time - start_time
        self._wait_time += delta

    def reset_wait_time(self):
        """
        Zeroes out the total wait time tracked by this instance of IceApi.
        """
        self._wait_time = 0

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
        print('executing %s.request()' % self.__class__.__name__)
        kwargs = self._set_defaults(**kwargs)
        start_time = arrow.utcnow()
        try:
            return self._request_api.request(method, url, **kwargs)
        finally:
            self._update_wait_time(start_time, arrow.utcnow())

    def head(self, url, **kwargs):
        kwargs = self._set_defaults(**kwargs)
        start_time = arrow.utcnow()
        try:
            return self._request_api.head(url, **kwargs)
        finally:
            self._update_wait_time(start_time, arrow.utcnow())

    def get(self, url, **kwargs):
        kwargs = self._set_defaults(**kwargs)
        start_time = arrow.utcnow()
        try:
            return self._request_api.get(url, **kwargs)
        finally:
            self._update_wait_time(start_time, arrow.utcnow())

    def post(self, url, data=None, **kwargs):
        kwargs = self._set_defaults(**kwargs)
        start_time = arrow.utcnow()
        try:
            return self._request_api.post(url, data, **kwargs)
        finally:
            self._update_wait_time(start_time, arrow.utcnow())

    def put(self, url, data=None, **kwargs):
        kwargs = self._set_defaults(**kwargs)
        start_time = arrow.utcnow()
        try:
            return self._request_api.put(url, data, **kwargs)
        finally:
            self._update_wait_time(start_time, arrow.utcnow())

    def patch(self, url, data=None, **kwargs):
        kwargs = self._set_defaults(**kwargs)
        start_time = arrow.utcnow()
        try:
            return self._request_api.patch(url, data, **kwargs)
        finally:
            self._update_wait_time(start_time, arrow.utcnow())

    def delete(self, url, **kwargs):
        kwargs = self._set_defaults(**kwargs)
        start_time = arrow.utcnow()
        try:
            return self._request_api.delete(url, **kwargs)
        finally:
            self._update_wait_time(start_time, arrow.utcnow())

    def options(self, **kwargs):
        kwargs = self._set_defaults(**kwargs)
        start_time = arrow.utcnow()
        try:
            self.request_api.options(self, **kwargs)
        finally:
            self._update_wait_time(start_time, arrow.utcnow())

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

    @property
    def timeout(self):
        if isinstance(self._request_api, RequestGenerator):
            return self._request_api.timeout
        return self._timeout

    @timeout.setter
    def timeout(self, timeout):
        """
        Sets the default communication timeout used for all subsequent REST HTTP requests, which can
        also be specified on a per-request basis
        :param timeout: a tuple of (connection timeout, read timeout) in seconds
        """
        self._timeout = timeout
        if isinstance(self._request_api, RequestGenerator):
            return self._request_api.timeout

    @property
    def auth(self):
        return self._auth

    @auth.setter
    def auth(self, auth):
        self._auth = auth


class SessionRequestGenerator(RequestGenerator):
    """
    Defines the default implementation for HTTP clients that want to transparently create
    HTTP requests without the need to worry about whether or not the generated requests
    are part of a session. The default implementation is to generate all HTTP requests from the
    session context.
    """

    def __init__(self, session, auth=None, timeout=RequestGenerator.DEFAULT_TIMEOUT,
                 verify_ssl_cert=RequestGenerator.VERIFY_SSL_DEFAULT):
        super(SessionRequestGenerator, self).__init__(request_api=session, timeout=timeout,
                                                      verify_ssl_cert=verify_ssl_cert,
                                                      auth=auth)
        self._session = session

    ############################################
    # 'with' context manager implementation ###
    ############################################
    def __enter__(self):
        return self

    def __exit__(self, type, value, traceback):
        self._session.__exit__(type, value, traceback)
    ############################################


class PagedRequestGenerator(RequestGenerator):
    # TODO: consider generalizing to include result/offset based paging for requests that's
    # different in ICE vs. EDD
    """
    Provides support for clients of paged REST API resources to control the number of results
    returned from any pageable request, as well as which page is return, within the limits
    allowed by the REST resources.

    PagedRequestGenerator wraps an existing request API and makes certain that request parameters
    for controlling the page number and size are sent with every outgoing request (the assumption is
    that the API will ignore them when irrelevant).
    """
    def __init__(self, result_limit_param_name, result_limit=None, request_api=requests,
                 timeout=RequestGenerator.DEFAULT_TIMEOUT,
                 verify_ssl_cert=RequestGenerator.VERIFY_SSL_DEFAULT, auth=None):
        super(self.__class__, self).__init__(request_api, timeout=timeout,
                                             verify_ssl_cert=verify_ssl_cert, auth=auth)
        self._result_limit_param_name = result_limit_param_name
        self._result_limit = result_limit

    def request(self, method, url, **kwargs):
        kwargs = self._add_pagination_params(**kwargs)
        return super(self.__class__, self).request(method, url, **kwargs)

    def head(self, url, **kwargs):
        kwargs = self._add_pagination_params(**kwargs)
        return super(self.__class__, self).head(url, **kwargs)

    def get(self, url, **kwargs):
        kwargs = self._add_pagination_params(**kwargs)
        return super(self.__class__, self).get(url, **kwargs)

    def post(self, url, data=None, **kwargs):
        kwargs = self._add_pagination_params(**kwargs)
        return super(self.__class__, self).post(url, data, **kwargs)

    def put(self, url, data=None, **kwargs):
        kwargs = self._add_pagination_params(**kwargs)
        return super(self.__class__, self).put(url, data, **kwargs)

    def patch(self, url, data=None, **kwargs):
        kwargs = self._add_pagination_params(**kwargs)
        return super(self.__class__, self).patch(url, data, **kwargs)

    def delete(self, url, **kwargs):
        kwargs = self._add_pagination_params(**kwargs)
        return super(self.__class__, self).delete(url, **kwargs)

    def options(self, **kwargs):
        kwargs = self._add_pagination_params(**kwargs)
        return super(self.__class__, self).options(**kwargs)

    def _add_pagination_params(self, **kwargs):
        """
        If a result limit is configured, enforces it by copying kwargs and inserting the request
        parameter that controls page size.
        :return: a copy of kwargs that contains the request parameter to control page size
        """
        param_name = self._result_limit_param_name
        result_limit = self._result_limit

        if not (result_limit and param_name):
            return kwargs

        params = kwargs.get('params')
        if not params:
            params = {}
        else:
            existing_value = params.get(param_name)
            if existing_value != self._result_limit:
                logger.warning('An existing request parameter named "%s" was present. This '
                               'value (%s) will be overridden to (%s)' % (param_name,
                                                                          str(existing_value),
                                                                          str(self.result_limit)))
            params = params.copy()
        params[param_name] = result_limit

        updated_kwargs = kwargs.copy()
        updated_kwargs['params'] = params
        return updated_kwargs

    @property
    def result_limit_param_name(self):
        return self._result_limit_param_name

    @result_limit_param_name.setter
    def result_limit_param_name(self, result_limit_param):
        self._result_limit_param_name = result_limit_param

    @property
    def result_limit(self):
        return self._result_limit

    @result_limit.setter
    def result_limit(self, default_result_limit):
        self._result_limit = default_result_limit


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
        :return: True if this is only one page of a larger dataset, False if these are all the data.
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
