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
    CarbonSource,
    GroupPermission,
    Line,
    MeasurementUnit,
    Metabolite,
    MetadataGroup,
    MetadataType,
    Protocol,
    Strain,
    Study,
    UserPermission,
)
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
        with self.assertRaises(ValueError):
            study.metadata_add(md3, '9.876')


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

    def tearDown(self):
        set_thread_variable('request', None)

    def test_line_metadata(self):
        # 'media' is a MetadataType for Lines
        media = MetadataType.objects.get(type_name="Media")
        # 'original name' is a MetadataType for Assays
        orig_name = MetadataType.objects.get(type_name="Original Name")
        # adding line metadata to a line should work fine
        self.line1.metadata_add(media, "M9")
        self.assertEqual(self.line1.metadata_get(media), "M9")
        # adding assay metadata to a line should raise a ValueError
        with self.assertRaises(ValueError):
            self.line1.metadata_add(orig_name, "ABC13")

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

    @classmethod
    def setUpClass(cls):
        cls.user1 = factory.UserFactory()
        # fake a request so all calls to Update.load_update resolve to a singluar Update
        request = RequestFactory().get('/test-fixture')
        request.user = cls.user1
        set_thread_variable('request', request)
        # call parent *after* fake request is set up
        super().setUpClass()

    @classmethod
    def tearDownClass(cls):
        super().tearDownClass()
        set_thread_variable('request', None)

    @classmethod
    def setUpTestData(cls):
        super().setUpTestData()
        cls.study1 = factory.StudyFactory()
        cls.line1 = factory.LineFactory(
            contact=cls.user1,
            experimenter=cls.user1,
            study=cls.study1,
        )
        cls.protocol1 = factory.ProtocolFactory()
        cls.assay1 = factory.AssayFactory(
            line=cls.line1,
            protocol=cls.protocol1,
        )
        cls.type1 = factory.MetaboliteFactory()
        cls.meas1 = factory.MeasurementFactory(
            experimenter=cls.user1,
            measurement_type=cls.type1,
            assay=cls.assay1,
        )
        cls.meas2 = factory.MeasurementFactory(
            experimenter=cls.user1,
            assay=cls.assay1,
        )
        x1 = [0, 4, 8, 12, 18, 24, ]
        y1 = [0.0, 0.1, 0.2, 0.4, 0.8, 1.6, ]
        for x, y in zip(x1, y1):
            factory.ValueFactory(measurement=cls.meas1, x=[x], y=[y])
        factory.ValueFactory(measurement=cls.meas1, x=[32])

    def test_protocol_naming(self):
        # non-duplicate names
        with self.assertRaises(ValueError) as raised:
            Protocol.objects.create(name=self.protocol1.name)
        self.assertEqual(
            str(raised.exception),
            f"There is already a protocol named '{self.protocol1.name}'."
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
            self.meas1.extract_data_xvalues(),
            [0.0, 4.0, 8.0, 12.0, 18.0, 24.0, 32.0],
        )
        self.assertEqual(
            self.meas1.extract_data_xvalues(defined_only=True),
            [0.0, 4.0, 8.0, 12.0, 18.0, 24.0],
        )
        self.assertEqual(self.meas2.extract_data_xvalues(), [])

    def test_measurement_interpolate(self):
        # interpolation inside domain gives value
        y_interp = self.meas1.interpolate_at(21)
        if hasattr(math, 'isclose'):
            self.assertTrue(math.isclose(y_interp, 1.2))
        else:
            self.assertEqual(str(y_interp), "1.2")
        # interpolation outside domain is undefined/None
        self.assertIsNone(self.meas1.interpolate_at(25))
        # interpolation with no data raises exception
        with self.assertRaises(ValueError):
            self.meas2.interpolate_at(20)


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

    def get_json_data(self):
        p_id = str(Protocol.objects.get(name="GC-MS").pk)
        l_id = str(Line.objects.get(name="L1").pk)
        m_id_a = str(Metabolite.objects.get(short_name="ac").pk)
        m_id_b = str(Metabolite.objects.get(short_name="glc__D").pk)
        u_id = str(MeasurementUnit.objects.get(unit_name="mM").pk)

        series = [
            {
                "protocol_name": "GC-MS",
                "protocol_id": p_id,
                "line_name": "",
                "line_id": l_id,
                "assay_name": "Column 0",
                "assay_id": "named_or_new",
                "measurement_name": "ac",
                "measurement_id": m_id_a,
                "comp_name": "ic",
                "comp_id": "1",
                "units_name": "units",
                "units_id": u_id,
                "metadata": {},
                "data": [[0, "0.1"], [1, "0.2"], [2, "0.4"], [4, "1.7"], [8, "5.9"]]},
            {
                "kind": "std",
                "protocol_name": "GC-MS",
                "protocol_id": "5",
                "line_name": "",
                "line_id": l_id,
                "assay_name": "Column 0",
                "assay_id": "named_or_new",
                "measurement_name": "glc__D",
                "measurement_id": m_id_b,
                "comp_name": "ic",
                "comp_id": "1",
                "units_name": "units",
                "units_id": u_id,
                "metadata": {},
                "data": [[0, "0.2"], [1, "0.4"], [2, "0.6"], [4, "0.8"], [8, "1.2"]]
            }
        ]

        # XXX not proud of this, but we need actual IDs in here
        import_context = {
            'kind': 'std',
            'writemode': 'm',
        }
        return import_context, series

    def test_import_gc_ms_metabolites(self):
        table = TableImport(self.study1, self.user1)
        context, series_data = self.get_json_data()
        table.parse_context(context)
        (added, updated) = table.import_series_data(series_data)
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
            context, series = self.get_json_data()
            table.parse_context(context)
            table.import_series_data(series)


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
