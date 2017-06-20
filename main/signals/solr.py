# -*- coding: utf-8 -*-
from __future__ import absolute_import, unicode_literals

import functools
import logging

from collections import namedtuple
from django.conf import settings
from django.contrib.auth import get_user_model
from django.db import connection
from django.db.models.signals import post_delete, pre_delete

from . import study_modified, study_removed, user_modified, user_removed
from .dispatcher import receiver
from .. import models as edd_models
from ..solr import StudySearch, UserSearch


study_index = StudySearch()
users_index = UserSearch()
logger = logging.getLogger(__name__)


class PrimaryKeyCache(namedtuple('PrimaryKeyCache', ['id'])):
    """
    Defines a cache for objects to-be-deleted so their primary keys can be available in
    post-commit hooks
    """
    pass


def index_remove(index, items):
    try:
        index.remove(items)
    except IOError:
        logger.error("Failed to remove from solr with %s", items)


def index_update(index, items):
    try:
        index.update(items)
    except IOError:
        logger.error("Failed to update solr with %s", items)


@receiver(pre_delete, sender=(edd_models.Study, get_user_model()))
def cache_deleting_key(sender, instance, **kwargs):
    """
    A model's primary key is removed during deletion; this handler will cache the primary key on
    a model instance, so it is available in the `_pk_cached` attribute in `post_delete` handlers.
    """
    instance._pk_cached = PrimaryKeyCache(instance.pk)


@receiver(post_delete, sender=edd_models.Study)
def removed_study(sender, instance, using, **kwargs):
    if hasattr(instance, '_pk_cached'):
        study_removed.send(sender=sender, doc=instance._pk_cached, using=using)


@receiver(post_delete, sender=get_user_model())
def removed_user(sender, instance, using, **kwargs):
    if hasattr(instance, '_pk_cached'):
        user_removed.send(sender=sender, doc=instance._pk_cached, using=using)


@receiver(study_modified)
def index_study(sender, study, using, **kwargs):
    # only submit for indexing when the database key has a matching solr key
    if using in settings.EDD_MAIN_SOLR:
        # schedule the work for after the commit (or immediately if there's no transaction)
        connection.on_commit(functools.partial(index_update, study_index, [study, ]))


@receiver(user_modified)
def index_user(sender, user, using, **kwargs):
    # only submit for indexing when the database key has a matching solr key
    if using in settings.EDD_MAIN_SOLR:
        # schedule the work for after the commit (or immediately if there's no transaction)
        connection.on_commit(functools.partial(index_update, users_index, [user, ]))


@receiver(study_removed)
def remove_study(sender, doc, using, **kwargs):
    # only submit for removal when the database key has a matching solr key
    if using in settings.EDD_MAIN_SOLR:
        # schedule the work for after the commit (or immediately if there's no transaction)
        connection.on_commit(functools.partial(index_remove, study_index, [doc, ]))


@receiver(user_removed)
def remove_user(sender, doc, using, **kwargs):
    # only submit for removal when the database key has a matching solr key
    if using in settings.EDD_MAIN_SOLR:
        # schedule the work for after the commit (or immediately if there's no transaction)
        connection.on_commit(functools.partial(index_remove, users_index, [doc, ]))
