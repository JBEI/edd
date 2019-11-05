# -*- coding: utf-8 -*-

import collections
import functools
import logging
from uuid import uuid4

from django.conf import settings
from django.db import connection
from django.db.models import Q
from django.db.models.signals import (
    m2m_changed,
    post_delete,
    post_save,
    pre_delete,
    pre_save,
)

from .. import models, tasks
from .dispatcher import receiver
from .signals import study_modified

logger = logging.getLogger(__name__)

LinePreDelete = collections.namedtuple("LinePreDelete", ("study", "strain_ids"))


# ----- Attachment signal handlers -----


@receiver(pre_save, sender=models.Attachment)
def set_file_info(sender, instance, raw, using, **kwargs):
    if instance.file.readable():
        instance.filename = instance.file.name
        instance.file_size = instance.file.size
        # set the mime_type if it is not already set
        if not instance.mime_type:
            # if there is a content_type from the uploaded file, use that
            # instance.file is the db field; instance.file.file is the actual uploaded file
            uploaded_file = instance.file.file
            if hasattr(uploaded_file, "content_type"):
                instance.mime_type = uploaded_file.content_type
            else:
                # if there is no upload, give up and guess that it's a bunch of bytes
                instance.mime_type = "application/octet-stream"


# ----- common signal handlers -----

has_uuid = [
    models.Assay,
    models.CarbonSource,
    models.Line,
    models.Protocol,
    models.Strain,
    models.Study,
    models.WorklistTemplate,
]
has_update = has_uuid + [
    models.Attachment,
    models.Comment,
    models.Measurement,
    models.MeasurementValue,
]


@receiver(pre_save, sender=has_uuid)
def ensure_uuid(sender, instance, raw, using, **kwargs):
    if instance.uuid is None:
        instance.uuid = uuid4()


@receiver(pre_save, sender=has_update)
def ensure_updates(sender, instance, raw, using, **kwargs):
    if raw:
        # cannot access database when doing raw signal
        return
    update = models.Update.load_update()
    if getattr(instance, "created_id", None) is None:
        instance.created = update
    instance.updated = update
    # for some reason, Measurement has a distinct update_ref field?
    if sender is models.Measurement:
        instance.update_ref = update


@receiver(post_save, sender=has_uuid)
def log_update(sender, instance, created, raw, using, **kwargs):
    if raw:
        # cannot access database when doing raw signal
        return
    instance.updates.add(instance.updated)


# ----- Study signal handlers -----


@receiver(pre_save, sender=models.Study)
def study_slug(sender, instance, raw, using, **kwargs):
    # sanity check, make sure ensure_uuid is called first
    ensure_uuid(sender, instance, raw, using, **kwargs)
    if raw:
        # cannot access database when doing raw signal
        return
    if instance.slug is None:
        instance.slug = instance._build_slug(instance.name, instance.uuid.hex)


@receiver(pre_save, sender=models.Study)
def study_name_change_check(sender, instance, raw, using, **kwargs):
    """
    Runs prior to Study saving, and looks up the Study name to determine if ICE needs an update.
    """
    if check_ice_cannot_proceed():
        # abort when no ICE configured
        return
    if raw:
        # cannot access database when doing raw signal
        return
    # cache Study name as stored in the database so we can detect renaming
    try:
        queryset = models.Study.objects.filter(pk=instance.pk)
        values = queryset.values_list("name", flat=True)
        instance._pre_save_name = values.get()
    except models.Study.DoesNotExist:
        # nothing to do if Study does not exist yet
        pass


@receiver(pre_save, sender=models.Study)
def study_contact_extra(sender, instance, raw, using, **kwargs):
    if instance.contact_extra is None and instance.contact:
        instance.contact_extra = instance.contact.get_full_name()


@receiver(post_save, sender=models.Study)
def study_update_ice(sender, instance, created, raw, using, **kwargs):
    """
    Checks whether the study has been renamed by comparing its current name
    with the one set in study_name_change_check. If it has, and if the study
    is associated with any ICE strains, updates the corresponding ICE
    entry(ies) to label links to this study with its new name.
    """
    if check_ice_cannot_proceed():
        # abort when no ICE configured
        return
    if raw:
        # cannot access database when doing raw signal
        return
    if getattr(instance, "_pre_save_name", instance.name) == instance.name:
        # abort if no change detected in name
        return
    eligible = Q(
        line__study_id=instance.pk,
        registry_url__isnull=False,
        registry_id__isnull=False,
    )
    queryset = models.Strain.objects.filter(eligible).distinct()
    to_link = set(queryset.values_list("id", flat=True))
    partial = functools.partial(submit_ice_link, instance, to_link)
    connection.on_commit(partial)


