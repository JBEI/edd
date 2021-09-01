from django.db.models.signals import post_delete, post_save

from edd import receiver

from .. import models
from .signals import study_modified

permissions = (models.UserPermission, models.GroupPermission, models.EveryonePermission)


@receiver((post_save, post_delete), sender=permissions)
def permission_change(sender, instance, using, raw=False, **kwargs):
    # raw save == database may be inconsistent; do not forward next signal
    if not raw:
        study_modified.send(sender=sender, study=instance.study, using=using)
