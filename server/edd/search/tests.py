"""Tests for Solr API"""
import collections
import time
from unittest.mock import patch

import pytest
from django.test import override_settings
from django.urls import reverse
from faker import Faker
from requests import codes

from edd import TestCase
from edd.profile import factory as profile_factory
from main import models
from main.tests import factory

from . import signals, solr, widgets

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
    admin = profile_factory.UserFactory.build(is_superuser=True)
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
        cls.admin = profile_factory.UserFactory.build(is_superuser=True)
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
        user = profile_factory.UserFactory()
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
    user = profile_factory.UserFactory.build()
    with patch("main.signals.user_removed") as signal:
        # no forward if cache_deleting_key is not called first
        signals.removed_type(type(user), user, using="default")
        assert signal.send.call_count == 0


def test_solr_removed_user_forwards():
    user = profile_factory.UserFactory.build()
    with patch("main.signals.user_removed") as signal:
        # forward happens when cache_deleting_key is called
        signals.cache_deleting_key(type(user), user)
        signals.removed_user(type(user), user, using="default")
        signal.send.assert_called_once()


class Select2Tests(TestCase):
    @classmethod
    def setUpTestData(cls):
        super().setUpTestData()
        cls.user = profile_factory.UserFactory()

    def setUp(self):
        super().setUp()
        self.client.force_login(self.user)

    def test_bad_model_via_path(self):
        response = self.client.get(
            reverse("search:acmodel", kwargs={"model": "BADMODEL"}),
        )
        assert response.status_code == codes.bad_request

    def test_bad_model_via_query(self):
        response = self.client.get(
            reverse("search:autocomplete"),
            data={"model": "BADMODEL"},
        )
        assert response.status_code == codes.bad_request

    def test_autocomplete_own_user(self):
        response = self.client.get(
            reverse("search:acmodel", kwargs={"model": "User"}),
            data={"term": self.user.username},
        )
        assert response.status_code == codes.ok
        self.assertTemplateUsed("edd/profile/user_autocomplete_item.html")
        results = response.json()["results"]
        assert any(item["id"] == self.user.id for item in results)

    def test_autocomplete_own_user_for_permissions(self):
        response = self.client.get(
            reverse("search:acmodel", kwargs={"model": "Permission"}),
            data={"term": self.user.username},
        )
        assert response.status_code == codes.ok
        self.assertTemplateUsed("edd/profile/permission_autocomplete_item.html")
        results = response.json()["results"]
        assert any(self.user.username in item["html"] for item in results)

    def test_autocomplete_compartment(self):
        response = self.client.get(
            reverse("search:acmodel", kwargs={"model": "Compartment"}),
        )
        assert response.status_code == codes.ok
        results = response.json()["results"]
        # should always return the "N/A" compartment
        assert any(item["id"] == "0" for item in results)

    def test_autocomplete_gene(self):
        gene = factory.GeneFactory()
        response = self.client.get(
            reverse("search:acmodel", kwargs={"model": "Gene"}),
            data={"term": gene.type_name},
        )
        assert response.status_code == codes.ok
        results = response.json()["results"]
        assert any(item["id"] == gene.id for item in results)

    def test_autocomplete_group(self):
        group = profile_factory.GroupFactory()
        response = self.client.get(
            reverse("search:acmodel", kwargs={"model": "Group"}),
            data={"term": group.name},
        )
        assert response.status_code == codes.ok
        results = response.json()["results"]
        assert any(item["id"] == group.id for item in results)

    def test_autocomplete_metabolite(self):
        metabolite = factory.MetaboliteFactory()
        response = self.client.get(
            reverse("search:acmodel", kwargs={"model": "Metabolite"}),
            data={"term": metabolite.type_name},
        )
        assert response.status_code == codes.ok
        results = response.json()["results"]
        assert any(item["id"] == metabolite.id for item in results)

    def test_autocomplete_metabolite_via_smiles(self):
        term = "CCCCO"
        metabolite = factory.MetaboliteFactory(smiles=term)
        response = self.client.get(
            reverse("search:acmodel", kwargs={"model": "Metabolite"}),
            data={"term": term},
        )
        assert response.status_code == codes.ok
        results = response.json()["results"]
        assert any(item["id"] == metabolite.id for item in results)

    def test_autocomplete_assay_metadata(self):
        meta = factory.MetadataTypeFactory(for_context=models.MetadataType.ASSAY)
        basic_response = self.client.get(
            reverse("search:acmodel", kwargs={"model": "MetadataType"}),
            data={"term": meta.type_name},
        )
        typed_responses = [
            self.client.get(
                reverse("search:acmodel", kwargs={"model": "MetadataType"}),
                data={"term": meta.type_name, "type": search_type},
            )
            for search_type in ("Assay", "AssayForm", "AssayLine")
        ]
        assert basic_response.status_code == codes.ok
        assert all(r.status_code == codes.ok for r in typed_responses)
        results = basic_response.json()["results"]
        assert any(item["id"] == meta.id for item in results)
        assert all(
            any(item["id"] == meta.id for item in r.json()["results"])
            for r in typed_responses
        )

    def test_autocomplete_line_metadata(self):
        meta = factory.MetadataTypeFactory(for_context=models.MetadataType.LINE)
        basic_response = self.client.get(
            reverse("search:acmodel", kwargs={"model": "MetadataType"}),
            data={"term": meta.type_name},
        )
        typed_responses = [
            self.client.get(
                reverse("search:acmodel", kwargs={"model": "MetadataType"}),
                data={"term": meta.type_name, "type": search_type},
            )
            for search_type in ("Line", "LineForm", "AssayLine")
        ]
        assert basic_response.status_code == codes.ok
        assert all(r.status_code == codes.ok for r in typed_responses)
        results = basic_response.json()["results"]
        assert any(item["id"] == meta.id for item in results)
        assert all(
            any(item["id"] == meta.id for item in r.json()["results"])
            for r in typed_responses
        )

    def test_autocomplete_protein(self):
        protein = factory.ProteinFactory()
        response = self.client.get(
            reverse("search:acmodel", kwargs={"model": "Protein"}),
            data={"term": protein.type_name},
        )
        assert response.status_code == codes.ok
        results = response.json()["results"]
        assert any(item["id"] == protein.id for item in results)

    def test_autocomplete_protocol(self):
        protocol = factory.ProtocolFactory()
        response = self.client.get(
            reverse("search:acmodel", kwargs={"model": "Protocol"}),
            data={"term": protocol.name},
        )
        assert response.status_code == codes.ok
        results = response.json()["results"]
        assert any(item["id"] == protocol.id for item in results)

    def test_autocomplete_unit(self):
        unit = factory.UnitFactory()
        response = self.client.get(
            reverse("search:acmodel", kwargs={"model": "Unit"}),
            data={"term": unit.unit_name},
        )
        assert response.status_code == codes.ok
        results = response.json()["results"]
        assert any(item["id"] == unit.id for item in results)


