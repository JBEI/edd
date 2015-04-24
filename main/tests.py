from django.contrib.auth.models import User, Group
from django.test import TestCase
from main.models import * #Study, Update, UserPermission, GroupPermission
from main.solr import StudySearch
from edd.profile.models import UserProfile
import main.data_export
import main.data_import
import main.sbml_export
import main.utilities
import warnings
import os.path

class UserTests(TestCase) :
    def setUp (self) :
        TestCase.setUp(self)
        user1 = User.objects.create_user(username='James Smith',
            email="jsmith@localhost",
            password='password')
        user2 = User.objects.create_user(username='John Doe',
            email="jdoe@localhost",
            password='password')
        profile1 = UserProfile.objects.create(
            user=user1,
            initials="JS",
            description="random postdoc")

    def test_monkey_patches (self) :
        user1 = User.objects.get(username="James Smith")
        user2 = User.objects.get(username="John Doe")
        self.assertTrue(user1.initials == "JS")
        self.assertTrue(user2.initials is None)
        user_json = user1.to_json()
        for key,value in {'initials': u'JS', 'uid': u'James Smith',
              'name': u'', 'email': u'jsmith@localhost'}.iteritems() :
            self.assertTrue(user_json[key] == value)


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
        mdg1 = MetadataGroup.objects.create(group_name="Misc")
        mdt1 = MetadataType.objects.create(
            type_name="Some key",
            group=mdg1,
            for_context=MetadataType.STUDY)
        mdt2 = MetadataType.objects.create(
            type_name="Some key 2",
            group=mdg1,
            for_context=MetadataType.ALL)
        mdt3 = MetadataType.objects.create(
            type_name="Some key 3",
            group=mdg1,
            for_context=MetadataType.PROTOCOL)

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

    def test_study_metadata (self) :
        study = Study.objects.get(name='Test Study 1')
        study.set_metadata_item("Some key", "1.234")
        study.set_metadata_item("Some key 2", "5.678")
        self.assertTrue(study.get_metadata_item("Some key") == "1.234")
        self.assertTrue(study.get_metadata_dict() ==
            {'Some key 2': '5.678', 'Some key': '1.234'})
        try :
            study.set_metadata_item("Some key 3", "9.876")
        except ValueError :
            pass
        else :
            raise Exception("Should have caught a ValueError here...")


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


class LineTests (TestCase) : # XXX also Strain, CarbonSource
    def setUp (self) :
        TestCase.setUp(self)
        user1 = User.objects.create_user(username="admin",
            email="nechols@lbl.gov", password='12345')
        study1 = Study.objects.create(name='Test Study 1', description='')
        study2 = Study.objects.create(name='Test Study 2', description='')
        cs1 = CarbonSource.objects.create(name="Carbon source 1",
            labeling="100% unlabeled", volume=50.0, description="Desc 1")
        cs2 = CarbonSource.objects.create(name="Carbon source 2",
            labeling="20% 13C", volume=100.0)
        cs3 = CarbonSource.objects.create(name="Carbon source 3",
            labeling="40% 14C", volume=100.0)
        strain1 = Strain.objects.create(name="Strain 1",
            description="JBEI strain 1",
            registry_url="http://registry.jbei.org/strain/666")
        strain2 = Strain.objects.create(name="Strain 2")
        line1 = study1.line_set.create(name="Line 1", description="mutant 1",
            experimenter=user1, contact=user1)
        line1.carbon_source.add(cs1)
        line2 = study1.line_set.create(name="Line 2", description="mutant 2",
            experimenter=user1, contact=user1)
        line2.carbon_source.add(cs2)
        line3 = study2.line_set.create(name="Line 3",
            description="double mutant",
            experimenter=user1, contact=user1)
        line3.carbon_source.add(cs1)
        line3.carbon_source.add(cs3)
        line1.strains.add(strain1)
        line2.strains.add(strain1)
        line3.strains.add(strain1)
        line3.strains.add(strain2)
        mdg1 = MetadataGroup.objects.create(group_name="Line metadata")
        mdt1 = MetadataType.objects.create(
            type_name="Media",
            group=mdg1,
            for_context=MetadataType.LINE)
        mdg2 = MetadataGroup.objects.create(group_name="Assay metadata")
        mdt2 = MetadataType.objects.create(
            type_name="Sample volume",
            group=mdg2,
            for_context=MetadataType.PROTOCOL)

    def test_line_metadata (self) :
        line1 = Line.objects.get(name="Line 1")
        line1.set_metadata_item("Media", "M9")
        self.assertTrue(line1.media == "M9")
        try :
            line1.set_metadata_item("Sample volume", 1.5)
        except ValueError as e :
            pass
        else :
            raise Exception("Should have caught a ValueError here...")

    def test_line_json (self) :
        line1 = Line.objects.get(name="Line 1")
        line1.set_metadata_item("Media", "M9")
        json_dict = line1.to_json()
        # FIXME don't we want recognizable string keys for metadata?
        #print json_dict['meta']
        #self.assertTrue(json_dict['meta'] == {"Media" : "M9"})

    def test_strain (self) :
        strain1 = Strain.objects.get(name="Strain 1")
        strain2 = Strain.objects.get(name="Strain 2")
        self.assertTrue(strain1.n_lines == 3)
        self.assertTrue(strain1.n_studies == 2)
        self.assertTrue(strain2.n_lines == 1)
        self.assertTrue(strain2.n_studies == 1)
        json_dict = strain1.to_json()
        self.assertTrue(json_dict['registry_url'] == "http://registry.jbei.org/strain/666")
        self.assertTrue(json_dict['desc'] == "JBEI strain 1")
        line1 = Line.objects.get(name="Line 1")
        line2 = Line.objects.get(name="Line 2")
        line3 = Line.objects.get(name="Line 3")
        self.assertTrue(line1.primary_strain_name == "Strain 1")
        self.assertTrue(line3.primary_strain_name == "Strain 1")
        self.assertTrue(line1.strain_ids == "Strain 1")
        self.assertTrue(line1.strain_ids == line2.strain_ids)
        self.assertTrue(line3.strain_ids == "Strain 1,Strain 2")

    def test_carbon_source (self) :
        line1 = Line.objects.get(name="Line 1")
        line3 = Line.objects.get(name="Line 3")
        cs1 = CarbonSource.objects.get(name="Carbon source 1")
        cs2 = CarbonSource.objects.get(name="Carbon source 2")
        self.assertTrue(cs1.n_lines == 2)
        self.assertTrue(cs1.n_studies == 2)
        self.assertTrue(cs2.n_lines == 1)
        self.assertTrue(cs2.n_studies == 1)
        json_dict = cs1.to_json()
        self.assertTrue(json_dict['labeling'] == "100% unlabeled")
        self.assertTrue(line1.carbon_source_labeling == "100% unlabeled")
        self.assertTrue(line1.carbon_source_name == "Carbon source 1")
        self.assertTrue(line1.carbon_source_info ==
            "Carbon source 1 (100% unlabeled)")
        self.assertTrue(line3.carbon_source_info ==
            "Carbon source 1 (100% unlabeled),Carbon source 3 (40% 14C)")


