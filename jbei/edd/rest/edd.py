# -*- coding: utf-8 -*-
"""
Contains utility classes for connecting with and gathering data from EDD's REST API. This initial
implementation, as well as the REST API itself, can use some additions/improvements over time,
but is implemented to initially fulfill the basic need to connect to EDD programatically.
"""

from __future__ import unicode_literals

import json
import logging
from urlparse import urlparse, urlsplit

import requests
from requests.auth import AuthBase

import jbei
from jbei.rest.api import RestApiClient
from jbei.rest.request_generators import SessionRequestGenerator, PagedRequestGenerator, PagedResult
from jbei.rest.utils import remove_trailing_slash, UNSAFE_HTTP_METHODS
from jbei.rest.utils import show_response_html, is_success_code

DEBUG = True  # controls whether error response content is written to temp file, then displayed
              # in a browser tab
VERIFY_SSL_DEFAULT = jbei.rest.request_generators.RequestGenerator.VERIFY_SSL_DEFAULT
DEFAULT_REQUEST_TIMEOUT = (10, 10)  # HTTP request connection and read timeouts, respectively
                                    # (seconds)

USE_DRF_SERIALIZER = False  # test flag for doing deserialization without the Django REST
# Framework's serializer, which it turns out isn't very useful on the client side anyway.

LINE_ACTIVE_STATUS_PARAM = 'lines_active'
ALL_LINES_VALUE = 'all'
ACTIVE_LINES_ONLY = 'active'
INACTIVE_LINES_ONLY = 'inactive'
LINES_ACTIVE_DEFAULT = ACTIVE_LINES_ONLY

logger = logging.getLogger(__name__)

# TODO: either continue with this approach, or investigate using reflection to dynamically derive
# Model classes that prevent database access. Note that our current deserialization process is
# reflection-based, so it makes sense to pursue that when possible so we can avoid maintaining
# these classes in parallel to the Django ORM models (which we shouldn't always use on the client
# side).
# class EmptyQuerysetManager(models.Manager):
#     """
#     A custom Django model manager whose purpose is to hide the database.
#     """
#     def get_queryset(self):
#         return super(EmptyQuerysetManager, self).get_queryset().none()
#
# class PreventSaveMixin(object):
#     def save(self):
#         pass
#
# class PreventQueryMixin(object):
#     class Meta:
#         proxy=True
#         manager = EmptyQuerysetManager()
#
#
# #     Proxy models for EDD's Django instances obtained via calls to EDD's REST API rather than
# #     from
# #     direct database access using the ORM.  Detached* instances have all the same fields as
# #     their base Django model class, but they prevent accidental database modification via
# #     client-side REST code while keeping all the same fields and methods otherwise available to
# #     the base class.=.
# #
# #     While EDD is still changing significantly in early development, this approach should
# #     minimize maintenance for  client-side code (though at the cost of needing Django libraries
# #     that aren't strictly necessary on the client side).
#
# class DetachedStrain(Strain, PreventQueryMixin, PreventSaveMixin):
#     pass
#
# class DetachedLine(Line, PreventQueryMixin, PreventSaveMixin):
#     pass

#############################################################################################


class EddRestObject(object):
    """
    Defines the plain Python object equivalent of Django model objects persisted to EDD's
    database.  This separate object hierarchy should be used only on by external clients of EDD's
    REST API, since little-to-no validation is performed on the data stored in these objects.

    This separate object hierarchy that mirrors EDD's is necessary for a couple of reasons:
    1) It prevents EDD's REST API clients from having to install Django libraries that won't really
    provide any benefit on the client side
    2) It allows client and server-side code to be versioned independently, allowing for some wiggle
    room during for non-breaking API changes. For example, REST API additions on the server side
    shouldn't require updates to client code.

    As a result, it creates a separate object hierarchy that closely matches EDD's Django
    models, but needs to be maintained separately.

    Note that there con be some differences in defaults between EddRestObjects and the Django models
    on which they're based. While Django modules have defaults defined for application to related
    database records, EddRestObjects, which may only be partially populated from the ground truth in
    the database, use None for all attributes that arent' specifically set. This should hopefully
    help to distinguish unknown values from those that have defaults applied.

    TODO: alternatively, and BEFORE putting a lot of additional work into this, consider
    finding/implementing a reflection-based solution that dynamically inspects EDD's Django model
    objects and creates non-Django variants.
    """
    def __init__(self, **kwargs):
        self.pk = kwargs.get('pk')
        self.name = kwargs.get('name')
        self.description = kwargs.get('description')
        self.active = kwargs.get('active')
        self.created = kwargs.get('created')
        self.updated = kwargs.get('updated')
        self.meta_store = kwargs.get('meta_store')

    def __str__(self):
        return self.name


