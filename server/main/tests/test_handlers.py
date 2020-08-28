"""Tests for signal handlers."""
from unittest.mock import patch

import pytest
from django.test import override_settings
from faker import Faker

from .. import models
from ..signals import core, sbml
from . import factory

fake = Faker()


def test_set_file_info_without_file():
    sentinel = object()
    a = models.Attachment(
        file=None, filename=sentinel, file_size=sentinel, mime_type=sentinel
    )
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


def test_study_contact_extra_with_user():
    contact = factory.UserFactory.build()
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


@override_settings(ICE_URL=None)
def test_study_name_change_check_without_ice():
    study = factory.StudyFactory.build()
    core.study_name_change_check(models.Study, study, raw=False, using="default")
    # test will raise an error if *any* database access happens above
    # this test is asserting that no database access occurs


@override_settings(ICE_URL=None)
def test_study_update_ice_without_ice():
    study = factory.StudyFactory.build()
    core.study_update_ice(
        models.Study, study, created=False, raw=False, using="default"
    )
    # test will raise an error if *any* database access happens above
    # this test is asserting that no database access occurs


def test_study_update_ice_without_changes():
    study = factory.StudyFactory.build()
    core.study_update_ice(
        models.Study, study, created=False, raw=False, using="default"
    )
    # test will raise an error if *any* database access happens above
    # this test is asserting that no database access occurs


@pytest.mark.django_db
def test_study_update_ice_with_changes():
    study = factory.StudyFactory.build()
    study._pre_save_name = fake.catch_phrase()
    # patching: from django.db import connection
    with patch("main.signals.core.connection") as connection:
        core.study_update_ice(
            models.Study, study, created=False, raw=False, using="default"
        )
        connection.on_commit.assert_called_once()


@override_settings(ICE_URL=None)
def test_line_removing_without_ice():
    line = factory.LineFactory.build()
    core.line_removing(models.Line, line)
    # test will raise an error if *any* database access happens above
    # this test is asserting that no database access occurs


@override_settings(ICE_URL=None)
def test_line_removed_without_ice():
    line = factory.LineFactory.build()
    core.line_removed(models.Line, line)
    # test will raise an error if *any* database access happens above
    # this test is asserting that no database access occurs


def test_line_removed_without_changes():
    line = factory.LineFactory.build()
    core.line_removed(models.Line, line)
    # test will raise an error if *any* database access happens above
    # this test is asserting that no database access occurs


def test_line_strain_changed_reverse():
    line = factory.LineFactory.build()
    core.line_strain_changed(
        sender=models.Line,
        instance=line,
        action="post_add",
        reverse=True,
        model=models.Strain,
        pk_set=tuple(),
        using="default",
    )
    # test will raise an error if *any* database access happens above
    # this test is asserting that no database access occurs


@override_settings(ICE_URL=None)
def test_line_strain_changed_without_ice():
    line = factory.LineFactory.build()
    core.line_strain_changed(
        sender=models.Line,
        instance=line,
        action="post_add",
        reverse=False,
        model=models.Strain,
        pk_set=tuple(),
        using="default",
    )
    # test will raise an error if *any* database access happens above
    # this test is asserting that no database access occurs


def test_submit_ice_unlink():
    study_id = fake.pyint()
    to_remove = fake.pylist(value_types=(int,))
    with patch("main.signals.core.tasks.unlink_ice_entry_from_study") as task:
        core.submit_ice_unlink(study_id, to_remove)
        assert task.delay.call_count == len(to_remove)


def test_submit_ice_link():
    study_id = fake.pyint()
    to_link = fake.pylist(value_types=(int,))
    with patch("main.signals.core.tasks.link_ice_entry_to_study") as task:
        core.submit_ice_link(study_id, to_link)
        assert task.delay.call_count == len(to_link)


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
