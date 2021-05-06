import io
from unittest.mock import patch

from django.urls import reverse
from requests import codes

from edd import TestCase
from edd.profile.factory import UserFactory
from main import models
from main.tests import factory

XLSX_CONTENT_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"


class ViewTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        super().setUpTestData()
        cls.user = UserFactory()
        cls.study = factory.StudyFactory()
        cls.study_kwargs = {"slug": cls.study.slug}
        cls.study.userpermission_set.update_or_create(
            permission_type=models.StudyPermission.WRITE, user=cls.user
        )

    def test_get_global_HelpView(self):
        response = self.client.get(reverse("main:describe_flat:help"))
        self.assertEqual(response.status_code, codes.ok)
        self.assertTemplateUsed(response, "edd/describe/help.html")

    def test_get_scoped_HelpView(self):
        self.client.force_login(self.user)
        url = reverse("main:describe:help", kwargs=self.study_kwargs)
        response = self.client.get(url)
        self.assertEqual(response.status_code, codes.ok)
        self.assertTemplateUsed(response, "edd/describe/help.html")

    def test_get_global_ice_view_redirects_anonymous(self):
        folder_url = reverse("main:describe_flat:folder")
        response = self.client.get(folder_url, follow=True)
        login_url = reverse("account_login")
        self.assertRedirects(response, f"{login_url}?next={folder_url}")

    @patch("edd.describe.views.create_ice_connection")
    def test_get_global_IceFolderView_found(self, connector):
        self.client.force_login(self.user)
        # to avoid populating testing ICE with specific data
        # fake the connection
        ice = connector.return_value
        folder = ice.folder_from_url.return_value
        folder.to_json_dict.return_value = {"id": 1234, "name": "fake"}
        response = self.client.get(reverse("main:describe_flat:folder"))
        self.assertEqual(response.status_code, codes.ok)

    @patch("edd.describe.views.create_ice_connection")
    def test_get_global_IceFolderView_missing(self, connector):
        self.client.force_login(self.user)
        # to avoid populating testing ICE with specific data
        # fake the connection
        ice = connector.return_value
        ice.folder_from_url.return_value = None
        response = self.client.get(reverse("main:describe_flat:folder"))
        self.assertEqual(response.status_code, codes.not_found)

    @patch("edd.describe.views.create_ice_connection")
    def test_get_global_IceFolderView_error(self, connector):
        self.client.force_login(self.user)
        # to avoid triggering a real error
        # fake the connection raising an error
        connector.side_effect = ValueError()
        response = self.client.get(reverse("main:describe_flat:folder"))
        self.assertEqual(response.status_code, codes.internal_server_error)

    @patch("edd.describe.views.create_ice_connection")
    def test_get_scoped_IceFolderView_found(self, connector):
        self.client.force_login(self.user)
        # to avoid populating testing ICE with specific data
        # fake the connection
        ice = connector.return_value
        folder = ice.folder_from_url.return_value
        folder.to_json_dict.return_value = {"id": 1234, "name": "fake"}
        url = reverse("main:describe:folder", kwargs=self.study_kwargs)
        response = self.client.get(url)
        self.assertEqual(response.status_code, codes.ok)

    @patch("edd.describe.views.create_ice_connection")
    def test_get_scoped_IceFolderView_missing(self, connector):
        self.client.force_login(self.user)
        # to avoid populating testing ICE with specific data
        # fake the connection
        ice = connector.return_value
        ice.folder_from_url.return_value = None
        url = reverse("main:describe:folder", kwargs=self.study_kwargs)
        response = self.client.get(url)
        self.assertEqual(response.status_code, codes.not_found)

    @patch("edd.describe.views.create_ice_connection")
    def test_get_scoped_IceFolderView_error(self, connector):
        self.client.force_login(self.user)
        # to avoid triggering a real error
        # fake the connection raising an error
        connector.side_effect = ValueError()
        url = reverse("main:describe:folder", kwargs=self.study_kwargs)
        response = self.client.get(url)
        self.assertEqual(response.status_code, codes.internal_server_error)

    def test_get_DescribeView_no_permission(self):
        other_user = UserFactory()
        self.client.force_login(other_user)
        url = reverse("main:describe:describe", kwargs=self.study_kwargs)
        response = self.client.get(url)
        self.assertEqual(response.status_code, codes.not_found)

    def test_get_DescribeView_readonly(self):
        other_user = UserFactory()
        self.study.userpermission_set.update_or_create(
            permission_type=models.StudyPermission.READ, user=other_user
        )
        self.client.force_login(other_user)
        url = reverse("main:describe:describe", kwargs=self.study_kwargs)
        response = self.client.get(url)
        self.assertEqual(response.status_code, codes.forbidden)

    def test_get_DescribeView_writer(self):
        self.client.force_login(self.user)
        url = reverse("main:describe:describe", kwargs=self.study_kwargs)
        response = self.client.get(url)
        self.assertEqual(response.status_code, codes.ok)
        self.assertTemplateUsed(response, "edd/describe/combos.html")

    def test_post_DescribeView_no_permission(self):
        other_user = UserFactory()
        self.client.force_login(other_user)
        url = reverse("main:describe:describe", kwargs=self.study_kwargs)
        response = self.client.post(url)
        self.assertEqual(response.status_code, codes.not_found)

    def test_post_DescribeView_readonly(self):
        other_user = UserFactory()
        self.study.userpermission_set.update_or_create(
            permission_type=models.StudyPermission.READ, user=other_user
        )
        self.client.force_login(other_user)
        url = reverse("main:describe:describe", kwargs=self.study_kwargs)
        response = self.client.post(url)
        self.assertEqual(response.status_code, codes.forbidden)

    def test_post_DescribeView_writer_empty(self):
        self.client.force_login(self.user)
        url = reverse("main:describe:describe", kwargs=self.study_kwargs)
        response = self.client.post(url)
        # TODO: this describes current behavior!
        # it should return codes.bad_request
        # with details on why an empty request is bad m'kay
        self.assertEqual(response.status_code, codes.internal_server_error)

    def test_post_DescribeView_writer_json(self):
        self.client.force_login(self.user)
        url = reverse("main:describe:describe", kwargs=self.study_kwargs)
        # minimal JSON from front-end
        payload = br"""
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
        self.assertEqual(response.status_code, codes.ok)
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
        self.assertEqual(response.status_code, codes.ok)
        self.assertEqual(self.study.line_set.count(), 2)

    def test_post_DescribeView_writer_xlsx(self):
        self.client.force_login(self.user)
        url = reverse("main:describe:describe", kwargs=self.study_kwargs)
        filename = "ExperimentDescription_simple.xlsx"
        with factory.load_test_file(filename) as fp:
            file = io.BytesIO(fp.read())
        file.name = filename
        file.content_type = XLSX_CONTENT_TYPE
        payload = {"file": file}
        response = self.client.post(url, payload)
        self.assertEqual(response.status_code, codes.ok)
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
        self.assertEqual(response.status_code, codes.bad_request)

    def test_post_DescribeView_writer_xlsx_double_import(self):
        # run test_post_DescribeView_writer_xlsx
        self.test_post_DescribeView_writer_xlsx()
        # then do its insides again, checking for errors
        url = reverse("main:describe:describe", kwargs=self.study_kwargs)
        filename = "ExperimentDescription_simple.xlsx"
        with factory.load_test_file(filename) as fp:
            file = io.BytesIO(fp.read())
        file.name = filename
        file.content_type = XLSX_CONTENT_TYPE
        payload = {"file": file}
        response = self.client.post(url, payload)
        self.assertEqual(response.status_code, codes.bad_request)
        self.assertEqual(self.study.line_set.count(), 2)
        messages = response.json()
        self.assertIn("errors", messages)
        self.assertEqual(len(messages["errors"]), 1)
        self.assertEqual(messages["errors"][0]["category"], "Non-unique line names")

    def test_post_DescribeView_writer_xlsx_bad_headers(self):
        self.client.force_login(self.user)
        url = reverse("main:describe:describe", kwargs=self.study_kwargs)
        filename = "ExperimentDescription_bad_headers.xlsx"
        with factory.load_test_file(filename) as fp:
            file = io.BytesIO(fp.read())
        file.name = filename
        file.content_type = XLSX_CONTENT_TYPE
        payload = {"file": file}
        response = self.client.post(url, payload)
        self.assertEqual(response.status_code, codes.ok)
        self.assertEqual(self.study.line_set.count(), 2)
        messages = response.json()
        self.assertNotIn("errors", messages)
        self.assertIn("warnings", messages)
        self.assertEqual(messages["warnings"][0]["category"], "User input ignored")

    def test_post_DescribeView_writer_xlsx_bad_values(self):
        self.client.force_login(self.user)
        url = reverse("main:describe:describe", kwargs=self.study_kwargs)
        filename = "ExperimentDescription_bad_values.xlsx"
        with factory.load_test_file(filename) as fp:
            file = io.BytesIO(fp.read())
        file.name = filename
        file.content_type = XLSX_CONTENT_TYPE
        payload = {"file": file}
        response = self.client.post(url, payload)
        self.assertEqual(response.status_code, codes.bad_request)
        self.assertEqual(self.study.line_set.count(), 0)
        messages = response.json()
        self.assertIn("errors", messages)
        self.assertIn("warnings", messages)
        self.assertEqual(len(messages["errors"]), 2)
        self.assertEqual(
            {"Incorrect file format", "Invalid values"},
            {err["category"] for err in messages["errors"]},
        )
