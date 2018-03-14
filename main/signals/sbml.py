# -*- coding: utf-8 -*-

import logging

from django.db.models.signals import post_save

from .dispatcher import receiver
from .. import models as edd_models
from ..tasks import template_sync_species


logger = logging.getLogger(__name__)


@receiver(post_save, sender=edd_models.SBMLTemplate)
def template_saved(sender, instance, created, raw, using, update_fields, **kwargs):
    if not raw and (created or update_fields is None or 'sbml_file' in update_fields):
        try:
            template_sync_species.delay(instance.pk)
        except template_sync_species.OperationalError:
            logger.error("Failed to submit task template_sync_species(%s)", instance.pk)
