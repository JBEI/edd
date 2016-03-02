# -*- coding: utf-8 -*-
"""
Defines classes and utility methods used to communicate with the Index of Composable Elements
(ICE), a.k.a. the "registry of parts". This API is designed to minimize dependencies on other
libraries (e.g. Django model objects) so that it can be used from any part of the EDD codebase,
including remotely-executed code, with a minimum of network traffic and install process. For
example, many of the methods in the IceApi class are called from Celery tasks that may execute on
a physically separate server from EDD itself, where Django model objects shouldn't be passed over
the network.
"""
from __future__ import unicode_literals

import base64
import hashlib
import hmac
import json
import logging
import re
import os
import importlib

import requests
from requests.auth import AuthBase
from requests.compat import urlparse
from jbei.rest.utils import remove_trailing_slash, CLIENT_ERROR_NOT_FOUND

from jbei.rest.request_generators import RequestGenerator, SessionRequestGenerator
from jbei.util.deprecated import deprecated

logger = logging.getLogger(__name__)

####################################################################################################
# Set reasonable defaults where possible
####################################################################################################
ICE_REQUEST_TIMEOUT = (10, 10)  # request and read timeout, respectively, in seconds
ICE_URL = 'https://registry.jbei.org'
ICE_SECRET_KEY = None

####################################################################################################
# Perform flexible configuration based on whether or not client code or an environment
# variable has defined an alternate source of the required settings. If not, define some defaults
# here that will be used instead (though notably, no HMAC key will be available).
####################################################################################################

# if an ICE-specific settings module has been defined, override defaults with values provided there.
settings_module_name = os.environ.get('ICE_SETTINGS_MODULE')
if settings_module_name:
    settings = importlib.import_module(settings_module_name)
    if hasattr(settings, 'ICE_REQUEST_TIMEOUT'):
        ICE_REQUEST_TIMEOUT = settings.ICE_REQUEST_TIMEOUT
    if hasattr(settings, 'ICE_URL'):
        ICE_URL = settings.ICE_URL
    if hasattr(settings, 'ICE_SECRET_HMAC_KEY'):
        ICE_SECRET_KEY = settings.ICE_SECRET_KEY

# otherwise, if an a django settings module is defined, get configuration from there instead
else:
    settings_module_name = os.environ.get('DJANGO_SETTINGS_MODULE')
    if settings_module_name:
        # override defaults with values provided by Django settings. This dependency on
        # Django should be kept as contained as possible to prevent non-Django clients from
        # having to load a LOT of unnecessary libraries.
        try:
            import django.conf
            django_settings = django.conf.settings
            if hasattr(django_settings, 'ICE_REQUEST_TIMEOUT'):
                ICE_REQUEST_TIMEOUT = django_settings.ICE_REQUEST_TIMEOUT
            if hasattr(django_settings, 'ICE_URL'):
                ICE_URL = django_settings.ICE_URL
            if hasattr(django_settings, 'ICE_SECRET_HMAC_KEY'):
                ICE_SECRET_KEY = django_settings.ICE_SECRET_HMAC_KEY
        except ImportError as i:
            logger.error('DJANGO_SETTINGS_MODULE environment variable was provided as a source of '
                         'settings, but an import error occurred while trying to load Django '
                         'settings.')
            raise i


####################################################################################################


_JSON_CONTENT_TYPE_HEADER = {'Content-Type': 'application/json; charset=utf8'}

# regular expressions for parsing elements of ICE URLs
_PROTOCOL = 'http|https'
_BASE_ICE_URL_REGEX = r'.+'
# TODO: better to check for format of UUID. it's: 8 chars -4 chars -4 chars -4 chars -12 chars
_IDENTIFIER = r'[\w-]+'
_ICE_ENTRY_URL_REGEX = '(%(protocol)s)://(%(base_url)s)/entry/(%(identifier)s)/?' % {
    'protocol': _PROTOCOL, 'base_url': _BASE_ICE_URL_REGEX, 'identifier': _IDENTIFIER, }
ICE_ENTRY_URL_PATTERN = re.compile('^%s$' % _ICE_ENTRY_URL_REGEX, re.IGNORECASE)


