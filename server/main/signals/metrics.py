import logging

from django.db.models.signals import post_delete, post_save

from edd import receiver

from .. import models
from .signals import study_created, study_permission_change

logger = logging.getLogger(__name__)
permissions = (models.UserPermission, models.GroupPermission, models.EveryonePermission)
sentinel = object()


@receiver(post_save, sender=models.Study)
def check_for_study_created(sender, instance, created, raw, using, **kwargs):
    if created and not raw:
        user = instance.created.mod_by
        study_created.send(sender=sender, study=instance, user=user)


@receiver(post_delete, sender=permissions)
def check_permission_remove(sender, instance, **kwargs):
    # instance is not in the database anymore, take care to not reference related objects
    study_permission_change.send(
        sender=sender,
        study_id=instance.study_id,
        user=models.Update.get_current_user(),
        permission=instance.permission_type,
        selector=instance.get_selector(),
        applied=False,
    )


@receiver(post_save, sender=permissions)
def check_permission_update(sender, instance, raw, **kwargs):
    if not raw:
        study_permission_change.send(
            sender=sender,
            study_id=instance.study_id,
            user=models.Update.get_current_user(),
            permission=instance.permission_type,
            selector=instance.get_selector(),
            applied=True,
        )
