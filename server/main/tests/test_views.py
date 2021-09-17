import json
from io import BytesIO
from unittest.mock import patch

from django.contrib.auth import models as auth_models
from django.contrib.contenttypes.models import ContentType
from django.http import Http404
from django.http.request import HttpRequest
from django.urls import reverse
from django.utils.encoding import force_str
from faker import Faker
from requests import codes

from edd import TestCase
from edd.profile.factory import GroupFactory, UserFactory

from .. import models, redis
from . import factory

faker = Faker()


def upload_attachment(
    client,
    study,
    filename,
    content_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
):
    url = reverse("main:overview", kwargs={"slug": study.slug})
    with factory.load_test_file(filename) as fp:
        upload = BytesIO(fp.read())
    upload.name = filename
    upload.content_type = content_type
    payload = {
        "action": "attach",
        "description": faker.catch_phrase(),
        "file": upload,
    }
    return client.post(url, data=payload, follow=True)


class StudyCreateViewTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        super().setUpTestData()
        cls.url = reverse("main:create_study")
        cls.user = UserFactory()

    def setUp(self):
        super().setUp()
        self.client.force_login(self.user)

    def test_create_study_get(self):
        # Verify response from the dedicated creation page
        response = self.client.get(self.url)
        self.assertEqual(response.status_code, codes.ok)
        self.assertTemplateUsed(response, "main/create_study.html")

    def test_create_study_post(self):
        # Verify creation after POST to dedicated creation page
        name = faker.catch_phrase()
        payload = {"name": name}
        response = self.client.post(self.url, data=payload, follow=True)
        self.assertEqual(response.status_code, codes.ok)
        created = models.Study.objects.filter(name=name)
        self.assertEqual(created.count(), 1)
        self.assertRedirects(
            response, reverse("main:overview", kwargs={"slug": created.get().slug})
        )


class StudyIndexViewTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        super().setUpTestData()
        cls.url = reverse("main:index")
        cls.user = UserFactory()

    def setUp(self):
        super().setUp()
        self.client.force_login(self.user)

    def test_index_view_get(self):
        # GET loads the index view
        response = self.client.get(self.url)
        self.assertEqual(response.status_code, codes.ok)
        self.assertTemplateUsed(response, "main/index.html")

    def test_index_view_post(self):
        # POST uses the create view methods
        name = faker.catch_phrase()
        payload = {"name": name}
        response = self.client.post(self.url, data=payload, follow=True)
        self.assertEqual(response.status_code, codes.ok)
        created = models.Study.objects.filter(name=name)
        self.assertEqual(created.count(), 1)
        self.assertRedirects(
            response, reverse("main:overview", kwargs={"slug": created.get().slug})
        )

    def test_index_visiting_study_lists_in_latest_viewed_list(self):
        study = factory.StudyFactory()
        lvs = redis.LatestViewedStudies(self.user)
        lvs.viewed_study(study)
        response = self.client.get(self.url)
        self.assertContains(response, study.name)
        self.assertTemplateUsed(response, "main/index.html")


class StudyViewTestCase(TestCase):
    """Tests for the behavior of the Study view(s)."""

    @classmethod
    def setUpTestData(cls):
        super().setUpTestData()
        cls.user = UserFactory()
        cls.target_study = factory.StudyFactory()
        cls.target_study.userpermission_set.update_or_create(
            permission_type=models.StudyPermission.WRITE, user=cls.user
        )

    def setUp(self):
        super().setUp()
        self.client.force_login(self.user)


class StudyAttachmentViewTests(StudyViewTestCase):
    def setUp(self):
        super().setUp()
        upload_attachment(self.client, self.target_study, "ImportData_FBA_HPLC.xlsx")
        self.attachment = self.target_study.attachments.first()
        kwargs = {
            "slug": self.target_study.slug,
            "file_id": self.attachment.id,
            "file_name": self.attachment.filename,
        }
        self.url = reverse("main:attachment", kwargs=kwargs)

    def test_get(self):
        # viewing an attachment
        response = self.client.get(self.url)
        self.assertEqual(response.status_code, codes.ok)

    def test_post_to_confirm_delete(self):
        # delete an attachment confirmation page
        response = self.client.post(self.url)
        self.assertTemplateUsed(response, "main/confirm_delete.html")
        self.assertContains(response, self.attachment.filename)
        self.assertEqual(self.target_study.attachments.count(), 1)

    def test_post_after_confirmation(self):
        # delete execute
        response = self.client.post(self.url, data={"action": "delete"})
        self.assertEqual(self.target_study.attachments.count(), 0)
        self.assertRedirects(
            response, reverse("main:overview", kwargs={"slug": self.target_study.slug}),
        )


