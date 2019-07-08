# -*- coding: utf-8 -*-

import math
import warnings
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from django.core.exceptions import ValidationError
from django.test import RequestFactory
from threadlocals.threadlocals import set_thread_variable

from edd import TestCase

from .. import models as edd_models
from ..export import sbml as sbml_export
from ..forms import LineForm
from ..models import (
    SYSTEM_META_TYPES,
    CarbonSource,
    GroupPermission,
    MetadataGroup,
    MetadataType,
    Protocol,
    Strain,
    Study,
    UserPermission,
)
from ..solr import StudySearch
from . import factory

User = get_user_model()


# TODO: This comment is not up-to-date; need to find better way to indicate to tests to use a
#   testing solr instance
# Everything running in this file is a test, but Django only handles test instances of a
#   database; there is no concept of a Solr test instance as far as test framework is
#   concerned. Tests should be run with:
#       python manage.py test --settings test_settings main
#   Otherwise, tests will pollute the search index with several entries for testing data.


class UserTests(TestCase):
    JSON_KEYS = [
        "description",
        "disabled",
        "email",
        "firstname",
        "groups",
        "id",
        "initials",
        "institution",
        "lastname",
        "name",
        "uid",
    ]
    SOLR_KEYS = [
        "date_joined",
        "email",
        "fullname",
        "group",
        "id",
        "initials",
        "institution",
        "is_active",
        "is_staff",
        "is_superuser",
        "last_login",
        "name",
        "username",
    ]

    # create test users
    @classmethod
    def setUpTestData(cls):
        cls.user1 = factory.UserFactory(
            email="jsmith@localhost", first_name="Jane", last_name="Smith"
        )
        cls.user2 = factory.UserFactory(
            email="jdoe@localhost", first_name="", last_name=""
        )
        cls.admin = factory.UserFactory(
            email="ssue@localhost",
            is_staff=True,
            is_superuser=True,
            first_name="Sally",
            last_name="Sue",
        )

    def test_monkey_patches(self):
        """ Checking the properties monkey-patched on to the User model. """
        # Asserts
        self.assertIsNotNone(self.user1.profile)
        self.assertEqual(self.user1.initials, "JS")
        self.assertEqual(self.user1.profile.initials, "JS")
        self.assertIsNone(self.user1.institution)
        self.assertEqual(len(self.user1.institutions), 0)
        self.assertIsNotNone(self.user2.profile)
        self.assertEqual(self.user2.initials, "")
        self.assertEqual(self.user2.profile.initials, "")
        # ensure keys exist in JSON and Solr dict repr
        user_json = self.user1.to_json()
        for key in self.JSON_KEYS:
            self.assertIn(key, user_json)
        user_solr = self.user1.to_solr_json()
        for key in self.SOLR_KEYS:
            self.assertIn(key, user_solr)

    def test_initial_permissions(self):
        """ Checking initial class-based permissions for normal vs admin user. """
        # Asserts
        self.assertFalse(self.user1.has_perm("main.change.protocol"))
        self.assertTrue(self.admin.has_perm("main.change.protocol"))


