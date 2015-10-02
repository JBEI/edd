# -*- coding: utf-8 -*-
from __future__ import unicode_literals

from django.contrib.auth import get_user_model
from django.db.models.signals import post_save, pre_delete
from django.dispatch import receiver
from main.models import Study
from main.solr import StudySearch, UserSearch

from . import study_modified, study_removed, user_modified

solr = StudySearch()
users = UserSearch()


@receiver(post_save, sender=Study)
def study_saved(sender, instance, created, raw, using, **kwargs):
    if not raw and using == 'default':
        study_modified.send(sender=sender, study=instance)


@receiver(pre_delete, sender=Study)
def study_delete(sender, instance, using, **kwargs):
    if using == 'default':
        study_removed.send(sender=sender, study=instance)


@receiver(post_save, sender=get_user_model())
def user_saved(sender, instance, created, raw, using, **kwargs):
    if not raw and using == 'default':
        user_modified.send(sender=sender, user=instance)


@receiver(study_modified)
def index_study(sender, study, **kwargs):
    solr.update([study, ])


@receiver(study_removed)
def unindex_study(sender, study, **kwargs):
    solr.remove([study, ])


@receiver(user_modified)
def index_user(sender, user, **kwargs):
    users.update([user, ])