class Part(object):
    """
    The Python representation of an ICE part.
    """

    def __init__(self, id=None, visible=None, parents=[], index=None, uuid=None,
                 name=None, owner=None, owner_email=None, owner_id=None, creator=None,
                 creator_email=None, creator_id=None, status=None, short_description=None,
                 long_description=None,
                 creation_time=None, mod_time=None, biosafety_level=None, part_id=None, links=[],
                 pi_name=None, pi_email=None, pi_id=None, selection_markers=None, bp_count=None,
                 feature_count=None, view_count=None, has_attachment=None, has_sample=None,
                 has_sequence=None, has_original_sequence=None, can_edit=None,
                 access_permissions=[], public_read=False, linked_parts=[], alias=None, keywords=[],
                 intellectual_property=None, references=None, funding_source=None):
        self.id = id
        self.visible = visible
        self.parents = []
        self.index = index
        self.uuid = uuid
        self.name = name
        self.owner = owner
        self.owner_email = owner_email
        self.owner_id = owner_id
        self.creator = creator
        self.creator_email = creator_email
        self.creator_id = creator_id
        self.status = status
        self.short_description = short_description
        self.long_description = long_description
        self.creation_time = creation_time
        self.mod_time = mod_time
        self.biosafety_level = biosafety_level
        self.part_id = part_id
        self.links = links
        self.pi_name = pi_name
        self.pi_email = pi_email
        self.pi_id = pi_id
        self.selection_markers = selection_markers
        self.bp_count = bp_count
        self.feature_count = feature_count
        self.view_count = view_count
        self.has_attachment = has_attachment
        self.has_sample = has_sample
        self.has_sequence = has_sequence
        self.has_original_sequence = has_original_sequence
        self.can_edit = can_edit
        self.access_permissions = access_permissions
        self.public_read = public_read
        self.linked_parts = linked_parts
        self.alias = alias
        self.keywords = keywords
        self.intellectual_property = intellectual_property
        self.references = references
        self.funding_source = funding_source
        self.parents = parents

    @staticmethod
    def of(json_dict):
        """
        Factory method for creating a Part from a JSON dictionary received from ICE.
        :param json_dict: a dictionary representation of the ICE JSON for this part
        :return: an object representing the part, or None if there's none in the input
        """
        # convert to a dictionary of native Python types

        if not json_dict:
            return None

        # extract nested objects
        parents = []
        parents_list = json_dict.get('parents')
        parents_list = (Part.of(parent_dict) for parent_dict in parents_list) if parents_list \
            else []

        ############################################################################################
        #  TODO: untested / no known examples of these...may be wrong. If just strings, no need for
        # parsing here
        links = json_dict.get('links', [])
        parameters = json_dict.get('parameters', [])
        access_permissions = json_dict.get('accessPermissions', [])
        ############################################################################################
        linked_parts_temp = json_dict.get('linkedParts')
        linked_parts = (Part.of(linked_part_dict) for linked_part_dict in linked_parts_temp) if \
                       linked_parts_temp else []
        # strains_temp = json_dict.get('strainData')
        # strain_data = (strain for strain in strains_temp) if strains_temp else []

        # build up a list of keyword arguments to use in constructing the Part.
        params = {}

        # set/replace object parameters in the dictionary
        params['links'] = links
        params['parents'] = parents
        params['selection_markers'] = json_dict.get('selectionMarkers')
        params['linked_parts'] = linked_parts

        # set other parameters whose names are different in Python than Java
        # TODO: can do this with less code by automatically converting camel case for most of
        # these. At least one known solution exists at
        # http://stackoverflow.com/questions/1175208/elegant-python-function-to
        #  -convert-camelcase-to-camel-case (seems a bit problematic, license-wise)
        params['uuid'] = json_dict.get('recordId')
        params['owner_email'] = json_dict.get('ownerEmail')
        params['owner_id'] = json_dict.get('ownerId')
        params['creator_email'] = json_dict.get('creatorEmail')
        params['creator_id'] = json_dict.get('creatorId')
        params['short_description'] = json_dict.get('shortDescription')
        params['long_description'] = json_dict.get('longDescription')
        params['creation_time'] = json_dict.get('creationTime')
        params['mod_time'] = json_dict.get('modificationTime')
        params['biosafety_level'] = json_dict.get('bioSafetyLevel')
        params['part_id'] = json_dict.get('partId')
        params['pi_name'] = json_dict.get('principalInvestigator')
        params['pi_email'] = json_dict.get('principalInvestigatorEmail')
        params['pi_id'] = json_dict.get('principalInvestigatorId')
        params['bp_count'] = json_dict.get('basePairCount')
        params['feature_count'] = json_dict.get('featureCount')
        params['view_count'] = json_dict.get('viewCount')
        params['has_attachment'] = json_dict.get('hasAttachment')
        params['has_sample'] = json_dict.get('hasSample')
        params['has_sequence'] = json_dict.get('hasSequence')
        params['has_original_sequence'] = json_dict.get('hasOriginalSequence')
        params['can_edit'] = json_dict['canEdit']
        params['access_permissions'] = access_permissions
        params['public_read'] = json_dict['publicRead']
        params['intellectual_property'] = json_dict.get('intellectualProperty')
        params['funding_source'] = json_dict.get('fundingSource')

        # copy over other keys of interest...this takes less code than copying json_dict and then
        # removing all of the camel-case keys
        identically_named_keys = ['id', 'visible', 'index', 'name', 'status', 'creator', 'owner',
                                  'alias', 'keywords', 'references']
        for key in identically_named_keys:
            params[key] = json_dict.get(key)

        part_type = json_dict['type']  # don't shadow builtin 'type'!

        if 'PLASMID' == part_type:
            return Plasmid(**params)

        if 'STRAIN' == part_type:
            # extract strain-specific data, if available. change camel case to snake case.
            strain_data = json_dict.pop('strainData')
            if strain_data:
                params['host'] = strain_data.get('host')
                params['genotype_phenotype'] = strain_data.get('genotypePhenotype')

            return Strain(**params)

        if 'PART' == part_type:
            return Part(**params)

        raise Exception('Unsupported type "%s"' % part_type)

    def __str__(self):
        return '%s / "%s"' % (self.part_id, self.name)


