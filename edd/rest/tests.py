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
from __future__ import unicode_literals

import collections
import json
import logging

from builtins import str
from datetime import timedelta
from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group, Permission
from rest_framework import status
from rest_framework.test import APITestCase
from six import string_types
from threadlocals.threadlocals import set_thread_variable
from time import sleep
from uuid import UUID, uuid4

from edd.rest.views import (_KEY_LOOKUP_PATTERN, _NON_KEY_LOOKUP_PATTERN)
from jbei.rest.clients.edd.constants import (ACTIVE_STATUS_PARAM, ASSAYS_RESOURCE_NAME,
                                             CASE_SENSITIVE_PARAM, CREATED_AFTER_PARAM,
                                             CREATED_BEFORE_PARAM, DESCRIPTION_REGEX_PARAM,
                                             LINES_RESOURCE_NAME, MEASUREMENTS_RESOURCE_NAME,
                                             NAME_REGEX_PARAM, NEXT_PAGE_KEY,
                                             PREVIOUS_PAGE_KEY, QUERY_ACTIVE_OBJECTS_ONLY,
                                             QUERY_ANY_ACTIVE_STATUS,
                                             QUERY_INACTIVE_OBJECTS_ONLY, RESULTS_KEY,
                                             RESULT_COUNT_KEY, STRAINS_RESOURCE_NAME,
                                             STRAIN_DESCRIPTION_KEY, STRAIN_NAME_KEY,
                                             STRAIN_REG_ID_KEY, STRAIN_REG_URL_KEY,
                                             STUDIES_RESOURCE_NAME, STUDY_CONTACT_KEY,
                                             STUDY_DESCRIPTION_KEY, STUDY_NAME_KEY,
                                             UPDATED_AFTER_PARAM, UPDATED_BEFORE_PARAM, UUID_KEY,
                                             VALUES_RESOURCE_NAME)
from main.models import (
    Line,
    Measurement,
    MeasurementUnit,
    Metabolite,
    MetadataType,
    ProteinIdentifier,
    Protocol,
    Strain,
    StudyPermission,
)
from main.tests import factory

logger = logging.getLogger(__name__)

_EXTRACELLULAR = Measurement.Compartment.EXTRACELLULAR
_INTRACELLULAR = Measurement.Compartment.INTRACELLULAR
_SCALAR = Measurement.Format.SCALAR
_VECTOR = Measurement.Format.VECTOR

# See
# http://www.django-rest-framework.org/api-guide/authentication/#unauthorized-and-forbidden-responses
DRF_UNAUTHENTICATED_PERMISSION_DENIED_CODES = (
    status.HTTP_403_FORBIDDEN,
    status.HTTP_401_UNAUTHORIZED,
)

# status code always returned by Django REST Framework when a successfully
# authenticated request is denied permission to a resource.
# See http://www.django-rest-framework.org/api-guide/authentication/#unauthorized-and-forbidden
# -responses
DRF_AUTHENTICATED_BUT_DENIED = status.HTTP_403_FORBIDDEN

STRAINS_RESOURCE_URL = '/rest/%(resource)s' % {'resource': STRAINS_RESOURCE_NAME}
STUDIES_RESOURCE_URI = '/rest/%(resource)s' % {'resource': STUDIES_RESOURCE_NAME}
LINES_RESOURCE_URI = '/rest/lines'

_UNPRIVILEGED_USERNAME = 'unprivileged_user'
_ADMIN_USERNAME = 'admin.user'
_STAFF_USERNAME = 'staff.user'

# Note: some uses have an iterable of expected statuses...hence string format
_WRONG_STATUS_MSG = ('Wrong response status code from %(method)s %(url)s for user %(user)s. '
                     'Expected %(expected)s status but got %(observed)d')


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

    @property
    def values_converter(self):
        """
        Returns a function that converts ORM model objects into dictionaries that can easily be
        compared against JSON results of REST API calls performed during the test.
        """
        # raise an error -- this required property must be overridden by descendants
        raise NotImplementedError()

    def _assert_unauthenticated_put_denied(self, url, put_data):
        self.client.logout()
        response = self.client.put(url, put_data)
        self.assertTrue(response.status_code in DRF_UNAUTHENTICATED_PERMISSION_DENIED_CODES)

    def _assert_unauthenticated_get_denied(self, uri):
        self.client.logout()
        response = self.client.get(uri)
        self.assertTrue(response.status_code == status.HTTP_403_FORBIDDEN,
                        'Expected unauthenticated request to GET %(uri)s be denied (HTTP '
                        '%(expected)s), but got an HTTP %(code)d.  Response: %(response)s' % {
                            'uri': uri,
                            'expected': (', '.join([str(code) for code in
                                                   DRF_UNAUTHENTICATED_PERMISSION_DENIED_CODES])),
                            'code': response.status_code,
                            'response': response.content, })

    def _assert_unauthenticated_client_error(self, url):
        self.client.logout()
        response = self.client.get(url)
        expected_status = status.HTTP_400_BAD_REQUEST
        self.assertEquals(response.status_code, expected_status,
                          'Expected an "unauthenticated client error" (HTTP %(exp_code)s) for '
                          '%(uri)s, but got an HTTP %(code)d.  '
                          'Response: %(response)s' % {
                              'uri': url,
                              'exp_code': expected_status,
                              'code': response.status_code,
                              'response': response.content, })

    def _assert_unauthenticated_delete_denied(self, url):
        self.client.logout()
        response = self.client.delete(url)
        self.assertTrue(response.status_code in DRF_UNAUTHENTICATED_PERMISSION_DENIED_CODES)

    def _assert_unauthenticated_post_denied(self, url, post_data):
        self.client.logout()
        response = self.client.post(url, post_data, format='json')
        self.assertTrue(response.status_code in DRF_UNAUTHENTICATED_PERMISSION_DENIED_CODES,
                        (_WRONG_STATUS_MSG + 'response was %(response)s') % {
                            'method':   'POST', 'url': url,
                            'user':     'unauthenticated',
                            'expected': str(DRF_UNAUTHENTICATED_PERMISSION_DENIED_CODES),
                            'observed': response.status_code,
                            'response': str(response)})

    def _assert_authenticated_post_denied(self, url, user, post_data):
        self._do_post(url, user, post_data, status.HTTP_403_FORBIDDEN)

    def _assert_authenticated_put_denied(self, url, user, put_data):
        self._do_put(url, user, put_data, status.HTTP_403_FORBIDDEN)

    def _assert_authenticated_post_allowed(self, url, user, post_data,
                                           required_response=None,
                                           partial_response=False):
        return self._do_post(url, user, post_data, status.HTTP_201_CREATED,
                             expected_values=required_response,
                             partial_response=partial_response)

    def _assert_authenticated_search_allowed(self, url, user,
                                             expected_values=None,
                                             partial_response=False,
                                             request_params=None):
        return self._do_get(url, user, status.HTTP_200_OK,
                            expected_values=expected_values,
                            partial_response=partial_response,
                            request_params=request_params)

    def _assert_authenticated_put_allowed(self, url, user, put_data,
                                          expected_values=None, partial_response=False):
        self._do_put(url, user, put_data, status.HTTP_200_OK,
                     expected_values=expected_values,
                     partial_response=partial_response)

    def _assert_authenticated_post_conflict(self, url, user, post_data):
        self._do_post(url, user, post_data, status.HTTP_400_BAD_REQUEST)

    def _do_post(self, url, user, post_data, expected_status, expected_values=None,
                 partial_response=False, request_params=None):

        self.client.force_login(user)

        response = self.client.post(url, post_data, format='json')
        self.client.logout()

        self._compare_expected_values(url, 'POST', user, response, expected_status,
                                      expected_values=expected_values,
                                      partial_response=partial_response)

        return response

    def _do_put(self, url, user, put_data, expected_status, expected_values=None,
                partial_response=False):
        self.client.force_login(user)
        response = self.client.put(url, put_data, format='json')
        self.client.logout()

        return self._compare_expected_values(url, 'PUT', user, response, expected_status,
                                             expected_values=expected_values,
                                             partial_response=partial_response)

    def _assert_authenticated_get_denied(self, url, user):
        self.client.force_login(user)
        response = self.client.get(url)
        expected_status = status.HTTP_404_NOT_FOUND

        self.assertEquals(expected_status,
                          response.status_code,
                          (_WRONG_STATUS_MSG + '. Response: %(result)s') % {
                              'method': 'GET',
                              'url': url,
                              'user': user.username,
                              'expected': expected_status,
                              'observed': response.status_code,
                              'result': response.content})
        self.client.logout()

    def _assert_authenticated_get_allowed(self, url, user, expected_values=None,
                                          request_params=None, partial_response=False):
        self._do_get(url, user, status.HTTP_200_OK,
                     expected_values=expected_values,
                     partial_response=partial_response,
                     request_params=request_params)

    def _do_get(self, url, user, expected_status, expected_values=None,
                partial_response=False, request_params=None):
        self.client.force_login(user)
        response = self.client.get(url, data=request_params)
        self._compare_expected_values(url, 'GET', user, response, expected_status,
                                      expected_values=expected_values,
                                      partial_response=partial_response)
        self.client.logout()
        return response

    def _compare_expected_values(self, url, method, user, response, expected_status,
                                 expected_values=None, partial_response=False):
        # compare expected return code
        self.assertEquals(
                expected_status, response.status_code,
                (_WRONG_STATUS_MSG + '. Response body was %(response)s') % {
                    'method':   method,
                    'url': url,
                    'user': user.username,
                    'expected': expected_status,
                    'observed': response.status_code,
                    'response': response.content, })
        observed = json.loads(response.content)

        # compare expected response content, if provided
        if expected_values is not None:
            expected, is_paged = to_json_comparable(expected_values, self.values_converter)

            if is_paged:
                compare_paged_result_dict(self, expected, observed, order_agnostic=True,
                                          partial_response=partial_response)
            else:
                if not partial_response:
                    self.assertEqual(expected, observed,
                                     "Query contents didn't match expected values.\n\n"
                                     "Expected: %(expected)s\n\n"
                                     "Observed:%(observed)s" % {
                                         'expected': expected, 'observed': observed,
                                     })
                else:
                    _compare_partial_value(self, expected, observed)

        return observed

    def _do_delete(self, url, user, expected_status):
        self.client.force_login(user)
        response = self.client.delete(url)
        self.assertEquals(expected_status, response.status_code, _WRONG_STATUS_MSG % {
            'method':   'GET',
            'url': url,
            'user': user.username,
            'expected': expected_status,
            'observed': response.status_code
        })
        self.client.logout()

    def _assert_authenticated_get_not_found(self, url, user):
        self.client.force_login(user)
        response = self.client.get(url)
        required_result_status = status.HTTP_404_NOT_FOUND
        self.assertEquals(required_result_status, response.status_code, _WRONG_STATUS_MSG
                          % {
                              'method': 'GET',
                              'url': url,
                              'user': user.username,
                              'expected': required_result_status,
                              'observed': response.status_code})

    def _assert_authenticated_get_client_error(self, url, user):
        self.client.force_login(user)
        response = self.client.get(url)
        required_result_status = status.HTTP_400_BAD_REQUEST
        self.assertEquals(required_result_status, response.status_code, _WRONG_STATUS_MSG
                          % {
                              'method': 'GET',
                              'url': url,
                              'user': user.username,
                              'expected': required_result_status,
                              'observed': response.status_code})

    def _assert_authenticated_get_empty_result(self, url, user):
        self.client.force_login(user)
        response = self.client.get(url)
        required_result_status = status.HTTP_200_OK
        self.assertEquals(required_result_status, response.status_code, _WRONG_STATUS_MSG % {
                                'method':   'GET',
                                'url': url,
                                'user': user.username,
                                'expected': required_result_status,
                                'observed': response.status_code})

        self.assertFalse(
            bool(response.content),
            'GET %(url)s. Expected an empty list, but got "%(response)s"' % {
                'url': url,
                'response': response.content
            }
        )

    def _assert_authenticated_get_empty_paged_result(self, url, user, request_params=None):
        self.client.force_login(user)
        response = self.client.get(url, data=request_params)
        required_result_status = status.HTTP_200_OK
        self.assertEquals(required_result_status, response.status_code, _WRONG_STATUS_MSG % {
                                'method':   'GET',
                                'url': url,
                                'user': user.username,
                                'expected': required_result_status,
                                'observed': response.status_code})

        content_dict = json.loads(response.content)
        self.assertFalse(bool(content_dict['results']), 'Expected zero result, but got %d' %
                         len(content_dict['results']))
        self.assertEquals(0, content_dict['count'])
        self.assertEquals(None, content_dict['previous'])
        self.assertEquals(None, content_dict['next'])

    @classmethod
    def create_study(cls, create_auth_perms_and_users=False):
        """
        Factory method that creates a test study and test users with all available individual,
        class-level, and group-level permissions on the study (except everyone permissions,
        which would supercede several of the others).
        """
        _STUDY_READER_USERNAME = 'study.reader.user'
        _STUDY_READER_GROUP_USER = 'study.reader.group.user'
        _STUDY_WRITER_GROUP_USER = 'study.writer.group.user'
        _STUDY_WRITER_USERNAME = 'study.writer.user'

        # unprivileged user
        cls.unprivileged_user = factory.UserFactory(username=_UNPRIVILEGED_USERNAME)

        # superuser w/ no extra privileges
        cls.superuser = _create_user(username=_ADMIN_USERNAME, email='admin@localhost',
                                     is_superuser=True)

        # user with read only access to this study
        cls.study_read_only_user = factory.UserFactory(
            username=_STUDY_READER_USERNAME,
            email='study_read_only@localhost',
        )

        # user with write only access to this study
        cls.study_write_only_user = factory.UserFactory(
            username=_STUDY_WRITER_USERNAME,
            email='study.writer@localhost',
        )

        # user with read only access to the study via group membership
        cls.study_read_group_user = factory.UserFactory(
            username=_STUDY_READER_GROUP_USER,
            email='study.group_reader@localhost',
        )

        # user with write only access to the study via group membership
        cls.study_write_group_user = factory.UserFactory(
            username=_STUDY_WRITER_GROUP_USER,
            email='study.group_writer@localhost',
        )

        # user with access to the study via the default read permission
        cls.study_default_read_group_user = factory.UserFactory(
            username='Default read group user',
            email='study.default_read_group.user',
        )

        # create groups for testing group-level user permissions
        study_read_group = Group.objects.create(name='study_read_only_group')
        study_read_group.user_set.add(cls.study_read_group_user)
        study_read_group.save()

        study_write_group = Group.objects.create(name='study_write_only_group')
        study_write_group.user_set.add(cls.study_write_group_user)
        study_write_group.save()

        cls.study_default_read_group = Group.objects.create(name='study_default_read_group')
        cls.study_default_read_group.user_set.add(cls.study_default_read_group_user)
        cls.study_default_read_group.save()

        # create the study
        cls.study = factory.StudyFactory()

        # future-proof this test by removing any default permissions on the study that may have
        # been configured on this instance (e.g. by the EDD_DEFAULT_STUDY_READ_GROUPS setting).
        # This is most likely to be a complication in development.
        cls.study.userpermission_set.all().delete()
        cls.study.grouppermission_set.all().delete()

        # set permissions on the study
        cls.study.userpermission_set.create(
            user=cls.study_read_only_user,
            permission_type=StudyPermission.READ,
        )
        cls.study.userpermission_set.create(
            user=cls.study_write_only_user,
            permission_type=StudyPermission.WRITE,
        )
        cls.study.grouppermission_set.create(
            group=study_read_group,
            permission_type=StudyPermission.READ,
        )
        cls.study.grouppermission_set.create(
            group=study_write_group,
            permission_type=StudyPermission.WRITE,
        )

        if create_auth_perms_and_users:
            cls.add_study_permission = Permission.objects.get(codename='add_study')
            cls.change_study_permission = Permission.objects.get(codename='change_study')
            cls.delete_study_permission = Permission.objects.get(codename='delete_study')

            cls.staff_user = _create_user(username=_STAFF_USERNAME, email='staff@localhost',
                                          is_staff=True)

            cls.staff_study_creator = _create_user(
                username='staff.study.creator',
                email='staff.study@localhost',
                is_staff=True,
                manage_perms=(cls.add_study_permission,),
            )

            cls.staff_study_changer = _create_user(
                username='staff.study.changer',
                email='staff.study@localhost',
                is_staff=True,
                manage_perms=(cls.change_study_permission,),
            )

            cls.staff_study_deleter = _create_user(
                username='staff.study.deleter',
                is_staff=True,
                manage_perms=(cls.delete_study_permission,),
            )

    @classmethod
    def create_study_internals(cls, study, deepest_model, name_prefix):
        """
        A helper method that creates and saves study internals in the database so as a basis for
        testing REST API calls that should return them. A single, active  instance of each nested
        resource is created within the study, down to the level of depth requested.
        in the study
        :param deepest_element:
        :return: the deepest ORM model object created
        """

        models = StudyInternals()

        # create an active Line/Assay/Measurement in the study so we have something to test
        models.line = study.line_set.create(name='%sLine' % name_prefix)

        if deepest_model == LINES_RESOURCE_NAME:
            models.build_uris(study, deepest_model)
            return models

        models.protocol, created = Protocol.objects.get_or_create(
            name='JBEI Proteomics',
            description='Proteomics protocol used @ JBEI',
            owned_by=cls.superuser,
        )

        models.assay = models.line.assay_set.create(
            name='%sAssay' % name_prefix,
            protocol=models.protocol,
            experimenter=cls.study_write_only_user,
        )

        if deepest_model == ASSAYS_RESOURCE_NAME:
            models.build_uris(study, deepest_model)
            return models

        # get / create measurement types, units, etc as needed for measurements. Some of these will
        # be needed in inactive/sibling_model_factory() methods rather than here
        models.protein, created = ProteinIdentifier.objects.get_or_create(
            accession_id='1|2|3|4',
            length=255,
            mass=1,
            type_name='Test protein',
            short_name='test prot',
        )
        models.ethanol_metabolite = Metabolite.objects.get(type_name='Ethanol')
        models.oxygen_metabolite = Metabolite.objects.get(type_name='O2')

        models.gram_per_liter_units = MeasurementUnit.objects.get(unit_name='g/L')
        models.detection_units, created = MeasurementUnit.objects.get_or_create(
            unit_name='detections',
            display=True,
        )

        models.hour_units = MeasurementUnit.objects.get(unit_name='hours')
        models.min_units, created = MeasurementUnit.objects.get_or_create(unit_name='minutes')

        models.measurement = models.assay.measurement_set.create(
            experimenter=cls.study_write_only_user,
            measurement_type=models.oxygen_metabolite,
            x_units=models.gram_per_liter_units,
            y_units=models.hour_units,
            compartment=_EXTRACELLULAR,
            measurement_format=_SCALAR,
        )

        if deepest_model == MEASUREMENTS_RESOURCE_NAME:
            models.build_uris(study, deepest_model)
            return models

        models.measurement_val = models.measurement.measurementvalue_set.create(x=[1], y=[2])
        models.build_uris(study, deepest_model)

        return models

    @classmethod
    def create_everyone_studies(cls, deepest_elt):
        """
        Creates studies and nested components that have "everyone read" and "everyone write"
        permissions.
        """

        ###########################################################################################
        # Create studies
        ###########################################################################################
        everyone_read_study = factory.StudyFactory(name='Study')
        everyone_read_study.everyonepermission_set.create(permission_type=StudyPermission.READ)

        everyone_write_study = factory.StudyFactory(name='Writable by everyone')
        everyone_write_study.everyonepermission_set.create(permission_type=StudyPermission.WRITE)

        read_models = cls.create_study_internals(everyone_read_study, deepest_elt,
                                                 'Everyone read ')
        write_models = cls.create_study_internals(everyone_write_study, deepest_elt,
                                                  'Everyone write ')

        return read_models, write_models

    @classmethod
    def define_auth_perms_and_users(cls, model_name):
        cls.add_permission = Permission.objects.get(codename='add_%s' % model_name)
        cls.change_permission = Permission.objects.get(codename='change_%s' % model_name)
        cls.delete_permission = Permission.objects.get(codename='delete_%s' % model_name)

        cls.staff_creator = _create_user(
            username='staff.%s.creator' % model_name,
            email='staff.study@localhost',
            is_staff=True,
            manage_perms=(cls.add_permission,),
        )

        cls.staff_changer = _create_user(
            username='staff.%s.changer' % model_name,
            email='staff.study@localhost',
            is_staff=True,
            manage_perms=(cls.change_permission,),
        )

        cls.staff_deleter = _create_user(
            username='staff.%s.deleter' % model_name,
            is_staff=True,
            manage_perms=(cls.delete_permission,),
        )


