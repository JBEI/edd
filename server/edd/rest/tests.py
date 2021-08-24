"""
Unit tests for EDD's REST API.

Note that tests here purposefully hard-code simple object serialization that's
also coded seperately in EDD's REST API. This should help to detect when REST
API code changes in EDD accidentally affect client code.
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
    Tests access controls and HTTP return codes for queries to REST API
    resources related to studies.

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

    def test_study_get_with_anonymous(self):
        url = reverse("rest:studies-detail", args=[self.study.pk])
        self.client.logout()
        self._check_status(self.client.get(url), status.HTTP_403_FORBIDDEN)

    def test_study_get_with_unprivleged(self):
        url = reverse("rest:studies-detail", args=[self.study.pk])
        self.client.force_login(self.unprivileged_user)
        self._check_status(self.client.get(url), status.HTTP_404_NOT_FOUND)

    def test_study_get_with_readonly(self):
        url = reverse("rest:studies-detail", args=[self.study.pk])
        self.client.force_login(self.readonly_user)
        self._check_status(self.client.get(url), status.HTTP_200_OK)

    def test_study_get_with_superuser(self):
        url = reverse("rest:studies-detail", args=[self.study.pk])
        self.client.force_login(self.superuser)
        self._check_status(self.client.get(url), status.HTTP_200_OK)

    def test_study_get_using_uuid(self):
        url = reverse("rest:studies-detail", args=[self.study.uuid])
        self.client.force_login(self.superuser)
        self._check_status(self.client.get(url), status.HTTP_200_OK)

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

    def test_study_add_without_contact(self):
        url = reverse("rest:studies-list")
        with self.settings(EDD_ONLY_SUPERUSER_CREATE=False):
            self.client.force_login(self.unprivileged_user)
            self._check_status(
                self.client.post(url, {"name": "contactless study", "description": ""}),
                status.HTTP_400_BAD_REQUEST,
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
    """
    Tests for expected outputs from /rest/export/ and /rest/stream-export/,
    with additional tests for basic functioning of /rest/assays,
    /rest/measurements, and /rest/values, since the data is already set up
    for handling the export.
    """

    @classmethod
    def setUpTestData(cls):
        super().setUpTestData()
        User = get_user_model()
        cls.admin = User.objects.get(username="system")
        # create study and line with 30 assays
        # each assay with one measurement having one value
        cls.study = factory.StudyFactory()
        cls.line = factory.LineFactory(study=cls.study)
        for _i in range(30):
            assay = factory.AssayFactory(line=cls.line)
            measurement = factory.MeasurementFactory(assay=assay)
            factory.ValueFactory(measurement=measurement)

    def _assert_row_is_header_row(self, row):
        # TODO update based on output config?
        self.assertListEqual(
            row,
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

    def _read_normal_response(self, response):
        # read the CSV output
        reader = csv.reader(codecs.iterdecode(response.content.split(b"\n"), "utf8"))
        # return as a list
        return list(reader)

    def _read_streaming_response(self, response):
        # read the CSV output from streaming_content (not response.content)
        reader = csv.reader(codecs.iterdecode(response.streaming_content, "utf8"))
        # return as a list
        return list(reader)

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

    def test_export_as_normal_user(self):
        url = reverse("rest:export-list")
        readonly_user = UserFactory()
        self.study.userpermission_set.create(
            user=readonly_user, permission_type=models.StudyPermission.READ
        )
        self.client.force_authenticate(user=readonly_user)
        # request using slug instead of ID
        response = self.client.get(url, {"in_study": self.study.slug})
        # validate
        table = self._read_normal_response(response)
        self.assertEqual(response.status_code, codes.ok)
        self.assertEqual(response.get("Content-Type"), "text/csv; charset=utf-8")
        self._assert_row_is_header_row(table[0])

    def test_export_using_in_study_slug(self):
        url = reverse("rest:export-list")
        self.client.force_authenticate(user=self.admin)
        # request using slug instead of ID
        response = self.client.get(url, {"in_study": self.study.slug})
        # validate
        table = self._read_normal_response(response)
        self.assertEqual(response.status_code, codes.ok)
        self.assertEqual(response.get("Content-Type"), "text/csv; charset=utf-8")
        self._assert_row_is_header_row(table[0])

    def test_export_using_in_study_pk(self):
        url = reverse("rest:export-list")
        self.client.force_authenticate(user=self.admin)
        # request using slug instead of ID
        response = self.client.get(url, {"in_study": self.study.pk})
        # validate
        table = self._read_normal_response(response)
        self.assertEqual(response.status_code, codes.ok)
        self.assertEqual(response.get("Content-Type"), "text/csv; charset=utf-8")
        self._assert_row_is_header_row(table[0])

    def test_export_using_in_study_uuid(self):
        url = reverse("rest:export-list")
        self.client.force_authenticate(user=self.admin)
        # request using slug instead of ID
        response = self.client.get(url, {"in_study": self.study.uuid})
        # validate
        table = self._read_normal_response(response)
        self.assertEqual(response.status_code, codes.ok)
        self.assertEqual(response.get("Content-Type"), "text/csv; charset=utf-8")
        self._assert_row_is_header_row(table[0])

    def test_export_output_all(self):
        url = reverse("rest:export-list")
        self.client.force_authenticate(user=self.admin)
        # force request with big page size to get all in one response
        response = self.client.get(url, {"line_id": self.line.pk, "page_size": 50})
        # validate
        table = self._read_normal_response(response)
        self.assertEqual(response.status_code, codes.ok)
        self.assertIsNone(response.get("Link"))
        self.assertEqual(response.get("Content-Type"), "text/csv; charset=utf-8")
        self._assert_row_is_header_row(table[0])
        # one row for header, plus 30 assays/measurements
        self.assertEqual(len(table), 31)

    def test_export_output_first_page(self):
        url = reverse("rest:export-list")
        self.client.force_authenticate(user=self.admin)
        # force request with small page_size to see paging of results
        response = self.client.get(url, {"line_id": self.line.pk, "page_size": 5})
        # validate
        table = self._read_normal_response(response)
        self.assertEqual(response.status_code, codes.ok)
        self.assertRegex(
            response.get("Link"), r'<https?://.*/rest/export/\?.*>; rel="next"'
        )
        self.assertEqual(response.get("Content-Type"), "text/csv; charset=utf-8")
        self._assert_row_is_header_row(table[0])
        # one row for header, plus page_size==5 rows
        self.assertEqual(len(table), 6)

    def test_export_output_last_page(self):
        url = reverse("rest:export-list")
        self.client.force_authenticate(user=self.admin)
        # force request with small page_size to see paging of results
        response = self.client.get(
            url, {"line_id": self.line.pk, "page_size": 5, "page": 6}
        )
        # validate
        table = self._read_normal_response(response)
        self.assertEqual(response.status_code, codes.ok)
        self.assertRegex(
            response.get("Link"), r'<https?://.*/rest/export/\?.*>; rel="prev"'
        )
        self.assertEqual(response.get("Content-Type"), "text/csv; charset=utf-8")
        self._assert_row_is_header_row(table[0])
        # one row for header, plus page_size==5 rows
        self.assertEqual(len(table), 6)

    def test_export_streaming(self):
        url = reverse("rest:stream-export-list")
        self.client.force_authenticate(user=self.admin)
        response = self.client.get(url, {"line_id": self.line.pk})
        # validate
        table = self._read_streaming_response(response)
        self.assertEqual(response.status_code, codes.ok)
        self.assertEqual(response.get("Content-Type"), "text/csv; charset=utf-8")
        self._assert_row_is_header_row(table[0])
        # one row for header, plus 30 assays/measurements
        self.assertEqual(len(table), 31)

    def test_assays_list(self):
        url = reverse("rest:assays-list")
        self.client.force_login(self.admin)
        response = self.client.get(url, {"in_study": self.study.slug})
        self._check_status(response, status.HTTP_200_OK)
        assert response.data["count"] == 30

    def test_measurements_list(self):
        url = reverse("rest:measurements-list")
        self.client.force_login(self.admin)
        response = self.client.get(url, {"in_study": self.study.slug})
        self._check_status(response, status.HTTP_200_OK)
        assert response.data["count"] == 30

    def test_values_list(self):
        url = reverse("rest:values-list")
        self.client.force_login(self.admin)
        response = self.client.get(url, {"in_study": self.study.slug})
        self._check_status(response, status.HTTP_200_OK)
        assert response.data["count"] == 30


class LinesTests(EddApiTestCaseMixin, APITestCase):
    """
    Tests access controls and HTTP return codes for queries to REST API
    resources related to lines.
    """

    @classmethod
    def setUpTestData(cls):
        super().setUpTestData()
        cls.readonly_user = UserFactory()
        cls.study = factory.StudyFactory()
        cls.study.userpermission_set.create(
            user=cls.readonly_user, permission_type=models.StudyPermission.READ
        )
        cls.strains = [
            factory.StrainFactory(),
            factory.StrainFactory(),
            factory.StrainFactory(),
        ]
        for i in range(10):
            line = factory.LineFactory(study=cls.study)
            line.strains.add(cls.strains[i % len(cls.strains)])

    def test_lines_list_no_filter(self):
        url = reverse("rest:lines-list")
        self.client.force_login(self.readonly_user)
        response = self.client.get(url)
        self._check_status(response, status.HTTP_200_OK)
        assert "count" in response.data

    def test_lines_list_filter_by_slug(self):
        url = reverse("rest:lines-list")
        self.client.force_login(self.readonly_user)
        response = self.client.get(url, {"in_study": self.study.slug})
        self._check_status(response, status.HTTP_200_OK)
        assert response.data["count"] == 10

    def test_lines_list_filter_by_pk(self):
        url = reverse("rest:lines-list")
        self.client.force_login(self.readonly_user)
        response = self.client.get(url, {"in_study": self.study.pk})
        self._check_status(response, status.HTTP_200_OK)
        assert response.data["count"] == 10

    def test_lines_list_filter_by_uuid(self):
        url = reverse("rest:lines-list")
        self.client.force_login(self.readonly_user)
        response = self.client.get(url, {"in_study": self.study.uuid})
        self._check_status(response, status.HTTP_200_OK)
        assert response.data["count"] == 10

    def test_lines_list_filter_by_strain_uuid(self):
        url = reverse("rest:lines-list")
        self.client.force_login(self.readonly_user)
        response = self.client.get(url, {"strain": self.strains[0].registry_id})
        self._check_status(response, status.HTTP_200_OK)
        # first strain will appear for 0th, 3rd, 6th, 9th
        assert response.data["count"] == 4

    def test_lines_list_filter_by_strain_url(self):
        url = reverse("rest:lines-list")
        self.client.force_login(self.readonly_user)
        response = self.client.get(url, {"strain": self.strains[1].registry_url})
        self._check_status(response, status.HTTP_200_OK)
        # second strain will appear for 1st, 4th, 7th
        assert response.data["count"] == 3

    def test_lines_list_filter_by_strain_multiples(self):
        url = reverse("rest:lines-list")
        self.client.force_login(self.readonly_user)
        response = self.client.get(
            url,
            {
                "strain": f"{self.strains[0].registry_url},{self.strains[1].registry_id}",
            },
        )
        self._check_status(response, status.HTTP_200_OK)
        # first and second strain cover seven of the lines
        assert response.data["count"] == 7


class MiscellanyTests(EddApiTestCaseMixin, APITestCase):
    """
    Collection of tests that should not require any special setup, querying
    the bootstrap data of EDD.
    """

    @classmethod
    def setUpTestData(cls):
        super().setUpTestData()
        User = get_user_model()
        cls.admin = User.objects.get(username="system")

    def test_metadata_types_list(self):
        url = reverse("rest:metadata_types-list")
        self.client.force_login(self.admin)
        response = self.client.get(url)
        self._check_status(response, status.HTTP_200_OK)
        assert "count" in response.data

    def test_types_list(self):
        url = reverse("rest:types-list")
        self.client.force_login(self.admin)
        response = self.client.get(url)
        self._check_status(response, status.HTTP_200_OK)
        assert "count" in response.data

    def test_units_list(self):
        url = reverse("rest:units-list")
        self.client.force_login(self.admin)
        response = self.client.get(url)
        self._check_status(response, status.HTTP_200_OK)
        assert "count" in response.data

    def test_users_list(self):
        url = reverse("rest:users-list")
        self.client.force_login(self.admin)
        response = self.client.get(url)
        self._check_status(response, status.HTTP_200_OK)
        assert "count" in response.data
