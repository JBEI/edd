import logging
from uuid import uuid4

from django.db.models.signals import post_save, pre_save

from edd import receiver

from .. import models
from .signals import study_modified

logger = logging.getLogger(__name__)


# ----- Attachment signal handlers -----


@receiver(pre_save, sender=models.Attachment)
def set_file_info(sender, instance, raw, using, **kwargs):
    if instance.file and instance.file.readable():
        set_file_info_filename(instance)
        set_file_info_file_size(instance)
        set_file_info_mime_type(instance)


def set_file_info_filename(instance):
    if not instance.filename:
        instance.filename = getattr(instance.file, "name", "unnamed-file")


def set_file_info_file_size(instance):
    if instance.file_size == 0:
        instance.file_size = getattr(instance.file, "size", 0)


def set_file_info_mime_type(instance):
    if not instance.mime_type:
        # instance.file is the db field; instance.file.file is the actual uploaded file
        # if there is no content_type found, guess that it's a bunch of bytes
        instance.mime_type = getattr(
            instance.file.file, "content_type", "application/octet-stream"
        )


# ----- common signal handlers -----

core_eddobject = [
    models.Assay,
    models.Line,
    models.Study,
    models.WorklistTemplate,
]
has_uuid = core_eddobject + [
    models.MetadataType,
    models.Protocol,
]
has_update = core_eddobject + [
    models.Attachment,
    models.Comment,
    models.Measurement,
    models.MeasurementValue,
    models.Protocol,
    models.Strain,
]


@receiver(pre_save, sender=has_uuid)
def ensure_uuid(sender, instance, raw, using, **kwargs):
    if instance.uuid is None:
        instance.uuid = uuid4()


@receiver(pre_save, sender=has_update)
def ensure_updates(sender, instance, raw, using, **kwargs):
    update = models.Update.load_update()
    if getattr(instance, "created_id", None) is None:
        instance.created = update
    instance.updated = update
    # for some reason, Measurement has a distinct update_ref field?
    if sender is models.Measurement:
        instance.update_ref = update


@receiver(post_save, sender=core_eddobject)
def log_update(sender, instance, created, raw, using, **kwargs):
    instance.updates.add(instance.updated)


# ----- Study signal handlers -----


@receiver(pre_save, sender=models.Study)
def study_slug(sender, instance, raw, using, **kwargs):
    # sanity check, make sure ensure_uuid is called first
    ensure_uuid(sender, instance, raw, using, **kwargs)
    if instance.slug is None:
        instance.slug = instance._build_slug(instance.name, instance.uuid.hex)


@receiver(pre_save, sender=models.Study)
def study_contact_extra(sender, instance, raw, using, **kwargs):
    if instance.contact_extra is None and instance.contact:
        instance.contact_extra = instance.contact.profile.display_name


@receiver(post_save, sender=models.Study)
def study_saved(sender, instance, created, raw, using, **kwargs):
    """Forwards a signal indicating a study was saved."""
    study_modified.send(sender=sender, study=instance, using=using)