class StrainResourceTests(EddApiTestCaseMixin, APITestCase):
    """
    Tests access controls and HTTP return codes for queries to the /rest/strains/ REST API resource

    Strains should only be accessible by:
    1) Superusers
    2) Users who have explicit class-level mutator permissions on Strains via a django.contrib.auth
       permissions. Any user with a class-level mutator permission has implied read permission on
       all strains.
    3) Users who have strain read access implied by their read access to an associated study. Since
       EDD only caches the strain name, description, and URL, this should be essentially the same
       visibility granted via access to the study.  There's likely little need for API users to
       access strains in this way, which requires more expensive joins to determine.  However,
       it would be strange to *not* grant read-only access to the strain data already visible
       via the study, if requested. Also note that class-level study mutator permissions granted
       via django.contrib.auth do NOT grant strain access, since that permission only gives
       access to the study name/description, not the data or metadata.

    Note that these permissions are enforced by a combination of EDD's custom
    ImpliedPermissions class and StrainViewSet's get_queryset() method, whose non-empty result
    implies that the requesting user has access to the returned strains.
    """

    @classmethod
    def setUpTestData(cls):
        """
        Creates strains, users, and study/line combinations to test the REST resource's application
        of user permissions.
        """
        super(StrainResourceTests, cls).setUpTestData()

        # create the study and associated users & permissions
        cls.create_study()

        cls.add_strain_permission = Permission.objects.get(codename='add_strain')
        cls.change_strain_permission = Permission.objects.get(codename='change_strain')
        cls.delete_strain_permission = Permission.objects.get(codename='delete_strain')

        # plain staff w/ no extra privileges
        cls.staff_user = _create_user(username=_STAFF_USERNAME, email='staff@localhost',
                                      is_staff=True)

        cls.staff_strain_user = _create_user(username='staff.strain.user',
                                             email='staff.study@localhost', is_staff=True,
                                             manage_perms=(cls.add_strain_permission,
                                                           cls.change_strain_permission,
                                                           cls.delete_strain_permission))

        cls.staff_strain_creator = _create_user(username='staff.strain.creator',
                                                email='staff.study@localhost', is_staff=True,
                                                manage_perms=(cls.add_strain_permission,))

        cls.staff_strain_changer = _create_user(username='staff.strain.changer',
                                                email='staff.study@localhost', is_staff=True,
                                                manage_perms=(cls.change_strain_permission,))

        cls.staff_strain_deleter = _create_user(username='staff.strain.deleter', is_staff=True,
                                                manage_perms=(cls.delete_strain_permission,))

        # create some strains / lines in the study
        cls.study_strain1 = Strain.objects.create(
            name='Study Strain 1',
            registry_id=UUID('f120a00f-8bc3-484d-915e-5afe9d890c5f'),
            registry_url='https://registry-test.jbei.org/entry/55349',
        )
        line = cls.study.line_set.create(name='Study strain1 line')
        line.strains.add(cls.study_strain1)

    @property
    def values_converter(self):
        return strain_to_json_dict

    def _enforce_study_strain_read_access(self, url, is_list, strain_in_study=True):
        """
        A helper method that does the work to test permissions for both list and individual strain
        GET access. Note that the way we've constructed test data above,
        :param strain_in_study: True if the provided URL references a strain in our test study,
        False if the strain isn't in the test study, and should only be visible to
        superusers/managers.
        """

        # verify that an un-authenticated request gets a 404
        self._assert_unauthenticated_get_denied(url)

        # verify that various authenticated, but unprivileged users
        # are denied access to strains without class level permission or access to a study that
        # uses them. This is important, because viewing strain names/descriptions for
        # un-publicized studies could compromise the confidentiality of the research before
        # it's published self.require_authenticated_access_denied(self.study_owner)
        require_no_result_method = (self._assert_authenticated_get_empty_paged_result if
                                    is_list else
                                    self._assert_authenticated_get_empty_result)

        #  enforce access denied behavior for the list resource -- same as just showing an empty
        #  list, since otherwise we'd also return a 403 for a legitimately empty list the user
        #  has access to
        if is_list:
            require_no_result_method(url, self.unprivileged_user)
            require_no_result_method(url, self.staff_user)
            require_no_result_method(url, self.staff_strain_creator)

        # enforce access denied behavior for the strain detail -- permission denied
        else:
            self._assert_authenticated_get_denied(url, self.unprivileged_user)
            self._assert_authenticated_get_denied(url, self.staff_user)
            self._assert_authenticated_get_denied(url, self.staff_strain_creator)

        # test that an 'admin' user can access strains even without the write privilege
        self._assert_authenticated_get_allowed(url, self.superuser)

        # test that 'staff' users with any strain mutator privileges have implied read permission
        self._assert_authenticated_get_allowed(url, self.staff_strain_changer)
        self._assert_authenticated_get_allowed(url, self.staff_strain_deleter)
        self._assert_authenticated_get_allowed(url, self.staff_strain_user)

        if strain_in_study:
            # if the strain is in our test study,
            # test that an otherwise unprivileged user with read access to the study can also use
            # the strain resource to view the strain
            self._assert_authenticated_get_allowed(url, self.study_read_only_user)
        else:
            # if the strain isn't in our test study, test that a user with study read access,
            # but no additional privileges, can't access it
            self._assert_authenticated_get_denied(url, self.study_read_only_user)

        # test that user group members with any access to the study have implied read
        # permission on the strains used in it
        if strain_in_study:
            self._assert_authenticated_get_allowed(url, self.study_read_group_user)
            self._assert_authenticated_get_allowed(url, self.study_write_group_user)
        else:
            self._assert_authenticated_get_denied(url, self.study_read_group_user)
            self._assert_authenticated_get_denied(url, self.study_write_group_user)

    def test_malformed_uri(self):
        """
        Tests that the API correctly identifies a client error in URI input, since code has
        to deliberately avoid a 500 error for invalid ID's
        """
        # build a URL with purposefully malformed UUID
        strain_detail_pattern = '%(base_strain_url)s/%(uuid)s/'
        url = strain_detail_pattern % {
            'base_strain_url': STRAINS_RESOURCE_URL,
            'uuid': 'None',
        }

        self._assert_unauthenticated_get_denied(url)
        self._assert_authenticated_get_client_error(url, self.unprivileged_user)

    def test_strain_delete(self):
        """
        TODO: remove this; deletion of strain references should not be an exposed option.
        """

        # create a strain to be deleted
        strain = Strain.objects.create(name='To be deleted')

        strain_detail_pattern = '%(base_strain_url)s/%(pk)d/'
        url = strain_detail_pattern % {
            'base_strain_url': STRAINS_RESOURCE_URL,
            'pk': strain.pk,
        }

        # for now, verify that NO ONE can delete a strain via the API. Easier as a stopgap than
        # learning how to ensure that only strains with no foreign keys can be deleted,
        # or implementing / testing a capability to override that check

        # unauthenticated user and unprivileged users get 403
        self.client.logout()
        response = self.client.delete(url)
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self._do_delete(url, self.unprivileged_user, status.HTTP_403_FORBIDDEN)

        # privileged users got 405
        self._do_delete(url, self.staff_strain_deleter, status.HTTP_405_METHOD_NOT_ALLOWED)
        self._do_delete(url, self.superuser, status.HTTP_405_METHOD_NOT_ALLOWED)

        # manually delete the strain
        strain.delete()

    def test_strain_add(self):
        """
        TODO: remove this; adding strain references should not be an exposed option.
        Tests that the /rest/strains/ resource responds correctly to configured user permissions
        for adding strains.  Note that django.auth permissions calls this 'add' while DRF
        uses the 'create' action
        """

        # Note: missing slash causes 301 response when authenticated
        _URL = STRAINS_RESOURCE_URL + '/'

        # verify that an unprivileged user gets a 403. Note dumps needed for UUID
        post_data = {
            STRAIN_NAME_KEY:        'new strain 1',
            STRAIN_DESCRIPTION_KEY: 'strain 1 description goes here',
            STRAIN_REG_ID_KEY:      '3a3e7b39-258c-4d32-87d6-dd00a66f174f',
            STRAIN_REG_URL_KEY:      'https://registry-test.jbei.org/entry/55350',
        }

        # verify that an un-authenticated request gets a 404
        self._assert_unauthenticated_post_denied(_URL,
                                                 post_data)

        # verify that unprivileged user can't create a strain
        self._assert_authenticated_post_denied(_URL, self.unprivileged_user, post_data)

        # verify that staff permission alone isn't enough to create a strain
        self._assert_authenticated_post_denied(_URL, self.staff_user, post_data)

        # verify that strain change permission doesn't allow addition of new strains
        self._assert_authenticated_post_denied(_URL, self.staff_strain_changer, post_data)

        # verify that an administrator can create a strain
        self._assert_authenticated_post_allowed(_URL, self.superuser, post_data)

        # verify that UUID input is ignored during strain creation
        post_data[STRAIN_REG_ID_KEY] = self.study_strain1.registry_id
        response = self._assert_authenticated_post_allowed(_URL, self.superuser, post_data)

        self.assertNotEqual(post_data[STRAIN_REG_ID_KEY],
                            json.loads(response.content)[STRAIN_REG_ID_KEY])

        # verify that a user with only explicit create permission can create a strain
        post_data = {
            STRAIN_NAME_KEY:        'new strain 2',
            STRAIN_DESCRIPTION_KEY: 'strain 2 description goes here',
            STRAIN_REG_ID_KEY:       None,
            STRAIN_REG_URL_KEY:      None,
        }
        self._assert_authenticated_post_allowed(_URL, self.staff_strain_creator, post_data)

    def test_strain_change(self):
        """
        TODO: remove this; editing strain references should not be an exposed option.
        """

        # Note: missing slash causes 301 response when authenticated
        url_format = STRAINS_RESOURCE_URL + '/%(id)s/'

        # create a temporary strain to test intended changes on, while preventing changes
        # to the class-level state that could impact other test results
        study_strain = self.study_strain1

        strain_to_change = Strain.objects.create(
            name=study_strain.name,
            description=study_strain.description,
            registry_url=study_strain.registry_url,
            registry_id=uuid4(),
        )

        # define URLs in both pk and UUID format, and run the same tests on both
        for index, durable_id in enumerate(('pk', 'uuid')):
            if 'pk' == durable_id:
                url = url_format % {'id': self.study_strain1.pk}
            else:
                url = url_format % {'id': self.study_strain1.registry_id}

            # define put data for changing every strain field
            put_data = {
                STRAIN_NAME_KEY:        'Holoferax volcanii%d' % index,
                STRAIN_DESCRIPTION_KEY: 'strain description goes here%d' % index,
                STRAIN_REG_ID_KEY:      str(uuid4()),
                STRAIN_REG_URL_KEY:     'https://registry-test.jbei.org/entry/6419%d' % index,
                'pk':                   self.study_strain1.pk
            }

            # verify that an un-authenticated request gets a 404
            self._assert_unauthenticated_put_denied(url, put_data)

            # verify that unprivileged user can't update a strain
            self._assert_authenticated_put_denied(url, self.unprivileged_user, put_data)

            # verify that group-level read/write permission on a related study doesn't grant any
            # access to update the contained strains
            self._assert_authenticated_put_denied(url, self.study_read_group_user,
                                                  put_data)
            self._assert_authenticated_put_denied(url,
                                                  self.study_write_group_user,
                                                  put_data)

            # verify that staff permission alone isn't enough to update a strain
            self._assert_authenticated_put_denied(url, self.staff_user, put_data)

            # verify that a user can't update an existing strain with the 'create' permission.
            # See http://www.django-rest-framework.org/api-guide/generic-views/#put-as-create
            self._do_put(url, self.staff_strain_creator, put_data, status.HTTP_403_FORBIDDEN)

            if 'pk' == durable_id:
                url = url_format % {'id': strain_to_change.pk}
            else:
                url = url_format % {'id': strain_to_change.registry_id}
            put_data['pk'] = strain_to_change.pk

            # verify that the explicit 'change' permission allows access to update the strain
            self._assert_authenticated_put_allowed(url, self.staff_strain_changer, put_data,
                                                   expected_values=put_data,
                                                   partial_response=False)

            if 'uuid' == durable_id:
                url = url_format % {'id': put_data[STRAIN_REG_ID_KEY]}
            put_data[STRAIN_REG_ID_KEY] = str(uuid4())

            # verify that an administrator can update a strain
            self._assert_authenticated_put_allowed(url,
                                                   self.superuser,
                                                   put_data,
                                                   expected_values=put_data,
                                                   partial_response=False)

            strain_to_change.registry_id = put_data[STRAIN_REG_ID_KEY]

    def test_paging(self):
        pass

    def test_strain_list_read_access(self):
        """
        Tests GET /rest/strains
        """

        list_url = '%s/' % STRAINS_RESOURCE_URL
        self._enforce_study_strain_read_access(list_url, True)

        # create / configure studies and related strains to test strain access via
        # the "everyone" permissions. Note these aren't included in setUpTestData() since that
        # config sets us up for initial tests for results where no strain access is allowed / no
        # results are returned.

        # everyone read
        everyone_read_study = factory.StudyFactory(name='Readable by everyone')
        everyone_read_study.everyonepermission_set.create(permission_type=StudyPermission.READ)
        everyone_read_strain = Strain.objects.create(
            name='Readable by everyone via study read',
            registry_id=uuid4(),
        )
        line = everyone_read_study.line_set.create(name='Everyone read line')
        line.strains.add(everyone_read_strain)

        self._assert_authenticated_get_allowed(list_url,
                                               self.unprivileged_user,
                                               expected_values=[everyone_read_strain])

        # everyone write
        everyone_write_study = factory.StudyFactory(name='Writable be everyone')
        everyone_write_study.everyonepermission_set.create(permission_type=StudyPermission.WRITE)
        everyone_write_strain = Strain.objects.create(
            name='Readable by everyone via study write',
            registry_id=uuid4(),
        )
        line = everyone_write_study.line_set.create(name='Everyone write line')
        line.strains.add(everyone_write_strain)

        # test access to strain details via "everyone" read permission
        self._assert_authenticated_get_allowed(list_url, self.unprivileged_user, expected_values=[
            everyone_read_strain,
            everyone_write_strain, ])

    def test_strain_detail_read_access(self):
        """
            Tests GET /rest/strains
        """

        # test access to the study-linked strain configured in setUpTestData(), which should
        # expose strain details to users with study-specific privileges in addition to users with
        # admin or class-level django.util.auth privileges
        strain_detail_pattern = '%(base_strain_url)s/%(id)s/'
        urls = (strain_detail_pattern % {
                    'base_strain_url': STRAINS_RESOURCE_URL,
                    'id': self.study_strain1.pk, },
                strain_detail_pattern % {
                    'base_strain_url': STRAINS_RESOURCE_URL,
                    'id': self.study_strain1.registry_id, }, )

        for strain_detail_url in urls:
            # test access to the strain details (via pk)
            self._enforce_study_strain_read_access(strain_detail_url, False, strain_in_study=True)

        # create a new strain so we can test access to its detail view
        strain = Strain.objects.create(
            name='Test strain',
            description='Description goes here',
            registry_id=uuid4(),
        )

        # construct the URL for the strain detail view
        urls = (strain_detail_pattern % {
                    'base_strain_url': STRAINS_RESOURCE_URL,
                    'id':              strain.pk, },
                strain_detail_pattern % {
                    'base_strain_url': STRAINS_RESOURCE_URL,
                    'id': strain.registry_id, })

        for strain_detail_url in urls:
            # test the strain detail view. Normal users shouldn't have access via the study.
            self._enforce_study_strain_read_access(strain_detail_url,
                                                   False,
                                                   strain_in_study=False)

        # create / configure studies and related lines to test strain access via
        # the "everyone" permissions. Note these aren't included in setUpTestData() since that
        # config sets us up for initial tests for results where no strain access is allowed / no
        # results are returned.

        # everyone read
        everyone_read_study = factory.StudyFactory(name='Readable by everyone')
        everyone_read_study.everyonepermission_set.create(permission_type=StudyPermission.READ)
        everyone_read_strain = Strain.objects.create(
            name='Readable by everyone via study read',
            registry_id=uuid4(),
        )
        line = everyone_read_study.line_set.create(name='Everyone read line')
        line.strains.add(everyone_read_strain)

        urls = (strain_detail_pattern % {  # PK
                    'base_strain_url': STRAINS_RESOURCE_URL,
                    'id': everyone_read_strain.pk, },
                strain_detail_pattern % {  # UUID
                    'base_strain_url': STRAINS_RESOURCE_URL,
                    'id': everyone_read_strain.registry_id, }, )

        for everyone_read_url in urls:

            # verify that an un-authenticated request gets a 404
            self._assert_unauthenticated_get_denied(everyone_read_url)

            self._assert_authenticated_get_allowed(everyone_read_url,
                                                   self.unprivileged_user,
                                                   expected_values=everyone_read_strain)

        # everyone write
        everyone_write_study = factory.StudyFactory(name='Writable be everyone')
        everyone_write_study.everyonepermission_set.create(permission_type=StudyPermission.WRITE)
        everyone_write_strain = Strain.objects.create(
            name='Readable by everyone via study write',
            registry_id=uuid4(),
        )
        line = everyone_write_study.line_set.create(name='Everyone write line')
        line.strains.add(everyone_write_strain)

        urls = (strain_detail_pattern % {  # pk
                    'base_strain_url': STRAINS_RESOURCE_URL,
                    'id': everyone_write_strain.pk, },
                strain_detail_pattern % {  # UUID
                    'base_strain_url': STRAINS_RESOURCE_URL,
                    'id': everyone_write_strain.pk, },)

        for everyone_write_url in urls:

            # verify that an un-authenticated request gets a 404
            self._assert_unauthenticated_get_denied(everyone_write_url)

            # verify study-level "everyone" permissions allow access to view associated strains
            self._assert_authenticated_get_allowed(everyone_write_url,
                                                   self.unprivileged_user,
                                                   expected_values=everyone_write_strain)