def test_select2_without_autocomplete():
    select2 = widgets.Select2Widget()
    fieldname = fake.domain_word()

    html = select2.render(fieldname, "foobar")

    assert fieldname in html
    assert "autocomp2" in html
    assert "form-select" in html
    assert "data-eddautocompletetype" not in html
    assert "data-eddautocompleteurl" not in html


def test_select2_metadata_builtins_on():
    select2 = widgets.MetadataAutocomplete(includeField=True)
    fieldname = fake.domain_word()

    html = select2.render(fieldname, "foobar")

    assert fieldname in html
    assert "autocomp2" in html
    assert "form-select" in html
    assert 'data-eddautocompletetype="MetadataType"' in html
    assert "data-eddautocompleteurl" in html
    assert 'data-eddauto-field-types="true"' in html


def test_select2_metadata_builtins_off():
    select2 = widgets.MetadataAutocomplete(includeField=False)
    fieldname = fake.domain_word()

    html = select2.render(fieldname, "foobar")

    assert fieldname in html
    assert "autocomp2" in html
    assert "form-select" in html
    assert 'data-eddautocompletetype="MetadataType"' in html
    assert "data-eddautocompleteurl" in html
    assert 'data-eddauto-field-types="false"' in html


def test_select2_metadata_filter_single():
    select2 = widgets.MetadataAutocomplete(typeFilter="A")
    fieldname = fake.domain_word()

    html = select2.render(fieldname, "foobar")

    assert fieldname in html
    assert "autocomp2" in html
    assert "form-select" in html
    assert 'data-eddautocompletetype="MetadataType"' in html
    assert "data-eddautocompleteurl" in html
    assert 'data-eddauto-type-filter="&quot;A&quot;"' in html


def test_select2_metadata_filter_multiple():
    select2 = widgets.MetadataAutocomplete(typeFilter=["S", "L"])
    fieldname = fake.domain_word()

    html = select2.render(fieldname, "foobar")

    assert fieldname in html
    assert "autocomp2" in html
    assert "form-select" in html
    assert 'data-eddautocompletetype="MetadataType"' in html
    assert "data-eddautocompleteurl" in html
    # just check that it's a JSON list, too flaky to hard-code serialization
    assert 'data-eddauto-type-filter="[' in html


def test_select2_sbml_exchange():
    sbml_id = fake.pyint()
    select2 = widgets.SbmlExchange(sbml_id)
    fieldname = fake.domain_word()

    html = select2.render(fieldname, "foobar")

    assert fieldname in html
    assert "autocomp2" in html
    assert "form-select" in html
    assert 'data-eddautocompletetype="SbmlExchange"' in html
    assert "data-eddautocompleteurl" in html
    assert f'data-eddauto-template="{sbml_id}"' in html


def test_select2_sbml_species():
    sbml_id = fake.pyint()
    select2 = widgets.SbmlSpecies(sbml_id)
    fieldname = fake.domain_word()

    html = select2.render(fieldname, "foobar")

    assert fieldname in html
    assert "autocomp2" in html
    assert "form-select" in html
    assert 'data-eddautocompletetype="SbmlSpecies"' in html
    assert "data-eddautocompleteurl" in html
    assert f'data-eddauto-template="{sbml_id}"' in html
