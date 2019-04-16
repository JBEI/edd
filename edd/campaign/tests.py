# coding: utf-8

from django.contrib.auth.models import AnonymousUser
from django.urls import reverse
from faker import Faker
from requests import codes

from . import factory, models
from edd import TestCase
from main import models as edd_models
from main.tests import factory as edd_factory


faker = Faker()


class CampaignPermissionTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        super().setUpTestData()
        cls.campaign = factory.CampaignFactory()
        cls.permission = models.EveryonePermission.objects.create(
            campaign=cls.campaign,
            campaign_permission=models.CampaignPermission.READ,
            study_permission=models.CampaignPermission.READ,
        )

    def test_campaign_filtering_none_user(self):
        # permission is for everyone, so a user of None can still filter
        q = models.Campaign.filter_for(None)
        self.assertTrue(models.Campaign.objects.filter(q).exists())

    def test_campaign_filtering_anon_user(self):
        # permission is for everyone, so an AnonymousUser can filter
        anon = AnonymousUser()
        q = models.Campaign.filter_for(anon)
        self.assertTrue(models.Campaign.objects.filter(q).exists())

    def test_campaign_filtering_user(self):
        # permission is for everyone, so any user can filter
        user = edd_factory.UserFactory()
        q = models.Campaign.filter_for(user)
        self.assertTrue(models.Campaign.objects.filter(q).exists())

    def test_campaign_filtering_string_access(self):
        # filtering on a specific access string works
        q_read = models.Campaign.filter_for(None, access=models.CampaignPermission.READ)
        q_write = models.Campaign.filter_for(
            None, access=models.CampaignPermission.WRITE
        )
        self.assertTrue(models.Campaign.objects.filter(q_read).exists())
        self.assertFalse(models.Campaign.objects.filter(q_write).exists())

    def test_campaign_helpers_none_user(self):
        self.assertTrue(self.campaign.user_can_read(None))
        self.assertFalse(self.campaign.user_can_write(None))

    def test_campaign_helpers_anon_user(self):
        anon = AnonymousUser()
        self.assertTrue(self.campaign.user_can_read(anon))
        self.assertFalse(self.campaign.user_can_write(anon))

    def test_campaign_helpers(self):
        user = edd_factory.UserFactory()
        self.assertTrue(self.campaign.user_can_read(user))
        self.assertFalse(self.campaign.user_can_write(user))

    def test_permission_invalid_operation(self):
        # testing an invalid operation will not be allowed
        operation = "invalid_operation"
        self.assertFalse(self.permission.is_allowed(edd_models.Study, operation))
        # adding an invalid operation will raise an error
        with self.assertRaises(ValueError):
            self.permission.set_allowed(edd_models.Study, operation)

    def test_permission_operation_unset(self):
        # an operation that is not set will not be allowed by default
        operation = models.CampaignPermission.ADD
        self.assertFalse(
            self.permission.is_allowed(edd_models.Study, operation),
            f"{self.permission.link_permissions}",
        )

    def test_permission_allow_operation(self):
        # setting an operation will allow that operation
        operation = models.CampaignPermission.ADD
        self.permission.set_allowed(edd_models.Study, operation)
        self.assertTrue(self.permission.is_allowed(edd_models.Study, operation))

    def test_permission_disallow_operation(self):
        # disallowing an operation on permission will show as not allowed
        operation = models.CampaignPermission.ADD
        self.permission.set_allowed(edd_models.Study, operation, allow=False)
        self.assertFalse(
            self.permission.is_allowed(edd_models.Study, operation),
            f"{self.permission.link_permissions}",
        )

    def test_permission_register_operation(self):
        # adding a new operation works
        operation = "new_action"
        with factory.CampaignLinkRegistry(edd_models.Study, operation):
            self.permission.set_allowed(edd_models.Study, operation)
            self.assertTrue(self.permission.is_allowed(edd_models.Study, operation))

    def test_study_permission_applied(self):
        READ = models.CampaignPermission.READ
        # create user and permission on campaign
        user = edd_factory.UserFactory()
        models.UserPermission.objects.create(
            campaign=self.campaign,
            campaign_permission=READ,
            study_permission=READ,
            user=user,
        )
        # create group and permission on campaign
        group = edd_factory.GroupFactory()
        models.GroupPermission.objects.create(
            campaign=self.campaign,
            campaign_permission=READ,
            study_permission=READ,
            group=group,
        )
        # create study
        study = edd_factory.StudyFactory()
        # add study to campaign
        models.CampaignMembership.objects.create(campaign=self.campaign, study=study)
        # verify study permissions applied
        self.assertTrue(
            edd_models.UserPermission.objects.filter(
                user=user, study=study, permission_type=READ
            ).exists()
        )
        self.assertTrue(
            edd_models.GroupPermission.objects.filter(
                group=group, study=study, permission_type=READ
            ).exists()
        )
        self.assertTrue(
            edd_models.EveryonePermission.objects.filter(
                study=study, permission_type=READ
            ).exists()
        )

    def test_visibility_helpers(self):
        self.assertTrue(self.permission.is_read())
        self.assertFalse(self.permission.is_write())


class CampaignIndexViewTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        super().setUpTestData()
        cls.user1 = edd_factory.UserFactory()
        cls.campaign = factory.CampaignFactory()
        cls.index_url = reverse("campaign:index")
        cls.link_url = reverse("campaign:detail", kwargs={"slug": cls.campaign.slug})

    def setUp(self):
        super().setUp()
        self.client.force_login(self.user1)

    def test_index_without_read_permission(self):
        # absent permissions, campaign link does not show on index
        response = self.client.get(self.index_url)
        self.assertTemplateUsed(response, "edd/campaign/index.html")
        self.assertNotContains(response, self.link_url)

    def test_index_with_read_permission(self):
        # set permission on campaign
        self.campaign.userpermission_set.create(
            user=self.user1,
            campaign_permission=models.UserPermission.READ,
            study_permission=models.UserPermission.READ,
        )
        # verify campaign link does show on index
        response = self.client.get(self.index_url)
        self.assertTemplateUsed(response, "edd/campaign/index.html")
        self.assertContains(response, self.link_url)

    def test_index_for_admin(self):
        # make the logged in user an admin
        self.user1.is_superuser = True
        self.user1.save(update_fields=("is_superuser",))
        # verify campaign link does show on index
        response = self.client.get(self.index_url)
        self.assertTemplateUsed(response, "edd/campaign/index.html")
        self.assertContains(response, self.link_url)

    def test_index_empty_post(self):
        pre_count = models.Campaign.objects.count()
        response = self.client.post(self.index_url)
        # verify no change in counts
        self.assertEqual(pre_count, models.Campaign.objects.count())
        self.assertTemplateUsed(response, "edd/campaign/create.html")
        self.assertEqual(response.status_code, codes.bad_request)

    def test_index_valid_post(self):
        fake_name = faker.catch_phrase()
        fake_desc = faker.sentence()
        response = self.client.post(
            self.index_url, data={"name": fake_name, "description": fake_desc}
        )
        # verify campaign is created and redirects to detail page
        qs = models.Campaign.objects.filter(name=fake_name)
        self.assertTrue(qs.exists())
        created = qs[0]
        detail_url = reverse("campaign:detail", kwargs={"slug": created.slug})
        self.assertRedirects(response, detail_url)


class CampaignDetailViewTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        super().setUpTestData()
        cls.user1 = edd_factory.UserFactory()
        cls.campaign = factory.CampaignFactory()
        cls.detail_url = reverse("campaign:detail", kwargs={"slug": cls.campaign.slug})

    def setUp(self):
        super().setUp()
        self.client.force_login(self.user1)

    def _add_campaign_permission(
        self,
        campaign_permission=models.CampaignPermission.READ,
        study_permission=models.CampaignPermission.READ,
        add_study=False,
        remove_study=False,
    ):
        # adding permission, and including ability to add Study to Campaign
        permission = models.UserPermission.objects.create(
            campaign=self.campaign,
            campaign_permission=campaign_permission,
            study_permission=study_permission,
            user=self.user1,
        )
        if add_study:
            permission.set_allowed(edd_models.Study, models.CampaignPermission.ADD)
        if remove_study:
            permission.set_allowed(edd_models.Study, models.CampaignPermission.REMOVE)
        permission.save()
        return permission

    def test_create_study_without_permission(self):
        # post without permission results in NOT FOUND
        response = self.client.post(self.detail_url)
        self.assertEqual(response.status_code, codes.not_found)

    def test_create_study_without_add_study(self):
        # add a permission, but do not set the add study flag
        self._add_campaign_permission()
        # post without permission having Add Study results in FORBIDDEN
        response = self.client.post(self.detail_url)
        self.assertEqual(response.status_code, codes.forbidden)

    def test_create_study_invalid(self):
        # empty post causes validation error, no study created
        self._add_campaign_permission(add_study=True)
        pre_count = edd_models.Study.objects.count()
        response = self.client.post(self.detail_url)
        post_count = edd_models.Study.objects.count()
        self.assertEqual(pre_count, post_count)
        self.assertEqual(response.status_code, codes.bad_request)
        self.assertTemplateUsed(response, "edd/campaign/detail.html")

    def test_create_study_valid(self):
        # valid post creates study
        self._add_campaign_permission(add_study=True)
        fake_name = faker.catch_phrase()
        fake_desc = faker.sentence()
        response = self.client.post(
            self.detail_url, data={"name": fake_name, "description": fake_desc}
        )
        qs = edd_models.Study.objects.filter(name=fake_name)
        # study exists
        self.assertTrue(qs.exists())
        # study has correct permissions added
        self.assertTrue(
            qs.filter(
                userpermission__user=self.user1,
                userpermission__permission_type=edd_models.StudyPermission.WRITE,
            ).exists()
        )
        # study contained in campaign
        created = qs[0]
        self.assertTrue(models.Campaign.objects.filter(studies__id=created.id).exists())
        # redirects to study overview
        study_url = reverse("main:overview", kwargs={"slug": created.slug})
        self.assertRedirects(response, study_url)

    def test_with_none_access(self):
        response = self.client.get(self.detail_url)
        self.assertEqual(response.status_code, codes.not_found)

    def test_with_read_access(self):
        self._add_campaign_permission()
        response = self.client.get(self.detail_url)
        self.assertTemplateUsed(response, "edd/campaign/detail.html")
        # does not have add study button or add permission button
        self.assertNotContains(response, 'id="addStudyButton"')
        self.assertNotContains(response, 'id="addPermission"')

    def test_with_read_access_and_add(self):
        self._add_campaign_permission(add_study=True)
        response = self.client.get(self.detail_url)
        self.assertTemplateUsed(response, "edd/campaign/detail.html")
        # does have add study button, not add permission button
        self.assertContains(response, 'id="addStudyButton"')
        self.assertNotContains(response, 'id="addPermission"')

    def test_with_write_access(self):
        self._add_campaign_permission(campaign_permission=models.CampaignPermission.WRITE)
        response = self.client.get(self.detail_url)
        self.assertEqual(response.status_code, codes.ok)
        self.assertTemplateUsed(response, "edd/campaign/detail.html")
        # does not have add study button, does have add permission button
        self.assertNotContains(response, 'id="addStudyButton"')
        self.assertContains(response, 'id="addPermission"')

    def test_with_admin(self):
        # make the logged in user an admin
        self.user1.is_superuser = True
        self.user1.save(update_fields=("is_superuser",))
        # can view campaign, add study, add permission
        response = self.client.get(self.detail_url)
        self.assertEqual(response.status_code, codes.ok)
        self.assertTemplateUsed(response, "edd/campaign/detail.html")
        # does not have add study button, does have add permission button
        self.assertContains(response, 'id="addStudyButton"')
        self.assertContains(response, 'id="addPermission"')


class CampaignStudyListViewTests(CampaignDetailViewTests):

    @classmethod
    def setUpTestData(cls):
        # parent class creates user1, campaign, detail_url
        super().setUpTestData()
        membership = factory.CampaignMembershipFactory(campaign=cls.campaign)
        cls.study = membership.study
        cls.list_url = reverse("campaign:study", kwargs={"slug": cls.campaign.slug})
        cls.study_url = reverse("main:detail", kwargs={"slug": cls.study.slug})

    def test_without_campaign_read_permission(self):
        # absent permissions, page is not found
        response = self.client.get(self.list_url)
        self.assertEqual(response.status_code, codes.not_found)

    def test_without_study_read_permission(self):
        # create permission on only campaign
        self._add_campaign_permission()
        # can view campaign, but no study permission, should not see link to study
        response = self.client.get(self.list_url)
        self.assertTemplateUsed(response, "edd/campaign/study_list.html")
        self.assertNotContains(response, self.study_url)
        self.assertNotContains(response, 'id="removeStudyButton"')

    def test_with_read_permission(self):
        # create permission on campaign AND study
        permission = self._add_campaign_permission()
        permission.apply_to_study(self.study)
        # can view campaign, and see study
        response = self.client.get(self.list_url)
        self.assertTemplateUsed(response, "edd/campaign/study_list.html")
        self.assertContains(response, self.study_url)
        self.assertNotContains(response, 'id="removeStudyButton"')

    def test_with_remove_study(self):
        # create permission on campaign AND study
        permission = self._add_campaign_permission(remove_study=True)
        permission.apply_to_study(self.study)
        # can view campaign, and see study
        response = self.client.get(self.list_url)
        self.assertTemplateUsed(response, "edd/campaign/study_list.html")
        self.assertContains(response, self.study_url)
        self.assertContains(response, 'id="removeStudyButton"')

    def test_for_admin(self):
        # make the logged in user an admin
        self.user1.is_superuser = True
        self.user1.save(update_fields=("is_superuser",))
        # can view campaign, and see study
        response = self.client.get(self.list_url)
        self.assertTemplateUsed(response, "edd/campaign/study_list.html")
        self.assertContains(response, self.study_url)
        self.assertContains(response, 'id="removeStudyButton"')
