# -*- coding: utf-8 -*-
from __future__ import unicode_literals
import base64
import hashlib
import hmac
import json
import requests
import re
import logging

from requests.auth import AuthBase
from requests.compat import urlparse
from edd.local_settings import ICE_URL, ICE_SECRET_HMAC_KEY, ICE_REQUEST_TIMEOUT

"""
    Defines classes and utility methods used to communicate with the Index of Composable Elements (ICE), a.k.a. the
    "registry of parts".
    This API is designed to minimize dependencies on other libraries (e.g. Django model objects) so that it can be used
    from any part of the EDD codebase, including remotely-executed code, with a minimum of network traffic and install
    process. For example, many of the methods in the IceApi class are called from Celery tasks that may execute on a
    physically separate server from EDD itself, where Django model objects shouldn't be passed over the network.
"""

logger = logging.getLogger(__name__)

_JSON_CONTENT_TYPE_HEADER = {'Content-Type': 'application/json; charset=utf8'}

# not currently used, but implemented/tested based on an earlier set of assumptions...hopefully useful at some point!
_PROTOCOL = 'http|https'
_BASE_ICE_URL_REGEX = r'.+'
_IDENTIFIER = r'[\w-]+'  # TODO: better to check for format of UUID. it's: 8 chars -4 chars -4 chars -4 chars -12 chars
_ICE_ENTRY_URL_REGEX = '(' + _PROTOCOL + ')://(' + _BASE_ICE_URL_REGEX + ')' + '/entry/(' + _IDENTIFIER + ')/?'
ICE_ENTRY_URL_PATTERN = re.compile('^' + _ICE_ENTRY_URL_REGEX + '$', re.IGNORECASE)


def parse_entry_id(ice_entry_url):
    """
    Extracts identifier for the ICE part that is identified by the URL parameter. Depending on how the URL is defined,
    this may be either the locally-unique part ID used within a given ICE deplopment, or the UUID that provides a global
    unique ID for the part.\
    :param ice_entry_url: the fully-qualified URL of the ICE part.
    :return: the identifier for the part within its host ICE deployment, or None if the input didn't match the
    expected pattern.
    """
    match = ICE_ENTRY_URL_PATTERN.match(ice_entry_url)

    if not match:
        return None

    return match.group(3)


class HmacAuth(AuthBase):
    """
    Implements Hash-based Message Authentication Codes (HMAC). HMAC guarantees that: A) a message has been generated
    by a holder of the secret key, and B) that its contents haven't been altered since the auth code was generated.
    :param user_email the email address of the user who messages will be attributed to. Overrides the value provided by
    user_auth if both are present. At least one is required.
    :param user_auth an object that encapsulates information for the user that messages will be attributed to. Either
    user_auth or user_email is required.
    :raises ValueError if no user email address is provided.
    """

    def __init__(self, user_email=None, user_auth=None, settings_key='default'):
        if not user_email or (user_auth and user_auth.email):
            raise ValueError("At least one source of email address is required")
        self._USER_EMAIL = user_email if not None else user_auth.email
        self._SETTINGS_KEY = settings_key

    def __call__(self, request):
        """
        Overrides the empty base implementation to provide authentication for the provided request object.
        """
        sig = self.build_signature(request)
        # TODO handle None == self.ident
        header = ':'.join(('1', 'edd', self._USER_EMAIL, sig))
        request.headers['Authorization'] = header
        return request

    def build_message(self, request):
        """
        Builds a string representation of the message contained in the request so it can be digested for HMAC generation
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
        Builds a signature for the provided request message based on the secret key configured in server.cfg
        """
        key = base64.b64decode(ICE_SECRET_HMAC_KEY)
        msg = self.build_message(request)
        digest = hmac.new(key, msg=msg, digestmod=hashlib.sha1).digest()
        sig = base64.b64encode(digest).decode()
        return sig

    def sort_parameters(self, query):
        params = sorted(map(lambda p: p.split('=', 1), query.split('&')), key=lambda p: p[0])
        return '&'.join(map(lambda p: '='.join(p), params))


