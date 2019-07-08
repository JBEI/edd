# -*- coding: utf-8 -*-

from django.db.models.signals import post_delete, post_save

from .. import models as edd_models
from . import study_modified
from .dispatcher import receiver

permissions = (
    edd_models.UserPermission,
    edd_models.GroupPermission,
    edd_models.EveryonePermission,
)


@receiver((post_save, post_delete), sender=permissions)
def permission_change(sender, instance, using, raw=False, **kwargs):
    # raw save == database may be inconsistent; do not forward next signal
    if not raw and using == "default":
        study_modified.send(sender=sender, study=instance.study, using=using)