# XXX because there's so much overlap in functionality and the necessary setup
# is somewhat involved, this set of tests includes multiple models, focused
# on assay data and associated objects.
#
# TODO also test MeasurementVector
class AssayDataTests(TestCase) :

    def setUp (self) :
        TestCase.setUp(self)
        user1 = User.objects.create_user(username="admin",
            email="nechols@lbl.gov", password='12345')
        study1 = Study.objects.create(name='Test Study 1', description='')
        line1 = study1.line_set.create(name="Line 1", description="",
            experimenter=user1, contact=user1)
        protocol1 = Protocol.objects.create(name="gc-ms", owned_by=user1)
        protocol2 = Protocol.objects.create(name="OD600", owned_by=user1)
        protocol3 = Protocol.objects.create(name="New protocol",
            owned_by=user1, active=False)
        mt1 = Metabolite.objects.create(type_name="Mevalonate",
            short_name="Mev", type_group="m", charge=-1, carbon_count=6,
            molecular_formula="C6H11O4", molar_mass=148.16)
        mt2 = Metabolite.objects.create(type_name="D-Glucose",
            short_name="glc-D", type_group="m", charge=0, carbon_count=6,
            molecular_formula="C6H12O6", molar_mass=180.16)
        mt3 = Metabolite.objects.create(type_name="Acetate",
            short_name="ac", type_group="m", charge=-1, carbon_count=2,
            molecular_formula="C2H3O2", molar_mass=60.05)
        kw1 = MetaboliteKeyword.objects.create(name="GCMS", mod_by=user1)
        kw2 = MetaboliteKeyword.objects.create(name="HPLC", mod_by=user1)
        kw3 = MetaboliteKeyword.objects.create(name="Mevalonate Pathway",
            mod_by=user1)
        mt1.keywords.add(kw1)
        mt1.keywords.add(kw3)
        mt2.keywords.add(kw2)
        mt2 = GeneIdentifier.objects.create(type_name="Gene name 1",
            short_name="gen1", type_group="g")
        mt3 = MeasurementType.create_protein(type_name="Protein name 2",
            short_name="prot2")
        mt4 = MeasurementType.create_protein(type_name="Protein name 1",
            short_name="prot1")
        assay1 = line1.assay_set.create(name="Assay 1",
            protocol=protocol1, description="GC-MS assay", experimenter=user1)
        up1 = Update.objects.create(mod_by=user1)
        mu1 = MeasurementUnit.objects.create(unit_name="hours")
        mu2 = MeasurementUnit.objects.create(unit_name="mM", type_group="m")
        mu3 = MeasurementUnit.objects.create(unit_name="Cmol/L")
        mu4 = MeasurementUnit.objects.create(unit_name="abcd",
            alternate_names="asdf")
        meas1 = assay1.measurement_set.create(experimenter=user1,
            measurement_type=mt1, compartment="1", update_ref=up1,
            x_units=mu1, y_units=mu2)
        meas2 = assay1.measurement_set.create(experimenter=user1,
            measurement_type=mt2, compartment="1", update_ref=up1,
            x_units=mu1, y_units=mu2)
        meas3 = assay1.measurement_set.create(experimenter=user1,
            measurement_type=mt3, compartment="1", update_ref=up1,
            x_units=mu1, y_units=mu2)
        x1 = [ 0, 4, 8, 12, 18, 24 ]
        y1 = [ 0.0, 0.1, 0.2, 0.4, 0.8, 1.6 ]
        for x, y in zip(x1, y1) :
            md = meas1.measurementdatum_set.create(updated=up1, x=x, y=y)
        meas1.measurementdatum_set.create(updated=up1, x=32, y=None)

    def test_protocol (self) :
        p1 = Assay.objects.get(name="Assay 1").protocol
        p2 = Protocol.objects.get(name="OD600")
        p3 = Protocol.objects.filter(active=False)[0]
        self.assertTrue(str(p1) == "gc-ms")
        self.assertTrue(p1.categorization == "LCMS")
        self.assertTrue(p2.categorization == "OD")
        self.assertTrue(p3.categorization == "Unknown")
        self.assertTrue(p1.to_json() == {'disabled': False, 'name': u'gc-ms'})
        self.assertTrue(p3.to_json()=={'disabled':True,'name':u'New protocol'})
        user1 = User.objects.get(username="admin")
        protocol4 = Protocol.from_form(
            name="Another protocol",
            user=user1,
            variant_of_id=p3.id)
        try :
            protocol5 = Protocol.from_form(
                name="Another protocol",
                user=user1,
                variant_of_id=p3.id)
        except ValueError as e :
            self.assertTrue(str(e) ==
                "There is already a protocol named 'Another protocol'.")
        else :
            raise Exception("Should have caught a ValueError...")
        try :
            protocol5 = Protocol.from_form(
                name="",
                user=user1)
        except ValueError as e :
            self.assertTrue(str(e) == "Protocol name required.")
        else :
            raise Exception("Should have caught a ValueError...")

    def test_assay (self) :
        assay = Assay.objects.get(name="Assay 1")
        self.assertTrue(len(assay.get_metabolite_measurements()) == 1)
        self.assertTrue(len(assay.get_gene_measurements()) == 1)
        self.assertTrue(len(assay.get_protein_measurements()))
        json_dict = assay.to_json()
        self.assertTrue(json_dict['ln'] == "Line 1")
        self.assertTrue(json_dict['mea_c'] == 3)

    def test_measurement_type (self) :
        proteins = MeasurementType.proteins()
        self.assertTrue(len(proteins) == 2)
        self.assertTrue(proteins[0].is_protein())
        proteins_by_name = MeasurementType.proteins_by_name()
        assay = Assay.objects.get(name="Assay 1")
        meas1 = assay.measurement_set.filter(
            measurement_type__short_name="Mev")[0]
        mt1 = meas1.measurement_type
        self.assertTrue(mt1.is_metabolite() and not mt1.is_protein()
                        and not mt1.is_gene())
        met = Metabolite.objects.get(short_name="Mev")
        met.set_keywords(["GCMS", "HPLC"])
        self.assertTrue(met.keywords_str == "GCMS, HPLC")
        self.assertTrue(met.to_json() == { 'id': mt1.id, 'cc': 6, 'name': u'Mevalonate',
            'chgn': -1, 'ans': '', 'mm': 148.16, 'f': u'C6H11O4', 'chg': -1, 'sn': u'Mev',
            'family': mt1.type_group, 'kstr':'GCMS,HPLC'})
        keywords = MetaboliteKeyword.all_with_metabolite_ids()
        self.assertTrue(len(keywords[1]['metabolites']) == 2)
        mts = Metabolite.all_sorted_by_short_name()
        self.assertTrue([ m.type_name for m in mts ] ==
                        [u'Acetate', u'D-Glucose', u'Mevalonate'])

    def test_measurement_unit (self) :
        mu = MeasurementUnit.objects.get(unit_name="mM")
        self.assertTrue(mu.group_name == "Metabolite")
        all_units = [ mu.unit_name for mu in MeasurementUnit.all_sorted() ]
        self.assertTrue(all_units == [u'abcd', u'Cmol/L', u'hours', u'mM'])

    def test_measurement (self) :
        assay = Assay.objects.get(name="Assay 1")
        metabolites = list(assay.get_metabolite_measurements())
        self.assertTrue(len(metabolites) == 1)
        meas1 = metabolites[0]
        meas2 = list(assay.get_gene_measurements())[0]
        self.assertTrue(meas1.y_axis_units_name == "mM")
        self.assertTrue(meas1.name == "Mevalonate")
        self.assertTrue(meas1.short_name == "Mev")
        self.assertTrue(meas1.full_name == "IC Mevalonate")
        self.assertTrue(meas1.is_concentration_measurement())
        self.assertTrue(not meas1.is_carbon_ratio())
        self.assertTrue(meas2.is_gene_measurement())
        mdata = list(meas1.measurementdatum_set.all())
        self.assertTrue(str(mdata[0].fx) == "0.0")
        self.assertTrue(str(mdata[0].fy) == "0.0")
        self.assertTrue(str(mdata[-1].fx) == "32.0")
        self.assertTrue(mdata[-1].fy is None)

    def test_measurement_extract (self) :
        assay = Assay.objects.get(name="Assay 1")
        meas1 = list(assay.get_metabolite_measurements())[0]
        meas2 = list(assay.get_gene_measurements())[0]
        xval = meas1.extract_data_xvalues()
        self.assertTrue(xval == [0.0, 4.0, 8.0, 12.0, 18.0, 24.0, 32.0])
        xval2 = meas1.extract_data_xvalues(defined_only=True)
        self.assertTrue(xval2 == [0.0, 4.0, 8.0, 12.0, 18.0, 24.0])
        xval3 = meas2.extract_data_xvalues()
        self.assertTrue(len(xval3) == 0)

    def test_measurement_interpolate (self) :
        assay = Assay.objects.get(name="Assay 1")
        meas1 = list(assay.get_metabolite_measurements())[0]
        meas2 = list(assay.get_gene_measurements())[0]
        y_interp = meas1.interpolate_at(21)
        # XXX I hate floating-point math
        self.assertTrue(str(y_interp) == "1.2")
        y_interp2 = meas1.interpolate_at(25)
        self.assertTrue(y_interp2 is None)
        try :
            y = meas2.interpolate_at(20)
        except ValueError :
            pass
        else :
            raise Exception("Should have caught an exception here")


