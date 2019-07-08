# coding: utf-8
"""
Tests to validate utilities pages.
"""

from io import BytesIO

import environ
from django.urls import reverse
from requests import codes

from edd import TestCase


class SkylineConversionTests(TestCase):
    def test_conversion_tool(self):
        response = self.client.get(reverse("edd_utils:proteomics_home"))
        self.assertEqual(response.status_code, codes.ok)
        fixture = (environ.Path(__file__) - 2)("fixtures", "misc_data", "skyline.csv")
        with open(fixture, "rb") as fp:
            upload = BytesIO(fp.read())
        upload.name = "skyline.csv"
        upload.content_type = "text/csv"
        response = self.client.post(
            reverse("edd_utils:parse_skyline"), data={"file": upload}
        )
        self.assertEqual(response.status_code, codes.ok)
        message = response.json()
        self.assertEqual(message["n_proteins"], 4)
        self.assertEqual(message["n_samples"], 4)
        self.assertEqual(message["n_records"], 32)