def to_paged_result_dict(expected_values, values_converter):
    converted_values = [values_converter(value) for value in expected_values]
    return {
        RESULT_COUNT_KEY: len(converted_values),
        RESULTS_KEY: converted_values,
        PREVIOUS_PAGE_KEY: None,
        NEXT_PAGE_KEY: None,
    }


# TODO: prefer testcase.assertDictEqual(expected, observed) where feasible. For now
# this method is helpful for building up comparisons where only some of the results are tested. It
# should work as a stopgap.
def compare_paged_result_dict(testcase, expected, observed, order_agnostic=True,
                              partial_response=False):
    """
    A helper method for comparing deserialized JSON result dicts of paged results returned from
    EDD's REST API.
    Provides a  helpful error message if just performing simple exact-match comparison,
    or also supports order agnostic result comparison for cases where a single page of results
    can be reasonably expected to be returned in any order (e.g. when unsorted).
    @param partial_response: True if each provided expected result only contains a partial
    definition of the object.  In this case, only the provided values will be compared.
    """
    # compare result count
    compare_dict_value(testcase, RESULT_COUNT_KEY, expected, observed)

    # compare next page link
    compare_dict_value(testcase, NEXT_PAGE_KEY, expected, observed)

    # compare prev page link
    compare_dict_value(testcase, PREVIOUS_PAGE_KEY, expected, observed)

    # compare actual result content
    expected = expected[RESULTS_KEY]
    observed = observed[RESULTS_KEY]

    if order_agnostic:
        order_agnostic_result_comparison(testcase, expected, observed, unique_key_name='pk',
                                         partial_response=partial_response)
    else:
        if not partial_response:
            testcase.assertEqual(expected, observed, (
                "Response content didn't match required value(s).\n\n "
                "Expected: %(expected)s\n\n"
                "Observed: %(observed)s" % {
                    'expected': expected,
                    'observed': observed,
                }))
        else:
            _compare_partial_value(testcase, expected, observed)


def to_json_comparable(expected_values, values_converter):
    """
    Converts expected value(s) for a REST API request into a dictionary that's easily
    comparable against deserialized JSON results actually returned by the API during the test.
    :param expected_values: a single expected value or an iterable of expected values to
    structure in the arrangement as a deserialized JSON string received from the REST API.
    :param values_converter: a function to use for converting expected values specified in the
    test into the expected dictionary form to match deserialized JSON. Only used if expected_values
    is a list.
    :return: a dict of expected values that should match the REST JSON response
    """
    if isinstance(expected_values, list):
        return to_paged_result_dict(expected_values, values_converter), True
    elif isinstance(expected_values, dict):
        return expected_values, False
    else:
        if values_converter:
            return values_converter(expected_values), False
        return expected_values, False