class ImportTests(TestCase) :
    """
    Test import of assay measurement data.
    """
    def setUp (self) :
        TestCase.setUp(self)
        user1 = User.objects.create_user(username="admin",
            email="nechols@lbl.gov", password='12345')
        user2 = User.objects.create_user(username="postdoc",
            email="nechols@lbl.gov", password='12345')
        study1 = Study.objects.create(name='Test Study 1', description='')
        UserPermission.objects.create(study=study1, permission_type='R',
            user=user1)
        UserPermission.objects.create(study=study1, permission_type='W',
            user=user1)
        UserPermission.objects.create(study=study1, permission_type='R',
            user=user2)
        line1 = study1.line_set.create(name="L1", description="Line 1",
            experimenter=user1, contact=user1)
        line2 = study1.line_set.create(name="L2", description="Line 2",
            experimenter=user1, contact=user1)
        protocol1 = Protocol.objects.create(name="GC-MS", owned_by=user1)
        protocol2 = Protocol.objects.create(name="Transcriptomics",
            owned_by=user1)
        mt1 = Metabolite.objects.create(type_name="Acetate",
            short_name="ac", type_group="m", charge=-1, carbon_count=2,
            molecular_formula="C2H3O2", molar_mass=60.05)
        mt2 = Metabolite.objects.create(type_name="D-Glucose",
            short_name="glc-D", type_group="m", charge=0, carbon_count=6,
            molecular_formula="C6H12O6", molar_mass=180.16)
        mu1 = MeasurementUnit.objects.create(unit_name="mM")
        mu2 = MeasurementUnit.objects.create(unit_name="hours")
        mu3 = MeasurementUnit.objects.create(unit_name="counts")
        mu4 = MeasurementUnit.objects.create(unit_name="FPKM")

    def get_form (self) :
        mu = MeasurementUnit.objects.get(unit_name="mM")
        # XXX not proud of this, but we need actual IDs in here
        return {
            'action' : "Submit Data",
            'datalayout' : "std",
            'disamMComp1' : "IC",
            'disamMComp2' : "IC",
            'disamMCompHidden1' : 1,
            'disamMCompHidden2' : 1,
            'disamMType1' : "ac / Acetate",
            'disamMType2' : "glc-D / D-Glucose",
            'disamMTypeHidden1':Metabolite.objects.get(short_name="ac").pk,
            'disamMTypeHidden2':Metabolite.objects.get(short_name="glc-D").pk,
            'disamMUnits1' : "mM",
            'disamMUnits2' : "mM",
            'disamMUnitsHidden1' : mu.pk,
            'disamMUnitsHidden2' : mu.pk,
            'enableColumn0' : 1,
            'enableColumn1' : 2,
            'enableRow0' : 1,
            'enableRow1' : 2,
            'enableRow2' : 3,
            'enableRow3' : 4,
            'enableRow4' : 5,
            'enableRow5' : 6,
            'jsonoutput' : """[{"label":"Column 0","name":"Column 0","units":"units","parsingIndex":0,"assay":null,"assayName":null,"measurementType":1,"metadata":{},"singleData":null,"color":"rgb(10, 136, 109)","data":[[0,"0.1"],[1,"0.2"],[2,"0.4"],[4,"1.7"],[8,"5.9"]]},{"label":"Column 1","name":"Column 1","units":"units","parsingIndex":1,"assay":null,"assayName":null,"measurementType":2,"metadata":{},"singleData":null,"color":"rgb(136, 14, 43)","data":[[0,"0.2"],[1,"0.4"],[2,"0.6"],[4,"0.8"],[8,"1.2"]]}]""",
            'masterAssay' : "new",
            'masterLine' : Line.objects.get(name="L1").pk,
            'masterMComp' : '',
            'masterMCompValue' : 0,
            'masterMType' : '',
            'masterMTypeValue' : 0,
            'masterMUnits' : '',
            'masterMUnitsValue' : 0,
            'masterProtocol' : Protocol.objects.get(name="GC-MS").pk,
            'masterTimestamp' : '',
            'rawdataformat' : "csv",
            'row0type' : 2,
            'row1type' : 3,
            'row2type' : 3,
            'row3type' : 3,
            'row4type' : 3,
            'row5type' : 3,
            'studyID' : Study.objects.get(name="Test Study 1").pk,
            'writemode' : "m",
        }

    def test_import_gc_ms_metabolites (self) :
        update = Update.objects.create(
            mod_time=timezone.now(),
            mod_by=User.objects.get(username="admin"))
        main.data_import.import_assay_table_data(
            study=Study.objects.get(name="Test Study 1"),
            user=User.objects.get(username="admin"),
            post_data=self.get_form(),
            update=update)
        assays = Line.objects.get(name="L1").assay_set.all()
        self.assertTrue(len(assays) == 1)
        meas = assays[0].measurement_set.all()
        self.assertTrue(len(meas) == 2)
        data = []
        for m in meas :
            data.append([(d.fx,d.fy) for d in m.measurementdatum_set.all()])
        self.assertTrue(str(data) == """[[(0.0, 0.1), (1.0, 0.2), (2.0, 0.4), (4.0, 1.7), (8.0, 5.9)], [(0.0, 0.2), (1.0, 0.4), (2.0, 0.6), (4.0, 0.8), (8.0, 1.2)]]""")

    def test_error (self) :
        update = Update.objects.create(
            mod_time=timezone.now(),
            mod_by=User.objects.get(username="admin"))
        try : # failed user permissions check
            main.data_import.import_assay_table_data(
                study=Study.objects.get(name="Test Study 1"),
                user=User.objects.get(username="postdoc"),
                post_data=self.get_form(),
                update=update)
        except AssertionError as e :
            pass
        else :
            raise Exception("Expected an AssertionError here")

    def test_import_rna_seq (self) :
        line1 = Line.objects.get(name="L1")
        line2 = Line.objects.get(name="L2")
        table1 = [ # FPKM
            ["GENE",  "L1-1", "L1-2", "L2-1", "L2-2"],
            ["gene1", "5.34", "5.32", "7.45", "7.56"],
            ["gene2", "1.79", "1.94", "0.15", "0.33"],
        ]
        update = Update.objects.create(
            mod_time=timezone.now(),
            mod_by=User.objects.get(username="admin"))
        # two assays per line (replicas)
        result = main.data_import.import_rna_seq(
            study=Study.objects.get(name="Test Study 1"),
            user=User.objects.get(username="admin"),
            update=update,
            table=table1,
            n_cols=4,
            data_type="fpkm",
            line_ids=[line1.id,line1.id,line2.id,line2.id],
            assay_ids=[1,2,1,2],
            meas_times=[0]*4)
        self.assertTrue(result.n_meas == result.n_meas_data == 8)
        self.assertTrue(result.n_assay == 4 and result.n_meas_type == 2)
        result = main.data_import.interpret_raw_rna_seq_data(
            raw_data="\n".join([ "\t".join(row) for row in table1 ]),
            study=Study.objects.get(name="Test Study 1"))
        self.assertTrue(result["guessed_data_type"] == "fpkm")
        self.assertTrue(result["samples"][0]["line_id"] == line1.pk)
        self.assertTrue(result["samples"][2]["line_id"] == line2.pk)
        # one assay, two timepoints per line
        result = main.data_import.import_rna_seq(
            study=Study.objects.get(name="Test Study 1"),
            user=User.objects.get(username="admin"),
            update=update,
            table=table1,
            n_cols=4,
            data_type="fpkm",
            line_ids=[line1.id,line1.id,line2.id,line2.id],
            assay_ids=[1,1,1,1],
            meas_times=[0,1,0,1])
        self.assertTrue(result.n_meas == 4 and result.n_meas_data == 8)
        self.assertTrue(result.n_meas_type == 0 and result.n_assay == 2)
        table2 = [ # count
            ["GENE",  "L1-1", "L1-2", "L2-1", "L2-2"],
            ["gene1", "64", "67", "89", "91"],
            ["gene2", "27", "30", "5", "4"],
        ]
        result = main.data_import.import_rna_seq(
            study=Study.objects.get(name="Test Study 1"),
            user=User.objects.get(username="admin"),
            update=update,
            table=table2,
            n_cols=4,
            data_type="counts",
            line_ids=[line1.id,line1.id,line2.id,line2.id],
            assay_ids=[1,2,1,2],
            meas_times=[5]*4)
        self.assertTrue(result.n_meas == result.n_meas_data == 8)
        self.assertTrue(result.n_meas_type == 0 and result.n_assay == 4)
        table3 = [ # combined
            ["GENE",  "L1-1", "L1-2", "L2-1", "L2-2"],
            ["gene1", "64,5.34", "67,5.32", "89,7.45", "91,7.56"],
            ["gene2", "27,1.79", "30,1.94", "5,0.15", "4,0.33"],
        ]
        # one assay, two timepoints, counts+fpkms
        result = main.data_import.import_rna_seq(
            study=Study.objects.get(name="Test Study 1"),
            user=User.objects.get(username="admin"),
            update=update,
            table=table3,
            n_cols=4,
            data_type="combined",
            line_ids=[line1.id,line1.id,line2.id,line2.id],
            assay_ids=[1,1,1,1],
            meas_times=[0,1,0,1])
        self.assertTrue(result.n_meas_type == 0 and result.n_assay == 2)
        self.assertTrue(result.n_meas == 8 and result.n_meas_data == 16)
        try :
            result = main.data_import.import_rna_seq(
                study=Study.objects.get(name="Test Study 1"),
                user=User.objects.get(username="admin"),
                update=update,
                table=table3,
                n_cols=4,
                data_type="combined",
                line_ids=[line1.id,line1.id,line2.id,line2.id],
                assay_ids=[1,1,1,1],
                meas_times=[0,0,0,0])
        except ValueError as e :
            pass
        else :
            raise Exception("ValueError expected")
        result = main.data_import.interpret_raw_rna_seq_data(
            raw_data="\n".join([ "\t".join(row) for row in table3 ]),
            study=Study.objects.get(name="Test Study 1"))
        self.assertTrue(result["guessed_data_type"] == "combined")

