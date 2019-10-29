from django.urls import reverse
from django.views import debug
from requests import codes

from . import TestCase


class TestCleanseSetting(TestCase):
    """
    Tests the cleanse_setting function of django.views.debug that is
    monkey-patched in server/edd/__init__.py
    """

    def test_benign_value_not_obfuscated(self):
        # regular settings are unchanged
        original = "Some valid value"
        cleansed = debug.cleanse_setting("BENIGN", original)
        self.assertEqual(original, cleansed)

    def test_replace_url_password(self):
        # settings with keys matching URL or BACKEND are parsed, then
        # re-assembled with any password field obfuscated
        original = "http://user:12345@example.com/some/path/"
        cleansed = debug.cleanse_setting("SOME_URL", original)
        self.assertNotEqual(original, cleansed)
        self.assertNotIn("12345", cleansed)

    def test_unchanged_non_url_key(self):
        # when setting key does not contain URL or BACKEND, no attempt to
        # parse and obfuscate occurs
        original = "http://user:12345@example.com/some/path/"
        cleansed = debug.cleanse_setting("NOT_REPLACED", original)
        self.assertEqual(original, cleansed)

    def test_unchanged_non_string(self):
        # when setting value is not a string, no attempt to parse happens
        original = 42
        cleansed = debug.cleanse_setting("BACKEND_COUNT", original)
        self.assertEqual(original, cleansed)

    def test_invalid_url_unchanged(self):
        # adding an unmatched square bracket will trigger exception handling
        original = "http://user:12345@ex[ample.com/"
        cleansed = debug.cleanse_setting("SOME_URL", original)
        self.assertEqual(original, cleansed)


class RestDocsTest(TestCase):

    def test_docs_loads_without_error(self):
        response = self.client.get(reverse("rest:docs"))
        self.assertEqual(response.status_code, codes.ok)
