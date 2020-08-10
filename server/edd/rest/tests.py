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

import codecs
import csv
import logging

from django.contrib.auth import get_user_model
from django.contrib.auth.models import Permission
from django.contrib.contenttypes.models import ContentType
from requests import codes
from rest_framework import status
from rest_framework.reverse import reverse
from rest_framework.test import APITestCase
from threadlocals.threadlocals import set_thread_variable

from edd.profile.factory import GroupFactory, UserFactory
from main import models
from main.tests import factory

logger = logging.getLogger(__name__)


def load_permissions(model, *codenames):
    ct = ContentType.objects.get_for_model(model)
    return list(Permission.objects.filter(content_type=ct, codename__in=codenames))


class EddApiTestCaseMixin:
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
        super().setUpClass()
        set_thread_variable("request", None)

    @classmethod
    def tearDownClass(cls):
        """
        Overrides the default Django TestCase to clear out the threadlocal request variable during
        class setUp and tearDown.
        """
        super().tearDownClass()
        set_thread_variable("request", None)

    def setUp(self):
        """
        Overrides the default Django TestCase to clear out the threadlocal request variable during
        test setUp and tearDown.
        """
        super().setUp()
        set_thread_variable("request", None)

    def tearDown(self):
        """
        Overrides the default Django TestCase to clear out the threadlocal request variable during
        test setUp and tearDown.
        """
        super().tearDown()
        set_thread_variable("request", None)

    def _check_status(self, response, expected_code):
        wsgi = response.wsgi_request
        self.assertEqual(
            response.status_code,
            expected_code,
            f"Received {response.status_code} instead of {expected_code} for "
            f"{wsgi.method} {wsgi.path} for user {wsgi.user}. "
            f"Response: {response.content}",
        )
        return response


