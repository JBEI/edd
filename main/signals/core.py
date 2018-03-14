# -*- coding: utf-8 -*-

import functools
import logging

from django.conf import settings
from django.db import connection, transaction
from django.db.models import Q
from django.db.models.signals import m2m_changed, post_delete, post_save, pre_save, pre_delete
from uuid import uuid4

from . import study_modified
from .dispatcher import receiver
from .. import models as edd_models
from ..tasks import link_ice_entry_to_study, unlink_ice_entry_from_study


logger = logging.getLogger(__name__)


# ----- Attachment signal handlers -----

@receiver(pre_save, sender=edd_models.Attachment)
def set_file_info(sender, instance, raw, using, **kwargs):
    if not raw and instance.file is not None:
        instance.filename = instance.file.name
        instance.file_size = instance.file.size
        # set the mime_type if it is not already set
        if not instance.mime_type:
            # if there is a content_type from the uploaded file, use that
            # instance.file is the db field; instance.file.file is the actual uploaded file
            if hasattr(instance.file.file, 'content_type'):
                instance.mime_type = instance.file.file.content_type
            else:
                # if there is no upload, give up and guess that it's a bunch of bytes
                instance.mime_type = 'application/octet-stream'


# ----- common signal handlers -----

has_uuid = [
    edd_models.Study,
    edd_models.Line,
    edd_models.CarbonSource,
    edd_models.Strain,
    edd_models.Protocol,
    edd_models.Assay,
]
has_update = has_uuid + [
    edd_models.Attachment,
    edd_models.Comment,
    edd_models.Measurement,
    edd_models.MeasurementValue,
]


@receiver(pre_save, sender=has_uuid)
def ensure_uuid(sender, instance, raw, using, **kwargs):
    if not raw and instance.uuid is None:
        instance.uuid = uuid4()


@receiver(pre_save, sender=has_update)
def ensure_updates(sender, instance, raw, using, **kwargs):
    if not raw:
        update = edd_models.Update.load_update()
        if hasattr(instance, 'created_id') and instance.created_id is None:
            instance.created = update
        instance.updated = update
        # for some reason, Measurement has a distinct update_ref field?
        if sender is edd_models.Measurement:
            instance.update_ref = update


@receiver(post_save, sender=has_uuid)
def log_update(sender, instance, created, raw, using, **kwargs):
    if not raw:
        instance.updates.add(instance.updated)


# ----- Study signal handlers -----

@receiver(pre_save, sender=edd_models.Study)
def study_slug(sender, instance, raw, using, **kwargs):
    # sanity check, make sure ensure_uuid is called first
    ensure_uuid(sender, instance, raw, using, **kwargs)
    if not raw and instance.slug is None:
        with transaction.atomic(savepoint=False):
            instance.slug = instance._build_slug(instance.name, instance.uuid.hex)


@receiver(pre_save, sender=edd_models.Study)
def study_name_change_check(sender, instance, raw, using, **kwargs):
    """
    Runs prior to Study saving, and looks up the Study name to determine if ICE needs an update.
    """
    if check_ice_cannot_proceed(raw):
        return
    # study exists: cache its name as stored in the database so we can detect renaming
    if instance.pk:
        with transaction.atomic(savepoint=False):
            from_db = edd_models.Study.objects.filter(pk=instance.pk)
            instance.pre_save_name = from_db.values('name')[0]['name']


@receiver(pre_save, sender=edd_models.Study)
def study_contact_extra(sender, instance, raw, using, **kwargs):
    if instance.contact_extra is None and instance.contact:
        instance.contact_extra = instance.contact.get_full_name()


@receiver(post_save, sender=edd_models.Study)
def study_update_ice(sender, instance, created, raw, using, **kwargs):
    """
    Checks whether the study has been renamed by comparing its current name with the one set in
    study_name_change_check. If it has, and if the study is associated with any ICE strains,
    updates the corresponding ICE entry(ies) to label links to this study with its new name.
    """
    if check_ice_cannot_proceed(raw):
        return
    if hasattr(instance, 'pre_save_name') and instance.name == instance.pre_save_name:
        return
    eligible = Q(line__study_id=instance.pk, registry_url__isnull=False, registry_id__isnull=False)
    with transaction.atomic(savepoint=False):
        strains = edd_models.Strain.objects.filter(eligible).distinct()
        strains_to_link = set(strains.values_list('id', flat=True))
    if strains_to_link:
        partial = functools.partial(submit_ice_link, instance, strains_to_link)
        connection.on_commit(partial)
        logger.info(
            "Save to study %d updating %d strains in ICE",
            instance.pk, len(strains_to_link)
        )


@receiver(post_save, sender=edd_models.Study)
def study_saved(sender, instance, created, raw, using, **kwargs):
    """
    Forwards a signal indicating a study was saved.
    """
    # raw save == database may be inconsistent; do not forward next signal
    if not raw:
        study_modified.send(sender=sender, study=instance, using=using)


# ----- Line signal handlers -----

