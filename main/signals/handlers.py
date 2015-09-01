from django.contrib.auth import get_user_model
from django.db.models.signals import post_save
from django.dispatch import receiver
from main.models import Study
from main.solr import StudySearch, UserSearch

from . import study_modified, user_modified

solr = StudySearch()
users = UserSearch()

@receiver(post_save, sender=Study)
def study_saved(sender, instance, created, raw, **kwargs):
    if not raw:
        study_modified.send(sender=sender, study=instance)

@receiver(post_save, sender=get_user_model())
def user_saved(sender, instance, created, raw, **kwargs):
    if not raw:
        user_modified.send(sender=sender, user=instance)

@receiver(study_modified)
def index_study(sender, study, **kwargs):
    solr.update([ study, ])

@receiver(user_modified)
def index_user(sender, user, **kwargs):
    users.update([ user ])
