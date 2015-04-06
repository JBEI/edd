from django.conf import settings
from requests.auth import AuthBase
from requests.compat import urlparse
import base64
import hashlib
import hmac
import json
import requests


class HmacAuth(AuthBase):
    edd_key = 'yJwU0chpercYs/R4YmCUxhbRZBHM4WqpO3ZH0ZW6+4X+/aTodSGTI2w5jeBxWgJXNN1JNQIg02Ic3ZnZtSEVYA=='

    def __init__(self, ident=None, settings_key='default'):
        self.ident = ident
        self.settings_key = settings_key

    def __call__(self, request):
        key = base64.b64decode(self.edd_key)
        msg = self.build_message(request)
        digest = hmac.new(key, msg=msg, digestmod=hashlib.sha1).digest()
        sig = base64.b64encode(digest).decode()
        header = ':'.join(('1', 'edd', self.ident.username, sig))
        request.headers['Authorization'] = header
        return request

    def build_message(self, request):
        url = urlparse(request.url)
        msg = '\n'.join((self.ident.username, \
                         request.method, \
                         url.hostname, \
                         url.path, \
                         self.sort_parameters(url.query), \
                         request.body))
        return msg

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
            self.url = 'http://registry-test.jbei.org/'

    def search_for_part(self, query):
        if self.ident is None:
            raise RuntimeError('No user defined for ICE search')
        url = self.url + '/rest/search'
        auth = HmacAuth(ident=self.ident)
        data = { 'queryString': query }
        response = requests.post(url, json=data, auth=auth)
        if response.status_code == requests.codes.ok:
            return response.json()
        else:
            raise Exception('Searching ICE failed')
