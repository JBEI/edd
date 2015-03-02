from django.contrib.auth.models import User, Group
from django.test import TestCase
from main.models import * #Study, Update, UserPermission, GroupPermission
from main.solr import StudySearch
import main.data_export

class StudyTests(TestCase):
    
    def setUp(self):
        TestCase.setUp(self)
        email = 'wcmorrell@lbl.gov'
        user1 = User.objects.create_user(username='test1', email=email, password='password')
        user2 = User.objects.create_user(username='test2', email=email, password='password')
        user3 = User.objects.create_user(username='test3', email=email, password='password')
        user4 = User.objects.create_user(username='test4', email=email, password='password')
        fuels = Group.objects.create(name='Fuels Synthesis')
        decon = Group.objects.create(name='Deconstruction')
        user1.groups.add(fuels)
        user2.groups.add(decon)
        user3.groups.add(fuels, decon)
        # user4 will have no groups
        up1 = Update.objects.create(mod_by=user1)
        up2 = Update.objects.create(mod_by=user2)
        up3 = Update.objects.create(mod_by=user3)
        study1 = Study.objects.create(name='Test Study 1', description='')
        study2 = Study.objects.create(name='Test Study 2', description='')

    def tearDown(self):
        TestCase.tearDown(self)

    def test_read_with_no_permissions(self):
        """
        Ensure that a study without permissions cannot be read.
        """
        # Load objects
        study = Study.objects.get(name='Test Study 1')
        user1 = User.objects.get(username='test1')
        # Asserts
        self.assertFalse(study.user_can_read(user1))

    def test_user_read_write_permission(self):
        """
        Ensure that a study with user having read or write permissions can be read.
        """
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
        """
        Ensure that a study with group having read or write permissions can be read.
        """
        # Load objects
        study = Study.objects.get(name='Test Study 1')
        fuels = Group.objects.get(name='Fuels Synthesis')
        decon = Group.objects.get(name='Deconstruction')
        user1 = User.objects.get(username='test1') # fuels
        user2 = User.objects.get(username='test2') # decon
        user3 = User.objects.get(username='test3') # fuels AND decon
        user4 = User.objects.get(username='test4') # no group
        # Create permissions
        GroupPermission.objects.create(study=study, permission_type='W', group=fuels)
        GroupPermission.objects.create(study=study, permission_type='R', group=decon)
        # Asserts
        self.assertTrue(study.user_can_read(user1))
        self.assertTrue(study.user_can_write(user1))
        self.assertTrue(study.user_can_read(user2))
        self.assertFalse(study.user_can_write(user2))
        self.assertTrue(study.user_can_read(user3))
        self.assertTrue(study.user_can_write(user3))
        self.assertFalse(study.user_can_read(user4))
        self.assertFalse(study.user_can_write(user4))


class SolrTests(TestCase):

    def setUp(self):
        TestCase.setUp(self)
        email = 'wcmorrell@lbl.gov'
        self.admin = User.objects.create_superuser(username='admin', email=email, password='12345')
        self.user1 = User.objects.create_user(username='test1', email=email, password='password')
        self.solr_admin = StudySearch(ident=self.admin, settings_key='test')
        self.solr_user = StudySearch(ident=self.user1, settings_key='test')
        up1 = Update.objects.create(mod_by=self.user1)
        self.study1 = Study.objects.create(name='Test Study 1',
                                           description='Lorem ipsum dolor sit amet')
        self.study1.updates.add(up1)
        self.solr_admin.clear()

    def tearDown(self):
        self.solr_admin.clear()
        TestCase.tearDown(self)

    def test_initially_empty(self):
        result = self.solr_user.query(query='*:*')
        self.assertEqual(result['response']['numFound'], 0, "The test index is not initially empty")

    def test_add_and_retrieve(self):
        pre_add = self.solr_admin.query(query='description:dolor')
        add = self.solr_user.update([self.study1])
        post_add = self.solr_admin.query(query='description:dolor')
        self.assertEqual(pre_add['response']['numFound'], 0, "Study in index before it was added")
        self.assertEqual(post_add['response']['numFound'], 1, "Added study was not found in query")