class SBMLUtilTests (TestCase) :
    """
    Unit tests for various utilities used in SBML export
    """
    def setUp (self) :
        mm = SBMLTemplate.objects.create(
          name="R_Ec_biomass_iJO1366_core_53p95M",
          biomass_calculation=33.19037,
          biomass_exchange_name="R_Ec_biomass_iJO1366_core_53p95M")
        mt = Metabolite.objects.create(type_name="Optical Density",
            short_name="OD", type_group="m", charge=0, carbon_count=0,
            molecular_formula="", molar_mass=0)

    def test_metabolite_name (self) :
        guesses = \
          main.sbml_export.generate_species_name_guesses_from_metabolite_name(
            "acetyl-CoA")
        self.assertTrue(
            guesses == ['acetyl-CoA', 'acetyl_DASH_CoA', 'M_acetyl-CoA_c',
                        'M_acetyl_DASH_CoA_c', 'M_acetyl_DASH_CoA_c_'])

    def test_sbml_notes (self) :
        try :
            import libsbml
        except ImportError :
            warnings.warn(str(e))
        else :
            notes = main.sbml_export.create_sbml_notes_object({
              "CONCENTRATION_CURRENT" : [ 0.5 ],
              "CONCENTRATION_HIGHEST" : [ 1.0 ],
              "CONCENTRATION_LOWEST"  : [ 0.01 ],
            })
            notes_dict = main.sbml_export.parse_sbml_notes_to_dict(notes)
            self.assertTrue(dict(notes_dict) == {
              'CONCENTRATION_CURRENT': ['0.5'],
              'CONCENTRATION_LOWEST': ['0.01'],
              'CONCENTRATION_HIGHEST': ['1.0'] })

    def test_sbml_setup (self) :
        try :
            import libsbml
        except ImportError :
            warnings.warn(str(e))
        else :
            dir_name = os.path.dirname(__file__)
            sbml_file = os.path.join(dir_name,"fixtures","misc_data",
              "simple.sbml")
            s = main.sbml_export.sbml_info(i_template=0, sbml_file=sbml_file)
            self.assertTrue(s.n_sbml_species == 4)
            self.assertTrue(s.n_sbml_reactions == 5)
            # TODO lots more


