"""
Unit tests for EDD's REST API.

Tests in this module operate directly on the REST API itself, on and its HTTP responses, and
purposefully don't use Python API client code in jbei.rest.clients.edd.api. This focus on unit
testing of REST API resources enables finer-grained checks, e.g. for permissions /
security and for HTTP return codes that should verified independently of any specific client.

Note that tests here purposefully hard-code simple object serialization that's also coded
seperately in EDD's REST API.  This should help to detect when REST API code changes in EDD
accidentally affect client code.
"""

import logging

from django.contrib.auth import get_user_model
from django.contrib.auth.models import Permission
from django.contrib.contenttypes.models import ContentType
from django.test import Client
from rest_framework import status
from rest_framework.reverse import reverse
from rest_framework.test import APITestCase
from threadlocals.threadlocals import set_thread_variable

from main import models

logger = logging.getLogger(__name__)


def load_permissions(model, *codenames):
    ct = ContentType.objects.get_for_model(model)
    return list(Permission.objects.filter(content_type=ct, codename__in=codenames))


class EddApiTestCaseMixin(object):
    """
    Provides helper methods that improve test error messages and simplify repetitive test code.
    Helper methods also enforce consistency in return codes across EDD's REST API.
    """
    @classmethod
    def setUpClass(cls):
        """
        Overrides the default Django TestCase to clear out the threadlocal request variable during
        class setUp and tearDown.
        """
        super(EddApiTestCaseMixin, cls).setUpClass()
        set_thread_variable('request', None)

    @classmethod
    def tearDownClass(cls):
        """
        Overrides the default Django TestCase to clear out the threadlocal request variable during
        class setUp and tearDown.
        """
        super(EddApiTestCaseMixin, cls).tearDownClass()
        set_thread_variable('request', None)

    def setUp(self):
        """
        Overrides the default Django TestCase to clear out the threadlocal request variable during
        test setUp and tearDown.
        """
        super(EddApiTestCaseMixin, self).setUp()
        set_thread_variable('request', None)

    def tearDown(self):
        """
        Overrides the default Django TestCase to clear out the threadlocal request variable during
        test setUp and tearDown.
        """
        super(EddApiTestCaseMixin, self).tearDown()
        set_thread_variable('request', None)

    def __init__(self, *args, **kwargs):
        super(EddApiTestCaseMixin, self).__init__(*args, **kwargs)
        self.unauthenticated_client = Client()

    def _check_status(self, response, expected_code):
        self.assertEqual(
            response.status_code,
            expected_code,
            'Wrong response status code (%(code)s instead of %(expected)s) %(method)s %(url)s '
            'for user %(user)s. Response: %(response)s' % {
                'code': response.status_code,
                'expected': expected_code,
                'method': response.wsgi_request.method,
                'response': response.content,
                'url': response.wsgi_request.path,
                'user': response.wsgi_request.user,
            }
        )
        return response


