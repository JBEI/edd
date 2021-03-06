from django.contrib.auth import get_user_model
from django.db.models.signals import post_save

from edd import receiver

from .signals import user_modified


@receiver(post_save, sender=get_user_model())
def user_saved(sender, instance, created, raw, using, **kwargs):
    if not raw:
        user_modified.send(sender=sender, user=instance, using=using)
