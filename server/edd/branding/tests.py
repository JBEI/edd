from django.template import Context, Template
from django.urls import reverse
from requests import codes

from edd import TestCase
from main.tests import factory

from . import models


class BrandingTagTests(TestCase):
    def build_environment_sample_template(self):
        # boilerplate for following self.test_environment_label_* tests
        template = Template(
            r"{% load branding %}{% env_label %}{% env_background_color %}"
        )
        context = Context()
        return template.render(context)

    def test_environment_label_empty(self):
        # verify that an empty deployment env renders as production
        with self.settings(EDD_DEPLOYMENT_ENVIRONMENT=""):
            result = self.build_environment_sample_template()
            # no label, color set to white
            self.assertEqual(result, "white")

    def test_environment_label_nonsense(self):
        # verify nonsense environment renders as production
        with self.settings(EDD_DEPLOYMENT_ENVIRONMENT="SILLY"):
            result = self.build_environment_sample_template()
            # no label, color set to white
            self.assertEqual(result, "white")

    def test_environment_label_test(self):
        # verify test environment renders as test
        with self.settings(EDD_DEPLOYMENT_ENVIRONMENT="TEST"):
            result = self.build_environment_sample_template()
            # html class
            self.assertIn('class="test"', result)
            # label included
            self.assertIn("TEST", result)
            # color is reddish
            self.assertEqual(result[-7:], "#fff0f2")

    def test_environment_label_integration(self):
        # verify integration environment renders as integration
        with self.settings(EDD_DEPLOYMENT_ENVIRONMENT="INTEGRATION"):
            result = self.build_environment_sample_template()
            # html class
            self.assertIn('class="int"', result)
            # label included
            self.assertIn("INTEGRATION", result)
            # color is yellowish
            self.assertEqual(result[-7:], "#fff6e5")

    def test_environment_label_dev(self):
        # verify development environment renders as development
        with self.settings(EDD_DEPLOYMENT_ENVIRONMENT="DEVELOPMENT"):
            result = self.build_environment_sample_template()
            # html class
            self.assertIn('class="dev"', result)
            # label included
            self.assertIn("DEVELOPMENT", result)
            # color is greenish
            self.assertEqual(result[-7:], "#f4fef4")

    def test_environment_label_test_extras(self):
        # verify extra parts are added to tag
        with self.settings(EDD_DEPLOYMENT_ENVIRONMENT="TESTWITHEXTRAS"):
            result = self.build_environment_sample_template()
            # html class
            self.assertIn('class="test"', result)
            # label included
            self.assertIn("TESTWITHEXTRAS", result)
            # color is reddish
            self.assertEqual(result[-7:], "#fff0f2")

    def test_environment_label_test_special(self):
        # verify extra parts handle problematic characters
        with self.settings(EDD_DEPLOYMENT_ENVIRONMENT='TEST<&"'):
            result = self.build_environment_sample_template()
            # html class
            self.assertIn('class="test"', result)
            # label included, properly escaped
            self.assertIn("TEST&lt;&amp;&quot;", result)
            # color is reddish
            self.assertEqual(result[-7:], "#fff0f2")

    def test_display_version(self):
        template = Template(r"{% load branding %}{% edd_version_number %}")
        context = Context()
        # display with no set hash
        with self.settings(EDD_VERSION_NUMBER="v1", EDD_VERSION_HASH=None):
            result = template.render(context)
            self.assertEqual(result, "v1")
        # display with hash
        with self.settings(EDD_VERSION_NUMBER="v1", EDD_VERSION_HASH="abcdef"):
            result = template.render(context)
            self.assertEqual(result, "v1 (abcdef)")

    def test_logo_title(self):
        template = Template(r"{% load branding %}{% logo_title %}")
        context = Context()
        # display with default branding
        result = template.render(context)
        self.assertEqual(result, "EDD")
        # diaplay with no found branding
        with self.settings(SITE_ID=None):
            result = template.render(context)
            self.assertEqual(result, "EDD")

    def test_welcome_message(self):
        template = Template(r"{% load branding %}{% login_welcome %}")
        context = Context(dict(request=None))
        # default branding has no message
        result = template.render(context)
        self.assertEqual(result, "")
        # still renders without error when no branding found
        with self.settings(SITE_ID=None):
            result = template.render(context)
            self.assertEqual(result, "")


class BrandingFaviconTests(TestCase):
    def test_favicon(self):
        response = self.client.get("/favicon.ico")
        self.assertEqual(response["Content-Type"], "image/x-icon")
        self.assertEqual(response.status_code, codes.ok)
        # still a response with a bogus branding SITE_ID
        with self.settings(SITE_ID=9000):
            response = self.client.get("/favicon.ico")
            self.assertEqual(response["Content-Type"], "image/x-icon")
            self.assertEqual(response.status_code, codes.ok)


class BrandingModelsTests(TestCase):
    def test_default_name(self):
        branding = models.Branding()
        self.assertEqual(str(branding), "EDD")


class BrandingAdminTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        super().setUpTestData()
        # admin user to see the admin site
        cls.admin_user = factory.UserFactory(
            email="admin@example.org", is_staff=True, is_superuser=True
        )
        # create a Branding instance to test admin action
        models.Branding.objects.create()

    def test_use_branding_action(self):
        # must be logged in as admin user
        self.client.force_login(self.admin_user)
        url = reverse("admin:branding_branding_changelist")
        data = {
            "action": "use_this_branding",
            "_selected_action": models.Branding.objects.values_list("pk", flat=True)[
                :1
            ],
        }
        # use follow to go through redirect to final page
        response = self.client.post(url, data=data, follow=True)
        self.assertEqual(response.status_code, codes.ok)
        self.assertContains(response, "set to current branding")