class StudyOverviewViewTests(StudyViewTestCase):
    """Tests for the behavior of the Study view(s)."""

    @classmethod
    def setUpTestData(cls):
        super().setUpTestData()
        cls.query = models.Study.objects.filter(slug=cls.target_study.slug)
        cls.url = reverse("main:overview", kwargs={"slug": cls.target_study.slug})

    def test_overview_get(self):
        response = self.client.get(self.url)
        self.assertEqual(response.status_code, codes.ok)

    def test_overview_get_inactive(self):
        self.target_study.active = False
        self.target_study.save()
        response = self.client.get(self.url)
        self.assertEqual(response.status_code, codes.not_found)

    def test_overview_get_inactive_as_admin(self):
        self.target_study.active = False
        self.target_study.save()
        self.user.is_superuser = True
        self.user.save()
        response = self.client.get(self.url)
        self.assertEqual(response.status_code, codes.ok)

    def test_overview_get_without_permissions(self):
        # create user with no permissions
        user = UserFactory()
        self.client.force_login(user)
        # Not Found for a study without permissions
        response = self.client.get(self.url)
        self.assertEqual(response.status_code, codes.not_found)

    def test_overview_get_admin_sees_all(self):
        # create an admin user
        admin_user = UserFactory()
        admin_user.is_superuser = True
        admin_user.save()
        self.client.force_login(admin_user)
        # admin user can see the study
        response = self.client.get(self.url)
        self.assertEqual(response.status_code, codes.ok)

    def test_overview_update(self):
        new_user = UserFactory()
        name = faker.catch_phrase()
        description = faker.paragraph()
        # edit study info as default test user
        response = self.client.post(
            self.url,
            data={
                "action": "update",
                "study-name": name,
                "study-description": description,
                "study-contact_0": new_user.username,
                "study-contact_1": new_user.id,
            },
            follow=True,
        )
        self.assertEqual(response.status_code, codes.ok)
        reloaded = models.Study.objects.get(slug=self.target_study.slug)
        self.assertEqual(reloaded.name, name)
        self.assertEqual(reloaded.description, description)
        self.assertEqual(reloaded.contact, new_user)

    def test_overview_update_without_permissions(self):
        # verify that new_user without permissions cannot modify study
        new_user = UserFactory()
        target_url = self.url
        self.target_study.userpermission_set.update_or_create(
            permission_type=models.StudyPermission.READ, user=new_user
        )
        self.client.force_login(new_user)
        response = self.client.post(
            target_url,
            data={
                "action": "update",
                "study-name": faker.catch_phrase(),
                "study-description": faker.paragraph(),
                "study-contact_0": new_user.username,
                "study-contact_1": new_user.id,
            },
            follow=True,
        )
        self.assertContains(
            response, "You do not have permission", status_code=codes.forbidden
        )
        reloaded = models.Study.objects.get(slug=self.target_study.slug)
        self.assertEqual(reloaded.name, self.target_study.name)
        self.assertEqual(reloaded.description, self.target_study.description)
        self.assertEqual(reloaded.contact, self.target_study.contact)

    def test_overview_attach_post(self):
        # adding an attachment
        filename = "ImportData_FBA_HPLC.xlsx"
        response = upload_attachment(self.client, self.target_study, filename)
        self.assertContains(response, filename)
        self.assertRedirects(response, self.url)
        self.assertEqual(self.target_study.attachments.count(), 1)

    def test_overview_attach_post_invalid_form(self):
        # handle validation errors adding attachment
        filename = "ImportData_FBA_HPLC.xlsx"
        # views/study.py does `from .. import forms as edd_forms`,
        # so must mock that name
        with patch("main.views.study.edd_forms.CreateAttachmentForm") as MockForm:
            form = MockForm.return_value
            form.is_valid.return_value = False
            response = upload_attachment(self.client, self.target_study, filename)
        # invalid form means request status is bad
        self.assertEqual(response.status_code, codes.bad_request)
        # unchanged number of attachments
        self.assertEqual(self.target_study.attachments.count(), 0)

    def test_overview_comment_post(self):
        # adding a comment
        body = faker.sentence()
        payload = {
            "action": "comment",
            "body": body,
        }
        response = self.client.post(self.url, data=payload, follow=True)
        self.assertContains(response, body)
        self.assertEqual(self.target_study.comments.count(), 1)

    def test_overview_comment_post_invalid_form(self):
        # adding a comment
        body = faker.sentence()
        payload = {
            "action": "comment",
            "body": body,
        }
        # views/study.py does `from .. import forms as edd_forms`,
        # so must mock that name
        with patch("main.views.study.edd_forms.CreateCommentForm") as MockForm:
            form = MockForm.return_value
            # simulate a validation error
            form.is_valid.return_value = False
            response = self.client.post(self.url, data=payload, follow=True)
        # response does not have invalid comment,
        # response indicates bad request
        self.assertNotContains(response, body, status_code=codes.bad_request)
        # unchanged count of comments
        self.assertEqual(self.target_study.comments.count(), 0)

    def test_overview_delete_shows_confirmation_page(self):
        payload = {
            "action": "study_delete",
        }
        response = self.client.post(self.url, data=payload, follow=True)
        self.assertEqual(response.status_code, codes.ok)
        self.assertTemplateUsed(response, "main/confirm_delete.html")
        assert self.query.count() == 1

    def test_overview_confirmed_delete(self):
        payload = {
            "action": "delete_confirm",
        }
        response = self.client.post(self.url, data=payload, follow=True)
        self.assertEqual(response.status_code, codes.ok)
        assert not self.query.exists()

    def test_overview_delete_readonly(self):
        # prevent deletion with user not having write permission
        readonly_user = UserFactory()
        self.client.force_login(readonly_user)
        self.target_study.userpermission_set.update_or_create(
            permission_type=models.StudyPermission.READ, user=readonly_user
        )
        payload = {
            "action": "study_delete",
        }
        response = self.client.post(self.url, data=payload, follow=True)
        self.assertContains(
            response, "You do not have permission", status_code=codes.forbidden,
        )
        assert self.query.count() == 1

    def test_overview_delete_confirmation_with_data(self):
        # add line/assay/measurement to study
        line = factory.LineFactory(study=self.target_study)
        assay = factory.AssayFactory(line=line)
        factory.MeasurementFactory(assay=assay)
        # send delete confirmation
        payload = {
            "action": "delete_confirm",
        }
        response = self.client.post(self.url, data=payload, follow=True)
        # OK response, study still exists with active flag disabled
        self.assertEqual(response.status_code, codes.ok)
        assert self.query.filter(active=False).count() == 1

    def test_overview_restore_as_admin(self):
        self.target_study.active = False
        self.target_study.save()
        # send restore as admin
        admin_user = UserFactory()
        admin_user.is_superuser = True
        admin_user.save()
        self.client.force_login(admin_user)
        payload = {
            "action": "study_restore",
        }
        response = self.client.post(self.url, data=payload, follow=True)
        # OK response, study has active flag flipped on
        self.assertEqual(response.status_code, codes.ok)
        assert self.query.filter(active=True).count() == 1

    def test_overview_restore_without_admin(self):
        self.target_study.active = False
        self.target_study.save()
        # send restore
        payload = {
            "action": "study_restore",
        }
        response = self.client.post(self.url, data=payload, follow=True)
        # not found, study does not have active flag restored
        self.assertEqual(response.status_code, codes.not_found)
        assert not self.query.filter(active=True).exists()

    def test_overview_update_failed(self):
        # views/study.py does `from .. import forms as edd_forms`,
        # so must mock that name
        with patch("main.views.study.edd_forms.CreateStudyForm") as MockForm:
            form = MockForm.return_value
            form.is_valid.return_value = False
            # should be no redirect
            response = self.client.post(self.url, data={"action": "update"})
        # verify that a failed validation renders to overview page
        self.assertTemplateUsed(response, "main/study-overview.html")
        self.assertEqual(response.status_code, codes.bad_request)