# TODO: consider merging with / leveraging newer StudyInternalsTestMixin
class StudiesTests(EddApiTestCaseMixin, APITestCase):
    """
    Tests access controls and HTTP return codes for queries to the base /rest/studies REST API
    resource (not any nested resources).

    Studies should only be accessible by:
    1) Superusers
    2) Users who have explicit class-level mutator permissions on Studies via a django.contrib.auth
       permission. Any user with a class-level mutator permission has implied read permission on
       the basic study name/description, though not necessarily on the contained lines/assays
       or data.
    3) Users who have explicit StudyPermission granted via their individual account or via user
    group membership.

    Note that these permissions are enforced by a combination of EDD's custom
    ImpliedPermissions class and StudyViewSet's get_queryset() method,
    whose non-empty result implies that the requesting user has access to the returned strains.
    """

    fixtures = ['edd/rest/rest_basic_data']

    @classmethod
    def setUpTestData(cls):
        super(StudiesTests, cls).setUpTestData()
        User = get_user_model()
        cls.study = models.Study.objects.get(pk=23)  # "Group read study"
        cls.superuser = User.objects.get(username='superuser')
        cls.staffuser = User.objects.get(username='staff.user')
        # not doing this in fixture because it requires knowing the IDs, which can vary per deploy
        cls.staffuser.user_permissions.add(
            *load_permissions(models.Study, 'add_study', 'change_study', 'delete_study')
        )
        cls.unprivileged_user = User.objects.get(username='unprivileged_user')
        cls.readonly_user = User.objects.get(username='study.reader.user')
        cls.write_user = User.objects.get(username='study.writer.user')
        cls.write_group_user = User.objects.get(username='study.writer.group.user')

    def test_study_delete(self):
        """
        Check that study deletion is not allowed via the API.
        """
        url = reverse('rest:studies-detail', args=[self.study.pk])

        # No user
        self.client.logout()
        self._check_status(self.client.delete(url), status.HTTP_403_FORBIDDEN)

        # Unprivileged user
        self.client.force_login(self.unprivileged_user)
        self._check_status(self.client.delete(url), status.HTTP_405_METHOD_NOT_ALLOWED)

        # Staff user
        self.client.force_login(self.staffuser)
        self._check_status(self.client.delete(url), status.HTTP_405_METHOD_NOT_ALLOWED)

        # Superuser
        self.client.force_login(self.superuser)
        self._check_status(self.client.delete(url), status.HTTP_405_METHOD_NOT_ALLOWED)

    def test_study_add(self):
        """
        Check that study creation follows the setting of EDD_ONLY_SUPERUSER_CREATE.
        """
        url = reverse('rest:studies-list')
        post_data = {
            'name': 'new study 1',
            'description': 'description goes here',
            'contact_id': self.write_user.pk,
        }

        # verify that an un-authenticated request gets a 403
        self.client.logout()
        self._check_status(self.client.post(url, post_data), status.HTTP_403_FORBIDDEN)

        with self.settings(EDD_ONLY_SUPERUSER_CREATE=False):
            # with normal settings, verify all users can create studies, regardless of privileges
            self.client.force_login(self.unprivileged_user)
            self._check_status(self.client.post(url, post_data), status.HTTP_201_CREATED)

        with self.settings(EDD_ONLY_SUPERUSER_CREATE=True):
            self.client.force_login(self.unprivileged_user)
            self._check_status(self.client.post(url, post_data), status.HTTP_403_FORBIDDEN)

            # staff with main.add_study cannot create with this setting
            self.client.force_login(self.staffuser)
            self._check_status(self.client.post(url, post_data), status.HTTP_403_FORBIDDEN)

            # verify that an administrator can create a study
            self.client.force_login(self.superuser)
            self._check_status(self.client.post(url, post_data), status.HTTP_201_CREATED)

        with self.settings(EDD_ONLY_SUPERUSER_CREATE='permission'):
            self.client.force_login(self.unprivileged_user)
            self._check_status(self.client.post(url, post_data), status.HTTP_403_FORBIDDEN)

            # staff with main.add_study can create with this setting
            self.client.force_login(self.staffuser)
            self._check_status(self.client.post(url, post_data), status.HTTP_201_CREATED)

            # verify that an administrator can create a study
            self.client.force_login(self.superuser)
            self._check_status(self.client.post(url, post_data), status.HTTP_201_CREATED)

    def test_study_change(self):
        url = reverse('rest:studies-detail', args=[self.study.pk])
        # define placeholder put data that shouldn't get applied
        put_data = {
            'name': 'Test study',
            'description': 'Description goes here',
        }

        # verify that an un-authenticated request gets a 404
        self.client.logout()
        self._check_status(self.client.put(url, put_data), status.HTTP_403_FORBIDDEN)
        # verify that unprivileged user can't update someone else's study
        self.client.force_login(self.unprivileged_user)
        self._check_status(self.client.put(url, put_data), status.HTTP_404_NOT_FOUND)
        # test that a user with read privileges can't change the study
        self.client.force_login(self.readonly_user)
        self._check_status(self.client.put(url, put_data), status.HTTP_404_NOT_FOUND)

        put_data = {
            'name': 'Updated study name',
            'description': 'Updated study description',
            'contact_id': self.write_user.pk,
        }
        url = reverse('rest:studies-detail', args=[22])  # group write study
        self.client.force_login(self.write_group_user)
        self._check_status(self.client.put(url, put_data), status.HTTP_200_OK)
        # verify that staff permission alone isn't enough to update a study
        self.client.force_login(self.staffuser)
        self._check_status(self.client.put(url, put_data), status.HTTP_404_NOT_FOUND)
        # verify that an administrator can update
        self.client.force_login(self.superuser)
        self._check_status(self.client.put(url, put_data), status.HTTP_200_OK)

    def test_study_list_read_access(self):
        """
        Tests GET /rest/studies/
        """
        url = reverse('rest:studies-list')
        self.client.logout()
        self._check_status(self.client.get(url), status.HTTP_403_FORBIDDEN)
        self.client.force_login(self.unprivileged_user)
        self._check_status(self.client.get(url), status.HTTP_200_OK)