class MeasurementTests(TestCase) :
    def setUp (self) :
        TestCase.setUp(self)
        user1 = User.objects.create_user(username="admin",
            email="nechols@lbl.gov", password='12345')
        study1 = Study.objects.create(name='Test Study 1', description='')
        line1 = study1.line_set.create(name="Line 1", description="",
            experimenter=user1, contact=user1)
        protocol1 = Protocol.objects.create(name="GC-MS", owned_by=user1)
        mt1 = Metabolite.objects.create(type_name="Mevalonate",
            short_name="mev", type_group="m", charge=-1, carbon_count=6,
            molecular_formula="C6H11O4", molar_mass=148.16)
        assay1 = line1.assay_set.create(name="Assay 1",
            protocol=protocol1, description="GC-MS assay", experimenter=user1)
        up1 = Update.objects.create(mod_by=user1)
        meas1 = assay1.measurement_set.create(experimenter=user1,
            measurement_type=mt1, compartment="1", update_ref=up1)
        mu1 = MeasurementUnit.objects.create(unit_name="hours")
        mu2 = MeasurementUnit.objects.create(unit_name="mM")
        x1 = [ 0, 4, 8, 12, 18, 24 ]
        y1 = [ 0.0, 0.1, 0.2, 0.4, 0.8, 1.6 ]
        for x, y in zip(x1, y1) :
            md = meas1.measurementdatum_set.create(updated=up1,
                x_units=mu1, y_units=mu2, x=x, y=y)
        meas1.measurementdatum_set.create(updated=up1,
            x_units=mu1, y_units=mu2, x=32, y=None)

    def test_extract (self) :
        assay = Assay.objects.get(name="Assay 1")
        meas1 = assay.measurement_set.all()[0]
        xval = meas1.extract_data_xvalues()
        assert (xval == [0.0, 4.0, 8.0, 12.0, 18.0, 24.0, 32.0])
        xval2 = meas1.extract_data_xvalues(defined_only=True)
        assert (xval2 == [0.0, 4.0, 8.0, 12.0, 18.0, 24.0])

    def test_interpolate (self) :
        assay = Assay.objects.get(name="Assay 1")
        meas1 = assay.measurement_set.all()[0]
        y_interp = meas1.interpolate_at(21)
        assert (y_interp == 1.2)
        y_interp2 = meas1.interpolate_at(25)
        assert (y_interp2 is None)

