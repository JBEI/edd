"""Tests for signal handlers."""

from unittest.mock import patch

import pytest
from faker import Faker

from edd.profile.factory import UserFactory

from .. import models
from ..signals import core, sbml
from . import factory

fake = Faker()


def test_set_file_info_without_file():
    sentinel = object()
    a = models.Attachment(file=None, filename=sentinel, file_size=sentinel, mime_type=sentinel)
    core.set_file_info(models.Attachment, a, raw=False, using="default")
    # verify that filename, file_size, mime_type are unchanged
    assert a.filename is sentinel
    assert a.file_size is sentinel
    assert a.mime_type is sentinel


def test_set_file_info_keep_explicit_values():
    sentinel = object()
    fake_upload = factory.create_fake_upload()
    a = models.Attachment(
        file=fake_upload, filename=sentinel, file_size=sentinel, mime_type=sentinel
    )
    core.set_file_info(models.Attachment, a, raw=False, using="default")
    # verify that filename, file_size, mime_type are unchanged
    assert a.filename is sentinel
    assert a.file_size is sentinel
    assert a.mime_type is sentinel


def test_set_file_info_keep_mime():
    sentinel = object()
    fake_upload = factory.create_fake_upload()
    a = models.Attachment(file=fake_upload, mime_type=sentinel)
    core.set_file_info(models.Attachment, a, raw=False, using="default")
    # verify that filename and file_size are updated, mime_type is unchanged
    assert a.filename == fake_upload.name
    assert a.file_size == fake_upload.size
    assert a.mime_type is sentinel


def test_set_file_info_set_mime():
    fake_upload = factory.create_fake_upload()
    a = models.Attachment(file=fake_upload)
    core.set_file_info(models.Attachment, a, raw=False, using="default")
    # verify that filename, file_size, and mime_type are updated
    assert a.filename == fake_upload.name
    assert a.file_size == fake_upload.size
    assert a.mime_type == fake_upload.content_type


def test_set_file_info_missing_mime():
    fake_upload = factory.create_fake_upload()
    # simulate a missing content_type on uploaded file
    delattr(fake_upload, "content_type")
    a = models.Attachment(file=fake_upload)
    core.set_file_info(models.Attachment, a, raw=False, using="default")
    # verify that filename, file_size, and mime_type are updated
    assert a.filename == fake_upload.name
    assert a.file_size == fake_upload.size
    assert a.mime_type == "application/octet-stream"


@pytest.mark.django_db
def test_study_contact_extra_with_user():
    contact = UserFactory()
    study = factory.StudyFactory.build(contact_extra=None, contact=contact)
    assert study.contact_extra is None
    core.study_contact_extra(models.Study, study, raw=False, using="default")
    # check extra field set to non-empty string
    assert isinstance(study.contact_extra, str)
    assert len(study.contact_extra) > 0


def test_study_contact_extra_without_user():
    study = factory.StudyFactory.build(contact_extra=None, contact=None)
    assert study.contact_extra is None
    core.study_contact_extra(models.Study, study, raw=False, using="default")
    assert study.contact_extra is None


def test_sbml_template_saved_raw():
    template = factory.SBMLTemplateFactory.build()
    with patch("main.signals.sbml.tasks.template_sync_species") as task:
        sbml.template_saved(
            sender=models.SBMLTemplate,
            instance=template,
            created=False,
            raw=True,
            using="default",
            update_fields=[],
        )
        assert task.delay.call_count == 0


def test_sbml_template_saved_file_unchanged():
    template = factory.SBMLTemplateFactory.build()
    with patch("main.signals.sbml.tasks.template_sync_species") as task:
        sbml.template_saved(
            sender=models.SBMLTemplate,
            instance=template,
            created=False,
            raw=False,
            using="default",
            update_fields=["template_name"],
        )
        assert task.delay.call_count == 0


def test_sbml_template_saved():
    template = factory.SBMLTemplateFactory.build()
    with patch("main.signals.sbml.tasks.template_sync_species") as task:
        sbml.template_saved(
            sender=models.SBMLTemplate,
            instance=template,
            created=True,
            raw=False,
            using="default",
            update_fields=None,
        )
        assert task.delay.call_count == 1