err_msg = 'Expected %(key)s "%(expected)s", but observed "%(observed)s"'


def compare_dict_value(testcase, key, expected_values, observed_values):
    """
        A helper method to provide a more clear error message when a test assertion fails
    """
    expected = expected_values[key]
    observed = observed_values[key]
    testcase.assertEqual(expected, observed, err_msg % {
        'key': key,
        'expected': expected,
        'observed': observed,
    })


def order_agnostic_result_comparison(testcase, expected_values_list, observed_values_list,
                                     unique_key_name='pk', partial_response=False):
    """
    A helper method for comparing query results in cases where top-level result order doesn't
    matter, only content. For example, if user didn't specify any sort parameter in the query,
    order of results is unpredictable.

    Note that this method is only appropriate to use when there's only a single page of results,
    otherwise there's no guarantee of which results appear in the first page.
    @param partial_response: True if the expected value objects only contain a subset of the
    response (e.g. they may be missing pk's, UUID's or other data that were autogenerated by
    EDD). If True, only the expected values defined in the input will be compared, and any other
    results will be ignored.
    """

    # build dicts mapping unique id -> content for each result. requires more memory,
    # but a lot less code to compare this way.
    expected_values_dict = {value[unique_key_name]: value for value in expected_values_list}
    observed_values_dict = {value[unique_key_name]: value for value in observed_values_list}

    unique_keys = set(expected_values_dict.keys())
    unique_keys.update(observed_values_dict.keys())

    not_defined_val = '[Not defined]'
    header = '%(unique key)s\tExpected\tObserved'
    results_summary = '\n'.join(['%(key)s:\t%(expected)s\t%(observed)s' % {
        'key': key,
        'expected': expected_values_dict.get(key, not_defined_val),
        'observed': observed_values_dict.get(key, not_defined_val),
    } for key in unique_keys])

    if not partial_response:
        testcase.assertEqual(expected_values_dict, observed_values_dict,
                             "Query results didn't match expected values.\n"
                             "%(header)s\n\n%(results_summary)s" % {
                                 'header': header,
                                 'results_summary': results_summary,
                             })
    else:
        _compare_partial_value(testcase, expected_values_dict, observed_values_dict)


def _compare_partial_value(testcase, exp_value, observed_value, key=None):
    """
    A helper method for comparing nested JSON query results.  Dictionaries are compared without
    order taken into consideration, while all other elements are
    :param testcase:
    :param exp_value:
    :param observed_value:
    :return:
    """

    if isinstance(exp_value, dict):
        for unique_key, exp_inner in exp_value.iteritems():
            try:
                obs_inner = observed_value[unique_key]
                _compare_partial_value(testcase, exp_inner, obs_inner, key=unique_key)
            except KeyError:
                err_msg = ('Expected key "%(key)s" to be present, but it was missing. \n\n'
                           '"Expected: %(expected)s\n\n"'
                           'Observed: %(observed)s' % {
                               'key': unique_key,
                               'expected': exp_value,
                               'observed': observed_value,
                           })
                testcase.assertTrue(False, err_msg)

    elif isinstance(exp_value, collections.Sequence) and not isinstance(exp_value, string_types):
        for index, exp_inner in enumerate(exp_value):
            obs_inner = observed_value[index]
            _compare_partial_value(testcase, exp_inner, obs_inner, key)
    elif isinstance(exp_value, float) or isinstance(observed_value, float):
        testcase.assertAlmostEqual(exp_value, observed_value,
                                   'Expected %(key)s value %(exp)s but observed %(obs)s' % {
                                         'key': ('"%s"' % key) if key else '',
                                         'exp': exp_value,
                                         'obs': observed_value, })
    else:
        testcase.assertEqual(exp_value, observed_value,
                             'Expected %(key)s value "%(exp)s" %(exp_type)s but observed '
                             '"%(obs)s" %(obs_type)s' % {
                                 'key': ('"%s"' % key) if key else '',
                                 'exp': exp_value,
                                 'exp_type': type(exp_value),
                                 'obs_type': type(observed_value),
                                 'obs': observed_value, })


def strain_to_json_dict(strain):
    if not strain:
        return {}

    return {
        'name': strain.name,
        'description': strain.description,
        'registry_url': strain.registry_url,
        'registry_id': str(strain.registry_id),
        'pk': strain.pk
    }


def study_to_json_dict(study):
    if not study:
        return {}

    # define unique study attributes important for our test
    val = {
        'slug': study.slug,
        'pk': study.pk,
        'active': study.active,
    }

    # define common EddObject attributes
    edd_obj_to_json_dict(study, val)
    return val


def line_to_json_dict(line):
    if not line:
        return {}

    # define unique line attributes important for our test
    val = {
        'pk': line.pk,
        'study': line.study.pk,
        'strains': [strain_pk for strain_pk in line.strains.values_list('pk', flat=True)],
    }

    # define common EddObject attributes
    edd_obj_to_json_dict(line, val)
    return val


def assay_to_json_dict(assay):
    if not assay:
        return {}

    val = {
        'line': assay.line_id,
        'protocol': assay.protocol_id,
        'experimenter': assay.experimenter_id,
    }

    # define common EddObject attributes
    edd_obj_to_json_dict(assay, val)
    return val


def measurement_to_json_dict(measurement):
    if not measurement:
        return {}

    return {
        'pk': measurement.pk,
        'assay': measurement.assay_id,
        'experimenter': measurement.experimenter_id,
        'measurement_type': measurement.measurement_type_id,
        'x_units': measurement.x_units_id,
        'y_units': measurement.y_units_id,
        'update_ref': measurement.update_ref_id,
        'active': measurement.active,
        'compartment': measurement.compartment,
        'measurement_format': measurement.measurement_format,
    }


def value_to_json_dict(value):
    if not value:
        return {}

    return {
        'pk': value.pk,
        'x': ['%0.5f' % x for x in value.x],
        'y': ['%0.5f' % y for y in value.y],
        'updated': value.updated_id,
    }


def edd_obj_to_json_dict(edd_obj, json_dict):
    if not edd_obj:
        return json_dict

    json_dict['name'] = edd_obj.name
    json_dict['description'] = edd_obj.description
    json_dict['uuid'] = str(edd_obj.uuid)
    json_dict['pk'] = edd_obj.pk
    json_dict['active'] = edd_obj.active

    return json_dict