class StudyTests(TestCase):
    def setUp(self):
        super(StudyTests, self).setUp()
        email = "wcmorrell@lbl.gov"
        user1 = User.objects.create_user(
            username="test1", email=email, password="password"
        )
        user2 = User.objects.create_user(
            username="test2", email=email, password="password"
        )
        user3 = User.objects.create_user(
            username="test3", email=email, password="password"
        )
        User.objects.create_user(username="test4", email=email, password="password")
        fuels = Group.objects.create(name="Fuels Synthesis")
        decon = Group.objects.create(name="Deconstruction")
        user1.groups.add(fuels)
        user2.groups.add(decon)
        user3.groups.add(fuels, decon)
        # test4 user will have no groups
        Study.objects.create(name="Test Study 1", description="")
        Study.objects.create(name="Test Study 2", description="")
        mdg1 = MetadataGroup.objects.create(group_name="Misc")
        MetadataType.objects.create(
            type_name="Some key", group=mdg1, for_context=MetadataType.STUDY
        )
        MetadataType.objects.create(
            type_name="Some key 2", group=mdg1, for_context=MetadataType.LINE
        )
        MetadataType.objects.create(
            type_name="Some key 3", group=mdg1, for_context=MetadataType.ASSAY
        )

    def tearDown(self):
        TestCase.tearDown(self)

    def test_read_with_no_permissions(self):
        """ Ensure that a study without permissions cannot be read. """
        # Load objects
        study = Study.objects.get(name="Test Study 1")
        user1 = User.objects.get(username="test1")
        # Asserts
        self.assertFalse(study.user_can_read(user1))

    def test_user_read_write_permission(self):
        """ Ensure that a study with user having read or write permissions can be read. """
        # Load objects
        study = Study.objects.get(name="Test Study 1")
        user1 = User.objects.get(username="test1")
        user2 = User.objects.get(username="test2")
        user3 = User.objects.get(username="test3")
        # Create permissions
        UserPermission.objects.create(study=study, permission_type="W", user=user1)
        UserPermission.objects.create(study=study, permission_type="R", user=user2)
        # Asserts
        self.assertTrue(study.user_can_read(user1))
        self.assertTrue(study.user_can_write(user1))
        self.assertTrue(study.user_can_read(user2))
        self.assertFalse(study.user_can_write(user2))
        self.assertFalse(study.user_can_read(user3))
        self.assertFalse(study.user_can_write(user3))

    def test_group_read_write_permission(self):
        """ Ensure that a study with group having read or write permissions can be read. """
        # Load objects
        study = Study.objects.get(name="Test Study 1")
        fuels = Group.objects.get(name="Fuels Synthesis")
        decon = Group.objects.get(name="Deconstruction")
        user1 = User.objects.get(username="test1")  # fuels
        user2 = User.objects.get(username="test2")  # decon
        user3 = User.objects.get(username="test3")  # fuels AND decon
        user4 = User.objects.get(username="test4")  # no group
        # Create permissions
        GroupPermission.objects.create(
            study=study, permission_type=GroupPermission.WRITE, group=fuels
        )
        GroupPermission.objects.create(
            study=study, permission_type=GroupPermission.READ, group=decon
        )
        # Asserts
        self.assertTrue(study.user_can_read(user1))
        self.assertTrue(study.user_can_write(user1))
        self.assertTrue(study.user_can_read(user2))
        self.assertFalse(study.user_can_write(user2))
        self.assertTrue(study.user_can_read(user3))
        self.assertTrue(study.user_can_write(user3))
        self.assertFalse(study.user_can_read(user4))
        self.assertFalse(study.user_can_write(user4))

    def test_study_metadata(self):
        study = Study.objects.get(name="Test Study 1")
        md = MetadataType.objects.get(type_name="Some key")
        md3 = MetadataType.objects.get(type_name="Some key 3")
        study.metadata_add(md, "1.234")
        self.assertTrue(study.metadata_get(md) == "1.234")
        with self.assertRaises(ValueError):
            study.metadata_add(md3, "9.876")


class SolrTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        super(SolrTests, cls).setUpTestData()
        cls.admin = factory.UserFactory(is_superuser=True)
        cls.user1 = factory.UserFactory()
        cls.study = factory.StudyFactory(description="Lorem ipsum dolor sit amet")

    def setUp(self):
        super(SolrTests, self).setUp()
        self.solr_admin = StudySearch(ident=self.admin)
        self.solr_admin.clear()

    def tearDown(self):
        self.solr_admin.clear()
        super(SolrTests, self).tearDown()

    def test_initially_empty(self):
        solr = StudySearch(ident=self.user1)
        result = solr.query(query="*:*")
        self.assertEqual(
            result["response"]["numFound"], 0, "The test index is not initially empty"
        )

    def test_add_and_retrieve(self):
        solr = StudySearch(ident=self.user1)
        pre_add = self.solr_admin.query(query="description:dolor")
        solr.update([self.study])
        post_add = self.solr_admin.query(query="description:dolor")
        self.assertEqual(
            pre_add["response"]["numFound"], 0, "Study in index before it was added"
        )
        self.assertEqual(
            post_add["response"]["numFound"], 1, "Added study was not found in query"
        )


