import base64
import hashlib
import hmac
import json
import requests
import os

from django.conf import settings
from django.core.urlresolvers import reverse
from edd.settings import config
from requests.auth import AuthBase
from requests.compat import urlparse


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
    """
    """
    def __init__(self, ident=None, url=None, settings_key='default'):
        self.ident = ident
        if url is not None:
            self.url = url
        else:
            self.url = 'https://registry-test.jbei.org/'

    def fetch_part(self, record_id):
        url = self.url + 'rest/parts/' + record_id
        auth = HmacAuth(ident=self.ident)
        response = requests.request('GET', url, auth=auth)
        if response.status_code == requests.codes.ok:
            return (response.json(), url, )
        return None

    def link_study_to_part(self, study, strain):
        url = self.url + 'rest/parts/' + strain.registry_id + '/experiments'
        auth = HmacAuth(ident=self.ident)
        response = requests.request('GET', url, auth=auth)
        study_url = reverse('main:detail', kwargs={'pk':study.pk})
        data = { 'url': study_url, 'label': study.name, 'created': study.created().mod_time }
        found = False
        if response.status_code == requests.codes.ok:
            for exp in response.json():
                if exp.url == study_url:
                    found = True
        if not found:
            requests.request('POST', url, auth=auth,
                             data=json.dumps(data),
                             headers={ 'Content-Type': 'application/json; charset=utf8' },
                             )

    def search_for_part(self, query):
        if self.ident is None:
            raise RuntimeError('No user defined for ICE search')
        url = self.url + 'rest/search'
        auth = HmacAuth(ident=self.ident)
        data = { 'queryString': query }
        headers = { 'Content-Type': 'application/json; charset=utf8' }
        response = requests.request('POST', url,
                                    auth=auth,
                                    data=json.dumps(data),
                                    headers=headers,
                                    )
        if response.status_code == requests.codes.ok:
            return response.json()
        else:
            raise Exception('Searching ICE failed')