class IceApi(object):
    """
    Defines EDD's interface to ICE's REST API.

    TODO: extremely basic interface to ICE API; should eventually expand to cover more
    of the API, modularize (i.e. so others can just import jbei.ice), and document.

    """

    def __init__(self, user_email, base_url=ICE_URL, timeout=ICE_REQUEST_TIMEOUT):
        """
        Creates a new instance of IceApi
        :param user_email: the email address of the user who persistent ICE changes will be attributed to.
        :param base_url: the base URL of the ICE install.
        :param timeout a tuple representing the connection and read timeouts, respectively, in seconds,
        Sfor HTTP requests issued to ICE
        :return:
        """

        # chop off the trailing '/', if any, so we can write easier-to-read URL snippets in our code (starting w '%s/')
        if '/' == base_url[(len(base_url) - 1)]:
            base_url = base_url[0:len(base_url) - 1]
        self.base_url = base_url

        self.user_email = user_email
        self.timeout = timeout

    def fetch_part(self, entry_id, suppress_errors=False):
        """
        Retrieves a part using any of the unique identifiers: part number, synthetic id, or
        UUID. Returns a tuple of a dict containing ICE JSON representation of a part and the
        URL for the part; or a tuple of None and the URL if there was a non-success HTTP
        result; or None if there were errors making the request.
        """

        url = '%s/rest/parts/%s' % (self.base_url, entry_id)
        auth = HmacAuth(user_email=self.user_email)
        try:
            response = requests.get(url=url, auth=auth, timeout=self.timeout)
        except requests.exceptions.Timeout as e:
            logger.error("Timeout requesting part %s: %s", entry_id, e)
            if not suppress_errors:
                raise e
        else:
            if response.status_code == requests.codes.ok:
                return (response.json(), url,)
            if not suppress_errors:
                response.raise_for_status()

            return (None, url,)

    def search_for_part(self, query, suppress_errors=False):
        if self.user_email is None:
            raise RuntimeError('No user defined for ICE search')
        url = '%s/rest/search' % self.base_url
        auth = HmacAuth(user_email=self.user_email)
        data = {'queryString': query}
        headers = {'Content-Type': 'application/json; charset=utf8'}
        try:
            response = requests.request('POST', url,
                                        auth=auth,
                                        data=json.dumps(data),
                                        headers=headers,
                                        timeout=self.timeout
                                        )
            if response.status_code == requests.codes.ok:
                return response.json()
            elif suppress_errors:
                return None
            else:
                response.raise_for_status()
        except requests.exceptions.Timeout as e:
            logger.error("Timeout searching ICE: %s", e)
            if not suppress_errors:
                raise e

    def _create_or_update_link(self, study_name, study_url, entry_experiments_url, auth, link_id=None):
        """
            A helper method that creates or updates a single study link in ICE. Note that ICE seems to do some
            URL-based matching / link replacement even if no link ID is provided.
             :raises requests.exceptions.Timeout if the initial connection or response times out
        """
        # NOTE: this implementation works, but can probably be simplified based on how ICE actually behaves vs. what
        # the original plan was. Probably best to wait for comments and see whether SYNBIO-1196 changes (see associated
        # comments). Currently, there's no need to provide the link ID at all when adding/updating.

        json_dict = {'label': study_name, 'url': study_url}
        json_str = json.dumps(json_dict)

        if logger:
            logger.warning("Requesting part-> study link from ICE (id=%s): %s" % (str(link_id),
                                                                                  entry_experiments_url))
            logger.warning(json_str)

        headers = {'Content-Type': 'application/json'}
        if link_id:
            headers['id'] = link_id

        response = requests.request('POST', entry_experiments_url, auth=auth,
                                    data=json_str,
                                    headers=headers,
                                    timeout=self.timeout)

        if response.status_code != requests.codes.ok:
            response.raise_for_status()

    def unlink_entry_from_study(self, ice_entry_id, study_id, study_url, logger):
        """
        Contacts ICE to find and remove all the links from the specified ICE part to the specified EDD study. In
        practical use, there will probably only ever be one per part/study combination.
        :param ice_entry_id: the id of the ICE entry whose link to the study should be removed
        (either a UUID or the numeric id)
        :param study_id: the study ID to display in log messages (though the study may have been deleted).
        :param study_url: the study URL
        :param logger: the logger to log messages to
        :return true if a link to the specified study was removed from ICE, false if no such link existed
        (but no error occurred)
        :raises HTTPError if a communication error occurred or if the server responded with a status code other than
        200
        :raises requests.exceptions.Timeout if a communication timeout occurs.
        """
        logger.info('Start ' + self.unlink_entry_from_study.__name__ + "()")

        # Look up the links associated with this ICE part
        entry_experiments_rest_url = '%s/rest/parts/%s/experiments/' % (self.base_url, ice_entry_id)
        auth = HmacAuth(user_email=self.user_email)
        response = requests.request('GET', entry_experiments_rest_url, auth=auth, headers=_JSON_CONTENT_TYPE_HEADER,
                                    timeout=self.timeout)
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
            response = requests.request('DELETE', link_resource_uri, auth=auth, timeout=self.timeout)

            if response.status_code != requests.codes.ok:
                response.raise_for_status()
        return True

    def link_entry_to_study(self, ice_entry_id, study_id, study_url, study_name, logger, old_study_name=None):
        """
        Communicates with ICE to link an ICE entry to an EDD study, or if a link to this URL already exists,
        updates the labels for the all the existing ICE experiment links that uses this URL (even for entries other
        than the one specified by ice_entry_id). See comments on SYNBIO-1196.
        :param ice_entry_id: the string used to identify the strain (either the string representation of the number
        displayed in the URL, or the UUID stored in EDD's database)
        :param study_id: the unique ID of this study
        :param study_url: the URL for the EDD study to link to the ICE strain
        :param study_name: the name of the EDD study
        :param old_study_name: the previous name of the EDD study (assumption is that it was just renamed).
        If provided, all ICE links with this name and the study_url will be updated to use the new name.

        :raises HTTPError if a communication error occurred or if the server responded with a status code other than
        200
        :raises requests.exceptions.Timeout if a communication timeout occurs.
        """
        logger.info('Start ' + self.link_entry_to_study.__name__ + '()')
        # NOTE: this implementation works, but can probably be simplified based on how ICE actually behaves vs. what
        # the original plan was. Probably best to wait for comments and see whether SYNBIO-1196 changes (see associated
        # comments). Currently, there's no need to account for possibility of multiple ICE links from a single entry
        # to the same EDD study, since ICE won't support multiple links to the same URL (the latest just overwrites).

        # query ICE to get the list of existing links for this part
        entry_experiments_rest_url = '%s/rest/parts/%s/experiments/' % (self.base_url, ice_entry_id)
        logger.info(entry_experiments_rest_url)
        auth = HmacAuth(user_email=self.user_email)
        response = requests.request('GET', entry_experiments_rest_url, auth=auth,
                                    headers=_JSON_CONTENT_TYPE_HEADER, timeout=self.timeout)
        if response.status_code != requests.codes.ok:
            response.raise_for_status()

        # inspect results to find the unique ID's for any pre-existing links referencing the study's URL
        label_key = 'label'
        url_key = 'url'
        existing_links = response.json()
        current_study_links = [link for link in existing_links if
                               ((study_url == link.get(url_key)) and (study_name == link.get(label_key)))]
        outdated_study_links = []
        if old_study_name:
            outdated_study_links = [link for link in existing_links if
                                    ((study_url == link.get(url_key)) and (old_study_name == link.get(label_key)))]

        logger.debug('Existing links: ' + str(existing_links))
        logger.debug('Current study links:' + str(current_study_links))
        logger.debug('Outdated study links: ' + str(outdated_study_links))

        # if there's at least one up-to-date link to the study, and there are no outdated links to it, just return
        # without making any changes
        if current_study_links and not outdated_study_links:
            return

        # create or update study links
        if outdated_study_links:
            for outdated_link in outdated_study_links:
                self._create_or_update_link(study_name, study_url, entry_experiments_rest_url,
                                            auth=auth, link_id=outdated_link.get('id'))
        else:
            self._create_or_update_link(study_name, study_url, entry_experiments_rest_url, auth)

    def set_timeout(self, timeout):
        """
        Sets the communication timeout used for all subsequent REST API method calls to ICE
        :param timeout: a tuple of (connection timeout, read timeout) in seconds
        """
        self.timeout = timeout
