"""
Tests used to validate the tutorial screencast functionality.
"""

from django.test import override_settings
from django.urls import reverse
from requests import codes

import main.models as edd_models
from edd import TestCase
from main.tests.factory import StudyFactory, UserFactory


@override_settings(EDD_USE_PROTOTYPE_IMPORT=True)
class ImportViewTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        super().setUpTestData()
        cls.unprivileged_user = UserFactory()
        cls.write_user = UserFactory()
        cls.read_user = UserFactory()
        cls.target_study = StudyFactory()
        cls.target_kwargs = {"slug": cls.target_study.slug}
        cls.target_study.userpermission_set.update_or_create(
            permission_type=edd_models.StudyPermission.WRITE, user=cls.write_user
        )
        cls.target_study.userpermission_set.update_or_create(
            permission_type=edd_models.StudyPermission.READ, user=cls.read_user
        )

    def test_load_import_page(self):
        """
        Test verifying the import page loads properly.  Import processing is handled separately by
        REST view tests.
        """
        target_url = reverse("edd_file_importer:import2", kwargs=self.target_kwargs)

        # unprivileged user has no access
        self.client.force_login(self.unprivileged_user)
        response = self.client.get(target_url)
        self.assertEqual(response.status_code, codes.not_found)

        # user with study read permission has no access
        self.client.force_login(self.read_user)
        response = self.client.get(target_url)
        self.assertEqual(response.status_code, codes.not_found)

        # user with study write permission has access
        self.client.force_login(self.write_user)
        response = self.client.get(target_url)
        self.assertEqual(response.status_code, codes.ok)
        self.assertTemplateUsed(response, "edd_file_importer/import2.html")

        # admin user has access
        admin_user = UserFactory()
        admin_user.is_superuser = True
        admin_user.save()
        self.client.force_login(admin_user)
        response = self.client.get(target_url)
        self.assertEqual(response.status_code, codes.ok)
        self.assertTemplateUsed(response, "edd_file_importer/import2.html")

    def test_load_import_help(self):
        target_url = reverse("edd_file_importer:import_help")

        # unprivileged user has access
        unprivileged_user = UserFactory()
        self.client.force_login(unprivileged_user)
        response = self.client.get(target_url)
        self.assertEqual(response.status_code, codes.ok)
        self.assertTemplateUsed(response, "edd_file_importer/import_help.html")
