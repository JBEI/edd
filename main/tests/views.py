# coding: utf-8
"""
Tests used to validate the tutorial screencast functionality.
"""

import json

from django.contrib.auth import models as auth_models
from django.contrib.contenttypes.models import ContentType
from django.http import Http404
from django.http.request import HttpRequest
from django.urls import reverse
from django.utils.encoding import force_text
from faker import Faker
from io import BytesIO
from requests import codes
from unittest.mock import patch

from edd import TestCase
from .. import models, views
from . import factory


faker = Faker()


class StudyViewTests(TestCase):
    """Tests for the behavior of the Study view(s)."""

    @classmethod
    def setUpTestData(cls):
        super().setUpTestData()
        cls.user = factory.UserFactory()
        cls.target_study = factory.StudyFactory()
        cls.target_kwargs = {"slug": cls.target_study.slug}
        cls.target_study.userpermission_set.update_or_create(
            permission_type=models.StudyPermission.WRITE, user=cls.user
        )

    def setUp(self):
        super().setUp()
        self.client.force_login(self.user)

    def test_empty_post(self):
        """An empty POST request should just act like a GET."""
        response = self.client.post(
            reverse("main:lines", kwargs=self.target_kwargs), data={}
        )
        # content the same as a GET request
        self.assertTemplateUsed(response, "main/study-lines.html")
        # status code will say request is bad
        self.assertEqual(response.status_code, codes.bad_request)

    def test_load_study(self):
        """An invalid slug should return a Not Found code."""
        # using edddata view as simple way to go through main.view.load_study function
        response = self.client.get(reverse("main:edddata", kwargs={"slug": "invalid"}))
        self.assertEqual(response.status_code, codes.not_found)
        response = self.client.get(reverse("main:edd-pk:edddata", kwargs={"pk": 12345}))
        self.assertEqual(response.status_code, codes.not_found)
        # no view method should be calling load_study without ID or slug, but test directly
        request = HttpRequest()
        request.user = self.user
        # attempting to load study without ID or slug will raise a 404
        with self.assertRaises(Http404):
            views.load_study(request)

    def test_create_study(self):
        """Test verifying that the create study views work."""
        # Verify response from the dedicated creation page
        response = self.client.get(reverse("main:create_study"))
        self.assertEqual(response.status_code, codes.ok)
        self.assertTemplateUsed(response, "main/create_study.html")
        # Verify creation after POST to dedicated creation page
        response = self.client.post(
            reverse("main:create_study"), data={"name": "Testing123"}, follow=True
        )
        self.assertEqual(response.status_code, codes.ok)
        created = models.Study.objects.filter(name="Testing123")
        self.assertEqual(created.count(), 1)
        self.assertRedirects(
            response, reverse("main:overview", kwargs={"slug": created.get().slug})
        )

    def test_index_view(self):
        """Test verifying the index page loads properly."""
        index_url = reverse("main:index")
        # GET loads the index view
        response = self.client.get(index_url)
        self.assertEqual(response.status_code, codes.ok)
        self.assertTemplateUsed(response, "main/index.html")
        # POST uses the create view methods
        response = self.client.post(index_url, data={"name": "Testing123"}, follow=True)
        self.assertEqual(response.status_code, codes.ok)
        created = models.Study.objects.filter(name="Testing123")
        self.assertEqual(created.count(), 1)
        self.assertRedirects(
            response, reverse("main:overview", kwargs={"slug": created.get().slug})
        )

    def test_overview(self):
        """Test basics of overview page."""
        response = self.client.get(reverse("main:overview", kwargs=self.target_kwargs))
        self.assertEqual(response.status_code, codes.ok)
        # create study with no permissions and an admin user
        hidden_study = factory.StudyFactory()
        admin_user = factory.UserFactory()
        admin_user.is_superuser = True
        admin_user.save()
        # Not Found for a study without permissions
        hidden_study_url = reverse("main:overview", kwargs={"slug": hidden_study.slug})
        response = self.client.get(hidden_study_url)
        self.assertEqual(response.status_code, codes.not_found)
        # admin user can see the same study
        self.client.force_login(admin_user)
        response = self.client.get(hidden_study_url)
        self.assertEqual(response.status_code, codes.ok)

    def test_overview_update(self):
        """Test actions on overview page."""
        new_user = factory.UserFactory()
        self.target_study.userpermission_set.update_or_create(
            permission_type=models.StudyPermission.READ, user=new_user
        )
        # edit study info as default test user
        target_url = reverse("main:overview", kwargs=self.target_kwargs)
        response = self.client.post(
            target_url,
            data={
                "action": "update",
                "study-name": "foo",
                "study-description": "bar",
                "study-contact_0": new_user.username,
                "study-contact_1": new_user.id,
            },
            follow=True,
        )
        self.assertEqual(response.status_code, codes.ok)
        target_study = models.Study.objects.get(slug=self.target_study.slug)
        self.assertEqual(target_study.name, "foo")
        self.assertEqual(target_study.description, "bar")
        self.assertEqual(target_study.contact, new_user)
        # verify that new_user without permissions cannot modify study
        self.client.force_login(new_user)
        response = self.client.post(
            target_url,
            data={
                "action": "update",
                "study-name": "foofoo",
                "study-description": "barbar",
                "study-contact_0": new_user.username,
                "study-contact_1": new_user.id,
            },
            follow=True,
        )
        self.assertContains(
            response, "You do not have permission", status_code=codes.forbidden
        )
        target_study = models.Study.objects.get(slug=self.target_study.slug)
        self.assertEqual(target_study.name, "foo")
        self.assertEqual(target_study.description, "bar")
        self.assertEqual(target_study.contact, new_user)

    def _attachment_upload(self, filename):
        with factory.load_test_file(filename) as fp:
            upload = BytesIO(fp.read())
        upload.name = filename
        upload.content_type = (
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        )
        response = self.client.post(
            reverse("main:overview", kwargs=self.target_kwargs),
            data={"action": "attach", "file": upload, "description": "foobar"},
            follow=True,
        )
        return response

    def test_overview_attach(self):
        # adding an attachment
        filename = "ImportData_FBA_HPLC.xlsx"
        response = self._attachment_upload(filename)
        self.assertContains(response, filename)
        self.assertRedirects(
            response, reverse("main:overview", kwargs=self.target_kwargs)
        )
        self.assertEqual(self.target_study.attachments.count(), 1)
        # handle validation errors adding attachment
        # views.py does `from .forms import CreateAttachmentForm`, so must mock that name
        with patch("main.views.study.edd_forms.CreateAttachmentForm") as MockForm:
            form = MockForm.return_value
            form.is_valid.return_value = False
            response = self._attachment_upload(filename)
            # invalid form means request status is bad
            self.assertEqual(response.status_code, codes.bad_request)
            # unchanged number of attachments
            self.assertEqual(self.target_study.attachments.count(), 1)
        # viewing an attachment
        attachment = self.target_study.attachments.all()[0]
        attachment_kwargs = {
            "slug": self.target_study.slug,
            "file_id": attachment.id,
            "file_name": attachment.filename,
        }
        attachment_url = reverse("main:attachment", kwargs=attachment_kwargs)
        response = self.client.get(attachment_url)
        self.assertEqual(response.status_code, codes.ok)
        # delete an attachment confirmation page
        response = self.client.post(attachment_url)
        self.assertTemplateUsed(response, "main/confirm_delete.html")
        self.assertContains(response, attachment.filename)
        self.assertEqual(self.target_study.attachments.count(), 1)
        # delete execute
        response = self.client.post(attachment_url, data={"action": "delete"})
        self.assertEqual(self.target_study.attachments.count(), 0)

    def test_overview_comment(self):
        target_url = reverse("main:overview", kwargs=self.target_kwargs)
        # adding a comment
        body = faker.sentence()
        response = self.client.post(
            target_url, data={"action": "comment", "body": body}, follow=True
        )
        self.assertContains(response, body)
        self.assertEqual(self.target_study.comments.count(), 1)
        # handle validation errors adding comment
        # views.py does `from .forms import CreateCommentForm`, so must mock that name
        with patch("main.views.study.edd_forms.CreateCommentForm") as MockForm:
            form = MockForm.return_value
            form.is_valid.return_value = False
            body = faker.sentence()
            response = self.client.post(
                target_url, data={"action": "comment", "body": body}, follow=True
            )
            # response does not have invalid comment, response indicates bad request
            self.assertNotContains(response, body, status_code=codes.bad_request)
            # unchanged count of comments
            self.assertEqual(self.target_study.comments.count(), 1)

    def test_overview_delete(self):
        target_url = reverse("main:overview", kwargs=self.target_kwargs)
        # show of confirmation page
        response = self.client.post(
            target_url, data={"action": "study_delete"}, follow=True
        )
        self.assertEqual(response.status_code, codes.ok)
        self.assertTemplateUsed(response, "main/confirm_delete.html")
        self.assertEqual(
            models.Study.objects.filter(slug=self.target_study.slug).count(), 1
        )
        # delete actually happens
        response = self.client.post(
            target_url, data={"action": "delete_confirm"}, follow=True
        )
        self.assertEqual(response.status_code, codes.ok)
        self.assertEqual(
            models.Study.objects.filter(slug=self.target_study.slug).count(), 0
        )

    def test_overview_delete_readonly(self):
        # prevent deletion with user not having write permission
        readonly_user = factory.UserFactory()
        self.client.force_login(readonly_user)
        self.target_study.userpermission_set.update_or_create(
            permission_type=models.StudyPermission.READ, user=readonly_user
        )
        response = self.client.post(
            reverse("main:overview", kwargs=self.target_kwargs),
            data={"action": "study_delete"},
            follow=True,
        )
        self.assertContains(
            response, "You do not have permission", status_code=codes.forbidden
        )

    def test_overview_restore(self):
        target_url = reverse("main:overview", kwargs=self.target_kwargs)
        # add line/assay/measurement to study
        line = factory.LineFactory(study=self.target_study)
        assay = factory.AssayFactory(line=line)
        factory.MeasurementFactory(assay=assay)
        # send delete confirmation
        response = self.client.post(
            target_url, data={"action": "delete_confirm"}, follow=True
        )
        self.assertEqual(response.status_code, codes.ok)
        self.assertEqual(
            models.Study.objects.filter(
                slug=self.target_study.slug, active=False
            ).count(),
            1,
        )
        # send restore
        response = self.client.post(
            target_url, data={"action": "study_restore"}, follow=True
        )
        self.assertEqual(response.status_code, codes.ok)
        self.assertEqual(
            models.Study.objects.filter(
                slug=self.target_study.slug, active=True
            ).count(),
            1,
        )

    def test_overview_update_failed(self):
        # views.py does `from .forms import CreateStudyForm`, so must mock that name
        with patch("main.views.study.edd_forms.CreateStudyForm") as MockForm:
            form = MockForm.return_value
            form.is_valid.return_value = False
            # should be no redirect
            response = self.client.post(
                reverse("main:overview", kwargs=self.target_kwargs),
                data={"action": "update"},
            )
            # verify that a failed validation renders to overview page
            self.assertTemplateUsed(response, "main/study-overview.html")
            self.assertEqual(response.status_code, codes.bad_request)

    def test_lines_clone(self):
        target_url = reverse("main:lines", kwargs=self.target_kwargs)
        line = factory.LineFactory(study=self.target_study)
        # validate requesting to clone a line works
        self.assertEqual(self.target_study.line_set.count(), 1)
        response = self.client.post(
            target_url, data={"action": "clone", "lineId": [line.id]}, follow=True
        )
        self.assertEqual(response.status_code, codes.ok)
        self.assertEqual(self.target_study.line_set.count(), 2)
        # requesting to clone an invalid line ID is bad request
        response = self.client.post(
            target_url, data={"action": "clone", "lineId": [12345]}, follow=True
        )
        self.assertTemplateUsed(response, "main/study-lines.html")
        self.assertContains(
            response,
            "Failed to validate selection for clone.",
            status_code=codes.bad_request,
        )
        self.assertEqual(self.target_study.line_set.count(), 2)

    def test_lines_delete_restore(self):
        target_url = reverse("main:lines", kwargs=self.target_kwargs)
        line = factory.LineFactory(study=self.target_study)
        # validate that requesting to delete a line directs to confirmation
        self.assertEqual(self.target_study.line_set.count(), 1)
        response = self.client.post(
            target_url, data={"action": "disable", "lineId": [line.id]}, follow=True
        )
        self.assertTemplateUsed(response, "main/confirm_delete.html")
        self.assertEqual(response.status_code, codes.ok)
        self.assertEqual(self.target_study.line_set.count(), 1)
        # validate that confirming delete line works
        response = self.client.post(
            target_url,
            data={"action": "disable_confirm", "lineId": [line.id]},
            follow=True,
        )
        self.assertEqual(response.status_code, codes.ok)
        self.assertEqual(self.target_study.line_set.count(), 0)
        # validate that requesting to delete a line with measurements disables the line
        line = factory.LineFactory(study=self.target_study)
        assay = factory.AssayFactory(line=line)
        factory.MeasurementFactory(assay=assay)
        self.assertEqual(self.target_study.line_set.count(), 1)
        response = self.client.post(
            target_url,
            data={"action": "disable_confirm", "lineId": [line.id]},
            follow=True,
        )
        self.assertEqual(response.status_code, codes.ok)
        self.assertEqual(self.target_study.line_set.count(), 1)
        self.assertEqual(self.target_study.line_set.filter(active=True).count(), 0)
        # validate restoring the line
        response = self.client.post(
            target_url, data={"action": "enable", "lineId": [line.id]}, follow=True
        )
        self.assertEqual(response.status_code, codes.ok)
        self.assertEqual(self.target_study.line_set.count(), 1)
        self.assertEqual(self.target_study.line_set.filter(active=True).count(), 1)
        # if selection does not validate, is a bad request
        with patch("main.views.study.export_forms.ExportSelectionForm") as MockForm:
            form = MockForm.return_value
            form.is_valid.return_value = False
            response = self.client.post(
                target_url, data={"action": "disable_confirm"}, follow=True
            )
            self.assertEqual(response.status_code, codes.bad_request)
            self.assertEqual(self.target_study.line_set.count(), 1)

    def test_lines_assay_add(self):
        target_url = reverse("main:lines", kwargs=self.target_kwargs)
        # add line to study
        line = factory.LineFactory(study=self.target_study)
        # empty form is a bad request
        response = self.client.post(target_url, data={"action": "assay"}, follow=True)
        self.assertEqual(response.status_code, codes.bad_request)
        self.assertTemplateUsed(response, "main/study-lines.html")
        # single line add assay w/ any validation errors is a bad request
        with patch("main.views.study.edd_forms.AssayForm") as MockForm:
            form = MockForm.return_value
            form.is_valid.return_value = False
            response = self.client.post(
                target_url, data={"action": "assay", "lineId": line.pk}, follow=True
            )
            form.save.assert_not_called()
            self.assertEqual(response.status_code, codes.bad_request)
            self.assertTemplateUsed(response, "main/study-lines.html")
        # single line add assay works with a valid form
        with patch("main.views.study.edd_forms.AssayForm") as MockForm:
            form = MockForm.return_value
            form.is_valid.return_value = True
            response = self.client.post(
                target_url, data={"action": "assay", "lineId": line.pk}, follow=True
            )
            form.save.assert_called_once()
            self.assertEqual(response.status_code, codes.ok)
            self.assertTemplateUsed(response, "main/study-lines.html")

    def test_lines_assay_invalid_id(self):
        # editing assay with invalid assay ID is a bad request
        response = self.client.post(
            reverse("main:lines", kwargs=self.target_kwargs),
            data={"action": "assay", "assay-assay_id": 12345},
            follow=True,
        )
        self.assertEqual(response.status_code, codes.bad_request)
        self.assertTemplateUsed(response, "main/study-lines.html")

    def test_lines_add_line(self):
        target_url = reverse("main:lines", kwargs=self.target_kwargs)
        name = faker.catch_phrase()
        response = self.client.post(
            target_url, data={"action": "line", "line-name": name}, follow=True
        )
        self.assertContains(response, f"Added Line &#39;{name}&#39;")
        self.assertTrue(self.target_study.line_set.filter(name=name).exists())
        # if form does not validate, bad request
        with patch("main.views.study.edd_forms.LineForm") as MockForm:
            form = MockForm.return_value
            form.is_valid.return_value = False
            response = self.client.post(
                target_url, data={"action": "line", "line-name": name}, follow=True
            )
            self.assertEqual(response.status_code, codes.bad_request)

    def test_lines_edit_line(self):
        target_url = reverse("main:lines", kwargs=self.target_kwargs)
        line = factory.LineFactory(study=self.target_study)
        # basic line edit works
        name = faker.catch_phrase()
        post_data = {
            "action": "line",
            "line-name": name,
            "line-_bulk_name": "",
            "lineId": f"{line.pk}",
        }
        response = self.client.post(target_url, data=post_data, follow=True)
        self.assertContains(response, f"Saved 1 of 1 Lines")
        self.assertTrue(self.target_study.line_set.filter(name=name).exists())
        # if passed an invalid line ID, bad request
        bad_post = {}
        bad_post.update(post_data, lineId=12345)
        response = self.client.post(target_url, data=bad_post, follow=True)
        self.assertContains(
            response, "Failed to load line for editing", status_code=codes.bad_request
        )
        # if form does not validate, bad request
        with patch("main.views.study.edd_forms.LineForm") as MockForm:
            form = MockForm.return_value
            form.is_valid.return_value = False
            response = self.client.post(target_url, data=post_data, follow=True)
            self.assertEqual(response.status_code, codes.bad_request)

    def test_lines_edit_bulk(self):
        target_url = reverse("main:lines", kwargs=self.target_kwargs)
        line1 = factory.LineFactory(study=self.target_study)
        line2 = factory.LineFactory(study=self.target_study)
        # basic bulk edit works
        name = faker.catch_phrase()
        response = self.client.post(
            target_url,
            data={
                "action": "line",
                "line-description": name,
                "line-_bulk_description": "",
                "lineId": [line1.pk, line2.pk],
            },
            follow=True,
        )
        self.assertContains(response, "Saved 2 of 2 Lines")
        self.assertEqual(self.target_study.line_set.filter(description=name).count(), 2)
        # simulate errors in bulk edit form
        with patch("main.views.study.edd_forms.LineForm") as MockForm:
            form = MockForm.return_value
            form.is_valid.return_value = False
            form.errors.values.return_value = ["fake error"]
            response = self.client.post(
                target_url,
                data={
                    "action": "line",
                    "line-description": name,
                    "line-_bulk_description": "",
                    "lineId": [line1.pk, line2.pk],
                },
                follow=True,
            )
            self.assertContains(
                response, "Saved 0 of 2 Lines", status_code=codes.bad_request
            )
            self.assertContains(response, "fake error", status_code=codes.bad_request)

    def test_lines_export(self):
        target_url = reverse("main:lines", kwargs=self.target_kwargs)
        line = factory.LineFactory(study=self.target_study)
        # csv
        response = self.client.post(
            target_url,
            data={"action": "export", "export": "csv", "lineId": line.pk},
            follow=True,
        )
        self.assertTemplateUsed(response, "main/export.html")
        # sbml
        response = self.client.post(
            target_url,
            data={"action": "export", "export": "sbml", "lineId": line.pk},
            follow=True,
        )
        self.assertTemplateUsed(response, "main/sbml_export.html")
        # worklist
        response = self.client.post(
            target_url,
            data={"action": "export", "export": "worklist", "lineId": line.pk},
            follow=True,
        )
        self.assertTemplateUsed(response, "main/worklist.html")
        # new study
        response = self.client.post(
            target_url,
            data={"action": "export", "export": "study", "lineId": line.pk},
            follow=True,
        )
        self.assertTemplateUsed(response, "main/create_study.html")

    def test_line_combo(self):
        readonly_user = factory.UserFactory()
        self.target_study.userpermission_set.update_or_create(
            permission_type=models.StudyPermission.READ, user=readonly_user
        )
        url = reverse("main:combos", kwargs=self.target_kwargs)
        response = self.client.get(url)
        self.assertEqual(response.status_code, codes.ok)
        self.assertTemplateUsed(response, "main/study-lines-add-combos.html")
        self.client.force_login(readonly_user)
        response = self.client.get(url)
        self.assertEqual(response.status_code, codes.forbidden)
        self.assertTemplateNotUsed(response, "main/study-lines-add-combos.html")

    def test_detail_get(self):
        # when study has no lines, get a redirect to the overview page
        response = self.client.get(reverse("main:detail", kwargs=self.target_kwargs))
        self.assertRedirects(
            response, reverse("main:overview", kwargs=self.target_kwargs)
        )
        # when there are lines, but no measurements, redirect to the lines page
        line = factory.LineFactory(study=self.target_study)
        response = self.client.get(reverse("main:detail", kwargs=self.target_kwargs))
        self.assertRedirects(response, reverse("main:lines", kwargs=self.target_kwargs))
        # only when there are measurements, display the data details page
        assay = factory.AssayFactory(line=line)
        factory.MeasurementFactory(assay=assay)
        response = self.client.get(reverse("main:detail", kwargs=self.target_kwargs))
        self.assertTemplateUsed(response, "main/study-data.html")
        self.assertEqual(response.status_code, codes.ok)

    def test_detail_assay_delete(self):
        target_url = reverse("main:detail", kwargs=self.target_kwargs)
        line = factory.LineFactory(study=self.target_study)
        assay = factory.AssayFactory(line=line)
        # requesting delete redirects to confirmation
        response = self.client.post(
            target_url,
            data={"action": "disable_assay", "assayId": assay.pk},
            follow=True,
        )
        self.assertTemplateUsed(response, "main/confirm_delete.html")
        self.assertContains(response, f"the Assay &quot;{assay.name}&quot;")
        self.assertEqual(
            models.Assay.objects.filter(study=self.target_study).count(), 1
        )
        # test proper error when using an invalid ID
        response = self.client.post(
            target_url,
            data={"action": "disable_assay_confirm", "assayId": 12345},
            follow=True,
        )
        self.assertTemplateUsed(response, "main/study-data.html")
        self.assertContains(
            response, "Nothing selected to delete.", status_code=codes.bad_request
        )
        self.assertEqual(
            models.Assay.objects.filter(study=self.target_study).count(), 1
        )
        # test confirming delete works
        response = self.client.post(
            target_url,
            data={"action": "disable_assay_confirm", "assayId": assay.pk},
            follow=True,
        )
        self.assertTemplateUsed(response, "main/study-data.html")
        self.assertContains(response, f"Deleted 1 Assays")
        self.assertEqual(
            models.Assay.objects.filter(study=self.target_study, active=True).count(), 0
        )
        self.assertEqual(
            models.Assay.objects.filter(study=self.target_study, active=False).count(),
            1,
        )

    def test_detail_assay_edit(self):
        target_url = reverse("main:detail", kwargs=self.target_kwargs)
        line = factory.LineFactory(study=self.target_study)
        protocol = factory.ProtocolFactory()
        assay = factory.AssayFactory(line=line)
        # basic assay edit works
        name = faker.catch_phrase()
        post_data = {
            "action": "assay",
            "assay-name": name,
            "assay-_bulk_name": "",
            "assay-protocol": protocol.pk,
            "assay-_bulk_protocol": "",
            "assayId": [assay.pk],
        }
        response = self.client.post(target_url, data=post_data, follow=True)
        self.assertContains(response, f"Saved 1 of 1 Assays")
        self.assertTrue(
            models.Assay.objects.filter(
                study_id=self.target_study.pk, name=name, protocol_id=protocol.pk
            ).exists()
        )
        # if passed an invalid assay ID, bad request
        bad_post = {}
        bad_post.update(post_data, assayId=[12345])
        response = self.client.post(target_url, data=bad_post, follow=True)
        self.assertContains(
            response,
            "Must select at least one Assay to edit.",
            status_code=codes.bad_request,
        )
        # if form does not validate, bad request
        with patch("main.views.study.edd_forms.AssayForm") as MockForm:
            form = MockForm.return_value
            form.is_valid.return_value = False
            form.errors.values.return_value = ["Fake error"]
            response = self.client.post(target_url, data=post_data, follow=True)
            self.assertContains(response, "Fake error", status_code=codes.bad_request)

    def test_detail_assay_export(self):
        line = factory.LineFactory(study=self.target_study)
        assay = factory.AssayFactory(line=line)
        response = self.client.post(
            reverse("main:detail", kwargs=self.target_kwargs),
            data={"action": "export", "assayId": [assay.pk]},
            follow=True,
        )
        self.assertTemplateUsed(response, "main/export.html")

    def test_detail_measurement_add(self):
        target_url = reverse("main:detail", kwargs=self.target_kwargs)
        line = factory.LineFactory(study=self.target_study)
        assay = factory.AssayFactory(line=line)
        # empty form is a bad request
        response = self.client.post(
            target_url, data={"action": "measurement"}, follow=True
        )
        self.assertEqual(response.status_code, codes.bad_request)
        self.assertTemplateUsed(response, "main/study-data.html")
        # single assay add measurement w/ any validation errors is a bad request
        with patch("main.views.study.edd_forms.MeasurementForm") as MockForm:
            form = MockForm.return_value
            form.is_valid.return_value = False
            response = self.client.post(
                target_url,
                data={"action": "measurement", "assayId": assay.pk},
                follow=True,
            )
            form.save.assert_not_called()
            self.assertEqual(response.status_code, codes.bad_request)
            self.assertTemplateUsed(response, "main/study-data.html")
        # single assay add measurement works with a valid form
        with patch("main.views.study.edd_forms.MeasurementForm") as MockForm:
            form = MockForm.return_value
            form.is_valid.return_value = True
            response = self.client.post(
                target_url,
                data={"action": "measurement", "assayId": assay.pk},
                follow=True,
            )
            form.save.assert_called_once()
            self.assertEqual(response.status_code, codes.ok)
            self.assertTemplateUsed(response, "main/study-data.html")

    def test_detail_measurement_delete(self):
        target_url = reverse("main:detail", kwargs=self.target_kwargs)
        line = factory.LineFactory(study=self.target_study)
        assay = factory.AssayFactory(line=line)
        measurement = factory.MeasurementFactory(assay=assay)
        # requesting delete redirects to confirmation
        response = self.client.post(
            target_url,
            data={"action": "disable_assay", "measurementId": measurement.pk},
            follow=True,
        )
        self.assertEqual(response.status_code, codes.ok)
        self.assertTemplateUsed(response, "main/confirm_delete.html")
        self.assertEqual(
            models.Measurement.objects.filter(study=self.target_study).count(), 1
        )
        # test confirming delete works
        response = self.client.post(
            target_url,
            data={"action": "disable_assay_confirm", "measurementId": measurement.pk},
            follow=True,
        )
        self.assertTemplateUsed(response, "main/study-data.html")
        self.assertContains(response, f"Deleted 0 Assays and 1 Measurements.")
        self.assertEqual(
            models.Measurement.objects.filter(
                study=self.target_study, active=True
            ).count(),
            0,
        )
        self.assertEqual(
            models.Measurement.objects.filter(
                study=self.target_study, active=False
            ).count(),
            1,
        )

    def test_detail_measurement_edit(self):
        target_url = reverse("main:detail", kwargs=self.target_kwargs)
        line = factory.LineFactory(study=self.target_study)
        assay = factory.AssayFactory(line=line)
        measurement = factory.MeasurementFactory(assay=assay)
        value = factory.ValueFactory(x=[12], y=[34], measurement=measurement)
        # measurement edit uses edit_measurement.html
        response = self.client.post(
            target_url,
            data={"action": "measurement_edit", "measurementId": measurement.pk},
            follow=True,
        )
        self.assertEqual(response.status_code, codes.ok)
        self.assertTemplateUsed(response, "main/edit_measurement.html")
        # edit with invalid ID returns error
        response = self.client.post(
            target_url,
            data={"action": "measurement_edit", "measurementId": 12345},
            follow=True,
        )
        self.assertTemplateUsed(response, "main/study-data.html")
        self.assertContains(
            response, "Nothing selected for edit.", status_code=codes.bad_request
        )
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
        response = self.client.post(target_url, data=edit_data, follow=True)
        self.assertRedirects(response, target_url)
        saved_value = models.MeasurementValue.objects.get(id=value.pk)
        self.assertEqual(saved_value.x, [56])
        self.assertEqual(saved_value.y, [78])


