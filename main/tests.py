from django.contrib.auth.models import User, Group
from django.test import TestCase
from main.models import Study, Update, UserPermission, GroupPermission
from main.solr import StudySearch


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
        study1 = Study.objects.create(study_name='Test Study 1', description='',
                                      created=up1, updated=up1)
        study2 = Study.objects.create(study_name='Test Study 2', description='',
                                      created=up2, updated=up3)

    def tearDown(self):
        TestCase.tearDown(self)

    def test_read_with_no_permissions(self):
        """
        Ensure that a study without permissions cannot be read.
        """
        # Load objects
        study = Study.objects.get(study_name='Test Study 1')
        user1 = User.objects.get(username='test1')
        # Asserts
        self.assertFalse(study.user_can_read(user1))

    def test_user_read_write_permission(self):
        """
        Ensure that a study with user having read or write permissions can be read.
        """
        # Load objects
        study = Study.objects.get(study_name='Test Study 1')
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
        study = Study.objects.get(study_name='Test Study 1')
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
    solr = StudySearch(settings_key='test')

    def setUp(self):
        TestCase.setUp(self)

    def tearDown(self):
        TestCase.tearDown(self)

    def test_search(self):
        # TODO: get some fixtures loaded into test solr, make sure sane things come from search
        pass

    def test_update(self):
        # TODO: create study object, update test solr, make sure it can be retrieved from solr
        pass