def _create_user(username, email='staff.study@localhost',
                 is_superuser=False,
                 is_staff=True, manage_perms=()):
    """
        A convenience method that creates and returns a test User, with requested
        permissions set. Helps avoid verification problems when database state has been correctly
        configured, but locally cached user objects aren't up-to-date with the database.
    """

    # create and save the user so foreign key based permissions changes will succeed.
    # note: some password is required to allow successful login
    user = factory.UserFactory(username=username, email=email)

    # return early if no updates to user or its foreign key relationships
    if not (is_staff or is_superuser):
        return

    user.is_staff = is_staff
    user.is_superuser = is_superuser

    if is_staff:
        for permission in manage_perms:
            user.user_permissions.add(permission)

    user.save()
    user.refresh_from_db()

    return user


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

    @classmethod
    def setUpTestData(cls):
        """
        Creates strains, users, and study/line combinations to test the REST resource's application
        of user permissions.
        """
        super(StudiesTests, cls).setUpTestData()

        # define placeholder data members to silence PyCharm style checks for data members
        # created in create_study()
        cls.study = None
        cls.unprivileged_user = None
        cls.study_read_only_user = None
        cls.study_write_only_user = None
        cls.study_read_group_user = None
        cls.study_write_group_user = None
        cls.staff_user = None
        cls.staff_study_creator = None
        cls.staff_study_changer = None
        cls.staff_study_deleter = None
        cls.study_default_read_group_user = None
        cls.study_default_read_group = None
        cls.superuser = None

        # create the study and associated users & permissions
        cls.create_study(create_auth_perms_and_users=True)

    @property
    def values_converter(self):
        return study_to_json_dict

    def _enforce_study_read_access(self, url, is_list, expected_values):
        """
        A helper method that does the work to test permissions for both list and individual study
        GET access.
        """

        # verify that an un-authenticated request gets a 404
        self._assert_unauthenticated_get_denied(url)

        # verify that various authenticated, but unprivileged users
        # are denied access to studies without class level permission or access to a study that
        # uses them. This is important, because viewing strain names/descriptions for
        # un-publicized studies could compromise the confidentiality of the research before
        # it's published self.require_authenticated_access_denied(self.study_owner)
        require_no_result_method = (self._assert_authenticated_get_empty_paged_result if
                                    is_list else self._assert_authenticated_get_empty_result)

        #  enforce access denied behavior for the list resource -- same as just showing an empty
        #  list, since otherwise we'd also return a 403 for a legitimately empty list the user
        #  has access to
        if is_list:
            require_no_result_method(url, self.unprivileged_user)
            require_no_result_method(url, self.staff_user)
            require_no_result_method(url, self.staff_study_creator)

        # enforce access denied behavior for the study detail -- permission denied
        else:
            self._assert_authenticated_get_denied(url, self.unprivileged_user)
            self._assert_authenticated_get_denied(url, self.staff_user)
            self._assert_authenticated_get_denied(url, self.staff_study_creator)

        # test that users / groups with read access can read the study
        self._assert_authenticated_get_allowed(url,
                                               self.study_read_only_user,
                                               expected_values=expected_values,
                                               partial_response=True)

        self._assert_authenticated_get_allowed(url,
                                               self.study_read_group_user,
                                               expected_values=expected_values,
                                               partial_response=True)

        # verify that study write permissions imply read permissions
        self._assert_authenticated_get_allowed(url,
                                               self.study_write_only_user,
                                               expected_values=expected_values,
                                               partial_response=True)

        self._assert_authenticated_get_allowed(url,
                                               self.study_write_group_user,
                                               expected_values=expected_values,
                                               partial_response=True)

        # test that an 'admin' user can access study data without other privileges
        self._assert_authenticated_get_allowed(url,
                                               self.superuser,
                                               expected_values=expected_values,
                                               partial_response=True)

        # test that 'staff' users with any study mutator privileges have implied read permission
        self._assert_authenticated_get_allowed(url,
                                               self.staff_study_changer,
                                               expected_values=expected_values,
                                               partial_response=True)
        self._assert_authenticated_get_allowed(url,
                                               self.staff_study_deleter,
                                               expected_values=expected_values,
                                               partial_response=True)

    def test_malformed_uri(self):
        """
        Tests that the API correctly identifies a client error in URI input, since code has
        to deliberately avoid a 500 error for invalid ID's
        """
        # build a URL with purposefully malformed UUID
        strain_detail_pattern = '%(base_strain_url)s/%(uuid)s/'
        url = strain_detail_pattern % {
            'base_strain_url': STRAINS_RESOURCE_URL,
            'uuid': 'None',
        }

        self._assert_unauthenticated_get_denied(url)
        self._assert_authenticated_get_client_error(url, self.unprivileged_user)

    def test_study_delete(self):
        """
            Enforces that study deletion is not allowed via the API
        """

        # create a study to be deleted
        study = factory.StudyFactory(name='To be deleted')

        study_detail_pattern = '%(base_study_url)s/%(pk)d/'
        url = study_detail_pattern % {
            'base_study_url': STUDIES_RESOURCE_URI,
            'pk': study.pk,
        }

        # unauthenticated user and unprivileged users get 403
        self.client.logout()
        response = self.client.delete(url)
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self._do_delete(url, self.unprivileged_user, status.HTTP_403_FORBIDDEN)

        # privileged users got 405
        self._do_delete(url, self.staff_study_deleter, status.HTTP_405_METHOD_NOT_ALLOWED)
        self._do_delete(url, self.superuser, status.HTTP_405_METHOD_NOT_ALLOWED)

    def test_study_add(self):
        """
        Tests that the /rest/strains/ resource responds correctly to configured user permissions
        for adding strains.  Note that django.auth permissions calls this 'add' while DRF
        uses the 'create' action
        """
        # TODO: as a future improvement, test that less-used fields are also settable using this
        #  resource.  E.g. metabolic map, contact_extra, slug (but only by admins for slug)

        # Note: missing slash causes 301 response when authenticated
        _URL = STUDIES_RESOURCE_URI + '/'

        # verify that an unprivileged user gets a 403. Note dumps needed for UUID
        post_data = {
            STUDY_NAME_KEY:        'new study 1',
            STUDY_DESCRIPTION_KEY: 'strain 1 description goes here',
            STUDY_CONTACT_KEY: self.study_write_only_user.pk,
        }

        # verify that an un-authenticated request gets a 404
        self._assert_unauthenticated_post_denied(_URL, post_data)

        with self.settings(EDD_ONLY_SUPERUSER_CREATE=False):
            # with normal settings, verify all users can create studies, regardless of privileges
            self._assert_authenticated_post_allowed(_URL,
                                                    self.unprivileged_user,
                                                    post_data,
                                                    required_response=post_data,
                                                    partial_response=True)

        with self.settings(EDD_ONLY_SUPERUSER_CREATE=True):

            self._assert_authenticated_post_denied(_URL, self.unprivileged_user, post_data)

            self._assert_authenticated_post_denied(_URL, self.staff_user, post_data)

            # verify that study change permission doesn't allow addition of new studies
            self._assert_authenticated_post_denied(_URL, self.staff_study_changer,
                                                   post_data)

            # verify that an administrator can create a study
            self._assert_authenticated_post_allowed(_URL, self.superuser, post_data)

            # verify that even a user with the study create privilege can't create a study
            self._assert_authenticated_post_denied(_URL, self.staff_study_creator,
                                                   post_data)

        with self.settings(EDD_ONLY_SUPERUSER_CREATE='permission'):
            # verify that when the setting is set appropriately, the study create privilege is
            # sufficient to allow a privileged user to create a study
            self._assert_authenticated_post_allowed(_URL,
                                                    self.staff_study_creator,
                                                    post_data)

            self._assert_authenticated_post_denied(_URL, self.unprivileged_user, post_data)

            self._assert_authenticated_post_denied(_URL, self.staff_user, post_data)

            # verify that study change permission doesn't allow addition of new studies
            self._assert_authenticated_post_denied(_URL, self.staff_study_changer,
                                                   post_data)

            # verify that an administrator can create a study
            self._assert_authenticated_post_allowed(_URL, self.superuser, post_data)

            #######################################################################################
            #######################################################################################

            # verify that UUID input is ignored during study creation
            post_data[UUID_KEY] = str(self.study.uuid)
            response = self._assert_authenticated_post_allowed(_URL, self.superuser, post_data)
            self.assertNotEqual(post_data[UUID_KEY], json.loads(response.content)[UUID_KEY])

    def test_study_change(self):

        self.assertTrue(self.study.user_can_write(self.study_write_group_user))

        # Note: missing slash causes 301 response when authenticated
        url_format = '%(resource_url)s/%(id)s/'

        url = url_format % {'resource_url': STUDIES_RESOURCE_URI,
                            'id':           self.study.pk}

        # define placeholder put data that shouldn't get applied
        put_data = {
            STUDY_NAME_KEY:        'Test study',
            STUDY_DESCRIPTION_KEY: 'Description goes here',
        }

        # verify that an un-authenticated request gets a 404
        self._assert_unauthenticated_put_denied(url, put_data)

        # verify that unprivileged user can't update someone else's study
        self._assert_authenticated_put_denied(url, self.unprivileged_user, put_data)

        # test that a user with read privileges can't change the study
        self._assert_authenticated_put_denied(url, self.study_read_group_user, put_data)

        put_data = {
            STUDY_NAME_KEY: 'Updated study name',
            STUDY_DESCRIPTION_KEY: 'Updated study description',
            STUDY_CONTACT_KEY: self.study_write_group_user.pk,
        }
        self._assert_authenticated_put_allowed(url, self.study_write_group_user, put_data,
                                               expected_values=put_data,
                                               partial_response=True)

        # verify that staff permission alone isn't enough to update a study
        self._assert_authenticated_put_denied(url, self.staff_user, put_data)

        # verify that a user can't update an existing study with the 'create' permission.
        # See http://www.django-rest-framework.org/api-guide/generic-views/#put-as-create
        self._assert_authenticated_put_denied(url,
                                              self.staff_study_creator,
                                              put_data)

        # verify that the explicit 'change' permission allows access to update the strain
        self._assert_authenticated_put_allowed(url, self.staff_study_changer, put_data)

        # verify that an administrator can update a strain
        self._assert_authenticated_put_allowed(url, self.superuser, put_data)

    def test_study_list_read_access(self):
        """
            Tests GET /rest/studies/
        """

        # test basic use for a single study
        list_url = '%s/' % STUDIES_RESOURCE_URI
        logger.info("Testing read access for %s" % list_url)
        self._enforce_study_read_access(list_url, True, expected_values=[self.study])

        # test study filtering based on active status
        self.study.active = False
        self.study.save()

        self._assert_authenticated_get_empty_paged_result(list_url, self.superuser)

        request_params = {ACTIVE_STATUS_PARAM: QUERY_ACTIVE_OBJECTS_ONLY}
        self._assert_authenticated_get_empty_paged_result(list_url,
                                                          self.superuser,
                                                          request_params=request_params)

        request_params = {ACTIVE_STATUS_PARAM: QUERY_INACTIVE_OBJECTS_ONLY}
        self._assert_authenticated_get_allowed(list_url,
                                               self.superuser,
                                               expected_values=[self.study],
                                               request_params=request_params,
                                               partial_response=True)

        # create a study everyone can read
        # wait before saving the study to guarantee a different creation/update timestamp
        sleep(0.05)
        everyone_read_study = factory.StudyFactory(name='Readable by everyone')
        everyone_read_study.everyonepermission_set.create(permission_type=StudyPermission.READ)

        self._assert_authenticated_get_allowed(list_url,
                                               self.unprivileged_user,
                                               expected_values=[everyone_read_study],
                                               partial_response=True)

        # create a study everyone can write
        # wait before saving the study to guarantee a different creation/update timestamp
        sleep(0.05)
        everyone_write_study = factory.StudyFactory(name='Writable be everyone')
        everyone_write_study.everyonepermission_set.create(permission_type=StudyPermission.WRITE)

        self._assert_authenticated_get_allowed(list_url,
                                               self.unprivileged_user,
                                               expected_values=[everyone_read_study,
                                                                everyone_write_study, ],
                                               partial_response=True)

        # test study filtering for all any active status
        request_params = {ACTIVE_STATUS_PARAM: QUERY_ANY_ACTIVE_STATUS}
        self._assert_authenticated_get_allowed(list_url,
                                               self.superuser,
                                               expected_values=[self.study,
                                                                everyone_read_study,
                                                                everyone_write_study],
                                               request_params=request_params,
                                               partial_response=True)
        self.study.active = True
        self.study.save()

        # test timestamp-based filtering
        request_params = {
            CREATED_AFTER_PARAM: self.study.created.mod_time,
        }
        expected_values = [self.study,
                           everyone_read_study,
                           everyone_write_study, ]
        self._assert_authenticated_get_allowed(list_url,
                                               self.study_read_only_user,
                                               expected_values=expected_values,
                                               request_params=request_params,
                                               partial_response=True)

        request_params = {
            UPDATED_AFTER_PARAM: self.study.created.mod_time,
        }
        self._assert_authenticated_get_allowed(list_url,
                                               self.study_read_only_user,
                                               expected_values=expected_values,
                                               request_params=request_params,
                                               partial_response=True)

        # verify that "after" param is inclusive, and "before" is exclusive
        request_params = {
            CREATED_AFTER_PARAM: self.study.created.mod_time,
            CREATED_BEFORE_PARAM: self.study.created.mod_time + timedelta(microseconds=1),
        }
        self._assert_authenticated_get_allowed(list_url,
                                               self.study_read_only_user,
                                               expected_values=[self.study],
                                               request_params=request_params,
                                               partial_response=True)

        request_params = {
            UPDATED_AFTER_PARAM: self.study.updated.mod_time,
            UPDATED_BEFORE_PARAM: self.study.updated.mod_time + timedelta(microseconds=1),
        }
        self._assert_authenticated_get_allowed(list_url,
                                               self.study_read_only_user,
                                               expected_values=[self.study],
                                               request_params=request_params,
                                               partial_response=True)

        request_params = {
            CREATED_BEFORE_PARAM: everyone_write_study.created.mod_time
        }
        expected_values = [self.study, everyone_read_study, ]
        self._assert_authenticated_get_allowed(list_url,
                                               self.study_read_only_user,
                                               expected_values=expected_values,
                                               request_params=request_params,
                                               partial_response=True)

        request_params = {
            UPDATED_BEFORE_PARAM: self.study.updated.mod_time
        }
        expected_values = [everyone_read_study, everyone_write_study, ]
        self._assert_authenticated_get_allowed(list_url,
                                               self.study_read_only_user,
                                               expected_values=expected_values,
                                               request_params=request_params,
                                               partial_response=True)

    def test_study_detail_read_access(self):
        """
            Tests GET /rest/studies
        """

        # build up a list of all the valid URL's by which the study details can be accessed\
        study_detail_urls = UriBuilder(self.study, [], [])

        # test that permissions are applied consistently across each URL used to access the study
        for study_detail_url in study_detail_urls.detail_uris:
            self._enforce_study_read_access(study_detail_url, False, expected_values=self.study)

        # create / configure studies and related strains to test strain access via
        # the "everyone" permissions. Note these aren't included in setUpTestData() since that
        # config sets us up for initial tests for results where no strain access is allowed / no
        # results are returned.

        # everyone read
        everyone_read_study = factory.StudyFactory(name='Readable by everyone')
        everyone_read_study.everyonepermission_set.create(permission_type=StudyPermission.READ)

        everyone_read_uris = UriBuilder(everyone_read_study, [], [])
        for everyone_read_url in everyone_read_uris.detail_uris:

            # verify that an un-authenticated request gets a 404
            self._assert_unauthenticated_get_denied(everyone_read_url)

            self._assert_authenticated_get_allowed(everyone_read_url,
                                                   self.unprivileged_user,
                                                   expected_values=everyone_read_study,
                                                   partial_response=True)

        # everyone write
        everyone_write_study = factory.StudyFactory(name='Writable be everyone')
        everyone_write_study.everyonepermission_set.create(permission_type=StudyPermission.WRITE)

        everyone_write_uris = UriBuilder(everyone_write_study, [], [])
        for everyone_write_url in everyone_write_uris.detail_uris:

            # verify that an un-authenticated request gets a 404
            self._assert_unauthenticated_get_denied(everyone_write_url)

            # verify study-level "everyone" permissions allow access to view associated strains
            self._assert_authenticated_get_allowed(everyone_write_url,
                                                   self.unprivileged_user,
                                                   expected_values=everyone_write_study,
                                                   partial_response=True)


class StudyInternals(object):
    def __init__(self):
        self.line = None
        self.assay = None
        self.measurement = None
        self.measurement_val = None
        self.protocol = None
        self.protein = None
        self.metabolite = None
        self.base_uris = None
        self.study_based_uris = None
        self.detail_model = None

    def build_uris(self, study, deepest_model):
        if deepest_model == LINES_RESOURCE_NAME:
            self.detail_model = self.line
        elif deepest_model == ASSAYS_RESOURCE_NAME:
            self.detail_model = self.assay
        elif deepest_model == MEASUREMENTS_RESOURCE_NAME:
            self.detail_model = self.measurement
        else:  # deepest_model == VALUES_RESOURCE_NAME:
            self.detail_model = self.measurement_val

        orm_models = [self.detail_model]
        uri_elts = [deepest_model]

        self.base_uris = UriBuilder(None,
                                    nested_orm_models=orm_models,
                                    uri_elts=uri_elts)
        self.study_based_uris = UriBuilder(study,
                                           nested_orm_models=orm_models,
                                           uri_elts=uri_elts)