class LineTests(TestCase):  # XXX also Strain, CarbonSource
    @classmethod
    def setUpTestData(cls):
        cls.user1 = factory.UserFactory()
        cls.study1 = factory.StudyFactory()
        cls.study2 = factory.StudyFactory()
        cls.cs1 = CarbonSource.objects.create(
            name="Carbon source 1",
            labeling="100% unlabeled",
            volume=50.0,
            description="Desc 1",
        )
        cls.cs2 = CarbonSource.objects.create(
            name="Carbon source 2", labeling="20% 13C", volume=100.0
        )
        cls.cs3 = CarbonSource.objects.create(
            name="Carbon source 3", labeling="40% 14C", volume=100.0
        )
        cls.strain1 = Strain.objects.create(
            name="Strain 1",
            description="JBEI strain 1",
            registry_url="http://registry.jbei.org/strain/666",
            registry_id="00000000-0000-0000-0000-000000000000",
        )
        cls.strain2 = Strain.objects.create(name="Strain 2")
        cls.line1 = cls.study1.line_set.create(
            name="Line 1",
            description="mutant 1",
            experimenter=cls.user1,
            contact=cls.user1,
        )
        cls.line1.carbon_source.add(cls.cs1)
        cls.line1.strains.add(cls.strain1)
        cls.line2 = cls.study1.line_set.create(
            name="Line 2",
            description="mutant 2",
            experimenter=cls.user1,
            contact=cls.user1,
        )
        cls.line2.carbon_source.add(cls.cs2)
        cls.line2.strains.add(cls.strain1)
        cls.line3 = cls.study2.line_set.create(
            name="Line 3",
            description="double mutant",
            experimenter=cls.user1,
            contact=cls.user1,
        )
        cls.line3.carbon_source.add(cls.cs1)
        cls.line3.carbon_source.add(cls.cs3)
        cls.line3.strains.add(cls.strain1)
        cls.line3.strains.add(cls.strain2)

    def setUp(self):
        super(LineTests, self).setUp()
        # fake a request so all calls to Update.load_update resolve to a singluar Update
        request = RequestFactory().get("/")
        request.user = self.user1
        set_thread_variable("request", request)

    def tearDown(self):
        set_thread_variable("request", None)

    def test_line_metadata(self):
        # 'media' is a MetadataType for Lines
        media = MetadataType.objects.get(uuid=SYSTEM_META_TYPES["Media"])
        # 'original name' is a MetadataType for Assays
        orig_name = MetadataType.objects.get(uuid=SYSTEM_META_TYPES["Original Name"])
        # adding line metadata to a line should work fine
        self.line1.metadata_add(media, "M9")
        self.assertEqual(self.line1.metadata_get(media), "M9")
        # adding assay metadata to a line should raise a ValueError
        with self.assertRaises(ValueError):
            self.line1.metadata_add(orig_name, "ABC13")

    def test_line_form(self):
        self.assertFalse(self.line1.control)
        # default form to existing data
        data = LineForm.initial_from_model(self.line1, prefix="line")
        # flip the checkbox for control
        data["line-control"] = True
        form = LineForm(
            data, instance=self.line1, prefix="line", study=self.line1.study
        )
        # verify the form validates
        self.assertTrue(form.is_valid(), "%s" % form._errors)
        form.save()
        # verify the saved line is now a control
        self.assertTrue(self.line1.control)

    def test_strain(self):
        self.assertEqual(self.strain1.line_set.count(), 3)
        self.assertEqual(self.strain2.line_set.count(), 1)

    def test_carbon_source(self):
        self.assertEqual(self.cs1.line_set.count(), 2)
        self.assertEqual(self.cs2.line_set.count(), 1)