class Strain(Part):
    def __init__(self, host=None, genotype_phenotype=None, **kwargs):
        super(self.__class__, self).__init__(**kwargs)
        self.host = host
        self.genotype_phenotype = genotype_phenotype


class Plasmid(Part):
    def __init__(self, **kwargs):
        super(self.__class__, self).__init__(**kwargs)
        self.plasmid_data = kwargs.pop('plasmid_data', None)


def parse_entry_id(ice_entry_url):
    """
    Extracts identifier for the ICE part that is identified by the URL parameter. Depending on
    how the URL is defined, this may be either the locally-unique part ID used within a given ICE
    deplopment, or the UUID that provides a global unique ID for the part.
    :param ice_entry_url:
    the fully-qualified URL of the ICE part.
    :return: the identifier for the part within its host
    ICE deployment, or None if the input didn't match the expected pattern.
    """
    match = ICE_ENTRY_URL_PATTERN.match(ice_entry_url)

    if not match:
        return None

    return match.group(3)


class HmacAuth(AuthBase):
    """
    Implements Hash-based Message Authentication Codes (HMAC). HMAC guarantees that: A) a message
    has been generated by a holder of the secret key, and B) that its contents haven't been
    altered since the auth code was generated.
    Instances of HmacAuth are immutable and are therefore safe to use in multiple threads.
    :param username the username of the ice user who ICE activity will be attributed to.
    Overrides the value provided by user_auth if both are present. At least one is required.
    :raises ValueError if no user email address is provided.
    """
    # TODO: remove remaining ICE-specific code/variable names to make this code more generic,
    # then relocate. May need to create an ICE-specific subclass.

    def __init__(self, secret_key, username=None):
        if not secret_key:
            raise ValueError("A secret key is required input for HMAC authentication")
        self._USER_EMAIL = username
        self._SECRET_KEY = secret_key
        self._request_generator = RequestGenerator(auth=self)

    def get_request_generator(self):
        return self._request_generator

    def __call__(self, request):
        """
        Overrides the empty base implementation to provide authentication for the provided request
        object.
        """

        # generate a signature for the message by hashing the request using the secret key
        sig = self.build_signature(request)
        # TODO handle None == self.ident

        # add message headers including the username and message signature
        header = ':'.join(('1', 'edd', self._USER_EMAIL, sig))
        request.headers['Authorization'] = header
        return request

    def build_message(self, request):
        """
        Builds a string representation of the message contained in the request so it can be digested
        for HMAC generation
        """
        url = urlparse(request.url)
        # TODO handle None == self.user_email
        msg = '\n'.join((self._USER_EMAIL,
                         request.method,
                         url.netloc,
                         url.path,
                         self.sort_parameters(url.query),
                         request.body or ''))
        return msg

    def build_signature(self, request):
        """
        Builds a signature for the provided request message based on the secret key configured in
        server.cfg
        """
        key = base64.b64decode(self._SECRET_KEY)
        msg = self.build_message(request)
        digest = hmac.new(key, msg=msg, digestmod=hashlib.sha1).digest()
        sig = base64.b64encode(digest).decode()
        return sig

    def sort_parameters(self, query):
        params = sorted(map(lambda p: p.split('=', 1), query.split('&')), key=lambda p: p[0])
        return '&'.join(map(lambda p: '='.join(p), params))

    ############################################
    # 'with' context manager implementation ###
    ############################################
    def __enter__(self):
        return self

    def __exit__(self, type, value, traceback):
        pass
    ############################################

    @staticmethod
    def get(secret_key=ICE_SECRET_KEY, username=None, user_auth=None, request=None):
        """
        Factory method for creating an HMAC authentication instance for communicating with ICE using
        a combination of HMAC and the user ID of an *authenticated* EDD user. All actions
        performed in ICE using the resulting authentication instance
        will be attributed to the user with this ID, but trusted by ICE since they're signed by
        the secret key. It's crucial for security communications using this mechanism only be
        exposed to authenticated users or trusted systems.

        At least one of the last three parameters must be provided as a source of ICE username.
        :param secret_key: the secret key used to sign messages as the basis of HMAC authentication.
        if no key is provided, an attempt is made to read it from django's settings.
        :param username: the username of the ICE user to which subsequent ICE activity will
        be attributed
        :param user_auth: the user auth for an EDD user, which is assumed to contain a
        :param request: the authenticated EDD request to get user information from
        :return: a new HmacAuth instance
        """

        if username:
            return HmacAuth(secret_key=secret_key, username=username)
        elif user_auth and user_auth.email:
            return HmacAuth(secret_key=secret_key, username=user_auth.email)
        elif request and request.user:
            return HmacAuth(secret_key=secret_key, username=request.user)
        else:
            raise ValueError("At least one source of ICE username for an authenticated EDD user is "
                             "required")


