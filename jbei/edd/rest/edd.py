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
from jbei.edd.rest.constants import (CASE_SENSITIVE_DEFAULT, CASE_SENSITIVE_PARAM,
                                     LINES_ACTIVE_DEFAULT, METADATA_CONTEXT_VALUES,
                                     METADATA_TYPE_GROUP, METADATA_TYPE_CONTEXT,
                                     METADATA_TYPE_NAME_REGEX,
                                     METADATA_TYPE_LOCALE, METADATA_TYPE_I18N,
                                     STRAIN_CASE_SENSITIVE, STRAIN_DESCRIPTION_KEY, STRAIN_NAME,
                                     STRAIN_NAME_KEY, STRAIN_NAME_REGEX, STRAIN_REG_ID_KEY,
                                     STRAIN_REG_URL_KEY, STRAIN_REGISTRY_ID,
                                     STRAIN_REGISTRY_URL_REGEX, PAGE_NUMBER_QUERY_PARAM,
                                     PAGE_SIZE_QUERY_PARAM)
from jbei.edd.rest.constants import LINE_ACTIVE_STATUS_PARAM
from jbei.rest.api import RestApiClient
from jbei.rest.request_generators import SessionRequestGenerator, PagedRequestGenerator, PagedResult
from jbei.rest.utils import remove_trailing_slash, UNSAFE_HTTP_METHODS, CLIENT_ERROR_NOT_FOUND
from jbei.rest.utils import show_response_html, is_success_code

DEBUG = False  # controls whether error response content is written to temp file, then displayed
               # in a browser tab
VERIFY_SSL_DEFAULT = jbei.rest.request_generators.RequestGenerator.VERIFY_SSL_DEFAULT
DEFAULT_REQUEST_TIMEOUT = (10, 10)  # HTTP request connection and read timeouts, respectively
                                    # (seconds)
DEFAULT_PAGE_SIZE = 30

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

# TODO: if continuing with this approach, extract string constants from EddObject & derived classes
# to a separate file and reference from both here and from edd.rest.serializers
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
        self.meta_store = temp.pop('meta_store', None)
        super(Line, self).__init__(**temp)


class Study(EddRestObject):
    def __init__(self, **kwargs):
        temp = kwargs.copy()  # don't change parameter!
        self.contact = temp.pop('contact', None)
        self.contact_extra = temp.pop('contact_extra', None)
        self.metabolic_map = temp.pop('metabolic_map', None)
        self.protocols = temp.pop('protocols', None)
        super(Study, self).__init__(**temp)


class MetadataType(object):
    def __init__(self, type_name, for_context, prefix='', postfix='', pk=None, group=None,
                 type_i18n=None, type_field=None, input_size=None, input_type=None,
                 default_value=None, type_class=None):
        self.pk = pk
        self.group = group
        self.type_name = type_name
        self.type_i18n = type_i18n
        self.type_field = type_field
        self.input_size = input_size
        self.input_type = input_type
        self.default_value = default_value
        self.prefix = prefix
        self.postfix = postfix
        self.for_context = for_context
        self.type_class = type_class


class MetadataGroup(object):
    def __init__(self, **kwargs):
        self.group_name = kwargs['group_name']