class ExportTests(TestCase) :
    """
    Test table dump of assay measurement data.
    """
    def setUp(self):
        TestCase.setUp(self)
        user1 = User.objects.create_user(username="admin",
            email="nechols@lbl.gov", password='12345')
        user2 = User.objects.create_user(username="postdoc",
            email="nechols@lbl.gov", password='12345')
        study1 = Study.objects.create(name='Test Study 1', description='')
        UserPermission.objects.create(study=study1, permission_type='R',
            user=user1)
        line1 = study1.line_set.create(name="Line 1", description="",
            experimenter=user1, contact=user1)
        line2 = study1.line_set.create(name="Line 2", description="",
            study=study1, experimenter=user1, contact=user1)
        protocol1 = Protocol.objects.create(name="GC-MS", owned_by=user1)
        mt1 = Metabolite.objects.create(type_name="Mevalonate",
            short_name="mev", type_group="m", charge=-1, carbon_count=6,
            molecular_formula="C6H11O4", molar_mass=148.16)
        mt2 = Metabolite.objects.create(type_name="Citrate", short_name="cit",
            type_group="m", charge=-3, carbon_count=6,
            molecular_formula="C3H5O(COO)3)", molar_mass=189)
        assay1 = line1.assay_set.create(name="Assay 1",
            protocol=protocol1, description="GC-MS assay", experimenter=user1)
        assay2 = line2.assay_set.create(name="Assay 2",
            protocol=protocol1, description="GC-MS assay", experimenter=user1)
        up1 = Update.objects.create(mod_by=user1)
        meas1 = assay1.measurement_set.create(experimenter=user1,
            measurement_type=mt1, compartment="1", update_ref=up1)
        meas2 = assay1.measurement_set.create(experimenter=user1,
            measurement_type=mt2, compartment="1", update_ref=up1)
        meas3 = assay2.measurement_set.create(experimenter=user1,
            measurement_type=mt1, compartment="1", update_ref=up1)
        meas4 = assay2.measurement_set.create(experimenter=user1,
            measurement_type=mt2, compartment="1", update_ref=up1)
        mu1 = MeasurementUnit.objects.create(unit_name="hours")
        mu2 = MeasurementUnit.objects.create(unit_name="mM")
        x1 = [ 0, 4, 8, 12, 18, 24 ]
        y1 = [ 0.0, 0.1, 0.2, 0.4, 0.8, 1.6 ]
        y2 = [ 0.0, 0.5, 0.6, 0.65, 0.675, 0.69 ]
        y3 = [ 0.0, 0.2, 0.4, 0.8, 1.6, 3.2 ]
        y4 = [ 0.0, 0.5, 1.1, 2.05, 4.09, 5.45 ]
        for x, y in zip(x1, y1) :
            md = meas1.measurementdatum_set.create(updated=up1,
                x_units=mu1, y_units=mu2, x=x, y=y)
        for x, y in zip(x1, y2) :
            md = meas2.measurementdatum_set.create(updated=up1,
                x_units=mu1, y_units=mu2, x=x, y=y)
        for x, y in zip(x1, y3) :
            md = meas3.measurementdatum_set.create(updated=up1,
                x_units=mu1, y_units=mu2, x=x, y=y)
        for x, y in zip(x1, y4) :
            md = meas4.measurementdatum_set.create(updated=up1,
                x_units=mu1, y_units=mu2, x=x, y=y)

    def tearDown(self):
        TestCase.tearDown(self)

    def test_data_export (self) :
        study = Study.objects.get(name="Test Study 1")
        lines = study.line_set.all()
        assays = []
        for line in lines : assays.extend(list(line.assay_set.all()))
        form = {
            "selectedLineIDs" : ",".join([ str(l.id) for l in lines ]),
            "selectedAssayIDs" : ",".join([ str(a.id) for a in assays ]),
            "assaylevel" : "1",
        }
        user = User.objects.get(username="admin")
        exports = main.data_export.select_objects_for_export(study, user, form)
        table = main.data_export.assemble_table(**exports)
        self.assertTrue(len(table) == 5)
        self.assertTrue(len(table[0]) == 21)
        self.assertTrue(table[0][-6:] == [ 0, 4, 8, 12, 18, 24 ]) # x1 in setUp
        # XXX y4 in setUp - note that sorting by metabolite changes order
        self.assertTrue(table[3][-6:] == [ 0.0, 0.5, 1.1, 2.05, 4.09, 5.45 ])
        # TODO more checks for expected content
        kwds = dict(exports)
        kwds['column_flags'] = { l:1 for l in [
            "LineContact", "LineLastModified", "AssayLastModified" ] }
        t = main.data_export.assemble_table(**kwds)
        #print t
        self.assertTrue(len(t[0]) == 18)
        self.assertTrue(not "Line Last Modified" in t[0])
        kwds = dict(exports)
        kwds['separate_lines'] = True
        kwds['separate_protocols'] = True
        t = main.data_export.assemble_table(**kwds)
        #print t
        # TODO check content

    def test_user_permission (self) :
        study = Study.objects.get(name="Test Study 1")
        lines = study.line_set.all()
        assays = []
        for line in lines : assays.extend(list(line.assay_set.all()))
        form = {
            "selectedLineIDs" : ",".join([ str(l.id) for l in lines ]),
            "selectedAssayIDs" : ",".join([ str(a.id) for a in assays ]),
            "assaylevel" : "1",
        }
        user2 = User.objects.get(username="postdoc")
        try :
            exports = main.data_export.select_objects_for_export(study, user2,
                form)
        except RuntimeError :
            pass
        else :
            raise Exception("Should have caught an exception here!")
