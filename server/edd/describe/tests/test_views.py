import io
from http import HTTPStatus

from django.urls import reverse

from edd import TestCase
from edd.profile.factory import UserFactory
from main import models as main_models
from main.tests import factory as main_factory

from . import factory

XLSX_CONTENT_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"


class ViewTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        super().setUpTestData()
        cls.user = UserFactory()
        cls.study = factory.StudyFactory()
        cls.study_kwargs = {"slug": cls.study.slug}
        cls.study.userpermission_set.update_or_create(
            permission_type=main_models.StudyPermission.WRITE, user=cls.user
        )

    def test_get_global_HelpView(self):
        response = self.client.get(reverse("describe_flat:help"))
        self.assertEqual(response.status_code, HTTPStatus.OK)
        self.assertTemplateUsed(response, "edd/describe/help.html")

    def test_get_scoped_HelpView(self):
        self.client.force_login(self.user)
        url = reverse("main:describe:help", kwargs=self.study_kwargs)
        response = self.client.get(url)
        self.assertEqual(response.status_code, HTTPStatus.OK)
        self.assertTemplateUsed(response, "edd/describe/help.html")

    def test_get_global_ice_view_redirects_anonymous(self):
        folder_url = reverse("describe_flat:folder")
        response = self.client.get(folder_url, follow=True)
        login_url = reverse("account_login")
        self.assertRedirects(response, f"{login_url}?next={folder_url}")

    def test_get_DescribeView_no_permission(self):
        other_user = UserFactory()
        self.client.force_login(other_user)
        url = reverse("main:describe:describe", kwargs=self.study_kwargs)
        response = self.client.get(url)
        self.assertEqual(response.status_code, HTTPStatus.NOT_FOUND)

    def test_get_DescribeView_readonly(self):
        other_user = UserFactory()
        self.study.userpermission_set.update_or_create(
            permission_type=main_models.StudyPermission.READ, user=other_user
        )
        self.client.force_login(other_user)
        url = reverse("main:describe:describe", kwargs=self.study_kwargs)
        response = self.client.get(url)
        self.assertEqual(response.status_code, HTTPStatus.FORBIDDEN)

    def test_get_DescribeView_writer(self):
        self.client.force_login(self.user)
        url = reverse("main:describe:describe", kwargs=self.study_kwargs)
        response = self.client.get(url)
        self.assertEqual(response.status_code, HTTPStatus.OK)
        self.assertTemplateUsed(response, "edd/describe/combos.html")

    def test_post_DescribeView_no_permission(self):
        other_user = UserFactory()
        self.client.force_login(other_user)
        url = reverse("main:describe:describe", kwargs=self.study_kwargs)
        response = self.client.post(url)
        self.assertEqual(response.status_code, HTTPStatus.NOT_FOUND)

    def test_post_DescribeView_readonly(self):
        other_user = UserFactory()
        self.study.userpermission_set.update_or_create(
            permission_type=main_models.StudyPermission.READ, user=other_user
        )
        self.client.force_login(other_user)
        url = reverse("main:describe:describe", kwargs=self.study_kwargs)
        response = self.client.post(url)
        self.assertEqual(response.status_code, HTTPStatus.FORBIDDEN)

    def test_post_DescribeView_writer_empty(self):
        self.client.force_login(self.user)
        url = reverse("main:describe:describe", kwargs=self.study_kwargs)
        response = self.client.post(url)
        # TODO: this describes current behavior!
        # it should return HTTPStatus.BAD_REQUEST
        # with details on why an empty request is bad m'kay
        self.assertEqual(response.status_code, HTTPStatus.INTERNAL_SERVER_ERROR)

    def test_post_DescribeView_writer_json(self):
        self.client.force_login(self.user)
        url = reverse("main:describe:describe", kwargs=self.study_kwargs)
        # minimal JSON from front-end
        payload = rb"""
            {
                "name_elements":{
                    "elements":["replicate_num"]
                },
                "custom_name_elts":{},
                "replicate_count":1,
                "combinatorial_line_metadata":{},
                "common_line_metadata":{}
            }
            """
        response = self.client.post(
            url, payload.strip(), content_type="application/json"
        )
        self.assertEqual(response.status_code, HTTPStatus.OK)
        self.assertEqual(self.study.line_set.count(), 1)

    def test_post_DescribeView_writer_csv(self):
        self.client.force_login(self.user)
        url = reverse("main:describe:describe", kwargs=self.study_kwargs)
        # minimal description of two lines
        file = io.BytesIO(b"Line Name,\nfoo,\nbar,")
        file.name = "description.csv"
        file.content_type = "text/csv"
        payload = {"file": file}
        response = self.client.post(url, payload)
        self.assertEqual(response.status_code, HTTPStatus.OK)
        self.assertEqual(self.study.line_set.count(), 2)

    def test_post_DescribeView_writer_xlsx(self):
        self.client.force_login(self.user)
        url = reverse("main:describe:describe", kwargs=self.study_kwargs)
        filename = "ExperimentDescription_simple.xlsx"
        with main_factory.load_test_file(filename) as fp:
            file = io.BytesIO(fp.read())
        file.name = filename
        file.content_type = XLSX_CONTENT_TYPE
        payload = {"file": file}
        response = self.client.post(url, payload)
        self.assertEqual(response.status_code, HTTPStatus.OK)
        self.assertEqual(self.study.line_set.count(), 2)

    def test_post_DescribeView_writer_invalid_contenttype(self):
        self.client.force_login(self.user)
        url = reverse("main:describe:describe", kwargs=self.study_kwargs)
        # minimal description of two lines
        file = io.BytesIO(b"")
        file.name = "testfile.docx"
        file.content_type = "application/octet-stream"
        payload = {"file": file}
        response = self.client.post(url, payload)
        self.assertEqual(response.status_code, HTTPStatus.BAD_REQUEST)

    def test_post_DescribeView_writer_xlsx_double_import(self):
        # run test_post_DescribeView_writer_xlsx
        self.test_post_DescribeView_writer_xlsx()
        # then do its insides again, checking for errors
        url = reverse("main:describe:describe", kwargs=self.study_kwargs)
        filename = "ExperimentDescription_simple.xlsx"
        with main_factory.load_test_file(filename) as fp:
            file = io.BytesIO(fp.read())
        file.name = filename
        file.content_type = XLSX_CONTENT_TYPE
        payload = {"file": file}
        response = self.client.post(url, payload)
        self.assertEqual(response.status_code, HTTPStatus.BAD_REQUEST)
        self.assertEqual(self.study.line_set.count(), 2)
        messages = response.json()
        self.assertIn("errors", messages)
        self.assertEqual(len(messages["errors"]), 1)
        self.assertEqual(messages["errors"][0]["category"], "Non-unique line names")

    def test_post_DescribeView_writer_xlsx_bad_headers(self):
        self.client.force_login(self.user)
        url = reverse("main:describe:describe", kwargs=self.study_kwargs)
        filename = "ExperimentDescription_bad_headers.xlsx"
        with main_factory.load_test_file(filename) as fp:
            file = io.BytesIO(fp.read())
        file.name = filename
        file.content_type = XLSX_CONTENT_TYPE
        payload = {"file": file}
        response = self.client.post(url, payload)
        self.assertEqual(response.status_code, HTTPStatus.OK)
        self.assertEqual(self.study.line_set.count(), 2)
        messages = response.json()
        self.assertNotIn("errors", messages)
        self.assertIn("warnings", messages)
        self.assertEqual(messages["warnings"][0]["category"], "User input ignored")

    def test_post_DescribeView_writer_xlsx_bad_values(self):
        self.client.force_login(self.user)
        url = reverse("main:describe:describe", kwargs=self.study_kwargs)
        filename = "ExperimentDescription_bad_values.xlsx"
        with main_factory.load_test_file(filename) as fp:
            file = io.BytesIO(fp.read())
        file.name = filename
        file.content_type = XLSX_CONTENT_TYPE
        payload = {"file": file}
        response = self.client.post(url, payload)
        self.assertEqual(response.status_code, HTTPStatus.BAD_REQUEST)
        self.assertEqual(self.study.line_set.count(), 0)
        messages = response.json()
        self.assertIn("errors", messages)
        self.assertIn("warnings", messages)
        self.assertEqual(len(messages["errors"]), 2)
        self.assertEqual(
            {"Incorrect file format", "Invalid values"},
            {err["category"] for err in messages["errors"]},
        )