@receiver(pre_delete, sender=edd_models.Line)
def line_removing(sender, instance, **kwargs):
    """
    Caches study <-> strain associations prior to deletion of a line and/or study so we can remove
    a study link from ICE if needed during post_delete.
    """
    if check_ice_cannot_proceed():
        return
    instance.pre_delete_study = instance.study
    linked = Q(line__id=instance.pk)
    with transaction.atomic(savepoint=False):
        instance.pre_delete_strain_ids = set(
            edd_models.Strain.objects.filter(linked).values_list('id', flat=True)
        )


@receiver(post_delete, sender=edd_models.Line)
def line_removed(sender, instance, **kwargs):
    """
    Checks study <-> strain associations following line deletion and removes study links from ICE
    for any strains that are no longer associated with the study. Note that the m2m_changed
    signal isn't broadcast when lines or studies are deleted. This signal is broadcast is in both
    cases, so we'll use it to fill the gap.
    """
    if check_ice_cannot_proceed():
        return
    if not (hasattr(instance, 'pre_delete_study') and hasattr(instance, 'pre_delete_strain_ids')):
        return
    study_strains = Q(line__study_id=instance.pre_delete_study.pk)
    with transaction.atomic(savepoint=False):
        # find the set of strains on the Study after the delete
        post_delete_strain_ids = set(
            edd_models.Strain.objects.filter(study_strains).distinct().values_list('id', flat=True)
        )
    # calculate which strains were removed as the set difference
    removed_strains = instance.pre_delete_strain_ids - post_delete_strain_ids
    logger.debug('Pre-deletion strains: %s', instance.pre_delete_strain_ids)
    logger.debug('Post-deletion strains: %s', post_delete_strain_ids)
    logger.debug('Removed strains: %s', removed_strains)
    # after transaction commits, schedule Celery task to unlink in ICE.
    partial = functools.partial(submit_ice_unlink, instance.pre_delete_study, removed_strains)
    connection.on_commit(partial)


@receiver(m2m_changed, sender=edd_models.Line.strains.through)
def line_strain_changed(sender, instance, action, reverse, model, pk_set, using, **kwargs):
    """
    Handles changes to the Line <-> Strain relationship caused by adding/removing/changing the
    strain associated with a single line in a study. Detects changes that indicate a need to push
    changes across to ICE for the (ICE part -> EDD study) link stored in ICE.
    """
    # only care about changes in the forward direction, Line -> Strain
    if reverse or check_ice_cannot_proceed():
        return
    # only execute these signals if using a non-testing database
    if using in settings.DATABASES:
        action_function = {
            'post_add': strain_added,
            'pre_remove': strain_removing,
            'post_remove': strain_removed,
        }.get(action, None)
        if action_function:
            action_function(instance, pk_set)


# ----- helper functions -----

def check_ice_cannot_proceed(raw=False):
    if not settings.ICE_URL:
        logger.warning('ICE URL is not configured. Skipping ICE experiment link updates.')
        return True
    return raw


def strain_added(line, pk_set):
    connection.on_commit(functools.partial(submit_ice_link, line.study, pk_set))


def strain_removing(line, pk_set):
    # cache data associated with this strain so we have enough info to remove some or all of
    # ICE's link(s) to this study if appropriate after line -> strain relationship change is
    # completed in EDD
    with transaction.atomic(savepoint=False):
        line.removed_strains = set(
            edd_models.Strain.objects.filter(pk__in=pk_set).values_list('pk', flat=True)
        )


def strain_removed(line, pk_set):
    # narrow down the list of lines that are no longer associated with this strain to
    # just those we want to take action on in ICE.
    with transaction.atomic(savepoint=False):
        remove_on_commit = {
            pk
            for pk in line.removed_strains
            if edd_models.Line.objects.filter(strains=pk, study=line.study.pk).count() == 0
        }
    connection.on_commit(functools.partial(submit_ice_unlink, line.study, remove_on_commit))


def submit_ice_unlink(study, removed_strains):
    """
    Helper method to schedule removal of a link from ICE. This method is only strictly necessary
    to help us work around the django-commit-hooks limitation that a no-arg method be passed to
    the post-commit hook.

    :param study: the Django model for Study to be unlinked
    :param removed_strains: iterable of IDs for Strains to be unlinked
    """
    for strain in removed_strains:
        try:
            unlink_ice_entry_from_study.delay(settings.ICE_ADMIN_ACCOUNT, strain, study.pk)
        except unlink_ice_entry_from_study.OperationalError:
            logger.error('Failed to submit task unlink_ice_entry_from_study(%d, %d)',
                         strain.pk, study.pk)


def submit_ice_link(study, linked_strains):
    """
    Helper method to schedule addition of a link to ICE. This method is only strictly necessary to
    help us work around the django-commit-hooks limitation that a no-arg method be passed to the
    post-commit hook.

    :param study: the Django model for Study to be unlinked
    :param linked_strains: iterable of IDs for Strains to be linked
    """
    for strain in linked_strains:
        try:
            link_ice_entry_to_study.delay(settings.ICE_ADMIN_ACCOUNT, strain, study.pk)
        except link_ice_entry_to_study.OperationalError:
            logger.error('Failed to submit task link_ice_entry_to_study(%d, %d)',
                         strain.pk, study.pk)