class Strain(EddRestObject):
    def __init__(self, registry_id, registry_url, **kwargs):
        temp = kwargs.copy()  # don't change parameter!
        self.registry_id = registry_id
        self.registry_url = registry_url
        super(Strain, self).__init__(**temp)


class Line(EddRestObject):
    def __init__(self, **kwargs):
        temp = kwargs.copy()  # don't change parameter!
        self.study = temp.pop('study', None)
        self.contact = temp.pop('contact', None)
        self.contact_extra = temp.pop('contact_extra', None)
        self.experimentor = temp.pop('experimentor', None)
        self.carbon_source = temp.pop('carbon_source', None)
        self.protocols = temp.pop('protocols', None)
        self.strains = temp.pop('strains', None)
        self.control = temp.pop('control', None)
        self.replicate = temp.pop('replicate', None)
        super(Line, self).__init__(**temp)


class Study(EddRestObject):
    def __init__(self, **kwargs):
        temp = kwargs.copy()  # don't change parameter!
        self.contact = temp.pop('contact', None)
        self.contact_extra = temp.pop('contact_extra', None)
        self.metabolic_map = temp.pop('metabolic_map', None)
        self.protocols = temp.pop('protocols', None)
        super(Study, self).__init__(**temp)


DJANGO_CSRF_COOKIE_KEY = 'csrftoken'
PAGE_SIZE_QUERY_PARAM = 'page_size'
PAGE_NUMBER_QUERY_PARAM = 'page'
RESULTS_OFFSET_QUERY_PARAM = 'offset'


def insert_spoofed_https_csrf_headers(headers, base_url):
    """
    Creates HTTP headers that help to work around Django's CSRF protection, which shouldn't apply
    outside of the browser context.
    :param headers: a dictionary into which headers will be inserted, if needed
    :param base_url: the base URL of the Django application being contacted
    """
    # if connecting to Django/DRF via HTTPS, spoof the 'Host' and 'Referer' headers that Django
    # uses to help prevent cross-site scripting attacks for secure browser connections. This
    # should be OK for a standalone Python REST API client, since the origin of a
    # cross-site scripting attack is malicious website code that executes in a browser,
    # but accesses another site's credentials via the browser or via user prompts within the
    # browser. Not applicable in this case for a standalone REST API client.
    # References:
    # https://docs.djangoproject.com/en/dev/ref/csrf/#how-it-works
    # http://security.stackexchange.com/questions/96114/why-is-referer-checking-needed-for-django
    # http://mathieu.fenniak.net/is-your-web-api-susceptible-to-a-csrf-exploit/
    # -to-prevent-csrf
    if urlparse(base_url).scheme == 'https':
        headers['Host'] = urlsplit(base_url).netloc
        headers['Referer'] = base_url  # LOL! Bad spelling is now standard :-)

_ASSUME_PAGED_RESOURCE = False
_DEFAULT_SINGLE_REQUEST_RESULT_LIMIT = None


