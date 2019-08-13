"""Tests for Solr API"""
from django.test import override_settings
from faker import Faker

from .. import solr

fake = Faker()

fake_solr = fake.url()
fake_django_setting = {"default": {"URL": fake_solr}, "BAD": {}}


def test_resolve_url_default():
    url = solr.SolrSearch.resolve_url(None, None, None)
    assert url == solr.SolrSearch.DEFAULT_URL


def test_resolve_url_explicit():
    arg_url = fake.url()
    url = solr.SolrSearch.resolve_url(None, None, arg_url)
    assert arg_url == url


def test_resolve_url_settings():
    arg_url = fake.url()
    url = solr.SolrSearch.resolve_url({"URL": arg_url}, None, None)
    assert arg_url == url


def test_resolve_url_bad_settings():
    url = solr.SolrSearch.resolve_url({}, None, None)
    assert url == solr.SolrSearch.DEFAULT_URL


@override_settings(EDD_MAIN_SOLR=fake_django_setting)
def test_resolve_url_settings_key():
    url = solr.SolrSearch.resolve_url(None, "default", None)
    assert url == fake_solr


@override_settings(EDD_MAIN_SOLR=fake_django_setting)
def test_resolve_url_bad_settings_key():
    url = solr.SolrSearch.resolve_url(None, "BAD", None)
    assert url == solr.SolrSearch.DEFAULT_URL


@override_settings(EDD_MAIN_SOLR=fake_django_setting)
def test_get_queryopt_bad_params():
    search = solr.SolrSearch()
    queryopt = search.get_queryopt("query", i="start", size="big")
    assert queryopt["q"] == "query"
    assert queryopt["start"] == 0
    assert queryopt["rows"] == 50