def setup_export_data () :
    """
    Utility method to populate the test database with data suitable for SBML
    or table export.
    """
    user1 = User.objects.create_user(username="admin",
        email="nechols@lbl.gov", password='12345')
    user2 = User.objects.create_user(username="postdoc",
        email="nechols@lbl.gov", password='12345')
    study1 = Study.objects.create(name='Test Study 1', description='')
    UserPermission.objects.create(study=study1, permission_type='R',
        user=user1)
    cs1 = CarbonSource.objects.create(name="Carbon source",
        volume=10.0)
    line1 = study1.line_set.create(name="Line 1", description="",
        experimenter=user1, contact=user1)
    line1.carbon_source.add(cs1)
    line2 = study1.line_set.create(name="Line 2", description="",
        study=study1, experimenter=user1, contact=user1)
    line2.carbon_source.add(cs1)
    strain1 = Strain.objects.create(name="Strain 1",
        description="JBEI strain 1",
        registry_url="http://registry.jbei.org/strain/666")
    strain2 = Strain.objects.create(name="Strain 2", active=False)
    line1.strains.add(strain1)
    protocol1 = Protocol.objects.create(name="GC-MS", owned_by=user1)
    protocol2 = Protocol.objects.create(name="OD600", owned_by=user1)
    protocol3 = Protocol.objects.create(name="HPLC", owned_by=user1)
    protocol4 = Protocol.objects.create(name="O2/CO2", owned_by=user1)
    protocol5 = Protocol.objects.create(name="Proteomics", owned_by=user1)
    protocol6 = Protocol.objects.create(name="Transcriptomics",
      owned_by=user1)
    protocol7 = Protocol.objects.create(name="LC-MS", owned_by=user1)
    mt1 = Metabolite.objects.create(type_name="Acetate",
        short_name="ac", type_group="m", charge=-1, carbon_count=2,
        molecular_formula="C2H3O2", molar_mass=60.05)
    mt2 = Metabolite.objects.create(type_name="D-Glucose",
        short_name="glc-D", type_group="m", charge=0, carbon_count=6,
        molecular_formula="C6H12O6", molar_mass=180.16)
    mt3 = Metabolite.objects.create(type_name="Optical Density",
        short_name="OD", type_group="m", charge=0, carbon_count=0,
        molecular_formula="", molar_mass=0)
    # RAMOS-specific metabolites
    mt4 = Metabolite.objects.create(type_name="CO2 production",
        short_name="CO2p", type_group="m", charge=0, carbon_count=1,
        molecular_formula="CO2", molar_mass=44.01)
    mt5 = Metabolite.objects.create(type_name="O2 consumption",
        short_name="O2c", type_group="m", charge=0, carbon_count=0,
        molecular_formula="O2", molar_mass=32)
    mt6 = Metabolite.objects.create(type_name="CO2",
        short_name="co2", type_group="m", charge=0, carbon_count=1,
        molecular_formula="CO2", molar_mass=44.01)
    mt7 = Metabolite.objects.create(type_name="O2",
        short_name="o2", type_group="m", charge=0, carbon_count=0,
        molecular_formula="O2", molar_mass=32)
    # ASSAYS
    assay1 = line1.assay_set.create(name="Assay 1",
        protocol=protocol1, description="GC-MS assay", experimenter=user1)
    assay2 = line2.assay_set.create(name="Assay 2",
        protocol=protocol1, description="GC-MS assay", experimenter=user1)
    assay3 = line1.assay_set.create(name="OD measurement",
        protocol=protocol2, description="OD measurement",
        experimenter=user1)
    assay4 = line1.assay_set.create(name="HPLC assay", experimenter=user1,
        protocol=protocol3, description="HPLC measurement")
    assay5 = line1.assay_set.create(name="RAMOS assay", experimenter=user1,
        protocol=protocol4, description="O2/CO2 measurements")
    assay6 = line1.assay_set.create(name="LC-MS assay", experimenter=user1,
        protocol=protocol7, description="IC LC-MS measurements")
    mu1 = MeasurementUnit.objects.create(unit_name="hours")
    mu2 = MeasurementUnit.objects.create(unit_name="mM")
    mu3 = MeasurementUnit.objects.create(unit_name="n/a")
    mu4 = MeasurementUnit.objects.create(unit_name="Cmol/L")
    mu5 = MeasurementUnit.objects.create(unit_name="mol/L/hr")
    up1 = Update.objects.create(mod_by=user1)
    meas1 = assay1.measurement_set.create(experimenter=user1,
        measurement_type=mt1, compartment="2", update_ref=up1,
        x_units=mu1, y_units=mu2)
    meas2 = assay1.measurement_set.create(experimenter=user1,
        measurement_type=mt2, compartment="2", update_ref=up1,
        x_units=mu1, y_units=mu2)
    meas3 = assay2.measurement_set.create(experimenter=user1, # GC-MS
        measurement_type=mt1, compartment="2", update_ref=up1,
        x_units=mu1, y_units=mu2)
    meas4 = assay2.measurement_set.create(experimenter=user1, # GC-MS
        measurement_type=mt2, compartment="2", update_ref=up1,
        x_units=mu1, y_units=mu2)
    meas5 = assay3.measurement_set.create(experimenter=user1, # OD
        measurement_type=mt3, compartment="0", update_ref=up1,
        x_units=mu1, y_units=mu3)
    meas6 = assay4.measurement_set.create(experimenter=user1, # HPLC
        measurement_type=mt1, compartment="2", update_ref=up1,
        x_units=mu1, y_units=mu4)
    meas7 = assay4.measurement_set.create(experimenter=user1, # HPLC
        measurement_type=mt2, compartment="2", update_ref=up1,
        x_units=mu1, y_units=mu4)
    meas8 = assay5.measurement_set.create(experimenter=user1,
        measurement_type=mt4, compartment="2", update_ref=up1,
        x_units=mu1, y_units=mu5)
    meas9 = assay5.measurement_set.create(experimenter=user1,
        measurement_type=mt5, compartment="2", update_ref=up1,
        x_units=mu1, y_units=mu5)
    # an intracellular measurement - shouldn't have flux!
    meas10 = assay6.measurement_set.create(experimenter=user1,
        measurement_type=mt1, compartment="1", update_ref=up1,
        x_units=mu1, y_units=mu2)
    x1 = [ 0, 4, 8, 12, 18, 24 ]
    y1 = [ 0.0, 0.1, 0.2, 0.4, 0.8, 1.6 ]
    y2 = [ 0.0, 0.5, 0.6, 0.65, 0.675, 0.69 ]
    y3 = [ 0.0, 0.2, 0.4, 0.8, 1.6, 3.2 ]
    y4 = [ 0.0, 0.5, 1.1, 2.05, 4.09, 5.45 ]
    y5 = [ 0.0, 0.3, 0.5, 0.55, 0.57, 0.59 ] # OD
    for x, y in zip(x1, y1) : # acetate
        md = meas1.measurementdatum_set.create(updated=up1, x=x, y=y)
        md2 = meas6.measurementdatum_set.create(updated=up1, x=x, y=y*1.1)
        md3 = meas10.measurementdatum_set.create(updated=up1, x=x,
          y=2.0-y)
    for x, y in zip(x1, y2) : # glucose
        md = meas2.measurementdatum_set.create(updated=up1, x=x, y=y)
        md2 = meas7.measurementdatum_set.create(updated=up1, x=x, y=y*1.1)
    for x, y in zip(x1, y3) :
        md = meas3.measurementdatum_set.create(updated=up1, x=x, y=y)
    for x, y in zip(x1, y4) :
        md = meas4.measurementdatum_set.create(updated=up1, x=x, y=y)
    for x, y in zip(x1, y5) : # OD
        md = meas5.measurementdatum_set.create(updated=up1, x=x, y=y)
    for x, y in zip([0,12,24], [0.1,0.3,0.5]) :
        md  = meas8.measurementdatum_set.create(updated=up1, x=x, y=y)
        md2 = meas9.measurementdatum_set.create(updated=up1, x=x, y=y)
    # TODO proteomics/transcriptomics would be nice
    # TODO incorporate metadata
    mm = SBMLTemplate.objects.create(
      name="R_Ec_biomass_iJO1366_core_53p95M",
      biomass_calculation=33.19037,
      biomass_exchange_name="R_Ec_biomass_iJO1366_core_53p95M")