class DrfSessionRequestGenerator(SessionRequestGenerator):
    """
    A special-case SessionRequestGenerator to support CSRF token headers required by the Django /
    Django Rest Framework (DRF) to make requests to "unsafe" (mutator) REST resources. Clients of
    DrfSessionRequestGenerator can just transparently call request/post/delete/etc methods here
    without needing to worry about which methods need DRF'S CSRF header set, or the mechanics of
    how that's accomplished.
    :param base_url: the base url of the site where Django REST framework is being connected to.
    """

    def __init__(self, base_url, session, timeout=DEFAULT_REQUEST_TIMEOUT,
                 verify_ssl_cert=VERIFY_SSL_DEFAULT):
        super(DrfSessionRequestGenerator, self).__init__(session, timeout=timeout,
                                                         verify_ssl_cert=verify_ssl_cert)
        self._base_url = base_url

    #############################################################
    # 'with' context manager implementation
    #############################################################
    def __enter__(self):
        return self

    def __exit__(self, type, value, traceback):
        super(self.DrfSessionRequestGenerator, self).__exit__(type, value, traceback)
    #############################################################

    def request(self, method, url, **kwargs):
        print('executing %s.request()' % self.__class__.__name__)
        # if using an "unsafe" HTTP method, include the CSRF header required by DRF
        if method.upper() in UNSAFE_HTTP_METHODS:
            kwargs = self._get_csrf_headers(**kwargs)

        return super(self.__class__, self).request(method, url, **kwargs)

    def head(self, url, **kwargs):
        return super(self.__class__, self).head(url, **kwargs)

    def get(self, url, **kwargs):
        return super(self.__class__, self).get(url, **kwargs)

    def options(self, **kwargs):
        super(self.__class__, self).options(self, **kwargs)

    def post(self, url, data=None, **kwargs):
        kwargs = self._get_csrf_headers(**kwargs)
        return super(self.__class__, self).post(url, data, **kwargs)

    def put(self, url, data=None, **kwargs):
        kwargs = self._get_csrf_headers(**kwargs)
        return super(self.__class__, self).put(url, data, **kwargs)

    def patch(self, url, data=None, **kwargs):
        kwargs = self._get_csrf_headers(**kwargs)
        return super(self.__class__, self).patch(url, data, **kwargs)

    def delete(self, url, **kwargs):
        kwargs = self._get_csrf_headers(**kwargs)
        return super(self.__class__, self).delete(url, **kwargs)

    def _get_csrf_headers(self, **kwargs):
        """
        Gets an updated dictionary of HTTP request headers, including headers required to satisfy
        Django's CSRF protection. The original input headers dictionary (if any) isn't modified.
        :return:
        """
        kwargs = kwargs.copy()  # don't modify the input dictionary
        headers = kwargs.pop('headers')

        if headers:
            headers = headers.copy()  # don't modify the headers dictionary
        else:
            headers = []

        csrf_token = self._session.cookies[DJANGO_CSRF_COOKIE_KEY]  # grab cookie value set by
                                                                    # Django
        headers['X-CSRFToken'] = csrf_token  # set the header value needed by DRF (inexplicably
                                             # different than the one Django uses)

        insert_spoofed_https_csrf_headers(headers, self._base_url)
        kwargs['headers'] = headers
        return kwargs


