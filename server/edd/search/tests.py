"""Tests for Solr API"""
import collections
import time
from unittest.mock import patch

import pytest
from django.test import override_settings
from faker import Faker

from edd import TestCase
from main import models
from main.tests import factory

from . import signals, solr

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


def test_repr():
    search = solr.SolrSearch(url=fake_solr)
    assert fake_solr in repr(search)


def test_create_collection_error():
    # use an invalid URL to simulate error
    search = solr.UserSearch(url="http://solr.invalid/")
    with pytest.raises(solr.SolrException):
        search.create_collection()


def test_commit_collection_without_create_raises():
    search = solr.UserSearch()
    with pytest.raises(solr.SolrException):
        search.commit_collection()


def test_commit_collection_error():
    search = solr.UserSearch()
    old_url = search.base_url
    # create collection
    search.create_collection()
    try:
        # switch search URL to an invalid one to simulate error
        search.base_url = "http://solr.invalid"
        with pytest.raises(solr.SolrException):
            search.commit_collection()
    finally:
        # cleanup
        search.base_url = old_url
        search.discard_collection()


def test_discard_collection_without_create_raises():
    search = solr.UserSearch()
    with pytest.raises(solr.SolrException):
        search.discard_collection()


def test_integration():
    # try all the main methods and verify they work as expected
    # _default is the built-in schema config
    search = solr.SolrSearch(core="_default")
    # create a collection to index things under _default schema
    # this test hits some timeout errors, so try waiting and retry
    for _loop in range(3):
        try:
            search.create_collection()
        except solr.SolrException:
            time.sleep(10)
            continue
        break
    else:
        raise AssertionError("Taking too long to create integration index")
    try:
        # checking length on brand-new collection
        assert len(search) == 0
        # adding stuff to collection
        search.update({"id": i, "some_txt": fake.text()} for i in range(10))
        # query for a specific thing
        result = search.query(query="id:3")
        assert result["response"]["numFound"] == 1
        assert len(search) == 10
        # delete a specific thing
        search.remove([collections.namedtuple("Doc", ["id"])(3)])
        # query no longer finds the thing
        result = search.query(query="id:3")
        assert result["response"]["numFound"] == 0
        assert len(search) == 9
    finally:
        # cleanup
        search.discard_collection()


def test_StudySearch_acl_none():
    # StudySearch should raise exception when not configured with a user
    search = solr.StudySearch(ident=None)
    with pytest.raises(solr.SolrException):
        search.build_acl_filter()


def test_StudySearch_acl_admin():
    # superusers should get no restrictions
    admin = factory.UserFactory.build(is_superuser=True)
    search = solr.StudySearch(ident=admin)
    read, write = search.build_acl_filter()
    assert read == ""
    assert write == "id:*"


# Some bits of the API need to work with "real" database records and query db
# Using Django TestCase to enable these operations
class SolrTests(TestCase):
    @classmethod
    def setUpClass(cls):
        # doing this as classmethod to avoid doing multiple collection creations
        super().setUpClass()
        cls.admin = factory.UserFactory.build(is_superuser=True)
        cls.collection = solr.StudySearch(ident=cls.admin)
        # create a new collection, instead of sending to main collection
        cls.collection.create_collection()

    @classmethod
    def tearDownClass(cls):
        # clean up created collection
        cls.collection.discard_collection()
        super().tearDownClass()

    def test_add_and_retrieve(self):
        study = factory.StudyFactory(description="Lorem ipsum dolor sit amet")
        self.collection.update([study])
        post_add = self.collection.query(query="description:dolor")
        self.assertEqual(
            post_add["response"]["numFound"], 1, "Added study was not found in query"
        )

    def test_acl(self):
        user = factory.UserFactory()
        # patch the normal user to the collection ident
        self.collection.ident = user
        # verify the ACLs
        read, write = self.collection.build_acl_filter()
        self.assertIn("OR", read)
        self.assertIn("OR", write)
        # restore the usual user
        self.collection.ident = self.admin


def test_solr_removed_study_without_key():
    study = factory.StudyFactory.build()
    with patch("main.signals.study_removed") as signal:
        # no forward if cache_deleting_key is not called first
        signals.removed_study(models.Study, study, using="default")
        assert signal.send.call_count == 0


def test_solr_removed_study_forwards():
    study = factory.StudyFactory.build()
    with patch("main.signals.study_removed") as signal:
        # forward happens when cache_deleting_key is called
        signals.cache_deleting_key(models.Study, study)
        signals.removed_study(models.Study, study, using="default")
        signal.send.assert_called_once()


def test_solr_removed_type_without_key():
    metabolite = factory.MetaboliteFactory.build()
    with patch("main.signals.type_removed") as signal:
        # no forward if cache_deleting_key is not called first
        signals.removed_type(models.Metabolite, metabolite, using="default")
        assert signal.send.call_count == 0


def test_solr_removed_type_forwards():
    metabolite = factory.MetaboliteFactory.build()
    with patch("main.signals.type_removed") as signal:
        # forward happens when cache_deleting_key is called
        signals.cache_deleting_key(models.Metabolite, metabolite)
        signals.removed_type(models.Metabolite, metabolite, using="default")
        signal.send.assert_called_once()


def test_solr_removed_user_without_key():
    User = factory.get_user_model()
    user = factory.UserFactory.build()
    with patch("main.signals.user_removed") as signal:
        # no forward if cache_deleting_key is not called first
        signals.removed_type(User, user, using="default")
        assert signal.send.call_count == 0


def test_solr_removed_user_forwards():
    User = factory.get_user_model()
    user = factory.UserFactory.build()
    with patch("main.signals.user_removed") as signal:
        # forward happens when cache_deleting_key is called
        signals.cache_deleting_key(User, user)
        signals.removed_user(User, user, using="default")
        signal.send.assert_called_once()