class ExportTests(TestCase) :
    """
    Test export of assay measurement data, either as simple tables or SBML.
    """
    def setUp(self):
        TestCase.setUp(self)
        setup_export_data()

    def tearDown(self):
        TestCase.tearDown(self)

    def test_data_export (self) :
        study = Study.objects.get(name="Test Study 1")
        lines = study.line_set.all()
        assays = []
        for line in lines :
          assays.extend(list(line.assay_set.all()))
        form = {
            "selectedLineIDs" : ",".join([ str(l.id) for l in lines ]),
            "selectedAssayIDs" : ",".join([ str(a.id) for a in assays ]),
            "assaylevel" : "1",
        }
        user = User.objects.get(username="admin")
        exports = main.data_export.select_objects_for_export(study, user, form)
        table = main.data_export.assemble_table(**exports)
        self.assertTrue(len(table) == 11)
        self.assertTrue(len(table[0]) == 21)
        self.assertTrue(table[0][-6:] == [ 0, 4, 8, 12, 18, 24 ]) # x1 in setUp
        # XXX y3 in setUp
        self.assertTrue(table[3][-6:] == [0.0, 0.2, 0.4, 0.8, 1.6, 3.2])
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

    # XXX this test does NOT depend on libsbml being available
    def test_data_export_setup (self) :
        study = Study.objects.get(name="Test Study 1")
        data = main.sbml_export.line_assay_data(
            study=study,
            lines=[ Line.objects.get(name="Line 1") ],
            form={})
        data.run()
        od_data = data.export_od_measurements()
        self.assertTrue(od_data[0]['data_points'][-1]['title'] == "0.59 at 24h")
        self.assertTrue(data.n_hplc_measurements == 2)
        hplc_data = data.export_hplc_measurements()
        self.assertTrue(hplc_data[0]['assays'][0]['measurements'][0]['name'] ==
            "EC Acetate")
        self.assertTrue(
            hplc_data[0]['assays'][0]['measurements'][0]['n_points'] == 6)
        dp = hplc_data[0]['assays'][0]['measurements'][0]['data_points'][2]
        self.assertTrue(dp['title'] == "0.22000 at 8h")
        self.assertTrue(data.n_lcms_measurements == 3)
        lcms_data = data.export_lcms_measurements()
        dp = lcms_data[0]['assays'][0]['measurements'][0]['data_points'][2]
        self.assertTrue(dp['title'] == "0.20000 at 8h")
        self.assertTrue(data.n_ramos_measurements == 2)
        all_meas = data.processed_measurements()
        self.assertTrue(len(all_meas) == 8)
        meas = all_meas[0]
        self.assertTrue(meas.n_errors == 0)
        self.assertTrue(meas.n_warnings == 1)
        self.assertTrue(meas.warnings[0] == 'Start OD of 0 means nothing physically present  (and a potential division-by-zero error).  Skipping...')
        #for md in meas.data :
        #  print md
        #for fd in meas.flux_data :
        #  print fd
        # TODO test interpolation of measurements
        self.assertTrue(data.available_timepoints == [4.0, 8.0, 12.0, 18.0])

    def test_sbml_export (self) :
        try :
            import libsbml
        except ImportError :
            warnings.warn(str(e))
        else :
            study = Study.objects.get(name="Test Study 1")
            data = main.sbml_export.line_sbml_export(
                study=study,
                lines=[ Line.objects.get(name="Line 1") ],
                form={"chosenmap":0})
            dir_name = os.path.dirname(__file__)
            sbml_file = os.path.join(dir_name,"fixtures","misc_data",
              "simple.sbml")
            data.run(test_mode=True,
              sbml_file=sbml_file)
            sbml_out = data.as_sbml(8.0)
            sbml_in = libsbml.readSBMLFromString(sbml_out)
            model = sbml_in.getModel()
            self.assertTrue(model is not None)
            # TODO test contents of file output

    def test_data_export_errors (self) :
        # now start removing data (testing for deliberate failure)
        study = Study.objects.get(name="Test Study 1")
        od = Assay.objects.get(name="OD measurement")
        odm = od.measurement_set.all()[0]
        odm.measurementdatum_set.filter(x__gt=0).delete()
        try :
            data = main.sbml_export.line_sbml_export(
                study=study,
                lines=[ Line.objects.get(name="Line 1") ],
                form={})
            data.run(test_mode=True)
        except ValueError as e :
            self.assertTrue("Selected Optical Data contains less than two defined data points!" in str(e))
        else :
            raise Exception("Should have caught an exception here!")
        # now delete the assay altogether
        od.delete()
        try :
            data = main.sbml_export.line_sbml_export(
                study=study,
                lines=[ Line.objects.get(name="Line 1") ],
                form={})
            data.run(test_mode=True)
        except ValueError as e :
            self.assertTrue("Line selection does not contain any OD600 Assays"
                            in str(e))
        else :
            raise Exception("Should have caught an exception here!")


