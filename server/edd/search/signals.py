import functools
import logging
from collections import namedtuple

from django.conf import settings
from django.contrib.auth import get_user_model
from django.db import connection
from django.db.models.signals import post_delete, post_save, pre_delete

from edd import receiver
from main import models, signals

from .solr import MeasurementTypeSearch, StudySearch, UserSearch

_type_index = None
_study_index = None
_users_index = None
measurement_types = [
    models.MeasurementType,
    models.Metabolite,
    models.GeneIdentifier,
    models.ProteinIdentifier,
    models.Phosphor,
]
all_indexed_types = measurement_types + [models.Study, get_user_model()]
logger = logging.getLogger(__name__)


def load_study_index():
    global _study_index
    if _study_index is None:
        _study_index = StudySearch()
    return _study_index


def load_type_index():
    global _type_index
    if _type_index is None:
        _type_index = MeasurementTypeSearch()
    return _type_index


def load_users_index():
    global _users_index
    if _users_index is None:
        _users_index = UserSearch()
    return _users_index


def _schedule_solr_update(callback, item):
    # schedule the work for after the commit
    # or immediately if there's no transaction
    try:
        connection.on_commit(functools.partial(callback, [item]))
    except Exception as e:
        logger.warning(f"Solr update for {item} failed: {e}")


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
        signals.study_removed.send(sender=sender, doc=instance._pk_cached, using=using)


@receiver(post_delete, sender=measurement_types)
def removed_type(sender, instance, using, **kwargs):
    if hasattr(instance, "_pk_cached"):
        signals.type_removed.send(sender=sender, doc=instance._pk_cached, using=using)


@receiver(post_delete, sender=get_user_model())
def removed_user(sender, instance, using, **kwargs):
    if hasattr(instance, "_pk_cached"):
        signals.user_removed.send(sender=sender, doc=instance._pk_cached, using=using)


@receiver(post_save, sender=measurement_types)
def type_saved(sender, instance, created, raw, using, **kwargs):
    """
    Forwards a signal indicating a study was saved.
    """
    # raw save == database may be inconsistent; do not forward next signal
    if not raw:
        signals.type_modified.send(
            sender=sender, measurement_type=instance, using=using
        )


@receiver(signals.study_modified)
def index_study(sender, study, using, **kwargs):
    # only submit for indexing when the database key has a matching solr key
    if using in settings.EDD_MAIN_SOLR:
        study_index = load_study_index()
        _schedule_solr_update(study_index.update, study)


@receiver(signals.type_modified)
def index_type(sender, measurement_type, using, **kwargs):
    # only submit for indexing when the database key has a matching solr key
    if using in settings.EDD_MAIN_SOLR:
        type_index = load_type_index()
        _schedule_solr_update(type_index.update, measurement_type)


@receiver(signals.user_modified)
def index_user(sender, user, using, **kwargs):
    # only submit for indexing when the database key has a matching solr key
    if using in settings.EDD_MAIN_SOLR:
        users_index = load_users_index()
        _schedule_solr_update(users_index.update, user)


@receiver(signals.study_removed)
def remove_study(sender, doc, using, **kwargs):
    # only submit for removal when the database key has a matching solr key
    if using in settings.EDD_MAIN_SOLR:
        study_index = load_study_index()
        _schedule_solr_update(study_index.remove, doc)


@receiver(signals.type_removed)
def remove_type(sender, doc, using, **kwargs):
    # only submit for removal when the database key has a matching solr key
    if using in settings.EDD_MAIN_SOLR:
        type_index = load_type_index()
        _schedule_solr_update(type_index.remove, doc)


@receiver(signals.user_removed)
def remove_user(sender, doc, using, **kwargs):
    # only submit for removal when the database key has a matching solr key
    if using in settings.EDD_MAIN_SOLR:
        users_index = load_users_index()
        _schedule_solr_update(users_index.remove, doc)


__all__ = []
