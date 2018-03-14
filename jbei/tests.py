# -*- coding: utf-8 -*-

from django.test import TestCase

from .rest.auth import HmacAuth


KEY = 'yJwU0chpercYs/R4YmCUxhbRZBHM4WqpO3ZH0ZW6+4X+/aTodSGTI2w5jeBxWgJXNN1JNQIg02Ic3ZnZtSEVYA=='


class FakeRequest(object):
    pass


class HmacTests(TestCase):
    KEY_ID = 'test.jbei.org'
    USER_ID = 'WCMorrell'

    def setUp(self):
        super(HmacTests, self).setUp()
        HmacAuth.register_key(self.KEY_ID, KEY)

    def test_signature_gen(self):
        request = FakeRequest()
        request.url = 'http://registry-test.jbei.org/rest/accesstoken'
        request.method = 'GET'
        request.headers = {}
        request.body = None
        auth = HmacAuth(self.KEY_ID, self.USER_ID)
        self.assertEqual(
            auth(request).headers['Authorization'],
            ':'.join(('1', self.KEY_ID, self.USER_ID, 'j7iHK4iYiELZlEtDWD8GJm04CWc='))
        )