@receiver(post_save, sender=models.Study)
def study_saved(sender, instance, created, raw, using, **kwargs):
    """Forwards a signal indicating a study was saved."""
    # raw save == database may be inconsistent; do not forward next signal
    if not raw:
        study_modified.send(sender=sender, study=instance, using=using)


# ----- Line signal handlers -----


@receiver(pre_delete, sender=models.Line)
def line_removing(sender, instance, **kwargs):
    """
    Caches study <-> strain associations prior to deletion of a line and/or
    study so we can remove a study link from ICE if needed during post_delete.
    """
    if check_ice_cannot_proceed():
        return
    queryset = models.Strain.objects.filter(line__id=instance.pk)
    instance._pre_delete = LinePreDelete(
        instance.study.id, set(queryset.values_list("id", flat=True))
    )


@receiver(post_delete, sender=models.Line)
def line_removed(sender, instance, **kwargs):
    """
    Checks study <-> strain associations following line deletion and removes
    study links from ICE for any strains that are no longer associated with the
    study. Note that the m2m_changed signal isn't broadcast when lines or
    studies are deleted. This signal is broadcast is in both cases, so we'll
    use it to fill the gap.
    """
    if check_ice_cannot_proceed():
        return
    if not hasattr(instance, "_pre_delete"):
        return
    queryset = models.Strain.objects.filter(
        line__study_id=instance._pre_delete.study
    ).distinct()
    # find the set of strains on the Study after the delete
    post_delete_strain_ids = set(queryset.values_list("id", flat=True))
    # calculate which strains were removed as the set difference
    removed_strains = instance._pre_delete.strain_ids - post_delete_strain_ids
    logger.debug(f"Pre-deletion strains: {instance._pre_delete.strain_ids}")
    logger.debug(f"Post-deletion strains: {post_delete_strain_ids}")
    logger.debug(f"Removed strains: {removed_strains}")
    # after transaction commits, schedule Celery task to unlink in ICE.
    partial = functools.partial(
        submit_ice_unlink, instance._pre_delete.study, removed_strains
    )
    connection.on_commit(partial)


@receiver(m2m_changed, sender=models.Line.strains.through)
def line_strain_changed(
    sender, instance, action, reverse, model, pk_set, using, **kwargs
):
    """
    Handles changes to the Line <-> Strain relationship caused by
    adding/removing/changing the strain associated with a single line in a
    study. Detects changes that indicate a need to push changes across to ICE
    for the (ICE part -> EDD study) link stored in ICE.
    """
    # only care about changes in the forward direction, Line -> Strain
    if reverse:
        return
    if check_ice_cannot_proceed():
        return
    # only execute these signals if using a non-testing database
    if using in settings.DATABASES:  # pragma: no cover
        # map a m2m change action to a function to handle the action
        action_map = {"post_add": strain_added, "post_remove": strain_removed}
        action_function = action_map.get(action, None)
        if action_function:
            action_function(instance, pk_set)


# ----- helper functions -----


def check_ice_cannot_proceed():
    if not settings.ICE_URL:
        logger.warning(
            "ICE URL is not configured. Skipping ICE experiment link updates."
        )
        return True
    return False


def strain_added(line, pk_set):
    connection.on_commit(functools.partial(submit_ice_link, line.study_id, pk_set))


def strain_removed(line, pk_set):
    connection.on_commit(functools.partial(submit_ice_unlink, line.study_id, pk_set))


def submit_ice_unlink(study_id, to_remove):
    """
    Schedules tasks to unlink the given study from every ICE entry in to_remove.

    :param study_id: ID of Study to be unlinked
    :param to_remove: iterable of IDs for Strains to be unlinked
    """
    for strain in to_remove:
        try:
            tasks.unlink_ice_entry_from_study.delay(strain, study_id)
        except tasks.unlink_ice_entry_from_study.OperationalError:  # pragma: no cover
            # this happens when the message queue goes away
            logger.error(
                "Failed to submit task unlink_ice_entry_from_study(%d, %d)",
                strain,
                study_id,
            )


def submit_ice_link(study_id, to_link):
    """
    Schedules tasks to link the given study to every ICE entry in to_link.

    :param study_id: ID of Study to be linked
    :param to_link: iterable of IDs for Strains to be linked
    """
    for strain in to_link:
        try:
            tasks.link_ice_entry_to_study.delay(strain, study_id)
        except tasks.link_ice_entry_to_study.OperationalError:  # pragma: no cover
            # this happens when the message queue goes away
            logger.error(
                "Failed to submit task link_ice_entry_to_study(%d, %d)",
                strain,
                study_id,
            )
