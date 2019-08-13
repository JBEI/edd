# -*- coding: utf-8 -*-

import logging

from django.db.models.signals import post_save

from .. import models, tasks
from .dispatcher import receiver

logger = logging.getLogger(__name__)


@receiver(post_save, sender=models.SBMLTemplate)
def template_saved(sender, instance, created, raw, using, update_fields, **kwargs):
    if raw:
        # cannot access database when doing raw signal
        return
    if created or update_fields is None or "sbml_file" in update_fields:
        try:
            tasks.template_sync_species.delay(instance.pk)
        except tasks.template_sync_species.OperationalError:  # pragma: no cover
            logger.error("Failed to submit task template_sync_species(%s)", instance.pk)