class LinesTests(EddApiTestCaseMixin, APITestCase):
    """
    Tests access controls and HTTP return codes for GET requests to
    /rest/studies/{X}/lines/ (list)
    /rest/lines/{X} (list + detail view)
    """

    fixtures = ['edd/rest/rest_basic_data']

    @classmethod
    def setUpTestData(cls):
        """
        Creates strains, users, and study/line combinations to test the REST resource's application
        of user permissions.
        """
        super(LinesTests, cls).setUpTestData()


class AssaysTests(EddApiTestCaseMixin, APITestCase):
    """
    Tests access controls, HTTP return codes, and content for GET requests to
    /rest/studies/{X}/assays/ (list) and
    /rest/assays/{X}/ (list + detail view)
    """

    fixtures = ['edd/rest/rest_basic_data']

    @classmethod
    def setUpTestData(cls):
        super(AssaysTests, cls).setUpTestData()


class MeasurementsTests(EddApiTestCaseMixin, APITestCase):
    """
    Tests access controls, HTTP return codes, and content for GET requests to
    /rest/studies/{X}/measurements/ (list) and
    /rest/measurements/{X}/ (list + detail view)
    """

    fixtures = ['edd/rest/rest_basic_data']

    @classmethod
    def setUpTestData(cls):
        super(MeasurementsTests, cls).setUpTestData()


class MeasurementValuesTests(EddApiTestCaseMixin, APITestCase):
    """
    Tests access controls, HTTP return codes, and content for GET requests to
    /rest/studies/{X}/values/ (list) and
    /rest/values/{X}/ (list + detail view)
    """

    fixtures = ['edd/rest/rest_basic_data']

    @classmethod
    def setUpTestData(cls):
        super(MeasurementValuesTests, cls).setUpTestData()


class EddObjectSearchTest(EddApiTestCaseMixin, APITestCase):
    """
    Tests search options for EDDObjects using /rest/lines/.  This test is an initial
    proof-of-concept/risk mitigation for related search options, and included tests should
    eventually be run individually on each EddObject API endpoint.
    """

    fixtures = ['edd/rest/rest_basic_data']

    @classmethod
    def setUpTestData(cls):
        super(EddObjectSearchTest, cls).setUpTestData()
        User = get_user_model()
        cls.superuser = User.objects.get(username='superuser')

    def test_edd_object_attr_search(self):
        """
        Tests GET /rest/search/ for metadata-based searching. Note that these searches
        are implemented nearly identically for every EddObject, so we can use
        this test as a verification that metadata searches work for all EddObject-based
        rest resources.  Ideally we'd test each separately, but having one test for
        starters is much more time efficient and eliminates most of the risk.
        """
        url = reverse('rest:lines-list')

        # test that the default search filter returns only active lines.
        # Note: we'll use the superuser account for all of these tests since it needs fewer
        # queries.  There's a separate method to test permissions enforcement.
        self.client.force_login(self.superuser)
        self._check_status(self.client.get(url), status.HTTP_200_OK)

    def test_edd_object_metadata_search(self):
        """
        Test metadata lookups supported in Django 1.11's HStoreField.  Note that examples
        here correspond to and are ordered according to examples in the Django HStoreField
        documentation.
        https://docs.djangoproject.com/en/1.11/ref/contrib/postgres/fields/#querying-hstorefield
        """
        pass


class EddObjectTimestampSearchTest(EddApiTestCaseMixin, APITestCase):
    """
    A test class class that using a fixture instead of code to build test data for searching
    EDDObject timestamps.
    """
    # Note: use a fixture to set explicit line timestamps assumed in this test.
    fixtures = ['edd/rest/rest_timestamp_search']

    def test_eddobject_timestamp_search(self):
        # url = reverse('rest:lines-list')
        pass