class SessionAuth(AuthBase):
    """
    Implements session-based authentication for ICE. At the time of initial implementation,
    "session-based" is a bit misleading for the processing performed here, since ICE's login
    mechanism doesn't reply with set-cookie headers or read the session ID in the session cookie.
    Instead, ICE's REST API responds to a successful login with a JSON object containing the session
    ID, and authenticates subsequent requests by requiring the session ID in each subsequent
    request header.

    Clients should first call login() to get a valid ice session id
    """
    def __init__(self, session_id, session, timeout=ICE_REQUEST_TIMEOUT, verify_ssl_cert=True):
        self._session_id = session_id
        self._session = session
        self._request_generator = SessionRequestGenerator(session, auth=self, timeout=timeout,
                                                          verify_ssl_cert=verify_ssl_cert)

    def get_request_generator(self):
        return self._request_generator

    def __call__(self, request):
        """
        Overrides the empty base implementation to provide authentication for the provided request
        object (which should normally be _session). ICE doesn't seem to read the session ID from
        cookies, so there's no specific need to provide those here.
        """
        request.headers['X-ICE-Authentication-SessionId'] = self._session_id
        return request

    ############################################
    # 'with' context manager implementation ###
    ############################################
    def __enter__(self):
        return self

    def __exit__(self, type, value, traceback):
        self._session.__exit__(type, value, traceback)
    ############################################

    @staticmethod
    def login(password, ice_username=None, user_auth=None, base_url=ICE_URL,
              timeout=ICE_REQUEST_TIMEOUT, verify_ssl_cert=True):

        """
        Logs into ICE at the provided base URL or raises an Exception if an unexpected response is
        received from the server.
        :param base_url: the base URL of the ICE installation (not including the protocol
        :param timeout a tuple representing the connection and read timeouts, respectively, in
        seconds, for the login request to ICE's REST API
        :param verify_ssl_cert True to verify ICE's SSL certificate. Provided so clients can ignore
        self-signed certificates during *local* EDD / ICE testing on a single development machine.
        Note that it's very dangerous to skip certificate verification when communicating across
        the network, and this should NEVER be done in production.
        :return: new SessionAuth containing the newly-created session. Note that at present the
        session isn't strictly required, but is provided for completeness in case ICE's
        behavior changes to store the session ID as a cookie instead of requiring it as a request
        header.
        """

        if not ice_username:
            ice_username = user_auth.email if user_auth else None

        if not ice_username:
            raise ValueError("At least one source of ICE username is required")

        # chop off the trailing '/', if any, so we can write easier-to-read URL snippets in our code
        # (starting w '%s/'). also makes our code trailing-slash agnostic.
        base_url = remove_trailing_slash(base_url)

        # begin a session to track any persistent state required by the server
        session = requests.session()

        # build request parameters for login
        login_dict = {'email': ice_username,
                      'password': password}
        login_resource_url = '%(base_url)s/rest/accesstokens/' % {'base_url': base_url}

        # issue a POST to request login from the ICE REST API
        response = session.post(login_resource_url, headers=_JSON_CONTENT_TYPE_HEADER,
                                data=json.dumps(login_dict), timeout=timeout,
                                verify=verify_ssl_cert)

        # raise an exception if the server didn't give the expected response
        if response.status_code != requests.codes.ok:
            response.raise_for_status()

        json_response = response.json()
        session_id = json_response['sessionId']

        # if login failed for any other reason,
        if not session_id:
            raise ValueError("Server responded successfully, but response did not include the "
                             "required session id")

        logger.info('Successfully logged into ICE at %s' % base_url)

        return SessionAuth(session_id, session)