class EddSessionAuth(AuthBase):
    """
    Implements session-based authentication for EDD.
    """
    SESSION_ID_KEY = 'sessionid'

    def __init__(self, base_url, session, timeout=DEFAULT_REQUEST_TIMEOUT,
                 verify_ssl_cert=VERIFY_SSL_DEFAULT):
        self._session = session

        drf_request_generator = DrfSessionRequestGenerator(base_url, session, timeout=timeout,
                                                             verify_ssl_cert=verify_ssl_cert)
        paging_request_generator = PagedRequestGenerator(request_api=drf_request_generator,
                                                         result_limit_param_name=PAGE_SIZE_QUERY_PARAM,
                                                         result_limit=None)
        self._request_generator = paging_request_generator

    @property
    def request_generator(self):
        """
        Get the request generator responsible for creating all requests to the remote server.
        """
        return self._request_generator

    def __call__(self, request):
        """
        Overrides the empty base implementation to provide authentication for the provided request
        object (which should normally be _session)
        """
        if request != self._session:  # TODO: not super helpful!!
            logger.warning('Requests using EddSessionAuth should originate from the session '
                           'rather than from a new request.')
            request.cookies[self.SESSION_ID_KEY] = self._session.cookies[self.SESSION_ID_KEY]

    ############################################
    # 'with' context manager implementation ###
    ############################################
    def __enter__(self):
        return self

    def __exit__(self, type, value, traceback):
        self._session.__exit__(type, value, traceback)
    ############################################

    @staticmethod
    def login(username, password, base_url='https://edd.jbei.org',
              timeout=DEFAULT_REQUEST_TIMEOUT, verify_ssl_cert=VERIFY_SSL_DEFAULT):
        """
        Logs into EDD at the provided URL
        :param login_page_url: the URL of the login page,
        (e.g. https://localhost:8000/accounts/login/).
        Note that it's a security flaw to use HTTP for anything but local testing.
        :return: an authentication object that encapsulates the newly-created user session, or None
        if authentication failed (likely because of user error in entering credentials).
        :raises Exception: if an HTTP error occurs
        """

        # chop off the trailing '/', if any, so we can write easier-to-read URL snippets in our code
        # (starting w '%s/'). also makes our code trailing-slash agnostic.
        base_url = remove_trailing_slash(base_url)

        # issue a GET to get the CRSF token for use in auto-login

        login_page_url = '%s/accounts/login/' % base_url  # Django login page URL
        # login_page_url = '%s/rest/auth/login/' % base_url  # Django REST framework login page URL
        session = requests.session()
        response = session.get(login_page_url, timeout=timeout, verify=verify_ssl_cert)

        if response.status_code != requests.codes.ok:
            response.raise_for_status()

        # extract the CSRF token from the server response to include as a form header
        # with the login request (doesn't work without it, even though it's already present in the
        # session cookie). Note: NOT the same key as the header we send with requests

        csrf_token = response.cookies[DJANGO_CSRF_COOKIE_KEY]
        if not csrf_token:
            logger.error("No CSRF token received from EDD. Something's wrong.")
            raise Exception('Server response did not include the required CSRF token')

        # package up credentials and CSRF token to send with the login request
        login_dict = {
            'login': username,
            'password': password,
        }
        csrf_request_headers = {'csrfmiddlewaretoken': csrf_token}
        login_dict.update(csrf_request_headers)

        # work around Django's additional CSRF protection for HTTPS, which doesn't apply outside of
        # the browser context
        headers = {}
        insert_spoofed_https_csrf_headers(headers, base_url)

        # issue a POST to log in
        response = session.post(login_page_url, data=login_dict, headers=headers, timeout=timeout,
                                verify=verify_ssl_cert)

        # return the session if it's successfully logged in, or print error messages/raise
        # exceptions as appropriate
        if response.status_code == requests.codes.ok:
            DJANGO_LOGIN_FAILURE_CONTENT = 'Login failed'
            DJANGO_REST_API_FAILURE_CONTENT = 'This field is required'
            if DJANGO_LOGIN_FAILURE_CONTENT in response.content or \
               DJANGO_REST_API_FAILURE_CONTENT in response.content:
                logger.warning('Login failed. Please try again.')
                logger.info(response.headers)
                if DEBUG:
                    show_response_html(response)
                return None
            else:
                logger.info('Successfully logged into EDD at %s' % base_url)
                return EddSessionAuth(base_url, session, timeout=timeout,
                                      verify_ssl_cert=verify_ssl_cert)
        else:
            if DEBUG:
                show_response_html(response)
            response.raise_for_status()

DEFAULT_PAGE_SIZE = 30