# XXX because there's so much overlap in functionality and the necessary setup
# is somewhat involved, this set of tests includes multiple models, focused
# on assay data and associated objects.
#
# TODO also test MeasurementVector
class AssayDataTests(TestCase):
    @classmethod
    def setUpClass(cls):
        cls.user1 = factory.UserFactory()
        # fake a request so all calls to Update.load_update resolve to a singluar Update
        request = RequestFactory().get("/test-fixture")
        request.user = cls.user1
        set_thread_variable("request", request)
        # call parent *after* fake request is set up
        super().setUpClass()

    @classmethod
    def tearDownClass(cls):
        super().tearDownClass()
        set_thread_variable("request", None)

    @classmethod
    def setUpTestData(cls):
        super().setUpTestData()
        cls.study1 = factory.StudyFactory()
        cls.line1 = factory.LineFactory(
            contact=cls.user1, experimenter=cls.user1, study=cls.study1
        )
        cls.protocol1 = factory.ProtocolFactory()
        cls.assay1 = factory.AssayFactory(line=cls.line1, protocol=cls.protocol1)
        cls.type1 = factory.MetaboliteFactory()
        cls.meas1 = factory.MeasurementFactory(
            experimenter=cls.user1, measurement_type=cls.type1, assay=cls.assay1
        )
        cls.meas2 = factory.MeasurementFactory(experimenter=cls.user1, assay=cls.assay1)
        x1 = [0, 4, 8, 12, 18, 24]
        y1 = [0.0, 0.1, 0.2, 0.4, 0.8, 1.6]
        for x, y in zip(x1, y1):
            factory.ValueFactory(measurement=cls.meas1, x=[x], y=[y])
        factory.ValueFactory(measurement=cls.meas1, x=[32])

    def test_protocol_naming(self):
        # non-duplicate names
        with self.assertRaises(ValueError) as raised:
            Protocol.objects.create(name=self.protocol1.name)
        self.assertEqual(
            str(raised.exception),
            f"There is already a protocol named '{self.protocol1.name}'.",
        )
        # non-empty names
        with self.assertRaises(ValueError) as raised:
            Protocol.objects.create(name="")
        self.assertEqual(str(raised.exception), "Protocol name required.")
        # no errors serializing to json
        self.protocol1.to_json()

    def test_assay_naming(self):
        # no errors serializing to json
        self.assay1.to_json()
        # increment for naming works
        p = self.assay1.protocol
        self.assertEqual(self.assay1.line.new_assay_number(p), 2)

    def test_measurement_type(self):
        self.assertTrue(self.type1.is_metabolite())
        self.assertFalse(self.type1.is_protein())
        self.assertFalse(self.type1.is_gene())

    def test_measurement(self):
        self.assertEqual(self.meas1.measurementvalue_set.count(), 7)
        mdata = list(self.meas1.measurementvalue_set.order_by("x").all())
        self.assertEqual(mdata[0].x[0], 0)
        self.assertEqual(mdata[0].y[0], 0)
        self.assertEqual(mdata[-1].x[0], 32)
        self.assertFalse(mdata[-1].y)

    def test_measurement_extract(self):
        self.assertEqual(
            self.meas1.extract_data_xvalues(), [0.0, 4.0, 8.0, 12.0, 18.0, 24.0, 32.0]
        )
        self.assertEqual(
            self.meas1.extract_data_xvalues(defined_only=True),
            [0.0, 4.0, 8.0, 12.0, 18.0, 24.0],
        )
        self.assertEqual(self.meas2.extract_data_xvalues(), [])

    def test_measurement_interpolate(self):
        # interpolation inside domain gives value
        y_interp = self.meas1.interpolate_at(21)
        if hasattr(math, "isclose"):
            self.assertTrue(math.isclose(y_interp, 1.2))
        else:
            self.assertEqual(str(y_interp), "1.2")
        # interpolation outside domain is undefined/None
        self.assertIsNone(self.meas1.interpolate_at(25))
        # interpolation with no data raises exception
        with self.assertRaises(ValueError):
            self.meas2.interpolate_at(20)


class SBMLUtilTests(TestCase):
    """ Unit tests for various utilities used in SBML export """

    def test_sbml_notes(self):
        try:
            import libsbml
        except ImportError as e:
            warnings.warn("%s" % e)
        else:
            libsbml.SBML_DOCUMENT  # check to make sure it loaded
            builder = sbml_export.SbmlBuilder()
            notes = builder.create_note_body()
            notes = builder.update_note_body(
                notes,
                **{
                    "CONCENTRATION_CURRENT": [0.5],
                    "CONCENTRATION_HIGHEST": [1.0],
                    "CONCENTRATION_LOWEST": [0.01],
                },
            )
            notes_dict = builder.parse_note_body(notes)
            self.assertEqual(
                dict(notes_dict),
                {
                    "CONCENTRATION_CURRENT": "0.5",
                    "CONCENTRATION_LOWEST": "0.01",
                    "CONCENTRATION_HIGHEST": "1.0",
                },
            )


