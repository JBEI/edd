# -*- coding: utf-8 -*-

import functools
import logging
from collections import namedtuple

from django.conf import settings
from django.contrib.auth import get_user_model
from django.db import connection
from django.db.models.signals import post_delete, post_save, pre_delete

from .. import models
from ..solr import MeasurementTypeSearch, StudySearch, UserSearch
from .dispatcher import receiver
from .signals import (
    study_modified,
    study_removed,
    type_modified,
    type_removed,
    user_modified,
    user_removed,
)

type_index = MeasurementTypeSearch()
study_index = StudySearch()
users_index = UserSearch()
measurement_types = [
    models.MeasurementType,
    models.Metabolite,
    models.GeneIdentifier,
    models.ProteinIdentifier,
    models.Phosphor,
]
all_indexed_types = measurement_types + [models.Study, get_user_model()]
logger = logging.getLogger(__name__)


class PrimaryKeyCache(namedtuple("PrimaryKeyCache", ["id"])):
    """
    Defines a cache for objects to-be-deleted so their primary keys can be
    available in post-commit hooks.
    """

    pass


@receiver(pre_delete, sender=all_indexed_types)
def cache_deleting_key(sender, instance, **kwargs):
    """
    A model's primary key is removed during deletion; this handler will cache
    the primary key on a model instance, so it is available in the `_pk_cached`
    attribute in `post_delete` handlers.
    """
    instance._pk_cached = PrimaryKeyCache(instance.pk)


@receiver(post_delete, sender=models.Study)
def removed_study(sender, instance, using, **kwargs):
    if hasattr(instance, "_pk_cached"):
        study_removed.send(sender=sender, doc=instance._pk_cached, using=using)


@receiver(post_delete, sender=measurement_types)
def removed_type(sender, instance, using, **kwargs):
    if hasattr(instance, "_pk_cached"):
        type_removed.send(sender=sender, doc=instance._pk_cached, using=using)


@receiver(post_delete, sender=get_user_model())
def removed_user(sender, instance, using, **kwargs):
    if hasattr(instance, "_pk_cached"):
        user_removed.send(sender=sender, doc=instance._pk_cached, using=using)


@receiver(post_save, sender=measurement_types)
def type_saved(sender, instance, created, raw, using, **kwargs):
    """
    Forwards a signal indicating a study was saved.
    """
    # raw save == database may be inconsistent; do not forward next signal
    if not raw:
        type_modified.send(sender=sender, measurement_type=instance, using=using)


@receiver(study_modified)
def index_study(sender, study, using, **kwargs):
    # only submit for indexing when the database key has a matching solr key
    if using in settings.EDD_MAIN_SOLR:
        # schedule the work for after the commit (or immediately if there's no transaction)
        connection.on_commit(functools.partial(study_index.update, [study]))


@receiver(type_modified)
def index_type(sender, measurement_type, using, **kwargs):
    # only submit for indexing when the database key has a matching solr key
    if using in settings.EDD_MAIN_SOLR:
        # schedule the work for after the commit (or immediately if there's no transaction)
        connection.on_commit(functools.partial(type_index.update, [measurement_type]))


@receiver(user_modified)
def index_user(sender, user, using, **kwargs):
    # only submit for indexing when the database key has a matching solr key
    if using in settings.EDD_MAIN_SOLR:
        # schedule the work for after the commit (or immediately if there's no transaction)
        connection.on_commit(functools.partial(users_index.update, [user]))


@receiver(study_removed)
def remove_study(sender, doc, using, **kwargs):
    # only submit for removal when the database key has a matching solr key
    if using in settings.EDD_MAIN_SOLR:
        # schedule the work for after the commit (or immediately if there's no transaction)
        connection.on_commit(functools.partial(study_index.remove, [doc]))


@receiver(type_removed)
def remove_type(sender, doc, using, **kwargs):
    # only submit for removal when the database key has a matching solr key
    if using in settings.EDD_MAIN_SOLR:
        # schedule the work for after the commit (or immediately if there's no transaction)
        connection.on_commit(functools.partial(type_index.remove, [doc]))


@receiver(user_removed)
def remove_user(sender, doc, using, **kwargs):
    # only submit for removal when the database key has a matching solr key
    if using in settings.EDD_MAIN_SOLR:
        # schedule the work for after the commit (or immediately if there's no transaction)
        connection.on_commit(functools.partial(users_index.remove, [doc]))