class StudyInternalsTestMixin(EddApiTestCaseMixin):
    """
    A helper class that supports testing REST API access to data considered to fall under a Study
    in the EDD ontology (e.g. Line, Assay, Measurement, MeasurementValue). The assumption of
    supporting test code is that each test sets up a similar test environment. The general
    process is:
    1) Create supporting database entries in the class-level setupTestData() method that are
    used to test list and detail views of the REST resource. This normally includes creating a
    single study and a set of users/groups
    to test access to it. Under the Study, ORM objects are created up to the level of
    detail needed to create a single active instance of the Django ORM model under test.
    2) Test user and group permissions to the resource, using common code to enforce consistency
    of permissions enforcement and return codes across all resources.
    """
    @classmethod
    def setUpTestData(cls):
        super(StudyInternalsTestMixin, cls).setUpTestData()

        # define placeholder data members to silence style checks for data members created in
        # create_study()
        cls.study = None
        cls.unprivileged_user = None
        cls.study_read_only_user = None
        cls.study_write_only_user = None
        cls.study_read_group_user = None
        cls.study_write_group_user = None
        cls.staff_user = None
        cls.staff_study_creator = None
        cls.staff_study_changer = None
        cls.staff_study_deleter = None
        cls.superuser = None

        cls.staff_creator = None
        cls.staff_changer = None
        cls.staff_deleter = None

    def inactive_model_factory(self):
        # must be overridden by children to create a sibling INactive model
        raise NotImplementedError()

    def sibling_model_factory(self):
        # must be overridde by children to create a sibling active model
        raise NotImplementedError()

    @property
    def resource_name(self):
        raise NotImplementedError()

    @property
    def privileged_base_list_values(self):
        """
        Returns the list of Django model objects expected in results returned when a privileged
        user accesses the base list resource, e.g. /rest/assays/.  Must be overridden by child
        classes for tests to work.
        """
        raise NotImplementedError()

    @property
    def unprivileged_base_list_values(self):
        """
        Returns the list of Django model objects expected in results returned when an unprivileged
        user accesses the base list resource, e.g. /rest/assays/.  Must be overridden by child
        classes for tests to work.
        """
        raise NotImplementedError()

    @property
    def privileged_study_list_values(self):
        """
        Returns the list of ORM model objects expected in results returned when a privileged
        user accesses the the study-based list resource, e.g. /rest/studies/{X}/assays. Must be
        overridden by child classes for tests to work.
        """
        raise NotImplementedError()

    @property
    def privileged_detail_results(self):
        """
        Returns the list of ORM model objects expected in results returned when a
        privileged user accesses detail resource, e.g. /rest/assays/{X). Must be overridden by
        child classes for tests to work.
        """
        raise NotImplementedError()

    @property
    def everyone_read_detail_uris(self):
        """
        Returns a UriBuilder containing all the valid URIs for accessing study internal details
        in the study with "everyone read" permission.
        """
        raise NotImplementedError()

    @property
    def everyone_write_detail_uris(self):
        """
        Returns a UriBuilder containing all the valid detail URIs for an instance of the
        Django model under test in the study with "everyone read" permission.
        """
        raise NotImplementedError()

    def test_list_read_access(self):
        """
            Tests GET resource list access, e.g. to /rest/assays/ and /rest/studies/{X}/assays/
        """

        ###########################################################################################
        # Test standard use cases for all REST resources...correct results and access privileges.
        # Note that if expected_list_values contains "everyone" read/write studies, those are
        # also tested here.
        ###########################################################################################
        self._enforce_study_internals_list(self.study_based_uris, True)
        self._enforce_study_internals_list(self.base_uris, False)

        ###########################################################################################
        # test resource-specific filtering options
        ###########################################################################################
        self.verify_filtering_options()

    def verify_filtering_options(self):
        """
        Placeholder method for children to implement for verifying resource-specific filtering
        options
        """
        pass

    def _enforce_study_internals_access(self, uri, is_list, study_based=True):
        """
           A helper method that does the work to test GET permissions for both list and detail
           views.
           :param study_based: True if the URI is of the form /rest/studies/{X}/... If so,
           no checks are performed for the detail view, since resources shouldn't be that deeply
           nested (e.g. no /rest/studies/{X}/lines/{Y}).
        """

        # verify that an un-authenticated request gets a 404
        self._assert_unauthenticated_get_denied(uri)

        if study_based:
            privileged_results = self.privileged_study_list_values if is_list else None
        else:
            privileged_results = (self.privileged_base_list_values if is_list
                                  else self.privileged_detail_results)
            unprivileged_list_results = (None if is_list else
                                         self.unprivileged_base_list_values)

        # enforce access denied behavior users without access to the enclosing study
        if is_list:
            if study_based:
                self._assert_authenticated_get_denied(uri, self.unprivileged_user)
                self._assert_authenticated_get_denied(uri, self.staff_user)
                self._assert_authenticated_get_denied(uri, self.staff_creator)
            else:
                self._assert_authenticated_get_allowed(uri,
                                                       self.unprivileged_user,
                                                       expected_values=unprivileged_list_results,
                                                       partial_response=True)
                self._assert_authenticated_get_allowed(uri,
                                                       self.staff_user,
                                                       expected_values=unprivileged_list_results,
                                                       partial_response=True)
                self._assert_authenticated_get_allowed(uri,
                                                       self.staff_creator,
                                                       expected_values=unprivileged_list_results,
                                                       partial_response=True)

        else:
            self._assert_authenticated_get_denied(uri, self.unprivileged_user)
            self._assert_authenticated_get_denied(uri, self.staff_user)
            self._assert_authenticated_get_denied(uri, self.staff_creator)

        # test that users / groups with read access can read study internals
        self._assert_authenticated_get_allowed(uri,
                                               self.study_read_only_user,
                                               expected_values=privileged_results,
                                               partial_response=True)

        self._assert_authenticated_get_allowed(uri,
                                               self.study_read_group_user,
                                               expected_values=privileged_results,
                                               partial_response=True)

        # verify that study write permissions imply read permissions on the internals
        self._assert_authenticated_get_allowed(uri,
                                               self.study_write_only_user,
                                               expected_values=privileged_results,
                                               partial_response=True)

        self._assert_authenticated_get_allowed(uri,
                                               self.study_write_group_user,
                                               expected_values=privileged_results,
                                               partial_response=True)

        # test that a superuser can access study data without any other privileges
        self._assert_authenticated_get_allowed(uri,
                                               self.superuser,
                                               expected_values=privileged_results,
                                               partial_response=True)

        # test that 'staff' users with class-level django.util.auth Study privileges have NO
        # implied permission on data stored within the study (those perms only apply to the
        # study title/description/contact).
        if is_list:
            if study_based:
                self._assert_authenticated_get_denied(uri, self.staff_study_changer)
                self._assert_authenticated_get_denied(uri, self.staff_study_creator)
                self._assert_authenticated_get_denied(uri, self.staff_study_deleter)
            else:
                self._assert_authenticated_get_allowed(uri,
                                                       self.staff_study_changer,
                                                       expected_values=unprivileged_list_results,
                                                       partial_response=True)
                self._assert_authenticated_get_allowed(uri,
                                                       self.staff_study_creator,
                                                       expected_values=unprivileged_list_results,
                                                       partial_response=True)
                self._assert_authenticated_get_allowed(uri,
                                                       self.staff_study_deleter,
                                                       expected_values=unprivileged_list_results,
                                                       partial_response=True)
        else:
            self._assert_authenticated_get_denied(uri, self.staff_study_changer)
            self._assert_authenticated_get_denied(uri, self.staff_study_creator)
            self._assert_authenticated_get_denied(uri, self.staff_study_deleter)

        # test that 'staff' users with class-level django.util.auth mutator privileges for the
        # requested ORM model class have permission on relevant objects even without study-based
        #  permissions
        if is_list:
            if study_based:
                self._assert_authenticated_get_denied(uri, self.staff_creator)
            else:
                self._assert_authenticated_get_allowed(uri,
                                                       self.staff_creator,
                                                       expected_values=unprivileged_list_results,
                                                       partial_response=True)
        else:
            self._assert_authenticated_get_denied(uri, self.staff_creator)

        self._assert_authenticated_get_allowed(uri,
                                               self.staff_changer,
                                               expected_values=privileged_results,
                                               partial_response=True)
        self._assert_authenticated_get_allowed(uri,
                                               self.staff_deleter,
                                               expected_values=privileged_results,
                                               partial_response=True)

    def _enforce_study_internals_list(self, uris, study_based):
        """
        A helper method that tests application of StudyPermissions, superuser status, and
        class-level django.contrib.auth permissions to access REST API resources.
        :param uris: uris to test
        :param study_based: True if provided URIs are under /rest/studies/{X}/, or False if they're
        base resources (e.g. /rest/assays/)
        """

        # test all the valid list URI's for this resource (e.g. bothe pk-based & UUID-based)
        for list_uri in uris.list_uris:
            self._enforce_study_internals_access(list_uri, True,
                                                 study_based=study_based)

            # test filtering based on study active status -- should return the same results as
            # before since the client has either asked for all results of this type,
            # or has specifically requested data in this study
            self.study.active = False
            self.study.save()
            self._enforce_study_internals_access(list_uri, True,
                                                 study_based=study_based)
            self.study.active = True
            self.study.save()

            # test that study-level "everyone" permissions, which will be accessed via different
            # URI's, are correctly applied

            if study_based:
                read_uris = self.everyone_read_resource.study_based_uris
                write_uris = self.everyone_write_resource.study_based_uris

                # everyone read
                read_orm_model = self.everyone_read_resource.detail_model
                self.assert_everyone_get_privileges(read_uris, False, [read_orm_model])

                # everyone write
                write_orm_model = self.everyone_write_resource.detail_model
                self.assert_everyone_get_privileges(write_uris, False, [write_orm_model])

            if not hasattr(self.detail_model, 'active'):  # MeasurementValue isn't an EDDObject!
                return

            # test that explicitly filtering by active=True status gives the same result as before
            active_resource_list = (self.privileged_study_list_values if study_based
                                    else self.privileged_base_list_values)
            request_params = {ACTIVE_STATUS_PARAM: QUERY_ACTIVE_OBJECTS_ONLY}
            self._assert_authenticated_get_allowed(list_uri, self.superuser,
                                                   request_params=request_params,
                                                   expected_values=active_resource_list,
                                                   partial_response=True)

            # create an inactive resource within the study that will show up in the list view
            inactive_resource = self.inactive_model_factory().detail_model

            # test that a default request still only returns the active objects
            self._assert_authenticated_get_allowed(list_uri, self.superuser,
                                                   expected_values=active_resource_list,
                                                   partial_response=True)

            # test that an explicit request for active resources only returns the active one
            request_params = {ACTIVE_STATUS_PARAM: QUERY_ACTIVE_OBJECTS_ONLY}
            self._assert_authenticated_get_allowed(list_uri, self.superuser,
                                                   expected_values=active_resource_list,
                                                   request_params=request_params,
                                                   partial_response=True)

            # test that an explicit request for INactive resources only returns the INactive one
            request_params = {ACTIVE_STATUS_PARAM: QUERY_INACTIVE_OBJECTS_ONLY}
            self._assert_authenticated_get_allowed(list_uri, self.superuser,
                                                   expected_values=[inactive_resource],
                                                   request_params=request_params,
                                                   partial_response=True)

            # delete inactive resources created for the purposes of the test...we don't want
            # them to interfere with subsequent iterations of enclosing loop or with other test
            # methods
            inactive_resource.delete()

    def test_detail_read_access(self):
        """
            Tests GET detail access, e.g. to /rest/assays/{X}/
        """

        # create a second active sibling model within the study so our tests of detail access can't
        # stumble on the same result as search without taking requested pk into
        # account...this happened during early tests!
        self.sibling_model_factory()

        # test that permissions are applied consistently across each URI used to access the
        # resource
        for detail_uri in self.base_uris.detail_uris:
            logger.debug('Testing detail access at GET %s' % detail_uri)
            self._enforce_study_internals_access(detail_uri, False,
                                                 study_based=False)

        # test that study-level "everyone" permissions are applied correctly for study internals
        read = self.everyone_read_resource
        self.assert_everyone_get_privileges(read.base_uris, True,
                                            read.detail_model)
        write = self.everyone_write_resource
        self.assert_everyone_get_privileges(write.base_uris, True,
                                            write.detail_model)

        # return early if the Django model being tested doesn't have an 'active' flag.
        # E.g. MeasurementValue.
        if not hasattr(self.detail_model, 'active'):
            return

        # test that a direct request for a resource returns it even if it's marked inactive
        # (which would hide it from the list view by default)
        inactive_resource_uris = self.inactive_model_factory()
        inactive_resource_uri = inactive_resource_uris.detail_uris[0]
        inactive_resource = inactive_resource_uris.detail_model

        logger.debug('testing inactive detail access at GET %s' % inactive_resource_uri)

        self._assert_authenticated_get_allowed(inactive_resource_uri,
                                               self.study_read_only_user,
                                               expected_values=inactive_resource,
                                               partial_response=True)

        # delete inactive resources created for the purposes of the test...we don't want
        # them to interfere with subsequent iterations of the test or with other test methods
        inactive_resource.delete()

    def assert_everyone_get_privileges(self, uri_builder, is_detail, expected_values):
        # test that every read/write permissions are enforced properly on nested study resources
        uris = uri_builder.detail_uris if is_detail else uri_builder.list_uris
        for uri in uris:
            logger.debug('Testing "everyone" GET access to %s' % uri)
            # verify that an un-authenticated request gets a 404`
            self._assert_unauthenticated_get_denied(uri)

            self._assert_authenticated_get_allowed(uri,
                                                   self.unprivileged_user,
                                                   expected_values=expected_values,
                                                   partial_response=True)

    def test_malformed_uri(self):
        """
        Tests that the API correctly identifies a client error in URI input, since code has
        to deliberately avoid a 500 error for invalid ID's
        """
        # build a URL with purposefully malformed study UUID
        line_list_pattern = '%(base_study_uri)s/%(study_uuid)s/%(nested_lines_uri)s/'
        uri = line_list_pattern % {
            'base_study_uri': STUDIES_RESOURCE_URI,
            'study_uuid': 'None',
            'nested_lines_uri': self.resource_name,
        }

        self._assert_unauthenticated_get_denied(uri)
        self._assert_authenticated_get_not_found(uri, self.unprivileged_user)
        self._assert_authenticated_get_not_found(uri, self.superuser)

        # build a URL with purposefully malformed study line UUID
        line_list_pattern = '%(base_uri)s/%(uuid)s/'
        uri = line_list_pattern % {
            'base_uri': STUDIES_RESOURCE_URI,
            'study_uuid': self.study.pk,
            'nested_lines_uri': self.resource_name,
            'uuid': 'None',
        }

        self._assert_unauthenticated_get_denied(uri)
        self._assert_authenticated_get_not_found(uri, self.unprivileged_user)
        self._assert_authenticated_get_not_found(uri, self.superuser)


class LinesTests(StudyInternalsTestMixin, APITestCase):
    """
    Tests access controls and HTTP return codes for GET requests to
    /rest/studies/{X}/lines/ (list)
    /rest/lines/{X} (list + detail view)
    """

    @classmethod
    def setUpTestData(cls):
        """
        Creates strains, users, and study/line combinations to test the REST resource's application
        of user permissions.
        """
        super(LinesTests, cls).setUpTestData()

        # create a study, associated users, permissions, and internals including a single
        # active Line
        cls.create_study(create_auth_perms_and_users=True)
        models = cls.create_study_internals(cls.study, LINES_RESOURCE_NAME, 'Active ')
        cls.parent_model = cls.study
        cls.detail_model = models.line

        # build up lists of all the valid URI's usable to access the line during the test
        cls.study_based_uris = models.study_based_uris
        cls.base_uris = models.base_uris

        # create class-level django.util.auth permissions for Lines. This isn't a normal use case,
        # but since EDD supports this configuration, it should be tested.
        cls.define_auth_perms_and_users('line')

        # create studies that use everyone read/write permissions to test Line access via those
        # permissions
        read_models, write_models = cls.create_everyone_studies(LINES_RESOURCE_NAME)
        cls.everyone_read_resource = read_models
        cls.everyone_write_resource = write_models

    @property
    def resource_name(self):
        return LINES_RESOURCE_NAME

    @property
    def privileged_detail_results(self):
        return self.detail_model

    @property
    def privileged_study_list_values(self):
        return [self.detail_model]

    @property
    def privileged_base_list_values(self):
        return [self.detail_model,
                self.everyone_read_resource.detail_model,
                self.everyone_write_resource.detail_model]

    @property
    def unprivileged_base_list_values(self):
        return [self.everyone_read_resource.detail_model,
                self.everyone_write_resource.detail_model]

    @property
    def values_converter(self):
        return line_to_json_dict

    def inactive_model_factory(self):
        # create an inactive assay
        inactive_line = self.study.line_set.create(name='Inactive line', active=False)
        return UriBuilder(None, nested_orm_models=[inactive_line], uri_elts=[LINES_RESOURCE_NAME])

    def sibling_model_factory(self):
        self.study.line_set.create(name='Study line 1')