class ExportTests(TestCase):
    """ Test export of assay measurement data, either as simple tables or SBML. """

    # fixtures = ['export_data_1', ]

    def test_data_export(self):
        # TODO tests using main.forms.ExportSelectionForm, main.forms.ExportOptionForm, and
        #   main.views.ExportView
        pass

    def test_user_permission(self):
        # TODO tests using main.forms.ExportSelectionForm, main.forms.ExportOptionForm, and
        #   main.views.ExportView
        pass

    def test_sbml_export(self):
        # TODO tests using main.export.sbml.SbmlExport
        pass

    def test_data_export_errors(self):
        # TODO tests using main.export.sbml.SbmlExport
        pass


class IceTests(TestCase):
    def test_entry_uri_pattern(self):
        from jbei.rest.clients.ice.api import ICE_ENTRY_URL_PATTERN

        # test matching against ICE URI's with a numeric ID
        uri = "https://registry-test.jbei.org/entry/49194/"
        match = ICE_ENTRY_URL_PATTERN.match(uri)
        self.assertEqual("https", match.group(1))
        self.assertEqual("registry-test.jbei.org", match.group(2))
        self.assertEqual("49194", match.group(3))

        # test matching against ICE URI's with a UUID
        uri = (
            "https://registry-test.jbei.org/entry/761ec36a-cd17-41b8-a348-45d7552d4f4f"
        )
        match = ICE_ENTRY_URL_PATTERN.match(uri)
        self.assertEqual("https", match.group(1))
        self.assertEqual("registry-test.jbei.org", match.group(2))
        self.assertEqual("761ec36a-cd17-41b8-a348-45d7552d4f4f", match.group(3))

        # verify non-match against invalid URLs
        uri = "ftp://registry.jbei.org/entry/12345"
        self.assertIsNone(ICE_ENTRY_URL_PATTERN.match(uri))
        uri = "http://registry.jbei.org/admin/12345"
        self.assertIsNone(ICE_ENTRY_URL_PATTERN.match(uri))
        uri = "http://registry.jbei.org/entry/12345/experiments"
        self.assertIsNone(ICE_ENTRY_URL_PATTERN.match(uri))
        uri = "http://registry.jbei.org/entry/foobar"
        self.assertIsNone(ICE_ENTRY_URL_PATTERN.match(uri))


class MetaboliteTests(TestCase):
    def test_carbon_count(self):
        # a formula string without any carbons should return 0
        m1 = factory.MetaboliteFactory.build(molecular_formula="H2O")
        self.assertEqual(m1.extract_carbon_count(), 0)
        # a formula string with a single carbon should return 1
        m2 = factory.MetaboliteFactory.build(molecular_formula="CH4")
        self.assertEqual(m2.extract_carbon_count(), 1)
        # a formula string with a C that is not carbon should not count it as carbon
        m3 = factory.MetaboliteFactory.build(molecular_formula="CuO4S")
        self.assertEqual(m3.extract_carbon_count(), 0)
        # a formula string with a subscripted carbon should return the subscript count
        m4 = factory.MetaboliteFactory.build(molecular_formula="C6H12O6")
        self.assertEqual(m4.extract_carbon_count(), 6)

    def test_pubchem_load_existing(self):
        # create a metabolite with a CID
        m = factory.MetaboliteFactory(pubchem_cid=factory.factory.Faker("pyint"))
        cid = m.pubchem_cid
        # not in the CID:00000 format raises an error
        with self.assertRaises(ValidationError):
            edd_models.Metabolite.load_or_create(f"{cid}")
        found = edd_models.Metabolite.load_or_create(f"CID:{cid}")
        self.assertEqual(m.id, found.id)

    def test_pubchem_create(self):
        # patch to not actually call out to PubChem
        with patch("main.models.measurement_type.metabolite_load_pubchem.delay"):
            created = edd_models.Metabolite.load_or_create("CID:9999")
        # verify provisional type
        self.assertTrue(created.provisional)
        self.assertEqual(created.pubchem_cid, "9999")
