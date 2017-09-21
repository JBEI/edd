# coding: utf-8
from __future__ import absolute_import, unicode_literals

"""
Integration tests for ICE.
"""

from django.contrib.auth import get_user_model

from jbei.rest.auth import HmacAuth
from jbei.rest.clients.ice import IceApi

from . import factory, TestCase


def user_to_ice_json(user):
    # these fields are all required for ICE
    return {
        'firstName': user.first_name,
        'lastName': user.last_name,
        'initials': user.initials,
        'description': '',
        'institution': '',
        'email': user.email,
        'password': '',
    }


class IceIntegrationTests(TestCase):
    """
    Sets of tests to validate communication between EDD and ICE.
    """

    @classmethod
    def setUpClass(cls):
        super(IceIntegrationTests, cls).setUpClass()
        auth = HmacAuth('edd', 'Administrator')
        ice = IceApi(auth)
        # make sure ICE has users matching EDD users
        admin_ice_user = factory.UserFactory(email='admin@example.org')
        read_ice_user = factory.UserFactory(email='reader@example.org')
        none_ice_user = factory.UserFactory(email='none@example.org')
        user_url = 'http://ice:8080/rest/users?sendEmail=false'
        ice.session.post(user_url, json=user_to_ice_json(admin_ice_user))
        ice.session.post(user_url, json=user_to_ice_json(read_ice_user))
        ice.session.post(user_url, json=user_to_ice_json(none_ice_user))
        # set the admin account type on admin_ice_user
        response = ice.session.get('http://ice:8080/rest/users?filter=admin@example.org')
        admin_id = response.json()['users'][0]['id']
        acct = user_to_ice_json(admin_ice_user)
        acct.update(accountType='ADMIN')
        ice.session.put('http://ice:8080/rest/users/%d' % admin_id, json=acct)
        # populate ICE with some strains
        with factory.load_test_file('ice_entries.csv') as entries:
            response = ice.session.post('http://ice:8080/rest/uploads/file', files={
                'type': 'plasmid',
                'file': entries,
            })
        upload_id = response.json()['uploadInfo']['id']
        response = ice.session.put('http://ice:8080/rest/uploads/%d/status' % upload_id, json={
            'id': upload_id,
            'status': 'APPROVED',
        })
        # set read permissions on some of the created strains
        response = ice.session.get('http://ice:8080/rest/users?filter=reader@example.org')
        reader_id = response.json()['users'][0]['id']
        for part_id in range(5):
            response = ice.session.post(
                'http://ice:8080/rest/parts/%d/permissions' % part_id,
                json={
                    'article': 'ACCOUNT',
                    'articleId': reader_id,
                    'type': 'READ_ENTRY',
                    'typeId': part_id,
                })

    @classmethod
    def setUpTestData(cls):
        User = get_user_model()
        cls.admin_ice_user = User.objects.get(email='admin@example.org')
        cls.read_ice_user = User.objects.get(email='reader@example.org')
        cls.none_ice_user = User.objects.get(email='none@example.org')

    def test_read_parts(self):
        admin_auth = HmacAuth('edd', self.admin_ice_user.email)
        reader_auth = HmacAuth('edd', self.read_ice_user.email)
        none_auth = HmacAuth('edd', self.none_ice_user.email)
        # verify that admin user finds all parts
        ice = IceApi(admin_auth)
        admin_search = ice.search('')
        self.assertEqual(len(admin_search), 10)
        # verify that reader user finds the five parts with permissions set
        ice = IceApi(reader_auth)
        reader_search = ice.search('')
        self.assertEqual(len(reader_search), 5)
        # verify that user with no permissions finds no parts
        ice = IceApi(none_auth)
        none_search = ice.search('')
        self.assertEqual(len(none_search), 0)
