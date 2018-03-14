# -*- coding: utf-8 -*-

import math
import warnings

from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from django.core.exceptions import PermissionDenied
from django.test import RequestFactory
from threadlocals.threadlocals import set_thread_variable

from ..export import sbml as sbml_export
from ..forms import LineForm
from ..importer import TableImport
from ..models import (
    Assay, CarbonSource, GeneIdentifier, GroupPermission, Line, MeasurementType,
    MeasurementUnit, Metabolite, MetadataGroup, MetadataType, Protocol, Strain, Study, Update,
    UserPermission)
from ..solr import StudySearch
from . import factory, TestCase


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
        'description', 'disabled', 'email', 'firstname', 'groups', 'id', 'initials', 'institution',
        'lastname', 'name', 'uid',
    ]
    SOLR_KEYS = [
        'date_joined', 'email', 'fullname', 'group', 'id', 'initials', 'institution', 'is_active',
        'is_staff', 'is_superuser', 'last_login', 'name', 'username',
    ]

    # create test users
    @classmethod
    def setUpTestData(cls):
        cls.user1 = factory.UserFactory(
            email="jsmith@localhost",
            first_name="Jane",
            last_name="Smith",
        )
        cls.user2 = factory.UserFactory(
            email="jdoe@localhost",
            first_name='',
            last_name='',
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
        self.assertEqual(self.user1.initials, 'JS')
        self.assertEqual(self.user1.profile.initials, 'JS')
        self.assertIsNone(self.user1.institution)
        self.assertEqual(len(self.user1.institutions), 0)
        self.assertIsNotNone(self.user2.profile)
        self.assertEqual(self.user2.initials, '')
        self.assertEqual(self.user2.profile.initials, '')
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
        self.assertFalse(self.user1.has_perm('main.change.protocol'))
        self.assertTrue(self.admin.has_perm('main.change.protocol'))


class StudyTests(TestCase):
    def setUp(self):
        super(StudyTests, self).setUp()
        email = 'wcmorrell@lbl.gov'
        user1 = User.objects.create_user(username='test1', email=email, password='password')
        user2 = User.objects.create_user(username='test2', email=email, password='password')
        user3 = User.objects.create_user(username='test3', email=email, password='password')
        User.objects.create_user(username='test4', email=email, password='password')
        fuels = Group.objects.create(name='Fuels Synthesis')
        decon = Group.objects.create(name='Deconstruction')
        user1.groups.add(fuels)
        user2.groups.add(decon)
        user3.groups.add(fuels, decon)
        # test4 user will have no groups
        Study.objects.create(name='Test Study 1', description='')
        Study.objects.create(name='Test Study 2', description='')
        mdg1 = MetadataGroup.objects.create(group_name="Misc")
        MetadataType.objects.create(
            type_name="Some key",
            group=mdg1,
            for_context=MetadataType.STUDY)
        MetadataType.objects.create(
            type_name="Some key 2",
            group=mdg1,
            for_context=MetadataType.LINE)
        MetadataType.objects.create(
            type_name="Some key 3",
            group=mdg1,
            for_context=MetadataType.ASSAY)

    def tearDown(self):
        TestCase.tearDown(self)

    def test_read_with_no_permissions(self):
        """ Ensure that a study without permissions cannot be read. """
        # Load objects
        study = Study.objects.get(name='Test Study 1')
        user1 = User.objects.get(username='test1')
        # Asserts
        self.assertFalse(study.user_can_read(user1))

    def test_user_read_write_permission(self):
        """ Ensure that a study with user having read or write permissions can be read. """
        # Load objects
        study = Study.objects.get(name='Test Study 1')
        user1 = User.objects.get(username='test1')
        user2 = User.objects.get(username='test2')
        user3 = User.objects.get(username='test3')
        # Create permissions
        UserPermission.objects.create(study=study, permission_type='W', user=user1)
        UserPermission.objects.create(study=study, permission_type='R', user=user2)
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
        study = Study.objects.get(name='Test Study 1')
        fuels = Group.objects.get(name='Fuels Synthesis')
        decon = Group.objects.get(name='Deconstruction')
        user1 = User.objects.get(username='test1')  # fuels
        user2 = User.objects.get(username='test2')  # decon
        user3 = User.objects.get(username='test3')  # fuels AND decon
        user4 = User.objects.get(username='test4')  # no group
        # Create permissions
        GroupPermission.objects.create(study=study,
                                       permission_type=GroupPermission.WRITE,
                                       group=fuels)
        GroupPermission.objects.create(study=study,
                                       permission_type=GroupPermission.READ,
                                       group=decon)
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
        study = Study.objects.get(name='Test Study 1')
        md = MetadataType.objects.get(type_name='Some key')
        md3 = MetadataType.objects.get(type_name='Some key 3')
        study.metadata_add(md, '1.234')
        self.assertTrue(study.metadata_get(md) == "1.234")
        self.assertTrue(study.get_metadata_dict() == {'Some key': '1.234'})
        try:
            study.metadata_add(md3, '9.876')
        except ValueError:
            pass
        else:
            raise Exception("Should have caught a ValueError here...")


class SolrTests(TestCase):

    @classmethod
    def setUpTestData(cls):
        super(SolrTests, cls).setUpTestData()
        cls.admin = factory.UserFactory(is_superuser=True)
        cls.user1 = factory.UserFactory()
        cls.study = factory.StudyFactory(description='Lorem ipsum dolor sit amet')

    def setUp(self):
        super(SolrTests, self).setUp()
        self.solr_admin = StudySearch(ident=self.admin)
        self.solr_admin.clear()

    def tearDown(self):
        self.solr_admin.clear()
        super(SolrTests, self).tearDown()

    def test_initially_empty(self):
        solr = StudySearch(ident=self.user1)
        result = solr.query(query='*:*')
        self.assertEqual(result['response']['numFound'], 0,
                         "The test index is not initially empty")

    def test_add_and_retrieve(self):
        solr = StudySearch(ident=self.user1)
        pre_add = self.solr_admin.query(query='description:dolor')
        solr.update([self.study])
        post_add = self.solr_admin.query(query='description:dolor')
        self.assertEqual(pre_add['response']['numFound'], 0, "Study in index before it was added")
        self.assertEqual(post_add['response']['numFound'], 1, "Added study was not found in query")


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
            description="Desc 1"
        )
        cls.cs2 = CarbonSource.objects.create(
            name="Carbon source 2",
            labeling="20% 13C",
            volume=100.0
        )
        cls.cs3 = CarbonSource.objects.create(
            name="Carbon source 3",
            labeling="40% 14C",
            volume=100.0
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
        request = RequestFactory().get('/')
        request.user = self.user1
        set_thread_variable('request', request)

    def test_line_metadata(self):
        media = MetadataType.objects.get(type_name="Media")
        rt = MetadataType.objects.get(type_name="Retention Time")
        self.line1.metadata_add(media, "M9")
        self.assertEqual(self.line1.metadata_get(media), "M9")
        with self.assertRaises(ValueError):
            self.line1.metadata_add(rt, 1.5)

    def test_line_form(self):
        self.assertFalse(self.line1.control)
        # default form to existing data
        data = LineForm.initial_from_model(self.line1, prefix='line')
        # flip the checkbox for control
        data['line-control'] = True
        form = LineForm(data, instance=self.line1, prefix='line', study=self.line1.study)
        # verify the form validates
        self.assertTrue(form.is_valid(), '%s' % form._errors)
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

    def setUp(self):
        super(AssayDataTests, self).setUp()
        user1 = User.objects.create_user(
            username="admin", email="nechols@lbl.gov", password='12345')
        study1 = Study.objects.create(name='Test Study 1', description='')
        line1 = study1.line_set.create(
            name="WT1", description="", experimenter=user1, contact=user1)
        protocol1 = Protocol.objects.create(
            name="gc-ms", categorization=Protocol.CATEGORY_LCMS, owned_by=user1)
        protocol2 = Protocol.objects.get(name='OD600')
        Protocol.objects.create(name="New protocol", owned_by=user1, active=False)
        mt1 = Metabolite.objects.get(short_name="ac")
        mt2 = GeneIdentifier.objects.create(
            type_name="Gene name 1", short_name="gen1", type_group="g")
        mt3 = MeasurementType.create_protein(
            type_name="Protein name 2", short_name="prot2")
        assay1 = line1.assay_set.create(
            name="1", protocol=protocol1, description="GC-MS assay 1", experimenter=user1)
        line1.assay_set.create(
            name="1", protocol=protocol2, description="OD600 assay 1", experimenter=user1)
        up1 = Update.objects.create(mod_by=user1)
        mu1 = MeasurementUnit.objects.get(unit_name="hours")
        mu2 = MeasurementUnit.objects.get(unit_name="mM")
        meas1 = assay1.measurement_set.create(
            experimenter=user1, measurement_type=mt1, compartment="1", update_ref=up1,
            x_units=mu1, y_units=mu2)
        assay1.measurement_set.create(
            experimenter=user1, measurement_type=mt2, compartment="1", update_ref=up1,
            x_units=mu1, y_units=mu2)
        assay1.measurement_set.create(
            experimenter=user1, measurement_type=mt3, compartment="1", update_ref=up1,
            x_units=mu1, y_units=mu2)
        x1 = [0, 4, 8, 12, 18, 24, ]
        y1 = [0.0, 0.1, 0.2, 0.4, 0.8, 1.6, ]
        for x, y in zip(x1, y1):
            meas1.measurementvalue_set.create(updated=up1, x=[x], y=[y])
        meas1.measurementvalue_set.create(updated=up1, x=[32], y=[])

    def test_protocol(self):
        p1 = Assay.objects.get(description="GC-MS assay 1").protocol
        p2 = Protocol.objects.get(name="OD600")
        p3 = Protocol.objects.filter(active=False)[0]
        self.assertTrue('%s' % p1 == "gc-ms")
        self.assertTrue(p1.categorization == Protocol.CATEGORY_LCMS)
        self.assertTrue(p2.categorization == Protocol.CATEGORY_OD)
        self.assertTrue(p3.categorization == Protocol.CATEGORY_NONE)
        p1_json = p1.to_json()
        self.assertTrue(p1_json.get('active', False))
        self.assertTrue(p1_json.get('name', None) == 'gc-ms')
        p3_json = p3.to_json()
        self.assertFalse(p3_json.get('active', True))
        self.assertTrue(p3_json.get('name', None) == 'New protocol')
        user1 = User.objects.get(username="admin")
        Protocol.objects.create(name="Another protocol", owned_by=user1, variant_of_id=p3.id)
        try:
            Protocol.objects.create(name="Another protocol", owned_by=user1, variant_of_id=p3.id)
        except ValueError as e:
            self.assertTrue('%s' % e == "There is already a protocol named 'Another protocol'.")
        else:
            raise Exception("Should have caught a ValueError...")
        try:
            Protocol.objects.create(name="", owned_by=user1)
        except ValueError as e:
            self.assertTrue('%s' % e == "Protocol name required.")
        else:
            raise Exception("Should have caught a ValueError...")

    def test_assay(self):
        assay = Assay.objects.get(description="GC-MS assay 1")
        assay.to_json()
        new_assay_number = assay.line.new_assay_number("gc-ms")
        self.assertTrue(new_assay_number == 2)

    def test_measurement_type(self):
        assay = Assay.objects.get(description="GC-MS assay 1")
        meas1 = assay.measurement_set.filter(measurement_type__short_name="ac")[0]
        mt1 = meas1.measurement_type
        # ((<MeasurementType: Acetate>, mt1.is_metabolite() == False, False, False))
        self.assertTrue(mt1.is_metabolite() and not mt1.is_protein() and not mt1.is_gene())

    def test_measurement(self):
        assay = Assay.objects.get(description="GC-MS assay 1")
        metabolites = list(assay.measurement_set.filter(
            measurement_type__type_group=MeasurementType.Group.METABOLITE
        ))  # []
        self.assertTrue(len(metabolites) == 1)
        meas1 = metabolites[0]
        self.assertTrue(meas1.y_axis_units_name == "mM")
        self.assertTrue(meas1.name == "Acetate")
        self.assertTrue(meas1.short_name == "ac")
        self.assertTrue(meas1.full_name == "Intracellular/Cytosol (Cy) Acetate")
        self.assertTrue(meas1.is_concentration_measurement())
        self.assertTrue(not meas1.is_carbon_ratio())
        mdata = list(meas1.measurementvalue_set.all())
        self.assertTrue(mdata[0].x[0] == 0)
        self.assertTrue(mdata[0].y[0] == 0)
        self.assertTrue(mdata[-1].x[0] == 32)
        self.assertFalse(mdata[-1].y)

    def test_measurement_extract(self):
        assay = Assay.objects.get(description="GC-MS assay 1")
        meas1 = assay.measurement_set.filter(
            measurement_type__type_group=MeasurementType.Group.METABOLITE
        )[0]
        meas2 = assay.measurement_set.filter(
            measurement_type__type_group=MeasurementType.Group.GENEID
        )[0]
        xval = meas1.extract_data_xvalues()
        self.assertTrue(xval == [0.0, 4.0, 8.0, 12.0, 18.0, 24.0, 32.0])
        xval2 = meas1.extract_data_xvalues(defined_only=True)
        self.assertTrue(xval2 == [0.0, 4.0, 8.0, 12.0, 18.0, 24.0])
        xval3 = meas2.extract_data_xvalues()
        self.assertTrue(len(xval3) == 0)

    def test_measurement_interpolate(self):
        assay = Assay.objects.get(description="GC-MS assay 1")
        meas1 = assay.measurement_set.filter(
            measurement_type__type_group=MeasurementType.Group.METABOLITE
        )[0]  # returns []
        meas2 = assay.measurement_set.filter(
            measurement_type__type_group=MeasurementType.Group.GENEID
        )[0]
        y_interp = meas1.interpolate_at(21)
        if hasattr(math, 'isclose'):
            self.assertTrue(math.isclose(y_interp, 1.2))
        else:
            self.assertEqual('%s' % y_interp, "1.2")
        y_interp2 = meas1.interpolate_at(25)
        self.assertIsNone(y_interp2)
        try:
            meas2.interpolate_at(20)
        except ValueError:
            pass
        else:
            raise Exception("Should have caught an exception here")


class ImportTests(TestCase):
    """ Test import of assay measurement data. """
    table1 = [  # FPKM
        ["GENE",  "L1-1", "L1-2", "L2-1", "L2-2"],
        ["gene1", "5.34", "5.32", "7.45", "7.56"],
        ["gene2", "1.79", "1.94", "0.15", "0.33"],
    ]
    table2 = [  # count
        ["GENE",  "L1-1", "L1-2", "L2-1", "L2-2"],
        ["gene1", "64", "67", "89", "91"],
        ["gene2", "27", "30", "5", "4"],
    ]
    table3 = [  # combined
        ["GENE",  "L1-1", "L1-2", "L2-1", "L2-2"],
        ["gene1", "64,5.34", "67,5.32", "89,7.45", "91,7.56"],
        ["gene2", "27,1.79", "30,1.94", "5,0.15", "4,0.33"],
    ]

    @classmethod
    def setUpTestData(cls):
        cls.user1 = factory.UserFactory(username="admin")
        cls.user2 = factory.UserFactory(username="postdoc")
        cls.study1 = factory.StudyFactory(name='Test Study 1')
        permissions = cls.study1.userpermission_set
        permissions.update_or_create(permission_type=UserPermission.WRITE, user=cls.user1)
        permissions.update_or_create(permission_type=UserPermission.READ, user=cls.user2)
        cls.line1 = cls.study1.line_set.create(
            name="L1",
            description="Line 1",
            experimenter=cls.user1,
            contact=cls.user1,
        )
        cls.line2 = cls.study1.line_set.create(
            name="L2",
            description="Line 2",
            experimenter=cls.user1,
            contact=cls.user1,
        )
        cls.transcriptomics = Protocol.objects.create(name="Transcriptomics", owned_by=cls.user1)

    def setUp(self):
        super(ImportTests, self).setUp()
        # fake a request so all calls to Update.load_update resolve to a singluar Update
        self.request = RequestFactory().get('/')
        self.request.user = self.user1
        set_thread_variable('request', self.request)

    def get_form(self):
        p_id = str(Protocol.objects.get(name="GC-MS").pk)
        l_id = str(Line.objects.get(name="L1").pk)
        m_id_a = str(Metabolite.objects.get(short_name="ac").pk)
        m_id_b = str(Metabolite.objects.get(short_name="glc__D").pk)
        u_id = str(MeasurementUnit.objects.get(unit_name="mM").pk)
        # breaking up big text blob
        json = (
            '[{'
            '"kind":"std",'
            '"protocol_name":"GC-MS",'
            '"protocol_id":"%(protocol_id)s",'
            '"line_name":"",'
            '"line_id":"%(line_id)s",'
            '"assay_name":"Column 0",'
            '"assay_id":"named_or_new",'
            '"measurement_name":"ac",'
            '"measurement_id":"%(measurement_id_a)s",'
            '"comp_name":"ic",'
            '"comp_id":"1",'
            '"units_name":"units",'
            '"units_id":"%(units_id)s",'
            '"metadata":{  },'
            '"data":[[0,"0.1"],[1,"0.2"],[2,"0.4"],[4,"1.7"],[8,"5.9"]]'
            '},{'
            '"kind":"std",'
            '"protocol_name":"GC-MS",'
            '"protocol_id":"%(protocol_id)s",'
            '"line_name":"",'
            '"line_id":"%(line_id)s",'
            '"assay_name":"Column 0",'
            '"assay_id":"named_or_new",'
            '"measurement_name":"glc__D",'
            '"measurement_id":"%(measurement_id_b)s",'
            '"comp_name":"ic",'
            '"comp_id":"1",'
            '"units_name":"units",'
            '"units_id":"%(units_id)s",'
            '"metadata":{  },'
            '"data":[[0,"0.2"],[1,"0.4"],[2,"0.6"],[4,"0.8"],[8,"1.2"]]}]'
        ) % {
            'line_id': l_id,
            'measurement_id_a': m_id_a,
            'measurement_id_b': m_id_b,
            'protocol_id': p_id,
            'units_id': u_id,
        }
        # XXX not proud of this, but we need actual IDs in here
        return {
            'action': "Submit Import",
            'datalayout': "std",
            'jsonoutput': json,
            'rawdataformat': "csv",
            'studyID': Study.objects.get(name="Test Study 1").pk,
            'writemode': "m",
        }

    def test_import_gc_ms_metabolites(self):
        table = TableImport(self.study1, self.user1)
        (added, updated) = table.import_data(self.get_form())
        self.assertEqual(added, 10)
        self.assertEqual(updated, 0)
        data_literal = ("""[[(0.0, 0.1), (1.0, 0.2), (2.0, 0.4), (4.0, 1.7), (8.0, 5.9)], """
                        """[(0.0, 0.2), (1.0, 0.4), (2.0, 0.6), (4.0, 0.8), (8.0, 1.2)]]""")
        assays = self.line1.assay_set.all()
        self.assertEqual(len(assays), 1)
        meas = assays[0].measurement_set.all()
        self.assertEqual(len(meas), 2)
        data = []
        for m in meas:
            data.append([(float(d.x[0]), float(d.y[0])) for d in m.measurementvalue_set.all()])
        self.assertEqual(str(data), data_literal)

    def test_error(self):
        # failed user permissions check
        with self.assertRaises(PermissionDenied):
            table = TableImport(self.study1, self.user2)
            table.import_data(self.get_form())


class SBMLUtilTests(TestCase):
    """ Unit tests for various utilities used in SBML export """

    def test_sbml_notes(self):
        try:
            import libsbml
        except ImportError as e:
            warnings.warn('%s' % e)
        else:
            libsbml.SBML_DOCUMENT  # check to make sure it loaded
            builder = sbml_export.SbmlBuilder()
            notes = builder.create_note_body()
            notes = builder.update_note_body(notes, **{
                "CONCENTRATION_CURRENT": [0.5, ],
                "CONCENTRATION_HIGHEST": [1.0, ],
                "CONCENTRATION_LOWEST": [0.01, ],
            })
            notes_dict = builder.parse_note_body(notes)
            self.assertEqual(dict(notes_dict), {
                'CONCENTRATION_CURRENT': '0.5',
                'CONCENTRATION_LOWEST': '0.01',
                'CONCENTRATION_HIGHEST': '1.0',
            })


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
        uri = 'https://registry-test.jbei.org/entry/49194/'
        match = ICE_ENTRY_URL_PATTERN.match(uri)
        self.assertEqual('https', match.group(1))
        self.assertEqual('registry-test.jbei.org', match.group(2))
        self.assertEqual('49194', match.group(3))

        # test matching against ICE URI's with a UUID
        uri = 'https://registry-test.jbei.org/entry/761ec36a-cd17-41b8-a348-45d7552d4f4f'
        match = ICE_ENTRY_URL_PATTERN.match(uri)
        self.assertEqual('https', match.group(1))
        self.assertEqual('registry-test.jbei.org', match.group(2))
        self.assertEqual('761ec36a-cd17-41b8-a348-45d7552d4f4f', match.group(3))

        # verify non-match against invalid URLs
        uri = 'ftp://registry.jbei.org/entry/12345'
        self.assertIsNone(ICE_ENTRY_URL_PATTERN.match(uri))
        uri = 'http://registry.jbei.org/admin/12345'
        self.assertIsNone(ICE_ENTRY_URL_PATTERN.match(uri))
        uri = 'http://registry.jbei.org/entry/12345/experiments'
        self.assertIsNone(ICE_ENTRY_URL_PATTERN.match(uri))
        uri = 'http://registry.jbei.org/entry/foobar'
        self.assertIsNone(ICE_ENTRY_URL_PATTERN.match(uri))
