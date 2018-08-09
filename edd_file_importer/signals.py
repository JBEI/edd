# -*- coding: utf-8 -*-
"""
Adds signal handlers for custom models defined in the "edd_file_importer" app, leveraging existing
signal handler code from "main".
"""

from django.db.models.signals import post_delete, post_save, pre_save

import main.models as edd_models
from . import models
from main.signals.core import ensure_updates, ensure_uuid, log_update, set_file_info
from main.signals.dispatcher import receiver


@receiver(pre_save, sender=models.ImportFile)
def set_file_info_wrapper(sender, instance, raw, using, **kwargs):
    set_file_info(sender, instance, raw, using, **kwargs)


# deletes files from the filesystem when import FileFields get deleted.  We only ever want to keep
# the latest file for each import.
@receiver(post_delete, sender=models.ImportFile)
def remove_from_filesystem(sender, instance, raw, using, **kwargs):
    instance.file.delete(False)  # False avoids saving the model instance


has_uuid = [
    models.Import,
    models.ImportCategory,
    models.ImportFormat,
]
has_update = has_uuid + []


@receiver(pre_save, sender=has_uuid)
def ensure_uuid_wrapper(sender, instance, raw, using, **kwargs):
    ensure_uuid(sender, instance, raw, using, **kwargs)


# special-case signal handler for ImportFile, which only has 'created' date rather than an update
# history.
@receiver(pre_save, sender=[models.ImportFile])
def ensure_created(sender, instance, raw, using, **kwargs):
    if not raw:
        update = edd_models.Update.load_update()
        if hasattr(instance, 'created_id') and instance.created_id is None:
            instance.created = update


@receiver(pre_save, sender=has_update)
def ensure_updates_wrapper(sender, instance, raw, using, **kwargs):
    ensure_updates(sender, instance, raw, using, **kwargs)


@receiver(post_save, sender=has_uuid)
def log_update_wrapper(sender, instance, created, raw, using, **kwargs):
    log_update(sender, instance, created, raw, using, **kwargs)