class AjaxPermissionViewTests(TestCase):
    """
    Tests for the behavior of AJAX views assisting front-end display of
    Study permissions.
    """

    @classmethod
    def setUpTestData(cls):
        super().setUpTestData()
        cls.user = factory.UserFactory()
        cls.target_study = factory.StudyFactory()
        cls.target_kwargs = {"slug": cls.target_study.slug}

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
        target_url = reverse("main:permissions", kwargs=self.target_kwargs)
        # no permissions set
        response = self.client.get(target_url)
        # response will be NOT FOUND
        self.assertEqual(response.status_code, codes.not_found)

    def test_get_permissions_with_read(self):
        target_url = reverse("main:permissions", kwargs=self.target_kwargs)
        self._set_permission(models.StudyPermission.READ)
        response = self.client.get(target_url)
        # response has username listed in permissions (implicit status OK)
        self.assertContains(response, self.user.username)

    def test_get_permissions_with_admin(self):
        target_url = reverse("main:permissions", kwargs=self.target_kwargs)
        # make user admin
        self.user.is_superuser = True
        self.user.save(update_fields=["is_superuser"])
        response = self.client.get(target_url)
        # response is empty array
        self.assertEqual(response.status_code, codes.ok)
        self.assertJSONEqual(force_text(response.content), [])

    def test_head_permissions(self):
        target_url = reverse("main:permissions", kwargs=self.target_kwargs)
        self._set_permission(models.StudyPermission.READ)
        response = self.client.head(target_url)
        # HEAD requests should always be OK with zero length
        self.assertEqual(response.status_code, codes.ok)
        self.assertEqual(len(response.content), 0)

    def test_delete_permissions_no_read(self):
        target_url = reverse("main:permissions", kwargs=self.target_kwargs)
        # no permissions set
        response = self.client.delete(target_url)
        # response will be NOT FOUND
        self.assertEqual(response.status_code, codes.not_found)

    def test_delete_permissions_with_read(self):
        target_url = reverse("main:permissions", kwargs=self.target_kwargs)
        # add a READ permission
        self._set_permission(models.StudyPermission.READ)
        response = self.client.delete(target_url)
        # response will be FORBIDDEN (no write access)
        self.assertEqual(response.status_code, codes.forbidden)

    def test_delete_permissions_with_write(self):
        target_url = reverse("main:permissions", kwargs=self.target_kwargs)
        self._set_permission(models.StudyPermission.WRITE)
        # have one permission before deletion
        self.assertEqual(self._length_of_permissions(), 1)
        # do deletion
        response = self.client.delete(target_url)
        # correct response of NO CONTENT, and permissions length zero
        self.assertEqual(response.status_code, codes.no_content)
        self.assertEqual(self._length_of_permissions(), 0)

    def test_post_permissions_no_read(self):
        target_url = reverse("main:permissions", kwargs=self.target_kwargs)
        # no permissions set
        response = self.client.post(target_url, data={})
        # response will be NOT FOUND
        self.assertEqual(response.status_code, codes.not_found)

    def test_post_permissions_with_read(self):
        target_url = reverse("main:permissions", kwargs=self.target_kwargs)
        # add a READ permission
        self._set_permission(models.StudyPermission.READ)
        response = self.client.post(target_url, data={})
        # response will be FORBIDDEN (no write access)
        self.assertEqual(response.status_code, codes.forbidden)

    def test_post_permissions_empty(self):
        target_url = reverse("main:permissions", kwargs=self.target_kwargs)
        self._set_permission(models.StudyPermission.WRITE)
        # have one permission before empty post
        self.assertEqual(self._length_of_permissions(), 1)
        response = self.client.post(target_url, data={})
        # correct response, no change in permission count
        self.assertEqual(response.status_code, codes.no_content)
        self.assertEqual(self._length_of_permissions(), 1)

    def test_post_permissions_adding(self):
        target_url = reverse("main:permissions", kwargs=self.target_kwargs)
        self._set_permission(models.StudyPermission.WRITE)
        # have one permission before post
        self.assertEqual(self._length_of_permissions(), 1)
        # create a bunch of things to add permissions for
        other_user = factory.UserFactory()
        some_group = factory.GroupFactory()
        add_other_user = {
            "type": models.StudyPermission.WRITE, "user": {"id": other_user.id}
        }
        add_some_group = {
            "type": models.StudyPermission.WRITE, "group": {"id": some_group.id}
        }
        payload = json.dumps([add_other_user, add_some_group])
        response = self.client.post(target_url, data={"data": payload})
        # correct response NO CONTENT, permission count updated
        self.assertEqual(response.status_code, codes.no_content)
        self.assertEqual(self._length_of_permissions(), 3)

    def test_post_permissions_removing(self):
        target_url = reverse("main:permissions", kwargs=self.target_kwargs)
        self._set_permission(models.StudyPermission.WRITE)
        # create some permissions to delete
        other_user = factory.UserFactory()
        self._set_permission(models.StudyPermission.READ, user=other_user)
        delete_other_user = {
            "type": models.StudyPermission.NONE, "user": {"id": other_user.id}
        }
        # have two permissions before post
        self.assertEqual(self._length_of_permissions(), 2)
        payload = json.dumps([delete_other_user])
        response = self.client.post(target_url, data={"data": payload})
        # correct response NO CONTENT, permission count updated
        self.assertEqual(response.status_code, codes.no_content)
        self.assertEqual(self._length_of_permissions(), 1)

    def test_post_permissions_public_without_access(self):
        target_url = reverse("main:permissions", kwargs=self.target_kwargs)
        self._set_permission(models.StudyPermission.WRITE)
        # have one permission before post
        self.assertEqual(self._length_of_permissions(), 1)
        add_everyone = {"type": models.StudyPermission.READ, "public": None}
        payload = json.dumps([add_everyone])
        response = self.client.post(target_url, data={"data": payload})
        # without access to make public, FORBIDDEN response and no change in length
        self.assertEqual(response.status_code, codes.forbidden)
        self.assertEqual(self._length_of_permissions(), 1)

    def test_post_permissions_public_with_access(self):
        target_url = reverse("main:permissions", kwargs=self.target_kwargs)
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
        response = self.client.post(target_url, data={"data": payload})
        # correct response NO CONTENT, permission count updated
        self.assertEqual(response.status_code, codes.no_content)
        self.assertEqual(self._length_of_permissions(), 2)

    def test_post_permissions_public_with_admin(self):
        target_url = reverse("main:permissions", kwargs=self.target_kwargs)
        # make user admin
        self.user.is_superuser = True
        self.user.save(update_fields=["is_superuser"])
        # have empty permission before post
        self.assertEqual(self._length_of_permissions(), 0)
        add_everyone = {"type": models.StudyPermission.READ, "public": None}
        payload = json.dumps([add_everyone])
        response = self.client.post(target_url, data={"data": payload})
        # correct response NO CONTENT, permission count updated to one
        self.assertEqual(response.status_code, codes.no_content)
        self.assertEqual(self._length_of_permissions(), 1)
