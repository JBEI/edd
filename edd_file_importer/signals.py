# -*- coding: utf-8 -*-
"""
Adds signal handlers for custom models defined in the "edd_file_importer" app, leveraging existing
signal handler code from "main".
"""

from django.db.models.signals import post_save, pre_save

from . import models
from main.signals.core import ensure_updates, ensure_uuid, log_update
from main.signals.dispatcher import receiver


has_uuid = [
    models.Import,
    models.ImportCategory,
    models.ImportFormat,
]
has_update = has_uuid + []


@receiver(pre_save, sender=has_uuid)
def ensure_uuid_wrapper(sender, instance, raw, using, **kwargs):
    ensure_uuid(sender, instance, raw, using, **kwargs)


@receiver(pre_save, sender=has_update)
def ensure_updates_wrapper(sender, instance, raw, using, **kwargs):
    ensure_updates(sender, instance, raw, using, **kwargs)


@receiver(post_save, sender=has_uuid)
def log_update_wrapper(sender, instance, created, raw, using, **kwargs):
    log_update(sender, instance, created, raw, using, **kwargs)
