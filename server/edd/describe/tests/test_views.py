import io

from django.contrib.sites.models import Site
from django.urls import reverse
from requests import codes

from edd import TestCase
from edd.profile.factory import UserFactory
from main import models as main_models
from main.tests import factory as main_factory

from .. import models
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

    def test_get_DescribeView_no_permission(self):
        other_user = UserFactory()
        self.client.force_login(other_user)
        url = reverse("main:describe:describe", kwargs=self.study_kwargs)
        response = self.client.get(url)
        self.assertEqual(response.status_code, codes.not_found)

    def test_get_DescribeView_readonly(self):
        other_user = UserFactory()
        self.study.userpermission_set.update_or_create(
            permission_type=main_models.StudyPermission.READ, user=other_user
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
            permission_type=main_models.StudyPermission.READ, user=other_user
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
        with main_factory.load_test_file(filename) as fp:
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
        with main_factory.load_test_file(filename) as fp:
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
        with main_factory.load_test_file(filename) as fp:
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
        with main_factory.load_test_file(filename) as fp:
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


class DescribeAdminTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        super().setUpTestData()
        cls.user = UserFactory(is_superuser=True, is_staff=True)
        # admin user to see the admin site
        cls.admin_user = UserFactory(
            email="admin@example.org", is_staff=True, is_superuser=True
        )

    def setUp(self):
        super().setUp()
        self.client.force_login(self.user)

    def test_get_exampleset_add_view(self):
        url = reverse("admin:describe_describeexampleset_add")
        response = self.client.get(url)
        # check that the site field has an input
        self.assertContains(response, """<select name="site" """)
        # check that the example_image_file field has an input
        self.assertContains(
            response, """<input type="file" name="example_image_file" """
        )
        # check that the example_file field has an input
        self.assertContains(response, """<input type="file" name="example_file" """)

    def test_get_exampleset_change_view(self):
        examples = factory.ExampleSetFactory()
        url = reverse("admin:describe_describeexampleset_change", args=(examples.pk,))
        response = self.client.get(url)
        # check that the site field has an input
        self.assertContains(response, """<select name="site" """)
        # check that the example_image_file field has an input
        self.assertContains(
            response, """<input type="file" name="example_image_file" """
        )
        # check that the example_file field has an input
        self.assertContains(response, """<input type="file" name="example_file" """)

    def test_use_examples_action__set_new(self):
        """
        Tests using the "use examples" action to go from defaults to a custom example set
        """
        # create a DescribeExampleSet to test admin action
        models.DescribeExampleSet.objects.create()
        # must be logged in as admin user
        self.client.force_login(self.admin_user)
        url = reverse("admin:describe_describeexampleset_changelist")
        data = {
            "action": "use_examples",
            "_selected_action": models.DescribeExampleSet.objects.values_list(
                "pk", flat=True
            )[:1],
        }
        # use follow to go through redirect to final page
        response = self.client.post(url, data=data, follow=True)
        self.assertEqual(response.status_code, codes.ok)
        self.assertContains(response, "updated examples")

    def test_use_examples_action__change_examples(self):
        """
        Tests using the "use examples" action to go from an existing example set to a new one
        """
        # create a site so we can assign example sets to it.
        # Example.com is a reserved domain name that can't be used for production.
        site = Site.objects.create(domain="example.com")

        # Create example sets, setting an existing one to the current site
        # so we can test transitioning away from it
        models.DescribeExampleSet.objects.create(site=site)
        site2 = models.DescribeExampleSet.objects.create()

        # must be logged in as admin user
        self.client.force_login(self.admin_user)

        # switch from one example set to the other
        url = reverse("admin:describe_describeexampleset_changelist")
        data = {
            "action": "use_examples",
            "_selected_action": site2.pk,
        }

        # use follow to go through redirect to final page
        response = self.client.post(url, data=data, follow=True)
        self.assertEqual(response.status_code, codes.ok)
        self.assertContains(response, "updated examples")