class StudiesTests(EddApiTestCaseMixin, APITestCase):
    """
    Tests access controls and HTTP return codes for queries to the base /rest/studies REST API
    resource (not any nested resources).

    Studies should only be accessible by:
    1) Superusers
    2) Users who have explicit class-level mutator permissions on Studies via a
       django.contrib.auth permission. Any user with a class-level mutator
       permission has implied read permission on the study.
    3) Users who have explicit StudyPermission granted via their individual
       account or via user group membership.
    """

    @classmethod
    def setUpTestData(cls):
        super().setUpTestData()
        cls.read_only_group = GroupFactory()
        cls.write_only_group = GroupFactory()
        cls.superuser = UserFactory(is_superuser=True)
        cls.unprivileged_user = UserFactory()
        cls.readonly_user = UserFactory()
        cls.write_user = UserFactory()
        cls.group_readonly_user = UserFactory()
        cls.group_readonly_user.groups.add(cls.read_only_group)
        cls.group_write_user = UserFactory()
        cls.group_write_user.groups.add(cls.write_only_group)
        cls.staff_user = UserFactory(is_staff=True)
        cls.staff_user.user_permissions.add(
            *load_permissions(models.Study, "add_study", "change_study", "delete_study")
        )
        cls.study = factory.StudyFactory()
        cls.study.userpermission_set.create(
            user=cls.readonly_user, permission_type=models.StudyPermission.READ
        )
        cls.study.userpermission_set.create(
            user=cls.write_user, permission_type=models.StudyPermission.WRITE
        )
        cls.study.grouppermission_set.create(
            group=cls.read_only_group, permission_type=models.StudyPermission.READ
        )
        cls.study.grouppermission_set.create(
            group=cls.write_only_group, permission_type=models.StudyPermission.WRITE
        )

    def test_study_delete_with_anonymous(self):
        url = reverse("rest:studies-detail", args=[self.study.pk])
        self.client.logout()
        self._check_status(self.client.delete(url), status.HTTP_403_FORBIDDEN)

    def test_study_delete_with_unprivleged(self):
        url = reverse("rest:studies-detail", args=[self.study.pk])
        self.client.force_login(self.unprivileged_user)
        self._check_status(self.client.delete(url), status.HTTP_405_METHOD_NOT_ALLOWED)

    def test_study_delete_with_staff(self):
        url = reverse("rest:studies-detail", args=[self.study.pk])
        self.client.force_login(self.staff_user)
        self._check_status(self.client.delete(url), status.HTTP_405_METHOD_NOT_ALLOWED)

    def test_study_delete_with_superuser(self):
        url = reverse("rest:studies-detail", args=[self.study.pk])
        self.client.force_login(self.superuser)
        self._check_status(self.client.delete(url), status.HTTP_405_METHOD_NOT_ALLOWED)

    def _post_payload_new_study(self):
        return {
            "name": "new study 1",
            "description": "description goes here",
            "contact_id": self.write_user.pk,
        }

    def test_study_add_with_anonymous(self):
        url = reverse("rest:studies-list")
        self.client.logout()
        self._check_status(
            self.client.post(url, self._post_payload_new_study()),
            status.HTTP_403_FORBIDDEN,
        )

    def test_study_add_only_superuser_setting_off(self):
        url = reverse("rest:studies-list")
        with self.settings(EDD_ONLY_SUPERUSER_CREATE=False):
            # with normal settings, verify all users can create studies,
            # regardless of privileges
            self.client.force_login(self.unprivileged_user)
            self._check_status(
                self.client.post(url, self._post_payload_new_study()),
                status.HTTP_201_CREATED,
            )

    def test_study_add_with_unprivledged_only_superuser_setting_on(self):
        url = reverse("rest:studies-list")
        with self.settings(EDD_ONLY_SUPERUSER_CREATE=True):
            self.client.force_login(self.unprivileged_user)
            self._check_status(
                self.client.post(url, self._post_payload_new_study()),
                status.HTTP_403_FORBIDDEN,
            )

    def test_study_add_with_staff_only_superuser_setting_on(self):
        url = reverse("rest:studies-list")
        with self.settings(EDD_ONLY_SUPERUSER_CREATE=True):
            # staff with main.add_study cannot create with this setting
            self.client.force_login(self.staff_user)
            self._check_status(
                self.client.post(url, self._post_payload_new_study()),
                status.HTTP_403_FORBIDDEN,
            )

    def test_study_add_with_superuser_only_superuser_setting_on(self):
        url = reverse("rest:studies-list")
        with self.settings(EDD_ONLY_SUPERUSER_CREATE=True):
            # verify that an administrator can create a study
            self.client.force_login(self.superuser)
            self._check_status(
                self.client.post(url, self._post_payload_new_study()),
                status.HTTP_201_CREATED,
            )

    def test_study_add_with_unprivledged_only_superuser_setting_permission(self):
        url = reverse("rest:studies-list")
        with self.settings(EDD_ONLY_SUPERUSER_CREATE="permission"):
            self.client.force_login(self.unprivileged_user)
            self._check_status(
                self.client.post(url, self._post_payload_new_study()),
                status.HTTP_403_FORBIDDEN,
            )

    def test_study_add_with_staff_only_superuser_setting_permission(self):
        url = reverse("rest:studies-list")
        with self.settings(EDD_ONLY_SUPERUSER_CREATE="permission"):
            # staff with main.add_study can create with this setting
            self.client.force_login(self.staff_user)
            self._check_status(
                self.client.post(url, self._post_payload_new_study()),
                status.HTTP_201_CREATED,
            )

    def test_study_add_with_superuser_only_superuser_setting_permission(self):
        url = reverse("rest:studies-list")
        with self.settings(EDD_ONLY_SUPERUSER_CREATE="permission"):
            # verify that an administrator can create a study
            self.client.force_login(self.superuser)
            self._check_status(
                self.client.post(url, self._post_payload_new_study()),
                status.HTTP_201_CREATED,
            )

    def _put_payload_change_study(self):
        return {"name": "Test study", "description": "Description goes here"}

    def _put_payload_change_study_contact(self):
        return {
            "name": "Updated study name",
            "description": "Updated study description",
            "contact_id": self.write_user.pk,
        }

    def test_study_change_with_anonymous(self):
        url = reverse("rest:studies-detail", args=[self.study.pk])
        self.client.logout()
        self._check_status(
            self.client.put(url, self._put_payload_change_study()),
            status.HTTP_403_FORBIDDEN,
        )

    def test_study_change_with_unprivledged(self):
        url = reverse("rest:studies-detail", args=[self.study.pk])
        self.client.force_login(self.unprivileged_user)
        self._check_status(
            self.client.put(url, self._put_payload_change_study()),
            status.HTTP_404_NOT_FOUND,
        )

    def test_study_change_with_readonly(self):
        url = reverse("rest:studies-detail", args=[self.study.pk])
        self.client.force_login(self.readonly_user)
        self._check_status(
            self.client.put(url, self._put_payload_change_study()),
            status.HTTP_403_FORBIDDEN,
        )

    def test_study_change_with_write(self):
        url = reverse("rest:studies-detail", args=[self.study.pk])
        self.client.force_login(self.write_user)
        self._check_status(
            self.client.put(url, self._put_payload_change_study_contact()),
            status.HTTP_200_OK,
        )

    def test_study_change_with_readonly_group(self):
        url = reverse("rest:studies-detail", args=[self.study.pk])
        self.client.force_login(self.group_readonly_user)
        self._check_status(
            self.client.put(url, self._put_payload_change_study()),
            status.HTTP_403_FORBIDDEN,
        )

    def test_study_change_with_write_group(self):
        url = reverse("rest:studies-detail", args=[self.study.pk])
        self.client.force_login(self.group_write_user)
        self._check_status(
            self.client.put(url, self._put_payload_change_study_contact()),
            status.HTTP_200_OK,
        )

    def test_study_change_with_staff(self):
        url = reverse("rest:studies-detail", args=[self.study.pk])
        self.client.force_login(self.staff_user)
        self._check_status(
            self.client.put(url, self._put_payload_change_study_contact()),
            status.HTTP_404_NOT_FOUND,
        )

    def test_study_change_with_superuser(self):
        url = reverse("rest:studies-detail", args=[self.study.pk])
        # verify that an administrator can update
        self.client.force_login(self.superuser)
        self._check_status(
            self.client.put(url, self._put_payload_change_study_contact()),
            status.HTTP_200_OK,
        )

    def test_study_list_read_access_anonymous(self):
        url = reverse("rest:studies-list")
        self.client.logout()
        self._check_status(self.client.get(url), status.HTTP_403_FORBIDDEN)

    def test_study_list_read_access_unprivledged(self):
        url = reverse("rest:studies-list")
        self.client.force_login(self.unprivileged_user)
        self._check_status(self.client.get(url), status.HTTP_200_OK)