class UtilityTests (TestCase) :
    def setUp (self) :
        TestCase.setUp(self)
        setup_export_data()

    def test_get_edddata (self) :
        users = main.utilities.get_edddata_users()
        #print users
        meas = main.utilities.get_edddata_measurement()
        self.assertTrue(
          sorted([m['name'] for k,m in meas['MetaboliteTypes'].iteritems()]) ==
          [u'Acetate', u'CO2', u'CO2 production', u'D-Glucose', u'O2',
           u'O2 consumption', u'Optical Density'])
        cs = main.utilities.get_edddata_carbon_sources()
        #print cs
        strains = main.utilities.get_edddata_strains()
        self.assertTrue(len(strains['EnabledStrainIDs']) == 1)
        misc = main.utilities.get_edddata_misc()
        misc_keys = sorted(["UnitTypeIDs", "UnitTypes", "MediaTypes", "UserIDs",
            "EnabledUserIDs", "Users", "MetaDataTypeIDs", "MetaDataTypes",
            "MeasurementTypeCompartmentIDs", "MeasurementTypeCompartments"])
        self.assertTrue(sorted(misc.keys()) == misc_keys)
        study = Study.objects.get(name="Test Study 1")
        data = main.utilities.get_edddata_study(study)
        #print data

    def test_interpolate (self) :
        assay = Assay.objects.get(name="Assay 1")
        meas = assay.measurement_set.all()[0]
        data = meas.measurementdatum_set.all()
        self.assertTrue(abs(main.utilities.interpolate_at(data,10)-0.3)<0.00001)

    def test_form_data (self) :
        lines = Line.objects.all()
        form1 = {
            "selectedLineIDs" : ",".join([str(l.id) for l in lines ]),
        }
        form2 = { "selectedLineIDs":[ str(l.id) for l in lines ] }
        form3 = {}
        for l in lines :
            form3["line%dinclude"%l.id] = 1
        ids1 = main.utilities.extract_id_list(form1, "selectedLineIDs")
        ids2 = main.utilities.extract_id_list(form2, "selectedLineIDs")
        ids3 = main.utilities.extract_id_list_as_form_keys(form3, "line")
        self.assertTrue(ids1 == ids2 == sorted(ids3))
        study = Study.objects.get(name="Test Study 1")
        lines2 = main.utilities.get_selected_lines(form1, study)

    def test_line_export_base (self) :
        study = Study.objects.get(name="Test Study 1")
        data = main.utilities.line_export_base(
            study=study,
            lines=study.line_set.all())
        data._fetch_cache_data()
        assay = Assay.objects.get(name="Assay 1")
        m = data._get_measurements(assay.id)
        self.assertTrue(len(m) == 2)
        md = data._get_measurement_data(m[0].id)
        self.assertTrue(len(md) == 6)
        mt = data._get_measurement_type(m[0].id)
        if mt.type_name != "D-Glucose" : # BUG?
            print mt.type_name, m[0].id
            print data._measurement_types[m[0].id]
        self.assertTrue(mt.type_name == "D-Glucose")
        mu = data._get_y_axis_units_name(m[1].id)
        self.assertTrue(mu == "mM")
        met = data._get_metabolite_measurements(assay.id)
        self.assertTrue(len(met) == 2)