class StudyDescriptionViewTests(StudyViewTestCase):
    """Tests for the behavior of the Study view(s)."""

    @classmethod
    def setUpTestData(cls):
        super().setUpTestData()
        cls.url = reverse("main:lines", kwargs={"slug": cls.target_study.slug})

    def test_empty_post(self):
        """An empty POST request should just act like a GET."""
        response = self.client.post(self.url, data={})
        # content the same as a GET request
        self.assertTemplateUsed(response, "main/study-lines.html")
        # status code will say request is bad
        self.assertEqual(response.status_code, codes.bad_request)

    def test_lines_clone(self):
        line = factory.LineFactory(study=self.target_study)
        payload = {
            "action": "clone",
            "lineId": [line.id],
        }
        response = self.client.post(self.url, data=payload, follow=True)
        self.assertEqual(response.status_code, codes.ok)
        assert self.target_study.line_set.count() == 2

    def test_lines_clone_with_no_id(self):
        payload = {
            "action": "clone",
        }
        response = self.client.post(self.url, data=payload, follow=True)
        self.assertTemplateUsed(response, "main/study-lines.html")
        self.assertContains(
            response,
            "Failed to validate selection for clone.",
            status_code=codes.bad_request,
        )
        assert self.target_study.line_set.count() == 0

    def test_lines_clone_with_invalid_id(self):
        payload = {
            "action": "clone",
            "lineId": [12345],
        }
        response = self.client.post(self.url, data=payload, follow=True)
        self.assertTemplateUsed(response, "main/study-lines.html")
        self.assertContains(
            response,
            "Failed to validate selection for clone.",
            status_code=codes.bad_request,
        )
        assert self.target_study.line_set.count() == 0

    def test_lines_delete_requests_confirmation(self):
        line = factory.LineFactory(study=self.target_study)
        payload = {
            "action": "disable",
            "lineId": [line.id],
        }
        response = self.client.post(self.url, data=payload, follow=True)
        self.assertTemplateUsed(response, "main/confirm_delete.html")
        self.assertEqual(response.status_code, codes.ok)
        assert self.target_study.line_set.count() == 1

    def test_lines_confirmed_delete_removes_empty_line(self):
        line = factory.LineFactory(study=self.target_study)
        payload = {
            "action": "disable_confirm",
            "lineId": [line.id],
        }
        response = self.client.post(self.url, data=payload, follow=True)
        self.assertEqual(response.status_code, codes.ok)
        assert self.target_study.line_set.count() == 0

    def test_lines_confirmed_delete_deactivates_line_with_data(self):
        line = factory.LineFactory(study=self.target_study)
        assay = factory.AssayFactory(line=line)
        factory.MeasurementFactory(assay=assay)
        payload = {
            "action": "disable_confirm",
            "lineId": [line.id],
        }
        response = self.client.post(self.url, data=payload, follow=True)
        self.assertEqual(response.status_code, codes.ok)
        assert self.target_study.line_set.count() == 1
        assert self.target_study.line_set.filter(active=True).count() == 0

    def test_lines_restoring_deactivated_line(self):
        line = factory.LineFactory(study=self.target_study, active=False)
        payload = {
            "action": "enable",
            "lineId": [line.id],
        }
        response = self.client.post(self.url, data=payload, follow=True)
        self.assertEqual(response.status_code, codes.ok)
        assert self.target_study.line_set.count() == 1
        assert self.target_study.line_set.filter(active=True).count() == 1

    def test_lines_delete_without_line_id(self):
        payload = {
            "action": "disable_confirm",
        }
        response = self.client.post(self.url, data=payload, follow=True)
        self.assertEqual(response.status_code, codes.bad_request)
        assert self.target_study.line_set.count() == 0

    def test_lines_delete_with_invalid_line_id(self):
        payload = {
            "action": "disable_confirm",
            "lineId": [12345],
        }
        response = self.client.post(self.url, data=payload, follow=True)
        self.assertEqual(response.status_code, codes.bad_request)
        assert self.target_study.line_set.count() == 0

    def test_lines_assay_add_without_line_id(self):
        payload = {
            "action": "assay",
        }
        response = self.client.post(self.url, data=payload, follow=True)
        self.assertEqual(response.status_code, codes.bad_request)
        self.assertTemplateUsed(response, "main/study-lines.html")

    def test_lines_assay_add_with_empty_form(self):
        line = factory.LineFactory(study=self.target_study)
        payload = {
            "action": "assay",
            "lineId": [line.id],
        }
        response = self.client.post(self.url, data=payload, follow=True)
        self.assertEqual(response.status_code, codes.bad_request)
        self.assertTemplateUsed(response, "main/study-lines.html")

    def test_lines_assay_add_with_bad_protocol(self):
        line = factory.LineFactory(study=self.target_study)
        payload = {
            "action": "assay",
            "assay-protocol": 12345,
            "lineId": [line.id],
        }
        response = self.client.post(self.url, data=payload, follow=True)
        self.assertEqual(response.status_code, codes.bad_request)
        self.assertTemplateUsed(response, "main/study-lines.html")

    def test_lines_assay_add(self):
        line = factory.LineFactory(study=self.target_study)
        protocol = factory.ProtocolFactory()
        payload = {
            "action": "assay",
            "assay-protocol": protocol.id,
            "lineId": [line.id],
        }
        response = self.client.post(self.url, data=payload, follow=True)
        self.assertEqual(response.status_code, codes.ok)
        self.assertTemplateUsed(response, "main/study-lines.html")
        assert models.Assay.objects.filter(study=self.target_study).count() == 1

    def test_lines_assay_add_to_multiple_lines(self):
        line1 = factory.LineFactory(study=self.target_study)
        line2 = factory.LineFactory(study=self.target_study)
        protocol = factory.ProtocolFactory()
        payload = {
            "action": "assay",
            "assay-protocol": protocol.id,
            "lineId": [line1.id, line2.id],
        }
        response = self.client.post(self.url, data=payload, follow=True)
        self.assertEqual(response.status_code, codes.ok)
        self.assertTemplateUsed(response, "main/study-lines.html")
        assert models.Assay.objects.filter(study=self.target_study).count() == 2

    def test_lines_assay_edit_invalid_id(self):
        payload = {
            "action": "assay",
            "assayId": 12345,
        }
        response = self.client.post(self.url, data=payload, follow=True)
        self.assertEqual(response.status_code, codes.bad_request)
        self.assertTemplateUsed(response, "main/study-lines.html")

    def test_lines_assay_edit(self):
        line = factory.LineFactory(study=self.target_study)
        assay = factory.AssayFactory(line=line)
        name = faker.catch_phrase()
        payload = {
            "action": "assay",
            "assayId": assay.id,
            "assay-name": name,
            "assay-protocol": assay.protocol_id,
        }
        response = self.client.post(self.url, data=payload, follow=True)
        self.assertEqual(response.status_code, codes.ok)
        self.assertTemplateUsed(response, "main/study-lines.html")
        assert self.target_study.assay_set.filter(name=name).exists()

    def test_lines_add_line(self):
        name = faker.catch_phrase()
        payload = {
            "action": "line",
            "line-name": name,
        }
        response = self.client.post(self.url, data=payload, follow=True)
        self.assertTemplateUsed(response, "main/study-lines.html")
        self.assertContains(response, f"Added Line &#x27;{name}&#x27;")
        assert self.target_study.line_set.filter(name=name).exists()

    def test_lines_add_line_with_invalid_form(self):
        name = faker.catch_phrase()
        payload = {
            "action": "line",
            "line-name": name,
        }
        # views/study.py does `from .. import forms as edd_forms`,
        # so must mock that name
        with patch("main.views.study.edd_forms.LineForm") as MockForm:
            form = MockForm.return_value
            form.is_valid.return_value = False
            response = self.client.post(self.url, data=payload, follow=True)
        self.assertTemplateUsed(response, "main/study-lines.html")
        self.assertEqual(response.status_code, codes.bad_request)
        assert self.target_study.line_set.count() == 0

    def test_lines_edit_line(self):
        line = factory.LineFactory(study=self.target_study)
        name = faker.catch_phrase()
        payload = {
            "action": "line",
            "line-_bulk_name": "",
            "line-name": name,
            "lineId": [line.id],
        }
        response = self.client.post(self.url, data=payload, follow=True)
        self.assertTemplateUsed(response, "main/study-lines.html")
        self.assertContains(response, "Saved 1 of 1 Lines")
        assert self.target_study.line_set.filter(name=name).exists()

    def test_lines_edit_line_with_invalid_id(self):
        name = faker.catch_phrase()
        payload = {
            "action": "line",
            "line-_bulk_name": "",
            "line-name": name,
            "lineId": [12345],
        }
        response = self.client.post(self.url, data=payload, follow=True)
        self.assertTemplateUsed(response, "main/study-lines.html")
        self.assertContains(
            response, "Failed to load line for editing", status_code=codes.bad_request
        )
        assert self.target_study.line_set.count() == 0

    def test_lines_edit_line_with_invalid_form(self):
        line = factory.LineFactory(study=self.target_study)
        name = faker.catch_phrase()
        payload = {
            "action": "line",
            "line-_bulk_name": "",
            "line-name": name,
            "lineId": [line.id],
        }
        # views/study.py does `from .. import forms as edd_forms`,
        # so must mock that name
        with patch("main.views.study.edd_forms.LineForm") as MockForm:
            form = MockForm.return_value
            form.is_valid.return_value = False
            response = self.client.post(self.url, data=payload, follow=True)
        self.assertEqual(response.status_code, codes.bad_request)
        self.assertTemplateUsed(response, "main/study-lines.html")
        # line still using original name
        assert self.target_study.line_set.filter(name=line.name).exists()

    def test_lines_edit_bulk(self):
        line1 = factory.LineFactory(study=self.target_study)
        line2 = factory.LineFactory(study=self.target_study)
        description = faker.catch_phrase()
        payload = {
            "action": "line",
            "line-_bulk_description": "",
            "line-description": description,
            "lineId": [line1.id, line2.id],
        }
        response = self.client.post(self.url, data=payload, follow=True)
        self.assertTemplateUsed(response, "main/study-lines.html")
        self.assertContains(response, "Saved 2 of 2 Lines")
        assert self.target_study.line_set.filter(description=description).count() == 2

    def test_lines_edit_bulk_with_invalid_form(self):
        line1 = factory.LineFactory(study=self.target_study)
        line2 = factory.LineFactory(study=self.target_study)
        description = faker.catch_phrase()
        payload = {
            "action": "line",
            "line-_bulk_description": "",
            "line-description": description,
            "lineId": [line1.id, line2.id],
        }
        # views/study.py does `from .. import forms as edd_forms`,
        # so must mock that name
        with patch("main.views.study.edd_forms.LineForm") as MockForm:
            form = MockForm.return_value
            form.is_valid.return_value = False
            form.errors.values.return_value = ["fake error"]
            response = self.client.post(self.url, data=payload, follow=True)
        self.assertTemplateUsed(response, "main/study-lines.html")
        self.assertContains(
            response, "Saved 0 of 2 Lines", status_code=codes.bad_request
        )
        self.assertContains(response, "fake error", status_code=codes.bad_request)
        assert self.target_study.line_set.filter(description=description).count() == 0

    def test_lines_replicate_with_empty_selection(self):
        replicate = models.MetadataType.system("Replicate")
        factory.LineFactory(study=self.target_study)
        factory.LineFactory(study=self.target_study)
        payload = {
            "action": "replicate",
        }
        response = self.client.post(self.url, data=payload, follow=True)
        assigned_ids = [
            line.metadata_get(replicate) for line in self.target_study.line_set.all()
        ]
        unique_ids = set(assigned_ids)
        self.assertTemplateUsed(response, "main/study-lines.html")
        # both lines show as not having replicate
        assert len(unique_ids) == 1
        assert None in unique_ids

    def test_lines_replicate_with_valid_selection(self):
        replicate = models.MetadataType.system("Replicate")
        line1 = factory.LineFactory(study=self.target_study)
        line2 = factory.LineFactory(study=self.target_study)
        # post replicate action with lines selected
        payload = {
            "action": "replicate",
            "lineId": [line1.id, line2.id],
        }
        response = self.client.post(self.url, data=payload, follow=True)
        assigned_ids = [
            line.metadata_get(replicate) for line in self.target_study.line_set.all()
        ]
        unique_ids = set(assigned_ids)
        self.assertTemplateUsed(response, "main/study-lines.html")
        # both lines have *same* non-None ID assigned
        assert len(unique_ids) == 1
        assert None not in unique_ids

    def test_lines_unreplicate_with_empty_selection(self):
        replicate = models.MetadataType.system("Replicate")
        metadata = {replicate.pk: "some value"}
        factory.LineFactory(study=self.target_study, metadata=metadata)
        factory.LineFactory(study=self.target_study, metadata=metadata)
        # post unreplicate action without any selection
        payload = {
            "action": "unreplicate",
        }
        response = self.client.post(self.url, data=payload, follow=True)
        assigned_ids = [
            line.metadata_get(replicate) for line in self.target_study.line_set.all()
        ]
        unique_ids = set(assigned_ids)
        self.assertTemplateUsed(response, "main/study-lines.html")
        # both lines keep original replicate ID
        assert len(unique_ids) == 1
        assert "some value" in unique_ids

    def test_lines_unreplicate_with_valid_selection(self):
        replicate = models.MetadataType.system("Replicate")
        metadata = {replicate.pk: "some value"}
        line1 = factory.LineFactory(study=self.target_study, metadata=metadata)
        line2 = factory.LineFactory(study=self.target_study, metadata=metadata)
        # post replicate action with lines selected
        payload = {
            "action": "unreplicate",
            "lineId": [line1.id, line2.id],
        }
        response = self.client.post(self.url, data=payload, follow=True)
        assigned_ids = [
            line.metadata_get(replicate) for line in self.target_study.line_set.all()
        ]
        print(assigned_ids)
        unique_ids = set(assigned_ids)
        self.assertTemplateUsed(response, "main/study-lines.html")
        # both lines show as not having replicate
        assert len(unique_ids) == 1
        assert None in unique_ids