class UriBuilder(object):
    """
    Builds valid URI's combinatorially for nested resources (e.g. using study slug/pk/uuid
    combinations). TODO: as an improvement, enable config-based random use of URL
    combinations...will significantly cut down on runtime for repetitive use.
    """
    def __init__(self, study, nested_orm_models, uri_elts):
        self.study = study
        self.nested_orm_models = nested_orm_models
        self.uri_elts = uri_elts

        self.list_uris = []
        self.detail_uris = None

        self._build_uri_combinations()

    @property
    def detail_model(self):
        return self.nested_orm_models[-1]

    def _build_uri_combinations(self):
        if self.study:
            _study_prefix = '/rest/studies/%s/'
            uri_prefixes = [_study_prefix % self.study.pk,
                            _study_prefix % self.study.uuid,
                            _study_prefix % self.study.slug]
        else:
            uri_prefixes = ['/rest/']

        for index, url_segment in enumerate(self.uri_elts):
            new_prefixes = []
            for prefix in uri_prefixes:
                resource = self.nested_orm_models[index]

                if index == (len(self.nested_orm_models) - 1):
                    self.list_uris.append(prefix + ('%s/' % url_segment))

                pk_uri = prefix + '%s/%s/' % (url_segment, resource.pk)
                new_prefixes.append(pk_uri)

                if hasattr(resource, 'uuid'):
                    uuid_uri = prefix + '%s/%s/' % (url_segment, resource.uuid)
                    new_prefixes.append(uuid_uri)

            uri_prefixes = new_prefixes

        self.detail_uris = uri_prefixes

        if not self.uri_elts:
            self.list_uris.append('/rest/study/')


class AssaysTests(StudyInternalsTestMixin, APITestCase):
    """
    Tests access controls, HTTP return codes, and content for GET requests to
    /rest/studies/{X}/assays/ (list) and
    /rest/assays/{X}/ (list + detail view)
    """
    @classmethod
    def setUpTestData(cls):
        super(AssaysTests, cls).setUpTestData()

        # create a study, associated users, permissions, and internals including a single
        # active Assay
        cls.create_study(create_auth_perms_and_users=True)
        models = cls.create_study_internals(cls.study, ASSAYS_RESOURCE_NAME, 'Active ')
        cls.parent_model = models.line
        cls.detail_model = models.assay
        cls.protocol = models.protocol

        # build up lists of all the valid URI's usable to access the assay during the test
        cls.study_based_uris = models.study_based_uris
        cls.base_uris = models.base_uris

        # create class-level django.util.auth permissions for Assays. This isn't a normal use case,
        # but since EDD supports this configuration, it should be tested.
        cls.define_auth_perms_and_users('assay')

        # create studies that use everyone read/write permissions to test Assay access via those
        # permissions
        read_models, write_models = cls.create_everyone_studies(ASSAYS_RESOURCE_NAME)
        cls.everyone_read_resource = read_models
        cls.everyone_write_resource = write_models

    @property
    def resource_name(self):
        return ASSAYS_RESOURCE_NAME

    @property
    def privileged_detail_results(self):
        return self.detail_model

    @property
    def privileged_study_list_values(self):
        return [self.detail_model]

    @property
    def privileged_base_list_values(self):
        return [self.detail_model,
                self.everyone_read_resource.detail_model,
                self.everyone_write_resource.detail_model]

    @property
    def unprivileged_base_list_values(self):
        return [self.everyone_read_resource.detail_model,
                self.everyone_write_resource.detail_model]

    @property
    def values_converter(self):
        return assay_to_json_dict

    def inactive_model_factory(self):
        # create an inactive assay
        inactive_assay = self.parent_model.assay_set.create(
            name='Inactive assay',
            protocol=self.protocol,
            active=False,
        )
        return UriBuilder(None,
                          nested_orm_models=[inactive_assay],
                          uri_elts=[ASSAYS_RESOURCE_NAME])

    def sibling_model_factory(self):
        self.parent_model.assay_set.create(
            name='Other active assay',
            protocol=self.protocol,
            active=True,
        )

    def verify_filtering_options(self):
        # create another assay using a different protocol so we can test protocol filtering
        protocol2 = Protocol.objects.create(
            name='JBEI Metabolomics',
            description='Metabolomics protocol used @ JBEI',
            owned_by=self.superuser,
        )

        metabolomics_assay = self.parent_model.assay_set.create(
            name='Metabolomics assay',
            protocol=protocol2,
            experimenter=self.study_write_only_user,
        )

        # test that single-value, protocol-based filtering works via both URIs for assays

        # /rest/assays/
        list_uri = self.base_uris.list_uris[0]
        self._verify_protocol_filtering(metabolomics_assay, protocol2, list_uri)

        # /rest/studies/{X}/assays
        list_uri = self.study_based_uris.list_uris[0]
        self._verify_protocol_filtering(metabolomics_assay, protocol2, list_uri)

    def _verify_protocol_filtering(self, metabolomics_assay, protocol2, list_uri):
        self._assert_authenticated_get_allowed(
            list_uri,
            self.superuser,
            expected_values=[metabolomics_assay],
            request_params={'protocol': protocol2.pk},
            partial_response=True)

        # test multi-value protocol filtering
        self._assert_authenticated_get_allowed(
            list_uri,
            self.superuser,
            expected_values=[metabolomics_assay],
            request_params={'protocol': [self.protocol.pk, protocol2.pk]},
            partial_response=True)


class MeasurementsTests(StudyInternalsTestMixin, APITestCase):
    """
    Tests access controls, HTTP return codes, and content for GET requests to
    /rest/studies/{X}/measurements/ (list) and
    /rest/measurements/{X}/ (list + detail view)
    """

    @classmethod
    def setUpTestData(cls):
        super(MeasurementsTests, cls).setUpTestData()

        # create a study, associated users, permissions, and internals including a single
        # active Measurement
        cls.create_study(create_auth_perms_and_users=True)
        models = cls.create_study_internals(cls.study, MEASUREMENTS_RESOURCE_NAME, 'Active ')
        cls.parent_model = models.assay
        cls.detail_model = models.measurement

        # save refs to other metadata created along the way to making our study
        cls.ethanol_metabolite = models.ethanol_metabolite
        cls.oxygen_metabolite = models.oxygen_metabolite
        cls.detection_units = models.detection_units
        cls.gram_per_liter_units = models.gram_per_liter_units
        cls.hour_units = models.hour_units
        cls.min_units = models.min_units
        cls.test_protein = models.protein

        # build up lists of all the valid URI's usable to access the measurement during the test
        cls.study_based_uris = models.study_based_uris
        cls.base_uris = models.base_uris

        # create class-level django.util.auth permissions for Measurements. This isn't a normal
        # use case, but since EDD supports this configuration, it should be tested.
        cls.define_auth_perms_and_users('measurement')

        read_models, write_models = cls.create_everyone_studies(MEASUREMENTS_RESOURCE_NAME)
        cls.everyone_read_resource = read_models
        cls.everyone_write_resource = write_models

    @property
    def resource_name(self):
        return MEASUREMENTS_RESOURCE_NAME

    @property
    def privileged_detail_results(self):
        return self.detail_model

    @property
    def privileged_study_list_values(self):
        return [self.detail_model]

    @property
    def privileged_base_list_values(self):
        return [self.detail_model,
                self.everyone_read_resource.detail_model,
                self.everyone_write_resource.detail_model]

    @property
    def unprivileged_base_list_values(self):
        return [self.everyone_read_resource.detail_model,
                self.everyone_write_resource.detail_model]

    @property
    def values_converter(self):
        return measurement_to_json_dict

    def inactive_model_factory(self):
        inactive_measurement = self.parent_model.measurement_set.create(
            experimenter=self.study_write_only_user,
            measurement_type=self.test_protein,
            x_units=self.detection_units,
            y_units=self.hour_units,
            compartment=_INTRACELLULAR,
            measurement_format=_SCALAR,
            active=False,
        )

        return UriBuilder(None,
                          nested_orm_models=[inactive_measurement],
                          uri_elts=[MEASUREMENTS_RESOURCE_NAME])

    def sibling_model_factory(self):
        return self.parent_model.measurement_set.create(
            experimenter=self.study_write_only_user,
            measurement_type=self.ethanol_metabolite,
            x_units=self.detection_units,
            y_units=self.min_units,
            compartment=_INTRACELLULAR,
            measurement_format=_VECTOR,
        )

    def verify_filtering_options(self):
        ###########################################################################################
        # Test measurement-specific filtering options
        ###########################################################################################

        # create a second measurement with different characteristics so we can tell that filters
        # are applied
        other_measurement = self.sibling_model_factory()

        # test that single-value measurement type filtering works
        list_uri = self.study_based_uris.list_uris[0]
        logger.debug('Testing filtering options at %s' % list_uri)
        self._assert_authenticated_get_allowed(
            list_uri,
            self.superuser,
            expected_values=[self.detail_model],
            request_params={'measurement_type': self.oxygen_metabolite.pk},
            partial_response=True)

        # test that single-value x-unit filtering works
        self._assert_authenticated_get_allowed(
            list_uri,
            self.superuser,
            expected_values=[self.detail_model],
            request_params={'x_units': self.gram_per_liter_units.pk},
            partial_response=True)

        # test that single-value y-unit filtering works
        self._assert_authenticated_get_allowed(
            list_uri,
            self.superuser,
            expected_values=[other_measurement],
            request_params={'y_units': self.min_units.pk},
            partial_response=True)

        # test that single-value cellular compartment filtering works
        self._assert_authenticated_get_allowed(
            list_uri,
            self.superuser,
            expected_values=[other_measurement],
            request_params={'compartment': _INTRACELLULAR},
            partial_response=True)

        # test that single-value measurement format filtering works
        self._assert_authenticated_get_allowed(
            list_uri,
            self.superuser,
            expected_values=[other_measurement],
            request_params={'meas_format': _VECTOR},
            partial_response=True)


class MeasurementValuesTests(StudyInternalsTestMixin, APITestCase):
    """
    Tests access controls, HTTP return codes, and content for GET requests to
    /rest/studies/{X}/values/ (list) and
    /rest/values/{X}/ (list + detail view)
    """

    @classmethod
    def setUpTestData(cls):
        """
        Creates strains, users, and study/line combinations to test the REST resource's application
        of user permissions.
        """
        super(MeasurementValuesTests, cls).setUpTestData()

        # create a study, associated users, permissions, and internals including a single
        # active Measurement
        cls.create_study(create_auth_perms_and_users=True)
        models = cls.create_study_internals(cls.study, VALUES_RESOURCE_NAME, 'Active ')
        cls.parent_model = models.measurement
        cls.detail_model = models.measurement_val
        cls.base_uris = models.base_uris
        cls.study_based_uris = models.study_based_uris

        # save refs to other metadata created along the way to making our study
        cls.ethanol_metabolite = models.ethanol_metabolite
        cls.oxygen_metabolite = models.oxygen_metabolite
        cls.detection_units = models.detection_units
        cls.gram_per_liter_units = models.gram_per_liter_units
        cls.hour_units = models.hour_units
        cls.min_units = models.min_units
        cls.test_protein = models.protein

        # build up lists of all the valid URI's usable to access the measurement during the test
        # cls.study_based_uris = models.study_based_uris
        # cls.base_uris = models.base_uris

        # create class-level django.util.auth permissions for Measurements. This isn't a normal
        # use case, but since EDD supports this configuration, it should be tested.
        cls.define_auth_perms_and_users('measurementvalue')

        read_models, write_models = cls.create_everyone_studies(VALUES_RESOURCE_NAME)
        cls.everyone_read_resource = read_models
        cls.everyone_write_resource = write_models

    @property
    def values_converter(self):
        return value_to_json_dict

    def inactive_model_factory(self):
        return None

    @property
    def resource_name(self):
        return MEASUREMENTS_RESOURCE_NAME

    @property
    def privileged_detail_results(self):
        return self.detail_model

    @property
    def privileged_study_list_values(self):
        return [self.detail_model]

    @property
    def privileged_base_list_values(self):
        return [self.detail_model,
                self.everyone_read_resource.detail_model,
                self.everyone_write_resource.detail_model]

    @property
    def unprivileged_base_list_values(self):
        return [self.everyone_read_resource.detail_model,
                self.everyone_write_resource.detail_model]

    def sibling_model_factory(self):
        self.parent_model.measurementvalue_set.create(x=[1], y=[2])