class ExportTests(EddApiTestCaseMixin, APITestCase):
    """Tests for expected outputs from /rest/export/"""

    def _setup_study_with_data_for_export(self):
        # create study and line with 30 assays
        # each assay with one measurement having one value
        self.study = factory.StudyFactory()
        self.line = factory.LineFactory(study=self.study)
        for _i in range(30):
            assay = factory.AssayFactory(line=self.line)
            measurement = factory.MeasurementFactory(assay=assay)
            factory.ValueFactory(measurement=measurement)

    def test_export_login_required(self):
        url = reverse("rest:export-list")
        response = self.client.get(url, {"line_id": 8})
        self.assertEqual(response.status_code, codes.forbidden)

    def test_export_output(self):
        url = reverse("rest:export-list")
        User = get_user_model()
        admin = User.objects.get(username="system")
        self.client.force_authenticate(user=admin)
        self._setup_study_with_data_for_export()
        # force request with small page_size to see paging of results
        response = self.client.get(url, {"line_id": self.line.pk, "page_size": 5})
        # read the CSV output
        reader = csv.reader(codecs.iterdecode(response.content.split(b"\n"), "utf8"))
        table = list(reader)
        # response has OK status
        self.assertEqual(response.status_code, codes.ok)
        # response has headers with link to following page
        self.assertRegex(
            response.get("Link"), r'<https?://.*/rest/export/\?.*>; rel="next"'
        )
        # response has correct Content-Type
        self.assertEqual(response.get("Content-Type"), "text/csv; charset=utf-8")
        # TODO update based on output config?
        self.assertListEqual(
            table[0],
            [
                "Study ID",
                "Study Name",
                "Line ID",
                "Line Name",
                "Line Description",
                "Protocol",
                "Assay ID",
                "Assay Name",
                "Formal Type",
                "Measurement Type",
                "Compartment",
                "Units",
                "Value",
                "Hours",
            ],
        )
        # one row for header, plus page_size==5 rows
        self.assertEqual(len(table), 6)


class EddObjectSearchTest(EddApiTestCaseMixin, APITestCase):
    """Tests search options for EDDObjects using /rest/lines/."""

    def test_line_list_with_superuser(self):
        url = reverse("rest:lines-list")
        self.client.force_login(UserFactory(is_superuser=True))
        self._check_status(self.client.get(url), status.HTTP_200_OK)