class StudyDetailViewTests(StudyViewTestCase):
    """Tests for the behavior of the Study view(s)."""

    @classmethod
    def setUpTestData(cls):
        super().setUpTestData()
        cls.url = reverse("main:detail", kwargs={"slug": cls.target_study.slug})

    def test_detail_get_empty_study(self):
        # when study has no lines, get a redirect to the overview page
        response = self.client.get(self.url)
        self.assertRedirects(
            response, reverse("main:overview", kwargs={"slug": self.target_study.slug}),
        )

    def test_detail_get_study_with_only_lines(self):
        # when there are lines, but no measurements, redirect to the lines page
        factory.LineFactory(study=self.target_study)
        response = self.client.get(self.url)
        self.assertRedirects(
            response, reverse("main:lines", kwargs={"slug": self.target_study.slug}),
        )

    def test_detail_get_study_with_measurements(self):
        # only when there are measurements, display the data details page
        line = factory.LineFactory(study=self.target_study)
        assay = factory.AssayFactory(line=line)
        factory.MeasurementFactory(assay=assay)
        response = self.client.get(self.url)
        self.assertTemplateUsed(response, "main/study-data.html")
        self.assertEqual(response.status_code, codes.ok)

    def test_detail_assay_delete_requests_confirmation(self):
        line = factory.LineFactory(study=self.target_study)
        assay = factory.AssayFactory(line=line)
        # requesting delete redirects to confirmation
        response = self.client.post(
            self.url,
            data={"action": "disable_assay", "assayId": assay.pk},
            follow=True,
        )
        self.assertTemplateUsed(response, "main/confirm_delete.html")
        self.assertContains(response, f"the Assay &quot;{assay.name}&quot;")
        assert self.target_study.assay_set.count() == 1

    def test_detail_assay_delete_with_invalid_id(self):
        line = factory.LineFactory(study=self.target_study)
        factory.AssayFactory(line=line)
        # test proper error when using an invalid ID
        response = self.client.post(
            self.url,
            data={"action": "disable_assay_confirm", "assayId": 12345},
            follow=True,
        )
        self.assertTemplateUsed(response, "main/study-data.html")
        self.assertContains(
            response, "Nothing selected to delete.", status_code=codes.bad_request
        )
        assert self.target_study.assay_set.count() == 1

    def test_detail_assay_confirm_delete(self):
        line = factory.LineFactory(study=self.target_study)
        assay = factory.AssayFactory(line=line)
        # test confirming delete works
        response = self.client.post(
            self.url,
            data={"action": "disable_assay_confirm", "assayId": assay.pk},
            follow=True,
        )
        self.assertTemplateUsed(response, "main/study-data.html")
        self.assertContains(response, "Deleted 1 Assays")
        assert self.target_study.assay_set.filter(active=True).count() == 0
        assert self.target_study.assay_set.filter(active=False).count() == 1

    def test_detail_assay_edit(self):
        line = factory.LineFactory(study=self.target_study)
        protocol = factory.ProtocolFactory()
        assay = factory.AssayFactory(line=line)
        name = faker.catch_phrase()
        payload = {
            "action": "assay",
            "assay-name": name,
            "assay-_bulk_name": "",
            "assay-protocol": protocol.pk,
            "assay-_bulk_protocol": "",
            "assayId": [assay.pk],
        }
        response = self.client.post(self.url, data=payload, follow=True)
        self.assertTemplateUsed(response, "main/study-data.html")
        self.assertContains(response, "Saved 1 of 1 Assays")
        assert self.target_study.assay_set.filter(name=name, protocol=protocol).exists()

    def test_detail_assay_edit_with_invalid_id(self):
        line = factory.LineFactory(study=self.target_study)
        protocol = factory.ProtocolFactory()
        assay = factory.AssayFactory(line=line)
        name = faker.catch_phrase()
        payload = {
            "action": "assay",
            "assay-name": name,
            "assay-_bulk_name": "",
            "assay-protocol": protocol.pk,
            "assay-_bulk_protocol": "",
            "assayId": [12345],
        }
        response = self.client.post(self.url, data=payload, follow=True)
        self.assertTemplateUsed(response, "main/study-data.html")
        self.assertContains(
            response,
            "Must select at least one Assay to edit.",
            status_code=codes.bad_request,
        )
        assert self.target_study.assay_set.filter(
            name=assay.name, protocol=assay.protocol
        ).exists()

    def test_detail_assay_edit_with_invalid_form(self):
        line = factory.LineFactory(study=self.target_study)
        assay = factory.AssayFactory(line=line)
        name = faker.catch_phrase()
        payload = {
            "action": "assay",
            "assay-name": name,
            "assay-_bulk_name": "",
            "assay-protocol": 12345,
            "assay-_bulk_protocol": "",
            "assayId": [assay.pk],
        }
        response = self.client.post(self.url, data=payload, follow=True)
        self.assertTemplateUsed(response, "main/study-data.html")
        self.assertContains(
            response, "Saved 0 of 1 Assays", status_code=codes.bad_request,
        )
        assert self.target_study.assay_set.filter(name=assay.name).exists()

    def test_detail_measurement_add_with_empty_form(self):
        line = factory.LineFactory(study=self.target_study)
        factory.AssayFactory(line=line)
        payload = {
            "action": "measurement",
        }
        response = self.client.post(self.url, data=payload, follow=True)
        self.assertEqual(response.status_code, codes.bad_request)
        self.assertTemplateUsed(response, "main/study-data.html")
        assert self.target_study.measurement_set.count() == 0

    def test_detail_measurement_add_invalid_form(self):
        line = factory.LineFactory(study=self.target_study)
        assay = factory.AssayFactory(line=line)
        payload = {
            "action": "measurement",
            "assayId": [assay.id],
            "measurement-compartment": "0",
            "measurement-measurement_type_0": "",
            "measurement-measurement_type_1": "",
        }
        response = self.client.post(self.url, data=payload, follow=True)
        self.assertEqual(response.status_code, codes.bad_request)
        self.assertTemplateUsed(response, "main/study-data.html")
        assert self.target_study.measurement_set.count() == 0

    def test_detail_measurement_add(self):
        line = factory.LineFactory(study=self.target_study)
        assay = factory.AssayFactory(line=line)
        mtype = factory.MeasurementTypeFactory()
        payload = {
            "action": "measurement",
            "assayId": [assay.id],
            "measurement-compartment": "0",
            "measurement-measurement_type_0": mtype.type_name,
            "measurement-measurement_type_1": mtype.id,
            "measurement-y_units": "1",
        }
        response = self.client.post(self.url, data=payload, follow=True)
        self.assertEqual(response.status_code, codes.ok)
        self.assertTemplateUsed(response, "main/study-data.html")
        assert self.target_study.measurement_set.count() == 1

    def test_detail_measurement_delete_asks_for_confirmation(self):
        line = factory.LineFactory(study=self.target_study)
        assay = factory.AssayFactory(line=line)
        measurement = factory.MeasurementFactory(assay=assay)
        response = self.client.post(
            self.url,
            data={"action": "disable_assay", "measurementId": measurement.pk},
            follow=True,
        )
        self.assertEqual(response.status_code, codes.ok)
        self.assertTemplateUsed(response, "main/confirm_delete.html")
        assert self.target_study.measurement_set.count() == 1

    def test_detail_measurement_confirm_deletion(self):
        line = factory.LineFactory(study=self.target_study)
        assay = factory.AssayFactory(line=line)
        measurement = factory.MeasurementFactory(assay=assay)
        # test confirming delete works
        response = self.client.post(
            self.url,
            data={"action": "disable_assay_confirm", "measurementId": measurement.pk},
            follow=True,
        )
        self.assertTemplateUsed(response, "main/study-data.html")
        self.assertContains(response, "Deleted 0 Assays and 1 Measurements.")
        assert self.target_study.measurement_set.filter(active=True).count() == 0
        assert self.target_study.measurement_set.filter(active=False).count() == 1

    def test_detail_measurement_edit(self):
        line = factory.LineFactory(study=self.target_study)
        assay = factory.AssayFactory(line=line)
        measurement = factory.MeasurementFactory(assay=assay)
        response = self.client.post(
            self.url,
            data={"action": "measurement_edit", "measurementId": measurement.pk},
            follow=True,
        )
        self.assertEqual(response.status_code, codes.ok)
        self.assertTemplateUsed(response, "main/edit_measurement.html")

    def test_detail_measurement_edit_with_invalid_id(self):
        # edit with invalid ID returns error
        response = self.client.post(
            self.url,
            data={"action": "measurement_edit", "measurementId": 12345},
            follow=True,
        )
        self.assertTemplateUsed(response, "main/study-data.html")
        self.assertContains(
            response, "Nothing selected for edit.", status_code=codes.bad_request
        )

    def test_detail_measurement_update_existing_values(self):
        line = factory.LineFactory(study=self.target_study)
        assay = factory.AssayFactory(line=line)
        measurement = factory.MeasurementFactory(assay=assay)
        value = factory.ValueFactory(x=[12], y=[34], measurement=measurement)
        # edit with valid bound data updates the measurement
        edit_data = {
            "action": "measurement_update",
            "measurementId": measurement.pk,
            f"{measurement.pk}-TOTAL_FORMS": 1,
            f"{measurement.pk}-INITIAL_FORMS": 1,
            f"{measurement.pk}-MIN_NUM_FORMS": 0,
            f"{measurement.pk}-MAX_NUM_FORMS": 1000,
            f"{measurement.pk}-0-id": value.pk,
            f"{measurement.pk}-0-x": 56,
            f"{measurement.pk}-0-y": 78,
        }
        response = self.client.post(self.url, data=edit_data, follow=True)
        self.assertRedirects(response, self.url)
        saved_value = models.MeasurementValue.objects.get(id=value.pk)
        self.assertEqual(saved_value.x, [56])
        self.assertEqual(saved_value.y, [78])