class EddObjectSearchTest(EddApiTestCaseMixin, APITestCase):
    """
    Tests search options for EDDObjects using /rest/lines/.  This test is an initial
    proof-of-concept/risk mitigation for related search options, and included tests should
    eventually be run individually on each EddObject API endpoint.
    """
    # TODO: generalize and run tests on each EDDObject endpoint.
    @property
    def values_converter(self):
        return line_to_json_dict

    @classmethod
    def setUpTestData(cls):
        """
        Creates strains, users, and study/line combinations to test the REST resource's application
        of user permissions.
        """
        super(EddObjectSearchTest, cls).setUpTestData()

        cls.create_study(create_auth_perms_and_users=True)

        # create class-level django.util.auth permissions for Assays. This isn't a normal use case,
        # but since EDD supports this configuration, it should be tested.
        cls.define_auth_perms_and_users('assay')

        cls.growth_temp = MetadataType.objects.get(type_name='Growth temperature',
                                                   for_context=MetadataType.LINE)

        # create some strains / lines in the study
        cls.study_strain1 = Strain(name='Study Strain 1',
                                   registry_id=UUID('f120a00f-8bc3-484d-915e-5afe9d890c5f'))
        cls.study_strain1.registry_url = 'https://registry-test.jbei.org/entry/55349'
        cls.study_strain1.save()

        cls.line = cls.study.line_set.create(
            name='Study strain1 line',
            description='Strain1 description123',
        )
        cls.line.strains.add(cls.study_strain1)
        cls.line.metadata_add(cls.growth_temp, 37)
        cls.line.save()

        cls.inactive_line = cls.study.line_set.create(
            name='Inactive line',
            active=False,
        )

    def test_edd_object_attr_search(self):
        """
        Tests GET /rest/search/ for metadata-based searching. Note that these searches
        are implemented nearly identically for every EddObject, so we can use
        this test as a verification that metadata searches work for all EddObject-based
        rest resources.  Ideally we'd test each separately, but having one test for
        starters is much more time efficient and eliminates most of the risk.
        """

        search_url = '%s/' % LINES_RESOURCE_URI

        # test that the default search filter returns only active lines.
        # Note: we'll use the superuser account for all of these tests since it needs fewer
        # queries.  There's a separate method to test permissions enforcement.
        search_params = {}
        expected_results = [self.line]
        self._assert_authenticated_search_allowed(search_url, self.superuser,
                                                  request_params=search_params,
                                                  expected_values=expected_results)

        # test that explicitly requesting only active lines returns the same result as the
        # default search
        search_params[ACTIVE_STATUS_PARAM] = QUERY_ACTIVE_OBJECTS_ONLY

        self._assert_authenticated_search_allowed(search_url, self.superuser,
                                                  request_params=search_params,
                                                  expected_values=expected_results)

        # test that searching for inactive lines works
        search_params[ACTIVE_STATUS_PARAM] = QUERY_INACTIVE_OBJECTS_ONLY
        expected_results = [self.inactive_line]
        self._assert_authenticated_search_allowed(search_url, self.superuser,
                                                  request_params=search_params,
                                                  expected_values=expected_results)

        # test that searching for all lines works
        search_params[ACTIVE_STATUS_PARAM] = QUERY_ANY_ACTIVE_STATUS
        expected_results = [self.line, self.inactive_line]
        self._assert_authenticated_search_allowed(search_url, self.superuser,
                                                  request_params=search_params,
                                                  expected_values=expected_results)

        # add another active line so we know name/description searches are actually applied
        self.study.line_set.create(name='Study no strain line', description='Description456 ')

        # test that the default name search is case insensitive
        search_params.pop(ACTIVE_STATUS_PARAM)
        search_params[NAME_REGEX_PARAM] = 'STRAIN1'
        expected_results = [self.line]
        self._assert_authenticated_search_allowed(search_url, self.superuser,
                                                  request_params=search_params,
                                                  expected_values=expected_results)

        # test that clients can configure whether the search is case sensitive
        search_params[NAME_REGEX_PARAM] = 'STRAIN1'
        search_params[CASE_SENSITIVE_PARAM] = True
        expected_results = []
        self._assert_authenticated_search_allowed(search_url, self.superuser,
                                                  request_params=search_params,
                                                  expected_values=expected_results)
        search_params.pop(NAME_REGEX_PARAM)
        search_params.pop(CASE_SENSITIVE_PARAM)

        # test that the default description search is case insensitive
        search_params[DESCRIPTION_REGEX_PARAM] = 'ION123'
        expected_results = [self.line]
        self._assert_authenticated_search_allowed(search_url, self.superuser,
                                                  request_params=search_params,
                                                  expected_values=expected_results)

        # test that case-sensitive search param also controls description search
        search_params[CASE_SENSITIVE_PARAM] = True
        expected_results = []
        self._assert_authenticated_search_allowed(search_url, self.superuser,
                                                  request_params=search_params,
                                                  expected_values=expected_results)
        search_params.pop(DESCRIPTION_REGEX_PARAM)
        search_params.pop(CASE_SENSITIVE_PARAM)

    def test_edd_objects_meta_search_regexes(self):
        # key lookup
        input = '11=200'
        match = _KEY_LOOKUP_PATTERN.match(input)
        self.assertTrue(match)
        self.assertEquals('11', match.group('key'))
        self.assertEquals('=', match.group('operator'))
        self.assertEquals('200', match.group('test'))

        # contains
        input = 'contains={18: 200}'
        match = _NON_KEY_LOOKUP_PATTERN.match(input)
        self.assertTrue(match)
        self.assertEquals('contains', match.group('operator'))
        self.assertEquals('{18: 200}', match.group('test'))

        # contained_by
        input = 'contained_by={18: 200}'
        match = _NON_KEY_LOOKUP_PATTERN.match(input)
        self.assertTrue(match)
        self.assertEquals('contained_by', match.group('operator'))
        self.assertEquals('{18: 200}', match.group('test'))

        # has_key
        input = 'has_key=18'
        match = _NON_KEY_LOOKUP_PATTERN.match(input)
        self.assertTrue(match)
        self.assertEquals('has_key', match.group('operator'))
        self.assertEquals('18', match.group('test'))

        # has_any_keys
        input = 'has_any_keys=[18, 10]'
        match = _NON_KEY_LOOKUP_PATTERN.match(input)
        self.assertTrue(match)
        self.assertEquals('has_any_keys', match.group('operator'))
        self.assertEquals('[18, 10]', match.group('test'))

        # has_keys
        input = 'has_keys=[18, 10]'
        match = _NON_KEY_LOOKUP_PATTERN.match(input)
        self.assertTrue(match)
        self.assertEquals('has_keys', match.group('operator'))
        self.assertEquals('[18, 10]', match.group('test'))

        # keys
        input = 'keys__overlap=[18, 10]'
        match = _NON_KEY_LOOKUP_PATTERN.match(input)
        self.assertTrue(match)
        self.assertEquals('keys__overlap', match.group('operator'))
        self.assertEquals('[18, 10]', match.group('test'))

        # values
        input = 'values__contains=[18, 10]'
        match = _NON_KEY_LOOKUP_PATTERN.match(input)
        self.assertTrue(match)
        self.assertEquals('values__contains', match.group('operator'))
        self.assertEquals('[18, 10]', match.group('test'))

    def test_edd_object_metadata_search(self):
        """
        Test metadata lookups supported in Django 1.11's HStoreField.  Note that examples
        here correspond to and are ordered according to examples in the Django HStoreField
        documentation.
        https://docs.djangoproject.com/en/1.11/ref/contrib/postgres/fields/#querying-hstorefield
        """

        unused_metadata = MetadataType.objects.get(type_name='Flask Volume')

        search_url = '%s/' % LINES_RESOURCE_URI

        search_params = {}
        _META_COMPARISON_KEY = 'meta'

        # add another active line so we know metadata searches are actually applied.
        # the line created in createTestData() only has growth temperature metadata
        shaking_speed = MetadataType.objects.get(type_name='Shaking speed',
                                                 for_context=MetadataType.LINE)

        _SHAKING_SPEED_VAL = '200'
        _EXP_GROWTH_TEMP = '37'
        line_with_shaking_speed = self.study.line_set.create(
            name='Study no strain line',
            description='Description456 ',
            meta_store={
                str(shaking_speed.pk): _SHAKING_SPEED_VAL,
                str(self.growth_temp.pk): _EXP_GROWTH_TEMP,
            })

        # line.metadata_add(shaking_speed, _SHAKING_SPEED_VAL)
        # line.save()

        # test that simple value equality comparison works
        search_params[_META_COMPARISON_KEY] = '%(meta_pk)s=%(val)s' % {
            'meta_pk': shaking_speed.pk,
            'val': _SHAKING_SPEED_VAL, }
        expected_results = [line_with_shaking_speed]
        self._assert_authenticated_search_allowed(search_url, self.superuser,
                                                  request_params=search_params,
                                                  expected_values=expected_results)

        # test that single-key 'contains' comparison works
        search_params[_META_COMPARISON_KEY] = '%s__contains=2' % shaking_speed.pk
        expected_results = [line_with_shaking_speed]
        self._assert_authenticated_search_allowed(search_url, self.superuser,
                                                  request_params=search_params,
                                                  expected_values=expected_results)

        # test that dict-based 'contains' comparison works
        search_params[_META_COMPARISON_KEY] = 'contains=%s' % json.dumps({
            shaking_speed.pk: _SHAKING_SPEED_VAL})
        expected_results = [line_with_shaking_speed]
        self._assert_authenticated_search_allowed(search_url, self.superuser,
                                                  request_params=search_params,
                                                  expected_values=expected_results)

        # test 'contained_by' comparison
        # test that dict-based 'contained_by' comparison works
        search_params[_META_COMPARISON_KEY] = 'contained_by=%s' % json.dumps({
            shaking_speed.pk: _SHAKING_SPEED_VAL,
            self.growth_temp.pk: _EXP_GROWTH_TEMP,
            unused_metadata.pk: 2})
        expected_results = [line_with_shaking_speed, self.line]
        self._assert_authenticated_search_allowed(search_url, self.superuser,
                                                  request_params=search_params,
                                                  expected_values=expected_results)

        # test 'has_key' comparison
        search_params[_META_COMPARISON_KEY] = 'has_key=%s' % self.growth_temp.pk
        expected_results = [self.line, line_with_shaking_speed]
        self._assert_authenticated_search_allowed(search_url, self.superuser,
                                                  request_params=search_params,
                                                  expected_values=expected_results)

        # test 'has_any_keys' comparison
        search_params[_META_COMPARISON_KEY] = 'has_any_keys=%s' % [self.growth_temp.pk]
        expected_results = [self.line, line_with_shaking_speed]
        self._assert_authenticated_search_allowed(search_url, self.superuser,
                                                  request_params=search_params,
                                                  expected_values=expected_results)

        # test 'has_keys' comparison
        search_params[_META_COMPARISON_KEY] = 'has_keys=%s' % [self.growth_temp.pk,
                                                               shaking_speed.pk]
        expected_results = [line_with_shaking_speed]
        self._assert_authenticated_search_allowed(search_url, self.superuser,
                                                  request_params=search_params,
                                                  expected_values=expected_results)

        # test 'keys' comparison
        search_params[_META_COMPARISON_KEY] = 'keys__overlap=%s' % [self.growth_temp.pk]
        expected_results = [self.line, line_with_shaking_speed]
        self._assert_authenticated_search_allowed(search_url, self.superuser,
                                                  request_params=search_params,
                                                  expected_values=expected_results)

        # test 'values' comparison
        search_params[_META_COMPARISON_KEY] = 'values__contains=%s' % json.dumps(
            [_SHAKING_SPEED_VAL])
        expected_results = [line_with_shaking_speed]
        self._assert_authenticated_search_allowed(search_url, self.superuser,
                                                  request_params=search_params,
                                                  expected_values=expected_results)

    def _assert_authenticated_search_allowed(self, url, user,
                                             expected_values=None,
                                             partial_response=True,
                                             request_params=None):
        """
        Overrides default values from the parent class to avoid repetetively passing the same
        values_converter and partial_response with repetitive calls
        """
        return super(EddObjectSearchTest, self)._assert_authenticated_search_allowed(
                url, user,
                expected_values=expected_values,
                partial_response=partial_response,
                request_params=request_params)


class EddObjectTimestampSearchTest(EddApiTestCaseMixin, APITestCase):
    """
    A test class class that using a fixture instead of code to build test data for searching
    EDDObject timestamps.
    """
    # Note: use a fixture to set explicit line timestamps assumed in this test. There's currently
    # no way to use the ORM API to reliably do this.  Note that initial tests of several methods
    # using the ORM worked, but only when the test method was run in isolation...not when run
    # in the larger context of this file.
    fixtures = ['main/rest_timestamp_search']

    @property
    def values_converter(self):
        return line_to_json_dict

    def test_eddobject_timestamp_search(self):

        search_url = '%s/' % LINES_RESOURCE_URI

        # get references to three lines with sequential timestamps
        line1 = Line.objects.get(pk=21)
        line2 = Line.objects.get(pk=22)
        line3 = Line.objects.get(pk=23)
        User = get_user_model()
        superuser = User.objects.get(pk=1)

        # test single-bounded search where inclusive start boundary is set
        search_params = {
            CREATED_AFTER_PARAM: line1.created.mod_time,
        }
        expected_values = [line1, line2, line3]
        self._assert_authenticated_search_allowed(search_url,
                                                  superuser,
                                                  request_params=search_params,
                                                  expected_values=expected_values)

        search_params = {
            UPDATED_AFTER_PARAM: line1.created.mod_time,
        }
        self._assert_authenticated_search_allowed(search_url,
                                                  superuser,
                                                  request_params=search_params,
                                                  expected_values=expected_values)

        # test single-bounded search where exclusive end boundary is set
        search_params = {
            CREATED_BEFORE_PARAM: line3.created.mod_time,
        }
        expected_values = [line1, line2, ]
        self._assert_authenticated_search_allowed(search_url, superuser,
                                                  request_params=search_params,
                                                  expected_values=expected_values)

        search_params = {
            UPDATED_BEFORE_PARAM: line3.updated.mod_time,
        }
        expected_values = [line2, line2, ]
        self._assert_authenticated_search_allowed(search_url, superuser,
                                                  request_params=search_params,
                                                  expected_values=expected_values)

        # for good measure, test searches bounded on both ends
        search_params = {
            CREATED_AFTER_PARAM: line1.created.mod_time,
            CREATED_BEFORE_PARAM: line2.created.mod_time,
        }
        self._assert_authenticated_search_allowed(search_url, superuser,
                                                  request_params=search_params,
                                                  expected_values=[line1])

        search_params = {
            UPDATED_AFTER_PARAM: line2.updated.mod_time,
            UPDATED_BEFORE_PARAM: line3.updated.mod_time,
        }
        self._assert_authenticated_search_allowed(search_url, superuser,
                                                  request_params=search_params,
                                                  expected_values=[line2])

    def _assert_authenticated_search_allowed(self, url, user,
                                             expected_values=None,
                                             partial_response=True,
                                             request_params=None):
        """
        Overrides default values from the parent class to avoid repetetively passing the same
        values_converter and partial_response with repetitive calls
        """
        return super(EddObjectTimestampSearchTest, self)._assert_authenticated_search_allowed(
                url, user,
                expected_values=expected_values,
                partial_response=partial_response,
                request_params=request_params)


def make_url_variants(list_url, edd_obj):
    pattern = list_url + '/%s/'

    return pattern % edd_obj.pk, pattern % str(edd_obj.uuid),