DJANGO_CSRF_COOKIE_KEY = 'csrftoken'


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
        super(DrfSessionRequestGenerator, self).__exit__(type, value, traceback)
    #############################################################

    def request(self, method, url, **kwargs):
        print('executing %s.request()' % self.__class__.__name__)
        # if using an "unsafe" HTTP method, include the CSRF header required by DRF
        if method.upper() in UNSAFE_HTTP_METHODS:
            kwargs = self._get_csrf_headers(**kwargs)

        return super(DrfSessionRequestGenerator, self).request(method, url, **kwargs)

    def head(self, url, **kwargs):
        return super(DrfSessionRequestGenerator, self).head(url, **kwargs)

    def get(self, url, **kwargs):
        return super(DrfSessionRequestGenerator, self).get(url, **kwargs)

    def options(self, **kwargs):
        super(DrfSessionRequestGenerator, self).options(self, **kwargs)

    def post(self, url, data=None, **kwargs):
        kwargs = self._get_csrf_headers(**kwargs)
        return super(DrfSessionRequestGenerator, self).post(url, data, **kwargs)

    def put(self, url, data=None, **kwargs):
        kwargs = self._get_csrf_headers(**kwargs)
        return super(DrfSessionRequestGenerator, self).put(url, data, **kwargs)

    def patch(self, url, data=None, **kwargs):
        kwargs = self._get_csrf_headers(**kwargs)
        return super(DrfSessionRequestGenerator, self).patch(url, data, **kwargs)

    def delete(self, url, **kwargs):
        kwargs = self._get_csrf_headers(**kwargs)
        return super(DrfSessionRequestGenerator, self).delete(url, **kwargs)

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
        super(EddApi, self).__init__('EDD', base_url, session_auth.request_generator,
                                     result_limit=result_limit)
        self.session_auth = session_auth

    def get_strain(self, strain_id=None):
        """
        A convenience method to get the strain (if any) with the provided primary key and/or
        registry id (either should be
        sufficient to uniquely identify the strain within an EDD deployment).
        :param strain_id: a unique identifier for the strain (either the numeric primary key or
        registry_id)
        """
        request_generator = self.session_auth.request_generator

        # make the HTTP request
        url = '%(base_url)s/rest/strain/%(strain_id)s/' % {
            'base_url': self.base_url,
            'strain_id': strain_id,
        }
        response = request_generator.get(url, headers=self._json_header)

        # throw an error for unexpected reply
        if response.status_code == requests.codes.ok:
            json_dict = json.loads(response.content)
            return Strain(**json_dict)
        elif response.status_code == CLIENT_ERROR_NOT_FOUND:
            return None

        response.raise_for_status()

    def get_metadata_type(self, local_pk=None):
        """
        Queries EDD to get the MetadataType uniquely identified by local numeric primary key,
        by i18n string, or by the combination of
        :param local_pk: the integer primary key that uniquely identifies the metadata type
        within this EDD deployment
        :return: the MetadaDataType, or None
        """
        # make the HTTP request
        url = '%(base_url)s/rest/metadata_type/%(pk)d' % {
            'base_url': self.base_url,
            'pk': local_pk,
        }
        request_generator = self.session_auth.request_generator
        response = request_generator.get(url, headers=self._json_header)

        # throw an error for unexpected reply
        if response.status_code != requests.codes.ok:
            response.raise_for_status()

        return MetadataType(**response.content)

    def search_metadata_types(self, context=None, group=None, local_name_regex=None, locale=b'en_US',
                              case_sensitive=CASE_SENSITIVE_DEFAULT, type_i18n=None, query_url=None,
                              page_number=None):
        """
        Searches EDD for the MetadataType(s) that match the search criteria
        :param context: the context for the metadata to be searched. Must be in
        METADATA_CONTEXT_VALUES
        :param group: the group this metadat is part of
        :param local_name_regex: the localized name for the metadata type
        :param locale: the locale to search for the metadata type
        :param case_sensitive: True if local_name_regex should be compiled for case-sensitive
        matching, False otherwise.
        :param type_i18n:
        :param query_url:
        :param page_number: the page number of results to be returned (1-indexed)
        :return:
        """

        if local_name_regex and not locale:
            raise RuntimeError('locale is required if local_name_regex is provided')

        if context and context not in METADATA_CONTEXT_VALUES:
            raise ValueError('context \"%s\" is not a supported value' % context)

        self._verify_page_number(page_number)

        request_generator = self.session_auth.request_generator

        # build up a dictionary of search parameters based on provided inputs
        if query_url:
            response = request_generator.get(query_url, headers=self._json_header)
        else:
            search_params = {}

            if context:
                search_params[METADATA_TYPE_CONTEXT] = context

            if group:
                search_params[METADATA_TYPE_GROUP] = group

            if type_i18n:
                search_params[METADATA_TYPE_I18N] = type_i18n

            if local_name_regex:
                search_params[METADATA_TYPE_NAME_REGEX] = local_name_regex
                search_params[METADATA_TYPE_LOCALE] = locale

            if case_sensitive:
                search_params[CASE_SENSITIVE_PARAM] = case_sensitive

            if self.result_limit:
                search_params[PAGE_SIZE_QUERY_PARAM] = self.result_limit

            if page_number:
                search_params[PAGE_NUMBER_QUERY_PARAM] = page_number

            # make the HTTP request
            url = '%s/rest/metadata_type' % self.base_url
            response = request_generator.get(url, params=search_params, headers=self._json_header)

        # throw an error for unexpected reply
        if response.status_code != requests.codes.ok:
            response.raise_for_status()

        return DrfPagedResult.of(response.content, model_class=MetadataType)

    def search_strains(self, query_url=None, local_pk=None, registry_id=None,
                       registry_url_regex=None, name=None,
                       name_regex=None, case_sensitive=None, page_number=None):
        """
        Searches EDD for strain(s) matching the search criteria.
        :param query_url: a convenience for getting the next page of results in multi-page
        result sets. Query_url is the entire URL for the search, including query parameters (for
        example, the value returned for next_page as a result of a prior search). If present,
        all other parameters will be ignored.
        :param local_pk: the integer primary key that idetifies the strain within this EDD
        deployment
        :param registry_id: the registry id (UUID) to search for
        :param registry_url_regex: the registry URL to search for
        :param name: the strain name or name fragment to search for (case-sensitivity determined
        by case_sensitive)
        :param name_regex: a regular expression for the strain name (case-sensitivity determined
        by case_sensitive)
        :param case_sensitive: whether or not to use case-sensitive string comparisons. False or
        None indicates that searches should be case-insensitive.
        :param page_number: the page number of results to be returned (1-indexed)
        :return: a PagedResult containing some or all of the EDD strains that matched the search
        criteria
        """

        self._verify_page_number(page_number)

        request_generator = self.session_auth.request_generator

        # build up a dictionary of search parameters based on provided inputs
        if query_url:
            response = request_generator.get(query_url, headers=self._json_header)
        else:
            search_params = {}

            if local_pk:
                search_params['pk'] = local_pk

            if registry_id:
                search_params[STRAIN_REGISTRY_ID] = registry_id

            if registry_url_regex:
                search_params[STRAIN_REGISTRY_URL_REGEX] = registry_url_regex

            if name:
                search_params[STRAIN_NAME] = name

            elif name_regex:
                search_params[STRAIN_NAME_REGEX] = name_regex

            if case_sensitive:
                search_params[STRAIN_CASE_SENSITIVE] = case_sensitive

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

        return DrfPagedResult.of(response.content, model_class=Strain)

    def get_strain_studies(self, local_strain_pk=None, strain_uuid=None, query_url=None,
                           page_number=None):
        """
        Queries EDD for all of the studies associated with the given strain.
        :param local_strain_pk: the integer local primary key for this strain in this EDD
        deployment. When available, strain_uuid is preferred since it's valid across EDD
        deployments.
        :param strain_uuid: the UUID for this strain as created by ICE. When available,
        strain_uuid is preferred since it's valid across EDD deployments.
        :param query_url: a convenience for getting the next page of results in multi-page
        result sets. Query_url is the entire URL for the search, including query parameters (for
        example, the value returned for next_page as a result of a prior search). If present,
        all other parameters will be ignored.
        :param page_number: the page number of results to be returned (1-indexed)
        :return: a PagedResult with some or all of the associated studies, or None if none were
        found for this strain
        """
        self._verify_page_number(page_number)
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
            elif local_strain_pk:
                search_params[id] = local_strain_pk
            else:
                raise KeyError('At least one strain identifier must be provided')  # TODO: consider
                # exception type and message

            if self.result_limit:
                search_params[PAGE_SIZE_QUERY_PARAM] = self.result_limit

            if page_number:
                search_params[PAGE_NUMBER_QUERY_PARAM] = page_number

            url = '%s/rest/strain/%d/studies/' % (self.base_url, local_strain_pk)

            response = request_generator.get(url, params=search_params)

        if response.status_code == requests.codes.ok:
            return DrfPagedResult.of(response.content, model_class=Study)

    def get_study_lines(self, study_pk, line_active_status=LINES_ACTIVE_DEFAULT, query_url=None,
                        page_number=None):

        """
        Queries EDD for the lines associated with a specific study
        :param query_url: a convenience for getting the next page of results in multi-page
        result sets. Query_url is the entire URL for the search, including query parameters (for
        example, the value returned for next_page as a result of a prior search). If present,
        all other parameters will be ignored.
        :param page_number: the page number of results to be returned (1-indexed)
        :return: a PagedResult containing some or all of the EDD lines that matched the search
        criteria
        """
        self._verify_page_number(page_number)
        request_generator = self.session_auth.request_generator

        # if servicing a paged response, just use the provided query URL so clients don't have to
        # keep track of all the parameters
        if query_url:
            response = request_generator.get(query_url, headers=self._json_header)
        else:
            # make the HTTP request
            url = '%s/rest/study/%d/lines/' % (self.base_url, study_pk)

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

        :param study_pk: the integer primary key for the EDD study whose strain assocations we
        want to get
        :param strain_id: an optional unique identifier to test whether a specific strain is used in
        this EDD study. The unique ID can be either EDD's numeric primary key for the strain,
        or ICE's UUID, or an empty string to get all strains associated with the study.
        :param line_active_status:
        :param page_number: the page number of results to be returned (1-indexed)
        :param query_url: a convenience for getting the next page of results in multi-page
        result sets. Query_url is the entire URL for the search, including query parameters (for
        example, the value returned for next_page as a result of a prior search). If present,
        all other parameters will be ignored.
        :return: a PagedResult containing some or all of the EDD strains used in this study
        """

        self._verify_page_number(page_number)
        request_generator = self.session_auth.request_generator
        response = None

        if query_url:
            request_generator.get(query_url, headers=self._json_header)

        else:
            url = '%s/rest/study/%d/strains/%s' % (self.base_url, study_pk, str(strain_id))

            # add parameters to the request
            params = {}

            if line_active_status:
                params[LINE_ACTIVE_STATUS_PARAM] = line_active_status

            if page_number:
                params[PAGE_NUMBER_QUERY_PARAM] = page_number

            response = request_generator.get(url, headers=self._json_header, params=params)

        if response.status_code == CLIENT_ERROR_NOT_FOUND:
            return None

        # throw an error for unexpected reply
        if response.status_code != requests.codes.ok:
            response.raise_for_status()

        return DrfPagedResult.of(response.content, Strain)

    def create_line(self, study_id, strain_id, name, description=None, metadata={}):
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
            "meta_store": metadata,
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

    # TODO: shouldn't be able to do this via the API...? Investigate use in Admin app.
    # Will's comment is that line creation / edit should take a strain UUID as input
    def create_strain(self, name, description, registry_id, registry_url):
        """
        Creates or updates a Strain in EDD
        :return: the newly-created strain, but containing only the subset of its state serialized
        by the REST API.
        :raises: an Exception if the strain couldn't be created
        :raises RuntimeError: if writes are disabled when this method is invoked
        """
        self._prevent_write_while_disabled()

        post_data = {
            STRAIN_NAME_KEY: name,
            STRAIN_DESCRIPTION_KEY: description,
            STRAIN_REG_ID_KEY: registry_id,
            STRAIN_REG_URL_KEY: registry_url,
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

        # return the created/updated strain
        return Strain(**json.loads(response.content))

    def _update_strain(self, http_method, name=None, description=None, local_pk=None,
                       registry_id=None, registry_url=None):
        """
        A helper method that is the workhorse for both setting all of a strains values,
        or updating just a select subset of them
        :param http_method: the method to use in updating the strain (determines replacement type by
        REST convention).
        :param name: the strain name
        :param description: the strain description
        :param local_pk: the numeric primary key for this strain in the local EDD deployment
        :param registry_id: the ICE UUID for this strain
        :param registry_url: the ICE URL for this strain
        :return: the strain if it was created
        """

        self._prevent_write_while_disabled()

        strain_values = {}
        if name:
            strain_values[STRAIN_NAME_KEY] = name
        if description:
            strain_values[STRAIN_DESCRIPTION_KEY] = name
        if registry_id:
            strain_values[STRAIN_REG_ID_KEY] = registry_id
        if registry_url:
            strain_values[STRAIN_REG_URL_KEY] = registry_url

        # determine which identifier to use for the strain. if the local_pk is provided, use that
        # since we may be trying to update a strain that has no UUID defined
        strain_id = str(local_pk) if local_pk else str(registry_id)

        # build the URL for this strain resource
        url = '%(base_url)s/rest/strain/%(strain_id)s' % {
            'base_url': self.base_url, 'strain_id': strain_id,
        }

        request_generator = self.session_auth.request_generator
        response = request_generator.request(http_method, url, data=json.dumps(strain_values),
                                             headers=self._json_header)

        if not is_success_code(response.status_code):
            if DEBUG:
                show_response_html(response)
            response.raise_for_status()

        return Strain(**json.loads(response.content))

    def update_strain(self, name=None, description=None, local_pk=None, registry_id=None,
                      registry_url=None):
        return self._update_strain('PATCH', name, description, local_pk, registry_id, registry_url)

    def set_strain(self, name, description, local_pk=None, registry_id=None, registry_url=None):
        """
        Updates the content of a preexisting strain, replacing all of its fields with the ones
        provided (or null/empty for any except the pk that aren't)
        :return:
        """
        return self._update_strain('PUT', name, description, local_pk, registry_id, registry_url)

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

    def get_abs_study_browser_url(self, study_pk, alternate_base_url=None):
        """
        Gets the absolute URL of the study with the provided identifier.
        :return:
        """
        # Note: we purposefully DON'T use reverse() here since this code runs outside the context
        # of Django, if the library is even installed (it shouldn't be required).
        # Note: although it's normally best to abstract the URLs away from clients, in this case
        # clients will need the URL to push study link updates to ICE.
        base_url = alternate_base_url if alternate_base_url else self.base_url
        return "%s/study/%s/" % (base_url, study_pk)


class DrfPagedResult(PagedResult):

    def __init__(self, results, total_result_count, next_page=None, previous_page=None):
        super(DrfPagedResult, self).__init__(results, total_result_count, next_page, previous_page)

    @staticmethod
    def of(json_string, model_class):
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
        # TODO: try to merge with IcePagedResult.of(), then move implementation to parent
        # class.  Initial attempt here was to use DRF serializers for de-serialization, which may be
        # worth another shot following corrected use of super() in those classes.
        # Otherwise, more Pythonic to just use a factory method. Also update IcePagedResult for
        # consistency.

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
        results_obj_list = []

        # IF response is paged, pull out paging context
        if response_content or RESULTS_KEY in json_dict:
            next_page = json_dict.pop(u'next', None)
            prev_page = json_dict.pop(u'previous', None)
            count = json_dict.pop(u'count', None)

            if count == 0:
                return None

            # iterate through the returned data, deserializing each object found
            for object_dict in response_content:
                # using parallel object hierarchy to Django model objects. Note that input isn't
                # validated, but that shouldn't really be an issue on the client side,
                # so long as the
                # server connection is secure / trusted
                result_object = model_class(**object_dict)

                results_obj_list.append(result_object)

        # otherwise just deserialize the data
        else:
            result_object = model_class(**json_dict)
            count = 1
            results_obj_list.append(result_object)

        return DrfPagedResult(results_obj_list, count, next_page, prev_page)
