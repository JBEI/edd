import pytest
from django.urls import reverse
from django.views import debug
from requests import codes

from main.tests.factory import UserFactory

# Tests for cleanse_setting function of django.views.debug
# that is monkey-patched in server/edd/__init__.py


def test_cleanse_setting_benign_value_not_obfuscated():
    # regular settings are unchanged
    original = "Some valid value"
    cleansed = debug.cleanse_setting("BENIGN", original)
    assert original == cleansed


def test_cleanse_setting_replace_url_password():
    # settings with keys matching URL or BACKEND are parsed, then
    # re-assembled with any password field obfuscated
    original = "http://user:12345@example.com/some/path/"
    cleansed = debug.cleanse_setting("SOME_URL", original)
    assert original != cleansed
    assert "12345" not in cleansed


def test_cleanse_setting_unchanged_non_url_key():
    # when setting key does not contain URL or BACKEND,
    # no attempt to parse and obfuscate occurs
    original = "http://user:12345@example.com/some/path/"
    cleansed = debug.cleanse_setting("NOT_REPLACED", original)
    assert original == cleansed


def test_cleanse_setting_unchanged_non_string():
    # when setting value is not a string, no attempt to parse happens
    original = 42
    cleansed = debug.cleanse_setting("BACKEND_COUNT", original)
    assert original == cleansed


def test_cleanse_setting_invalid_url_unchanged():
    # adding an unmatched square bracket will trigger exception handling
    original = "http://user:12345@ex[ample.com/"
    cleansed = debug.cleanse_setting("SOME_URL", original)
    assert original == cleansed


def test_docs_loads_without_error(client):
    # no auth needed
    response = client.get(reverse("rest:docs"))
    assert response.status_code == codes.ok


@pytest.mark.django_db
def test_graphiql_loads_without_error(client):
    client.force_login(UserFactory())
    response = client.get(reverse("graphiql"), HTTP_ACCEPT="text/html")
    assert response.status_code == codes.ok


def test_wsgi_application_loads():
    from edd import wsgi

    assert callable(wsgi.application)
