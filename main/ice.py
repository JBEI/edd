# -*- coding: utf-8 -*-
from __future__ import unicode_literals

import base64
import hashlib
import hmac
import json
import logging
import requests

from django.core.urlresolvers import reverse
from edd.settings import config
from requests.auth import AuthBase
from requests.compat import urlparse


logger = logging.getLogger(__name__)
timeout = (10, 10)  # tuple for request connection and read timeouts, respectively, in seconds


class HmacAuth(AuthBase):
    # TODO regenerate key. Value currently in server.cfg has been promoted to Git.
    # TODO: also replace the value in server.cfg.example with a placeholder
    edd_key = config['ice'].get('edd_key', '')

    def __init__(self, ident=None, settings_key='default'):
        self.ident = ident
        self.settings_key = settings_key

    def __call__(self, request):
        sig = self.build_signature(request)
        # TODO handle None == self.ident
        header = ':'.join(('1', 'edd', self.ident.email, sig))
        request.headers['Authorization'] = header
        return request

    def build_message(self, request):
        url = urlparse(request.url)
        # TODO handle None == self.ident
        msg = '\n'.join((self.ident.email,
                         request.method,
                         url.netloc,
                         url.path,
                         self.sort_parameters(url.query),
                         request.body or ''))
        return msg

    def build_signature(self, request):
        key = base64.b64decode(self.edd_key)
        msg = self.build_message(request)
        digest = hmac.new(key, msg=msg, digestmod=hashlib.sha1).digest()
        sig = base64.b64encode(digest).decode()
        return sig

    def sort_parameters(self, query):
        params = sorted(map(lambda p: p.split('=', 1), query.split('&')), key=lambda p: p[0])
        return '&'.join(map(lambda p: '='.join(p), params))


class IceApi(object):
    """ TODO: extremely basic interface to ICE API; should eventually expand to cover more
        of the API, modularize (i.e. so others can just import jbei.ice), and document. """

    def __init__(self, ident=None, url=None, settings_key='default'):
        self.ident = ident
        if url is not None:
            self.url = url
        else:
            self.url = 'https://registry-test.jbei.org/'

    def fetch_part(self, record_id, raise_error=False):
        """ Retrieves a part using any of the unique identifiers: part number, synthetic id, or
            GUID. Returns a tuple of a dict containing ICE JSON representation of a part and the
            URL for the part; or a tuple of None and the URL if there was a non-success HTTP
            result; or None if there were errors making the request. """
        url = '%srest/parts/%s' % (self.url, record_id)
        auth = HmacAuth(ident=self.ident)
        try:
            response = requests.get(url=url, auth=auth, timeout=timeout)
        except requests.exceptions.Timeout as e:
            logger.error("Timeout requesting part %s: %s", record_id, e)
            if raise_error:
                raise e
        else:
            if response.status_code == requests.codes.ok:
                return (response.json(), url, )
            return (None, url, )
        return None

    def link_study_to_part(self, study, strain, raise_error=False):
        url = '%srest/parts/%s/experiments' % (self.url, strain.registry_id)
        auth = HmacAuth(ident=self.ident)
        try:
            response = requests.get(url=url, auth=auth, timeout=timeout)
        except requests.exceptions.Timeout as e:
            logger.error("Timeout requesting part %s experiments: %s", strain.registry_id, e)
            if raise_error:
                raise e
        else:
            study_url = reverse('main:detail', kwargs={'pk': study.pk})
            data = {
                'url': study_url,
                'label': study.name,
                'created': study.created().mod_time,
                }
            found = (response.status_code == requests.codes.ok and
                     any(map(lambda exp: exp.get('url', None) == study_url, response.json())))
            if not found:
                try:
                    requests.post(
                        url=url, auth=auth, data=json.dumps(data), timeout=timeout,
                        headers={'Content-Type': 'application/json; charset=utf8'},
                        )
                except requests.exceptions.Timeout as e:
                    logger.error("Timeout posting study to part: %s", e)
                    if raise_error:
                        raise e

    def search_for_part(self, query, raise_error=False):
        if self.ident is None:
            raise RuntimeError('No user defined for ICE search')
        url = '%srest/search' % self.url
        auth = HmacAuth(ident=self.ident)
        data = {'queryString': query}
        headers = {'Content-Type': 'application/json; charset=utf8'}
        try:
            response = requests.post(
                url=url, auth=auth, data=json.dumps(data), headers=headers, timeout=timeout)
            if response.status_code == requests.codes.ok:
                return response.json()
            elif raise_error:
                raise Exception('Searching ICE failed')
            else:
                return None
        except requests.exceptions.Timeout as e:
            logger.error("Timeout searching ICE: %s", e)
            if raise_error:
                raise e