class EddApi(RestApiClient):
    """
    Defines a high-level interface to EDD's REST API. The initial version of this class is very
    basic, and exposes only a minimal subset of the initial API exposed as part of SYNBIO-1299.
    Note that data exposed via this API is subject to user and group-based access controls,
    and unlike Django ORM queries, won't necessarily reflect all the data present in the EDD
    database.

    It's also worth noting that EDD Model objects returned from EddApi purposefully prevent
    access or modifications to EDD's database, even when the appropriate Django settings are
    available on the client machine.
    """

    _json_header = {'Content-Type': 'application/json',
                    'Media-Type': 'application/json',
                    'Accept': 'application/json'}

    def __init__(self, session_auth, base_url, result_limit=DEFAULT_PAGE_SIZE):
        """
        Creates a new instance of EddApi, which prevents data changes by default.
        :param base_url: the base URL of the EDD deployment to interface with,
        e.g. https://edd.jbei.org/. Note HTTPS should almost always be used for security.
        :param session_auth: a valid, authenticated EDD session used to authorize all requests to
        the API.
        :param result_limit: the maximum number of results that can be returned from a single
        query, or None to apply EDD's default limit
        :return: a new EddApi instance
        """
        super(self.__class__, self).__init__('EDD', base_url,
                                             session_auth.request_generator,
                                             result_limit=result_limit)
        self.session_auth = session_auth

    def search_strains(self, query_url=None, registry_id=None, registry_url_regex=None, name=None,
                       name_regex=None, case_sensitive=None, page_number=None):
        """
        Searches EDD for strain(s) matching the search criteria.
        :param query_url: the entire URL for the search, including query parameters (for example,
        the value returned for next_page). If present, all other parameters will be ignored.
        :param registry_id: the registry id (UUID) to search for
        :param registry_url_regex: the registry URL to search for
        :param name: the strain name or name fragment to search for (case-sensitivity determined
        by case_sensitive)
        :param name_regex: a regular expression for the strain name (case-sensitivity determined
        by case_sensitive)
        :param case_sensitive: whether or not to use case-sensitive string comparisons. False or
        None indicates that searches should be case-insensitive.
        :param result_limit: the upper limit for the number of results that will be returned from
        this single request. If present, overrides the value provided to the constructor for
        the duration of this search.
        :return: a PagedResult containing some or all of the EDD strains that matched the search
        criteria
        """

        request_generator = self.session_auth.request_generator

        # build up a dictionary of search parameters based on provided inputs
        if query_url:
            response = request_generator.get(query_url, headers=self._json_header)
        else:
            search_params = {}

            if registry_id:
                search_params['registry_id'] = registry_id

            if registry_url_regex:
                search_params['registry_url_regex'] = registry_url_regex

            if name:
                search_params['name'] = name

            elif name_regex:
                search_params['name_regex'] = name_regex

            if case_sensitive:
                search_params['case_sensitive'] = case_sensitive

            if self.result_limit:
                search_params[PAGE_SIZE_QUERY_PARAM] = self.result_limit

            if page_number:
                search_params[PAGE_NUMBER_QUERY_PARAM] = page_number

            # make the HTTP request
            url = '%s/rest/strain' % self.base_url
            response = request_generator.get(url, params=search_params, headers=self._json_header)

        # throw an error for unexpected reply
        if response.status_code != requests.codes.ok:
            response.raise_for_status()

        if USE_DRF_SERIALIZER:
            from edd.rest.serializers import StrainSerializer
            return DrfPagedResult.of(response.content, serializer_class=StrainSerializer.__class__)
        else:
            return DrfPagedResult.of(response.content, model_class=Strain)

    def get_strain_studies(self, strain_pk=None, strain_uuid=None, query_url=None,
                           page_number=None):
        request_generator = self.session_auth.request_generator
        response = None

        # if the whole query was provided, just use it
        if query_url:
            response = request_generator.get(query_url, headers=self._json_header)
        # otherwise, build up a dictionary of search parameters based on provided inputs
        else:
            search_params = {}

            id = 'id'

            if strain_uuid:
                search_params[id] = strain_uuid  # TODO: consider renaming the param to ID,
                                                   # but def use a constant here and in else
            elif strain_pk:
                search_params[id] = strain_pk
            else:
                raise KeyError('At least one strain identifier must be provided')  # TODO: consider
                # exception type and message

            if self.result_limit:
                search_params[PAGE_SIZE_QUERY_PARAM] = self.result_limit

            if page_number:
                search_params[PAGE_NUMBER_QUERY_PARAM] = page_number

            url = '%s/rest/strain/%d/studies/' % (self.base_url, strain_pk)

            response = request_generator.get(url, params=search_params)

        if response.status_code == requests.codes.ok:
            query_url = response.url
            return DrfPagedResult.of(response.content, model_class=Study)

    def get_study_lines(self, study_pk, line_active_status=LINES_ACTIVE_DEFAULT, page_number=None):

        """
        Queries EDD for lines associated with a study
        :param result_limit: the upper limit for the number of results that will be returned from
        this single request. If present, overrides the value provided to the constructor for
        the duration of this search.
        :return: a PagedResult containing some or all of the EDD strains that matched the search
        criteria
        """

        # make the HTTP request
        url = '%s/rest/study/%d/lines/' % (self.base_url, study_pk)
        request_generator = self.session_auth.request_generator

        params = {}

        if line_active_status:
            params[LINE_ACTIVE_STATUS_PARAM]=line_active_status

        if page_number:
            params[PAGE_NUMBER_QUERY_PARAM] = page_number

        response = request_generator.get(url, headers=self._json_header, params=params)

        # throw an error for unexpected reply
        if response.status_code != requests.codes.ok:
            response.raise_for_status()

        return DrfPagedResult.of(response.content, Line)

    def get_study_strains(self, study_pk, strain_id='',
                          line_active_status=LINES_ACTIVE_DEFAULT,
                          page_number=None, query_url=None):
        """

        :param study_pk:
        :param strain_id: either EDD's numeric primary key for the strain, or ICE's UUID,
        or an empty string to get all strains associated with the study
        :param line_active_status:
        :param page_number:
        :param query_url:
        :return:
        """

        # make the HTTP request
        url = '%s/rest/study/%d/strains/%s' % (self.base_url, study_pk, str(strain_pk))
        request_generator = self.session_auth.request_generator

        # add parameters to
        params = {}

        if line_active_status:
            params[LINE_ACTIVE_STATUS_PARAM] = line_active_status

        if page_number:
            params[PAGE_NUMBER_QUERY_PARAM] = page_number

        response = request_generator.get(url, headers=self._json_header, params=params)

        # throw an error for unexpected reply
        if response.status_code != requests.codes.ok:
            response.raise_for_status()

        return DrfPagedResult.of(response.content, Strain)

    def create_line(self, study_id, strain_id, name, description=None):
        """
        Creates a new line in EDD
        :return: the newly-created Line, but containing only the subset of its state serialized
        by the REST API.
        :raises: exception if the line couldn't be created
        :raises RuntimeError: if writes are disabled when this method is invoked
        """
        self._prevent_write_while_disabled()

        url = '%s/rest/study/%d/lines/' % (self.base_url, study_id)

        new_line = {
            "study": study_id,
            "name": name,
            "control": False,
            "replicate": None,
            # "contact": 60,
            # "contact_extra": ' ',
            # "experimenter": 60,
            # "protocols": [
            #     1933
            # ],
            "strains": [strain_id],
        }

        if description:
            new_line['description'] = description

        request_generator = self.session_auth.request_generator
        response = request_generator.post(url, headers=self._json_header, data=json.dumps(new_line))

        # throw an error for unexpected reply
        if not is_success_code(response.status_code):
            if DEBUG:
                show_response_html(response)
            response.raise_for_status()

        return Line(**json.loads(response.content))

    def create_strain(self, name, description, registry_id, registry_url):
        """
        Creates a new Strain in EDD
        :return: the newly-created strain, but containing only the subset of its state serialized
        by the REST API.
        :raises: an Exception if the strain couldn't be created
        :raises RuntimeError: if writes are disabled when this method is invoked
        """
        self._prevent_write_while_disabled()

        post_data = {
            'name': name,
            'description': description,
            'registry_id': registry_id,
            'registry_url': registry_url,
        }

        # make the HTTP request
        url = '%s/rest/strain/' % self.base_url
        request_generator = self.session_auth.request_generator
        response = request_generator.post(url, data=json.dumps(post_data),
                                          headers=self._json_header)

        # throw an error for unexpected reply
        if not is_success_code(response.status_code):
            if DEBUG:
                show_response_html(response)
            response.raise_for_status()

        # return the created strain
        return Strain(**json.loads(response.content))

    def get_study(self, pk):
        url = '%s/rest/study/%d' % (self.base_url, pk)
        request_generator = self.session_auth.request_generator
        response = request_generator.get(url)

        # throw an error for unexpected reply
        if response.status_code == 404:
            return None

        if response.status_code != requests.codes.ok:
            response.raise_for_status()

        kwargs = json.loads(response.content)

        # remove Update kwargs, which just have the primary keys...maybe we'll serialize /
        # TODO: deserialize more of this data later
        kwargs.pop('created')
        kwargs.pop('updated')

        return Study(**kwargs)


