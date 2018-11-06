# coding: utf-8

from django.template import Context, Template
from django.test import TestCase
from django.urls import reverse
from requests import codes

from . import models

from main.tests import factory


class BrandingTagTests(TestCase):
    def test_environment_label(self):
        template = Template(
            r"{% load branding %}{% env_label %}{% env_background_color %}"
        )
        context = Context()
        # verify that an empty deployment env renders as production
        with self.settings(EDD_DEPLOYMENT_ENVIRONMENT=""):
            result = template.render(context)
            # no label, color set to transparent
            self.assertEqual(result, "transparent")
        # verify nonsense environment renders as production
        with self.settings(EDD_DEPLOYMENT_ENVIRONMENT="SILLY"):
            result = template.render(context)
            # no label, color set to transparent
            self.assertEqual(result, "transparent")
        # verify test environment renders as test
        with self.settings(EDD_DEPLOYMENT_ENVIRONMENT="TEST"):
            result = template.render(context)
            # html class
            self.assertIn('class="test"', result)
            # label included
            self.assertIn("TEST", result)
            # color is reddish
            self.assertEqual(result[-7:], "#fff0f2")
        # verify integration environment renders as integration
        with self.settings(EDD_DEPLOYMENT_ENVIRONMENT="INTEGRATION"):
            result = template.render(context)
            # html class
            self.assertIn('class="int"', result)
            # label included
            self.assertIn("INTEGRATION", result)
            # color is yellowish
            self.assertEqual(result[-7:], "#fff6e5")
        # verify development environment renders as development
        with self.settings(EDD_DEPLOYMENT_ENVIRONMENT="DEVELOPMENT"):
            result = template.render(context)
            # html class
            self.assertIn('class="dev"', result)
            # label included
            self.assertIn("DEVELOPMENT", result)
            # color is greenish
            self.assertEqual(result[-7:], "#f4fef4")
        # verify extra parts are added to tag
        with self.settings(EDD_DEPLOYMENT_ENVIRONMENT="TESTWITHEXTRAS"):
            result = template.render(context)
            # html class
            self.assertIn('class="test"', result)
            # label included
            self.assertIn("TESTWITHEXTRAS", result)
            # color is reddish
            self.assertEqual(result[-7:], "#fff0f2")
        # verify extra parts handle problematic characters
        with self.settings(EDD_DEPLOYMENT_ENVIRONMENT='TEST<&"'):
            result = template.render(context)
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
            "_selected_action": models.Branding.objects.values_list("pk", flat=True)[:1],
        }
        # use follow to go through redirect to final page
        response = self.client.post(url, data=data, follow=True)
        self.assertEqual(response.status_code, codes.ok)
        self.assertContains(response, "set to current branding")