class StudyAjaxViewTests(StudyViewTestCase):
    """Tests for the behavior of the Study view(s)."""

    @classmethod
    def setUpTestData(cls):
        super().setUpTestData()
        cls.url = reverse("main:edddata", kwargs={"slug": cls.target_study.slug})

    def test_load_study_with_invalid_slug(self):
        """An invalid slug should return a Not Found code."""
        # using edddata view as simple way to go through main.view.load_study function
        response = self.client.get(reverse("main:edddata", kwargs={"slug": "invalid"}))
        self.assertEqual(response.status_code, codes.not_found)

    def test_load_study_with_invalid_pk(self):
        """An invalid pk should return a Not Found code."""
        # using edddata view as simple way to go through main.view.load_study function
        response = self.client.get(reverse("main:edd-pk:edddata", kwargs={"pk": 0}))
        self.assertEqual(response.status_code, codes.not_found)

    def test_load_study_without_identifier(self):
        # no view method should be calling load_study without ID or slug, but test directly
        request = HttpRequest()
        request.user = self.user
        # attempting to load study without ID or slug will raise a 404
        with self.assertRaises(Http404):
            from main.views.ajax import load_study

            load_study(request)


class AjaxPermissionViewTests(TestCase):
    """
    Tests for the behavior of AJAX views assisting front-end display of
    Study permissions.
    """

    @classmethod
    def setUpTestData(cls):
        super().setUpTestData()
        cls.target_study = factory.StudyFactory()
        cls.url = reverse("main:permissions", kwargs={"slug": cls.target_study.slug})
        cls.user = UserFactory()

    def setUp(self):
        super().setUp()
        self.client.force_login(self.user)

    def _set_permission(self, permission_type=models.StudyPermission.READ, user=None):
        # abstracting this repeating pattern for setting a permission
        user = self.user if user is None else user
        self.target_study.userpermission_set.update_or_create(
            permission_type=permission_type, user=user
        )

    def _length_of_permissions(self):
        # making a nicer name for the below repeated expression
        return len(list(self.target_study.get_combined_permission()))

    def test_get_permissions_no_read(self):
        # no permissions set
        response = self.client.get(self.url)
        # response will be NOT FOUND
        self.assertEqual(response.status_code, codes.not_found)

    def test_get_permissions_with_read(self):
        self._set_permission(models.StudyPermission.READ)
        response = self.client.get(self.url)
        # response has username listed in permissions (implicit status OK)
        self.assertContains(response, self.user.username)

    def test_get_permissions_with_admin(self):
        # make user admin
        self.user.is_superuser = True
        self.user.save(update_fields=["is_superuser"])
        response = self.client.get(self.url)
        # response is empty array
        self.assertEqual(response.status_code, codes.ok)
        self.assertJSONEqual(force_str(response.content), [])

    def test_head_permissions(self):
        self._set_permission(models.StudyPermission.READ)
        response = self.client.head(self.url)
        # HEAD requests should always be OK with zero length
        self.assertEqual(response.status_code, codes.ok)
        self.assertEqual(len(response.content), 0)

    def test_delete_permissions_no_read(self):
        # no permissions set
        response = self.client.delete(self.url)
        # response will be NOT FOUND
        self.assertEqual(response.status_code, codes.not_found)

    def test_delete_permissions_with_read(self):
        # add a READ permission
        self._set_permission(models.StudyPermission.READ)
        response = self.client.delete(self.url)
        # response will be FORBIDDEN (no write access)
        self.assertEqual(response.status_code, codes.forbidden)

    def test_delete_permissions_with_write(self):
        self._set_permission(models.StudyPermission.WRITE)
        # have one permission before deletion
        self.assertEqual(self._length_of_permissions(), 1)
        # do deletion
        response = self.client.delete(self.url)
        # correct response of NO CONTENT, and permissions length zero
        self.assertEqual(response.status_code, codes.no_content)
        self.assertEqual(self._length_of_permissions(), 0)

    def test_post_permissions_no_read(self):
        # no permissions set
        response = self.client.post(self.url, data={})
        # response will be NOT FOUND
        self.assertEqual(response.status_code, codes.not_found)

    def test_post_permissions_with_read(self):
        # add a READ permission
        self._set_permission(models.StudyPermission.READ)
        response = self.client.post(self.url, data={})
        # response will be FORBIDDEN (no write access)
        self.assertEqual(response.status_code, codes.forbidden)

    def test_post_permissions_empty(self):
        self._set_permission(models.StudyPermission.WRITE)
        # have one permission before empty post
        self.assertEqual(self._length_of_permissions(), 1)
        response = self.client.post(self.url, data={})
        # correct response, no change in permission count
        self.assertEqual(response.status_code, codes.no_content)
        self.assertEqual(self._length_of_permissions(), 1)

    def test_post_permissions_adding(self):
        self._set_permission(models.StudyPermission.WRITE)
        # have one permission before post
        self.assertEqual(self._length_of_permissions(), 1)
        # create a bunch of things to add permissions for
        other_user = UserFactory()
        some_group = GroupFactory()
        add_other_user = {
            "type": models.StudyPermission.WRITE,
            "user": {"id": other_user.id},
        }
        add_some_group = {
            "type": models.StudyPermission.WRITE,
            "group": {"id": some_group.id},
        }
        payload = json.dumps([add_other_user, add_some_group])
        response = self.client.post(self.url, data={"data": payload})
        # correct response NO CONTENT, permission count updated
        self.assertEqual(response.status_code, codes.no_content)
        self.assertEqual(self._length_of_permissions(), 3)

    def test_post_permissions_removing(self):
        self._set_permission(models.StudyPermission.WRITE)
        # create some permissions to delete
        other_user = UserFactory()
        self._set_permission(models.StudyPermission.READ, user=other_user)
        delete_other_user = {
            "type": models.StudyPermission.NONE,
            "user": {"id": other_user.id},
        }
        # have two permissions before post
        self.assertEqual(self._length_of_permissions(), 2)
        payload = json.dumps([delete_other_user])
        response = self.client.post(self.url, data={"data": payload})
        # correct response NO CONTENT, permission count updated
        self.assertEqual(response.status_code, codes.no_content)
        self.assertEqual(self._length_of_permissions(), 1)

    def test_post_permissions_public_without_access(self):
        self._set_permission(models.StudyPermission.WRITE)
        # have one permission before post
        self.assertEqual(self._length_of_permissions(), 1)
        add_everyone = {"type": models.StudyPermission.READ, "public": None}
        payload = json.dumps([add_everyone])
        response = self.client.post(self.url, data={"data": payload})
        # without access to make public, FORBIDDEN response and no change in length
        self.assertEqual(response.status_code, codes.forbidden)
        self.assertEqual(self._length_of_permissions(), 1)

    def test_post_permissions_public_with_access(self):
        # self.user gets a write permission AND Django ContentType permission
        self._set_permission(models.StudyPermission.WRITE)
        public_ct = ContentType.objects.get_for_model(models.EveryonePermission)
        public_permission = auth_models.Permission.objects.get(
            codename="add_everyonepermission", content_type=public_ct
        )
        self.user.user_permissions.add(public_permission)
        # have one permission before post
        self.assertEqual(self._length_of_permissions(), 1)
        add_everyone = {"type": models.StudyPermission.READ, "public": None}
        payload = json.dumps([add_everyone])
        response = self.client.post(self.url, data={"data": payload})
        # correct response NO CONTENT, permission count updated
        self.assertEqual(response.status_code, codes.no_content)
        self.assertEqual(self._length_of_permissions(), 2)

    def test_post_permissions_public_with_admin(self):
        # make user admin
        self.user.is_superuser = True
        self.user.save(update_fields=["is_superuser"])
        # have empty permission before post
        self.assertEqual(self._length_of_permissions(), 0)
        add_everyone = {"type": models.StudyPermission.READ, "public": None}
        payload = json.dumps([add_everyone])
        response = self.client.post(self.url, data={"data": payload})
        # correct response NO CONTENT, permission count updated to one
        self.assertEqual(response.status_code, codes.no_content)
        self.assertEqual(self._length_of_permissions(), 1)