class IceApi(object):
    """
    Defines the interface to ICE's REST API.

    TODO: extremely basic interface to ICE API; should eventually expand to cover more
    of the API, modularize (i.e. so others can just import jbei.ice), and document.
    """
    # TODO: prioritize returning objects here over JSON, which is should be available to
    # front-end code, but better encapsulated for client-side REST API access. EDD should expose
    # JSON data as a view in its rest API rather than here.
    # TODO: when returning model objects, prevent database changes via partially-populated model
    # object instances. See draft code in edd.py

    def __init__(self, auth, base_url=ICE_URL):
        """
        Creates a new instance of IceApi
        :param auth: the authentication strategy for communication with ICE
        :param base_url: the base URL of the ICE install.
        """
        if not auth:
            raise ValueError("A valid authentication mechanism must be provided")

        self.request_generator = auth.get_request_generator()

        # chop off the trailing '/', if any, so we can write easier-to-read URL snippets in our code
        # (starting w '%s/'). also makes our code trailing-slash agnostic.
        self.base_url = remove_trailing_slash(base_url)

    def fetch_part(self, entry_id, suppress_errors=False):
        """
        Retrieves a part using any of the unique identifiers: part number, synthetic id, or
        UUID. Returns a Part object; or None if no part was found or if there were suppressed
        errors in making the request.
        :param entry_id: the ICE ID for this part
        :param suppress_errors: true to catch and log exception messages and return None instead of
        raising Exceptions.
        :return: A Part object representing the response from ICE, or None if an an Exception
        occurred but suppress_errors was true.
        """

        rest_url = '%s/rest/parts/%s' % (self.base_url, entry_id)
        try:
            response = self.request_generator.get(url=rest_url)
        except requests.exceptions.Timeout as e:

            if not suppress_errors:
                raise e
            logger.exception("Timeout requesting part %s: %s", entry_id)
        else:
            if response.status_code == requests.codes.ok:
                # convert reply to a dictionary of native python data types
                json_dict = json.loads(response.content)

                if not json_dict:
                    return None

                return Part.of(json_dict)

            elif response.status_code == CLIENT_ERROR_NOT_FOUND:
                return None

            if not suppress_errors:
                response.raise_for_status()

            logger.exception('Error fetching part from ICE with entry_id %(entry_id)s. '
                             'Response = %(status_code)d: "%(msg)s"'
                             % {'entry_id': entry_id,
                                'status_code': response.status_code,
                                'msg': response.reason
                                })

            return None

    @deprecated  # new code should use fetch_part() instead. MF 2/17/16
    def fetch_part_json(self, entry_id, suppress_errors=False):
        """
        Retrieves a part using any of the unique identifiers: part number, synthetic id, or
        UUID. Returns a tuple of a dict containing ICE JSON representation of a part and the
        URL for the part; or a tuple of None and the URL if there was a non-success HTTP
        result; or None if there were errors making the request.
        :param entry_id: the ICE ID for this part
        :param suppress_errors: true to catch and log exception messages and return None instead of
        raising Exceptions.
        :return: The JSON response from ICE, or None if an an Exception occurred but suppress_errors
        was true.
        """

        url = '%s/rest/parts/%s' % (self.base_url, entry_id)
        try:
            response = self.request_generator.get(url=url)
        except requests.exceptions.Timeout as e:

            if not suppress_errors:
                raise e
            logger.exception("Timeout requesting part %s: %s", entry_id)
        else:
            if response.status_code == requests.codes.ok:
                return (response.json(), url,)

            if not suppress_errors:
                response.raise_for_status()

            logger.exception('Error fetching part from ICE with entry_id %(entry_id)s. '
                             'Response = %(status_code)d: "%(msg)s"'
                             % {'entry_id': entry_id,
                                'status_code': response.status_code,
                                'msg': response.reason
                                })

            return (None, url,)

    def search_for_part(self, query, suppress_errors=False):
        """
        Calls ICE's REST API to search for a biological part with using the specified query string
        :param query: the query string
        :param suppress_errors:
        :return: JSON
        """
        logger.info('Searching for ICE part(s) using query "%s"' % query)

        url = '%s/rest/search' % self.base_url
        data = {'queryString': query}
        headers = {'Content-Type': 'application/json; charset=utf8'}
        try:
            response = self.request_generator.request(
                'POST', url,
                data=json.dumps(data),
                headers=headers
            )
            if response.status_code == requests.codes.ok:
                return response.json()
            elif suppress_errors:
                logger.exception('Error searching for ICE part using query "%(query_str)s". '
                                 'Response was %(status_code)s: "%(msg)s"' %
                                 {
                                     'query_str': query,
                                     'status_code': response.status_code,
                                     'msg': response.reason
                                 })
                return None
            else:
                response.raise_for_status()
        except requests.exceptions.Timeout as e:
            if not suppress_errors:
                raise e
            logger.exception('Timeout searching ICE for query "%s"' % query)

    def _create_or_update_link(self, study_name, study_url, entry_experiments_url,
                               link_id=None):
        """
            A helper method that creates or updates a single study link in ICE. Note that ICE seems
            to do some URL-based matching / link replacement even if no link ID is provided.
            :raises requests.exceptions.Timeout if the initial connection or response times out
        """
        # NOTE: this implementation works, but can probably be simplified based on how ICE actually
        # behaves vs. what the original plan was. Probably best to wait for comments and see
        # whether SYNBIO-1196 changes (see associated
        # comments). Currently, there's no need to provide the link ID at all when adding/updating.

        json_dict = {'label': study_name, 'url': study_url}
        json_str = json.dumps(json_dict)

        if logger:
            logger.info(
                "Requesting part-> study link from ICE (id=%s): %s" %
                (str(link_id), entry_experiments_url)
            )
            logger.info("Response: %s " % json_str)

        headers = {'Content-Type': 'application/json'}
        if link_id:
            headers['id'] = link_id

        request_generator = self.request_generator
        response = request_generator.request('POST', entry_experiments_url,
                                             data=json_str,
                                             headers=headers)

        if response.status_code != requests.codes.ok:
            response.raise_for_status()

    def unlink_entry_from_study(self, ice_entry_id, study_id, study_url, logger):
        """
        Contacts ICE to find and remove all the links from the specified ICE part to the
        specified EDD study. In practical use, there will probably only ever be one per
        part/study combination.
        :param ice_entry_id: the id of the ICE entry whose link to the study should be removed (
        either a UUID or the numeric id)
        :param study_id: the study ID to display in log messages (though the study may have been
        deleted).
        :param study_url: the study URL :param logger: the logger to log messages to
        :return true if a link to the specified study was removed from ICE, false if no such link
        existed (but no error occurred)
        :raises HTTPError if a communication error occurred or if the server responded with a
        status code other than 200
        :raises requests.exceptions.Timeout if a communication timeout occurs.
        """
        logger.info('Start ' + self.unlink_entry_from_study.__name__ + "()")

        # Look up the links associated with this ICE part
        entry_experiments_rest_url = '%s/rest/parts/%s/experiments/' % (self.base_url, ice_entry_id)

        response = self.request_generator.request('GET', entry_experiments_rest_url,
                                             headers=_JSON_CONTENT_TYPE_HEADER)
        if response.status_code != requests.codes.ok:
            response.raise_for_status()

        # Filter out links that aren't for this study
        json_dict = response.json()
        study_links = [link for link in json_dict if study_url == link.get('url')]
        logger.debug("Existing links response: " + json_dict.__str__())

        if not study_links:
            logger.warning('No existing links found for (entry %s, study %d). Nothing to remove!'
                           % (ice_entry_id, study_id))
            return False

        # Delete all links that reference this study URL
        for link in study_links:
            link_id = link.get('id')
            logger.info('Deleting link %d from entry %s' % (link_id, ice_entry_id))
            link_resource_uri = entry_experiments_rest_url + "%s/" % link_id
            response = request_generator.request('DELETE', link_resource_uri)

            if response.status_code != requests.codes.ok:
                response.raise_for_status()
        return True

    def link_entry_to_study(self, ice_entry_id, study_id, study_url, study_name, logger,
                            old_study_name=None):
        """
        Communicates with ICE to link an ICE entry to an EDD study, or if a link to this URL
        already exists, updates the labels for the all the existing ICE experiment links that
        uses this URL (even for entries other than the one specified by ice_entry_id). See
        comments on SYNBIO-1196.
        :param ice_entry_id: the string used to identify the strain ( either the string
        representation of the number displayed in the URL, or the UUID stored in EDD's database)
        :param study_id: the unique ID of this study
        :param study_url: the URL for the EDD study to link to the ICE strain
        :param study_name: the name of the EDD study
        :param old_study_name: the previous name of the EDD study (assumption is that it was just
        renamed). If provided, all ICE links with this name and the study_url will be updated to
        use the new name.
        :raises HTTPError if a communication error occurred or if the server responded with a status
        code other than 200
        :raises requests.exceptions.Timeout if a communication timeout occurs.
        """
        logger.info('Start ' + self.link_entry_to_study.__name__ + '()')

        # NOTE: this implementation works, but can probably be simplified based on how ICE actually
        # behaves vs. what the original plan was. Probably best to wait for comments and see
        # whether SYNBIO-1196 changes (see associated comments). Currently, there's no need to
        # account for possibility of multiple ICE links from a single entry to the same EDD
        # study, since ICE won't support multiple links to the same URL (the latest just
        # overwrites).

        # query ICE to get the list of existing links for this part
        entry_experiments_rest_url = '%s/rest/parts/%s/experiments/' % (self.base_url, ice_entry_id)
        logger.info(entry_experiments_rest_url)
        response = self.request_generator.request('GET', entry_experiments_rest_url,
                                             headers=_JSON_CONTENT_TYPE_HEADER)
        if response.status_code != requests.codes.ok:
            response.raise_for_status()

        # inspect results to find the unique ID's for any pre-existing links referencing the study's
        # URL
        label_key = 'label'
        url_key = 'url'
        existing_links = response.json()
        current_study_links = [link for link in existing_links if
                               ((study_url == link.get(url_key)) and
                                (study_name == link.get(label_key)))]
        outdated_study_links = []
        if old_study_name:
            outdated_study_links = [link for link in existing_links if
                                    ((study_url == link.get(url_key)) and
                                     (old_study_name == link.get(label_key)))]

        logger.debug('Existing links: ' + str(existing_links))
        logger.debug('Current study links:' + str(current_study_links))
        logger.debug('Outdated study links: ' + str(outdated_study_links))

        # if there's at least one up-to-date link to the study, and there are no outdated links to
        # it, just return without making any changes
        if current_study_links and not outdated_study_links:
            return

        # create or update study links
        if outdated_study_links:
            for outdated_link in outdated_study_links:
                self._create_or_update_link(study_name, study_url, entry_experiments_rest_url,
                                            link_id=outdated_link.get('id'))
        else:
            self._create_or_update_link(study_name, study_url, entry_experiments_rest_url)