class DrfPagedResult(PagedResult):
    def __init__(self, results, total_result_count, next_page=None, previous_page=None):
        super(DrfPagedResult, self).__init__(results, total_result_count, next_page, previous_page)

    @staticmethod
    def of(json_string, model_class, serializer_class=None, prevent_mods=True):
        """
        Gets a PagedResult containing object results from the provided JSON input. For consistency,
        the result is always a PagedResult, even if the JSON response actually included the full set
        of results.
        :param json_string: the raw content of the HTTP response containing potentially paged
        content
        :param model_class: the class object to use in instantiating object instances to capture
        individual query results
        :param serializer_class: the serializer class to use in deserializing result data
        :param prevent_mods: True to prevent database modifications via returned Django model
        objects, which may not be fully populated with the full compliment of data required for
        database storage.
        :return: a PagedResult containing the data and a sufficient information for finding the rest
        of it (if any)
        """
        # TODO: fix/use serializer_class
        # TODO: implement or remove prevent_mods
        # TODO: try to merge with IcePagedResult.of(), then move implementation to parent
        # class after resolving the reflection problem below for DRF-based serializers

        # convert reply to a dictionary of native python data types
        json_dict = json.loads(json_string)

        if not json_dict:
            return None

        # pull out the 'results' subsection *if* the data is paged
        RESULTS_KEY = u'results'
        response_content = json_dict.get(RESULTS_KEY)
        count = None
        next_page = None
        prev_page = None

        # IF response is paged, pull out paging context
        if response_content or RESULTS_KEY in json_dict:
            next_page = json_dict.pop(u'next', None)
            prev_page = json_dict.pop(u'previous', None)
            count = json_dict.pop(u'count', None)

            if count == 0:
                return None

        # otherwise just deserialize the data
        else:
            response_content = json_dict

        # iterate through the returned data, deserializing each object found
        results_obj_list = []
        for object_dict in response_content:
            result_object = None

            # INITIAL attempt to use DRF serializer for de-serialization also. Needs work on
            # paramaterizing which serializer gets used -- strange issues with reflection
            # thus far, plus lots of extra library dependencies for not much benefit
            if USE_DRF_SERIALIZER:

                from edd.rest.serializers import StrainSerializer
                # serializer = serializer_class(data=object_dict)  # TODO: should work, but doesn't
                # because of an apparent problem in __new__ in DRF's SerializerMetaClass. huh.
                serializer = StrainSerializer(data=object_dict)
                serializer.is_valid(raise_exception=True)
                model_class = serializer.Meta.model
                validated_data = serializer.validated_data

                # work around an issue where the default
                # read only pk field won't get sent back to clients after creating a new strain. See
                # https://github.com/tomchristie/django-rest-framework/issues/2320 and related
                # issues and mailing list posts. The solution suggested in these resources suggests
                # making the serializer's PK field writable, which seems dangerous. Probably best
                # to just work around it here.
                pk = object_dict.get('pk')
                if pk:
                    validated_data['pk'] = pk
                result_object = model_class(**validated_data)
            # using parallel object hierarchy to Django model objects. Note that input isn't
            # validated, but that shouldn't really be an issue on the client side, so long as the
            # server connection is secure / trusted
            else:
                result_object = model_class(**object_dict)
            results_obj_list.append(result_object)

        return DrfPagedResult(results_obj_list, count, next_page, prev_page)

    def get_abs_study_browser_url(self, study_pk):
        """
        Gets the absolute URL of the study with the provided identifier.
        :return:
        """
        # Note: we purposefully DON'T use reverse() here since this code runs outside the context
        # of Django, if the library is even installed (it shouldn't be required).
        # Note: although it's normally best to abstract the URLs away from clients, in this case
        # clients will need the URL to push study link updates to ICE.
        return "%s/study/%s" %(self.base_url, study_pk)
