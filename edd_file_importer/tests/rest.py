# coding: utf-8

import json
from django.urls import reverse
from requests import codes
from rest_framework.test import APITestCase

from . import factory
from main.tests import factory as main_factory


class ImportTests(APITestCase):
    """
    Sets of tests to exercise the Experiment Description view.
    """
    fixtures = ['basic']

    @classmethod
    def setUpTestData(cls):
        super(ImportTests, cls).setUpTestData()
        cls.user = main_factory.UserFactory()

    def setUp(self):
        super(ImportTests, self).setUp()
        self.client.force_login(self.user)

    def test_categories(self):
        url = reverse('edd.rest:import_categories-list')
        response = self.client.get(url,
                                   data={'ordering': 'display_order'})
        self.assertEqual(response.status_code, codes.ok)
        with factory.load_test_file('import_categories.json') as file:
            self.assertEqual(json.loads(file.read()), json.loads(response.content))
