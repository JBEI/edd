# -*- coding: utf-8 -*-
from __future__ import unicode_literals

import functools
import logging
import traceback

from builtins import str
from collections import namedtuple
from django.conf import settings
from django.contrib.auth import get_user_model
from django.core.mail import mail_admins
from django.core.urlresolvers import reverse as urlreverse
from django.db import connection, transaction
from django.db.models.signals import m2m_changed, post_delete, post_save, pre_save, pre_delete
from django.dispatch import receiver

from . import study_modified, user_modified
from .. import models as edd_models
from ..models import (
    Line, MetaboliteExchange, MetaboliteSpecies, SBMLTemplate, Strain, Study, Update,
)
from ..solr import StudySearch, UserSearch
from ..tasks import link_ice_entry_to_study, unlink_ice_entry_from_study
from ..utilities import get_absolute_url


solr_study_index = StudySearch()
solr_users_index = UserSearch()
logger = logging.getLogger(__name__)


@receiver(post_save, sender=Study, dispatch_uid="main.signals.handlers.study_saved")
def study_saved(sender, instance, created, raw, using, **kwargs):
    if not raw and using == 'default':
        study_modified.send(sender=sender, study=instance)


@receiver(post_save, sender=get_user_model(), dispatch_uid="main.signals.handlers.user_saved")
def user_saved(sender, instance, created, raw, using, **kwargs):
    if not raw and using == 'default':
        user_modified.send(sender=sender, user=instance)


@receiver(post_delete, sender=edd_models.UserPermission,
          dispatch_uid=("%s.study_user_permission_post_delete" % __name__))
def study_user_permission_post_delete(sender, instance, using, **kwargs):
    permissions = list(instance.study.userpermission_set.all())
    logger.debug('Post-delete study permissions: %s', str(permissions))
    _schedule_post_commit_study_permission_index(instance)


@receiver(post_save, sender=edd_models.UserPermission,
          dispatch_uid=("%s.study_user_permission_post_save" % __name__))
def study_user_permission_post_save(sender, instance, created, raw, using, **kwargs):
    permissions = list(instance.study.userpermission_set.all())
    logger.debug('Post-save study user permissions: %s', str(permissions))
    _schedule_post_commit_study_permission_index(instance)


@receiver(post_delete, sender=edd_models.GroupPermission,
          dispatch_uid=("%s.study_group_permission_post_delete" % __name__))
def study_group_permission_post_delete(sender, instance, using, **kwargs):
    _schedule_post_commit_study_permission_index(instance)


@receiver(post_save, sender=edd_models.GroupPermission,
          dispatch_uid=("%s.study_group_permission_post_save" % __name__))
def study_group_permission_post_save(sender, instance, created, raw, using, **kwargs):
    _schedule_post_commit_study_permission_index(instance)


@receiver(post_delete, sender=edd_models.EveryonePermission,
          dispatch_uid=("%s.study_public_permission_post_delete" % __name__))
def study_public_permission_post_delete(sender, instance, using, **kwargs):
    _schedule_post_commit_study_permission_index(instance)


@receiver(post_save, sender=edd_models.EveryonePermission,
          dispatch_uid=("%s.study_public_permission_post_save" % __name__))
def study_public_permission_post_save(sender, instance, created, raw, using, **kwargs):
    _schedule_post_commit_study_permission_index(instance)


def _schedule_post_commit_study_permission_index(study_permission):
    """
        Schedules a post-commit update of the SOLR index for the affected study whose permissions
        are affected
        """
    study = study_permission.study
    # package up work to be performed when the database change commits
    partial = functools.partial(_post_commit_index_study, study)
    # schedule the work for after the commit (or immediately if there's no transaction)
    connection.on_commit(partial)


@receiver(study_modified)
def index_study(sender, study, **kwargs):
    # package up work to be performed when the database change commits
    partial = functools.partial(_post_commit_index_study, study)
    # schedule the work for after the commit (or immediately if there's no transaction)
    connection.on_commit(partial)


def _post_commit_index_study(study):
    try:
        solr_study_index.update([study, ])
    except IOError:
        _handle_post_commit_function_error('Error updating Solr index for study %d' % study.pk)


# Python2 does not allow writing of docstrings to the __doc__ attr, commented section is for
# Python3 only
# PrimaryKeyCache = namedtuple('PrimaryKeyCache', ['id'])
# PrimaryKeyCache.__doc__ = """
#     Defines a cache for objects to-be-deleted so their primary keys can be available in
#     post-commit hooks """
class PrimaryKeyCache(namedtuple('PrimaryKeyCache', ['id'])):
    """
    Defines a cache for objects to-be-deleted so their primary keys can be available in
    post-commit hooks
    """
    pass


@receiver(pre_delete, sender=Study, dispatch_uid="main.signals.handlers.study_pre_delete")
def study_pre_delete(sender, instance, **kwargs):
    # package up work to be performed after the study is deleted / when the database change
    # commits. Note: we purposefully separate this from study_post_delete, since the study's
    # primary key will be removed from the Study object itself during deletion. Pre-delete is
    # also too early to perform the make changes since other issues may cause the deletion to
    # fail.
    study = instance
    study.post_remove_pk_cache = PrimaryKeyCache(study.pk)


@receiver(post_delete, sender=Study, dispatch_uid="main.signals.handlers.study_post_delete")
def study_post_delete(sender, instance, **kwargs):
    # schedule the work for after the commit (or immediately if there's no transaction)
    study = instance
    partial = functools.partial(_post_commit_unindex_study, study.post_remove_pk_cache)
    connection.on_commit(partial)


def _post_commit_unindex_study(study_pk):
    try:
        solr_study_index.remove([study_pk, ])
    except IOError:
        _handle_post_commit_function_error('Error updating Solr index for study %d' % study_pk)


@receiver(user_modified)
def index_user(sender, user, **kwargs):
    # package up work to be performed when the database change commits
    partial = functools.partial(_post_commit_index_user, user)
    # schedule the work for after the commit (or immediately if there's no transaction)
    connection.on_commit(partial)


def _post_commit_index_user(user):
        try:
            solr_users_index.update([user, ])
        # catch Solr/connection errors that occur during the user login process / email admins
        # regarding the error. users may not be able to do much without Solr, but they can still
        # access existing studies (provided the URL), and create new ones. Solr being down
        # shouldn't prevent the login process (EDD-201)
        except IOError as e:
            _handle_post_commit_function_error("Error updating Solr with user information for "
                                               "user %s" % user.username)


@receiver(pre_delete, sender=get_user_model(),
          dispatch_uid="main.signals.handlers.user_pre_delete")
def user_pre_delete(sender, instance, using, **kwargs):
    # cache the user's primary key for use in post_delete, which will be removed from the User
    # object itself during deletion
    user = instance
    user.post_remove_pk_cache = PrimaryKeyCache(instance.pk)


@receiver(post_delete, sender=get_user_model(), dispatch_uid=("%s.user_post_delete" % __name__))
def user_post_delete(sender, instance, using, **kwargs):
    user = instance
    logger.info('Start of user_post_delete(): username=%s', instance.username)

    # get the user pk we cached in pre_delete (pk data member gets removed during the deletion)
    post_remove_pk_cache = user.post_remove_pk_cache

    # schedule the Solr update for after the commit (or immediately if there's no transaction)
    partial = functools.partial(_post_commit_unindex_user, post_remove_pk_cache)
    connection.on_commit(partial)


def _post_commit_unindex_user(user_pk_cache):
    try:
        solr_users_index.remove([user_pk_cache, ])
    except IOError:
        _handle_post_commit_function_error(
            'Error updating Solr index for user %d' % user_pk_cache.id
        )


def log_update_warning_msg(study_id):
    logger.warning(
        'ICE URL is not configured. Skipping attempt to link ICE parts to EDD study "%s"',
        study_id
    )


@receiver(pre_save, sender=Study, dispatch_uid="main.signals.handlers.handle_study_pre_save")
def handle_study_pre_save(sender, instance, raw, using, **kwargs):
    if not settings.ICE_URL:
        logger.warning('ICE URL is not configured. Skipping ICE experiment link updates.')
        return
    elif raw:
        return

    # if the study was already saved, cache its name as stored in the database so we can detect
    # renaming
    if instance.pk:
        instance.pre_save_name = Study.objects.filter(pk=instance.pk).values('name')[0]['name']
    # if the study is new
    else:
        instance.pre_save_name = None


@receiver(post_save, sender=Study, dispatch_uid="main.signals.handlers.handle_study_post_save")
def handle_study_post_save(sender, instance, created, raw, using, **kwargs):
    """
    Checks whether the study has been renamed by comparing its current name with the one set in
    handle_study_pre_save. If it has, and if the study is associated with any ICE strains, updates
    the corresponding ICE entry(ies) to label links to this study with its new name.
    """
    if not settings.ICE_URL:
        logger.warning('ICE URL is not configured. Skipping ICE experiment link updates.')
        return
    elif raw:
        return

    logger.info("Start %s()", handle_study_post_save.__name__)

    study = instance

    if study.name == study.pre_save_name:
        return

    logger.info('Study "%s" has been renamed to "%s"', study.pre_save_name, study.name)

    # get the strains associated with this study so we can update link name for the corresponding
    # ICE entries (if any). note that this query only returns ONE row for the strain,
    # even if it's linked to multiple EDD studies. ICE will update ALL links to this study URL
    # for every part that references it, so we don't need to launch a separate Celery task for
    # each. See comments on SYNBIO-1196.
    strains = Strain.objects.filter(line__study_id=study.pk).prefetch_related('created')

    if strains:
        update = Update.load_update()  # find which user made the update that caused this signal
        user_email = update.mod_by.email

        # filter out strains that don't have enough information to link to ICE
        strains_to_link = []
        for strain in strains.all():
            if not _is_linkable(strain):
                logger.warning(
                    "Strain with id %d is no longer linked to study id %d, but doesn't have "
                    "enough data to link to ICE. It's possible (though unlikely) that the EDD "
                    "strain has been modified since an ICE link was created for it.",
                    strain.pk, study.pk
                )
                continue
            strains_to_link.append(strain)
        # schedule ICE updates as soon as the database changes commit
        partial = functools.partial(
            _post_commit_link_ice_entry_to_study,  # callback
            user_email, study, strains_to_link,    # args
        )
        connection.on_commit(partial)
        logger.info(
            "Scheduled post-commit work to update labels for %d of %d strains associated with "
            "study %d", len(strains_to_link), strains.count(), study.pk
        )


@receiver(pre_delete, sender=Line, dispatch_uid="main.signals.handlers.handle_line_pre_delete")
@transaction.atomic(savepoint=False)
def handle_line_pre_delete(sender, instance, **kwargs):
    """
    Caches study <-> strain associations prior to deletion of a line and/or study so we can remove
    a study link from ICE if needed during post_delete.
    """
    logger.debug("Start %s()", handle_line_pre_delete.__name__)

    if not settings.ICE_URL:
        logger.warning('ICE URL is not configured. Skipping ICE experiment link updates.')
        return

    line = instance
    with transaction.atomic():
        instance.pre_delete_study = line.study
        instance.pre_delete_strains = Strain.objects.filter(line__id=line.pk)

        # force query evaluation now instead of when we read the result
        len(instance.pre_delete_strains)


@receiver(post_delete, sender=Line, dispatch_uid="main.signals.handlers.handle_line_post_delete")
@transaction.atomic(savepoint=False)
def handle_line_post_delete(sender, instance, **kwargs):
    """
    Checks study <-> strain associations following line deletion and removes study links from ICE
    for any strains that are no longer associated with the study. Note that the m2m_changed
    signal isn't broadcast when lines or studies are deleted. This signal is broadcast is in both
    cases, so we'll use it to fill the gap.
    """
    logger.debug("Start %s()", handle_line_post_delete.__name__)

    if not settings.ICE_URL:
        logger.warning('ICE URL is not configured. Skipping ICE experiment link updates.')
        return

    line = instance

    # extract study-related data cached prior to the line deletion. Note that line deletion signals
    # are also sent during/after study deletion, so this information may not be in the database
    # any more
    study = line.pre_delete_study
    study_pk = study.pk

    # build a list of strains that are no longer associated with this study due to deletion of
    # the line.
    post_delete_strain_ids = [strain.pk for strain in
                              Strain.objects.filter(line__study_id=study_pk).distinct()]
    removed_strains = [strain for strain in line.pre_delete_strains if
                       strain.pk not in post_delete_strain_ids]

    logger.debug("pre_delete_strain_ids: %s", instance.pre_delete_strains)
    logger.debug("post-delete_strain_ids: %s", post_delete_strain_ids)
    logger.debug("removed_strain_ids: %s", removed_strains)

    # find which user made the update that caused this signal
    update = Update.load_update()

    if not (update and update.mod_by and update.mod_by.email):
        username = update.mod_by.username if (update and update.mod_by) else 'Unknown user'
        msg = ('No user email could be found associated with the in-progress deletion of '
               'line %(line_pk)d "%(line_name)s by user "%(username)s". Line deletion will '
               'proceed,  but the associated experiment link in ICE will remain in place because '
               'a user identity is required to update experiment links in  ICE. Please manually '
               'delete this link using the ICE user interface.\n'
               'This situation is known to occur when a line is deleted directly from the Django '
               'shell rather than from the EDD user interface. ' % {
                    'line_pk': line.pk,
                    'line_name': line.name,
                    'username': username
                })
        subject = "Stale ICE experiment link won't be deleted"
        logger.warning(subject)
        logger.warning(msg)
        mail_admins(subject, msg)
        return

    user_email = update.mod_by.email
    logger.debug("update performed by user %s", user_email)

    # wait until the connection commits, then schedule a Celery task to remove the link from ICE.
    # Note that if we don't wait, the Celery task can run before it commits, at which point its
    # initial DB query
    # will indicate an inconsistent database state. This happened repeatably during testing.
    partial = functools.partial(_post_commit_unlink_ice_entry_from_study, user_email, study,
                                removed_strains)
    connection.on_commit(partial)


def _post_commit_unlink_ice_entry_from_study(user_email, study, removed_strains):
    """
    Helper method to schedule removal of a link from ICE. This method is only strictly necessary
    to help us work around the django-commit-hooks limitation that a no-arg method be passed to
    the post-commit hook.

    :param user_email: the email used as user ID on ICE
    :param study: the Django model for Study to be unlinked
    :param removed_strains: iterable of Django models for Strains to be unlinked
    """
    logger.debug('Start %s()', _post_commit_unlink_ice_entry_from_study.__name__)
    for strain in removed_strains:
        if not _is_strain_linkable(strain.registry_url, strain.registry_id):
            logger.warning(
                "Strain with id %d is no longer linked to study id %d, but EDD does not have "
                "enough information to update ICE.", strain.pk, study.pk
            )
            continue
        try:
            unlink_ice_entry_from_study.delay(user_email, strain.pk, study.pk)
        except unlink_ice_entry_from_study.OperationalError:
            logger.error('Failed to submit task unlink_ice_entry_from_study(%d, %d)',
                         strain.pk, study.pk)


def _post_commit_link_ice_entry_to_study(user_email, study, linked_strains):
    """
    Helper method to schedule addition of a link to ICE. This method is only strictly necessary to
    help us work around the django-commit-hooks limitation that a no-arg method be passed to the
    post-commit hook.

    :param user_email: the email used as user ID on ICE
    :param study: the Django model for Study to be unlinked
    :param linked_strains: iterable of Django models for Strains to be unlinked
    """
    logger.debug('Start %s()', _post_commit_link_ice_entry_to_study.__name__)
    for strain in linked_strains:
        if not _is_strain_linkable(strain.registry_url, strain.registry_id):
            logger.warning(
                "Strain with id %d is linked to study id %d, but EDD does not have "
                "enough information to update ICE.", strain.pk, study.pk
            )
            continue
        try:
            link_ice_entry_to_study.delay(user_email, strain.pk, study.pk)
        except link_ice_entry_to_study.OperationalError:
            logger.error('Failed to submit task link_ice_entry_to_study(%d, %d)',
                         strain.pk, study.pk)


def _handle_post_commit_function_error(err_msg, re_raise_error=None):
    """
        A workaround for EDD-176: Django doesn't seem to be picking up errors / emailing admins
        for uncaught exceptions in post-commit signal handler functions.
        Note that even if Django
        resolves this we *still* often won't want to raise the exception since that would cause
        the EDD user to get an error message for a process that from their perspective was a
        partial/total success. For ICE messaging tasks, we can consider changing this behavior
        after  deploying Celery in production (EDD-176), which will effectively mask ICE
        communication / integration errors from EDD users since they'll occur outside the context
        of the browser's request. At that point, errors generated here will just reflect errors
        communicating with Celery, which should probably still be masked from users.
        :param err_msg: a brief string description of the error that will get logged / emailed to
        admins
        :param re_raise_error: a reference to the Error/Exception that was thrown if it should be
        re-raised after being logged / emailed to admins. Often this should only be done if the
        error is severe enough that it justifies interrupting the users current workflow. Note that
        a traceback will be logged / emailed even if this parameter isn't included.
    """

    # Note: purposeful to not pass the error here! Often the cause of unicode exceptions!
    # See SYNBIO-1267.
    logger.exception(err_msg)
    traceback_str = build_traceback_msg()
    msg = '%s\n\n%s' % (err_msg, traceback_str)
    mail_admins(err_msg, msg)

    if re_raise_error:
        raise re_raise_error


def _is_linkable(strain):
    return _is_strain_linkable(strain.registry_url, strain.registry_id)


def _is_strain_linkable(registry_url, registry_id):
    #  as a workaround for SYNBIO-1207, we'll extract the ICE part ID from the URL to increase
    # the odds that it'll be a numeric ID that won't cause 404 errors. otherwise, we could just
    # construct the URL from the registry ID and our ICE configuration data
    return registry_url and registry_id


class ChangeFromFixture(Exception):
    """ Exception to use when change from fixture is detected. """
    pass


def handle_line_strain_pre_clear(line, pk_set):
    # save contents of the relation before Django clears it in preparation to re-add
    # everything (including new items). This is the (seemingly very
    # inefficient/inconvenient/misleading) process Django uses each time, regardless of the
    # number of adds/removals actually taking place. ordinarily assuming that a "clear"
    # operation always precedes an "add" would be problematic, but it appears safe in this
    # case since the only time the M2M relationship between Lines / Strains should ever be
    # cleared is either when a study is deleted, or as an intermediate step by Django during
    # the save process. Seems like a very inefficient way of doing it, but improving that
    # behavior is out-of-scope for us here.

    # NOTE: call to list() forces query evaluation here rather than when we read the result
    # in post_add
    line.pre_clear_strain_pks = list(line.strains.values_list('pk', flat=True))
    return


def handle_line_strain_post_add(line, pk_set):
    added_strains = list(line.strains.filter(pk__in=pk_set))
    logger.debug("added_strains = %s" % str(added_strains))

    # schedule asynchronous work to maintain ICE strain links to this study, failing if any
    # job submission fails (probably because our link to Celery or RabbitMQ is down, and isn't
    # likely to come back up for subsequently attempted task submissions in the loop)
    study = line.study

    strain_pk = 0
    try:
        # find which user made the update that caused this signal
        update = Update.load_update()
        if update.mod_by is None:
            raise ChangeFromFixture("No user initiated change, aborting ICE update.")
        user_email = update.mod_by.email
        logger.debug("update performed by user " + user_email)

        add_on_commit_strains = []
        for strain in added_strains:
            strain_pk = strain.pk

            # skip any strains that aren't associated with an ICE entry
            if not _is_linkable(strain):
                logger.warning(
                    "Strain with id %d is now linked to study id %d, but EDD's "
                    "database entry for the strain doesn't contain enough data to create an "
                    "ICE link back to the study. It's possible (though unlikely) that the "
                    "EDD strain has been modified since an ICE link was created for it."
                    % (strain.pk, study.pk))
                continue

            add_on_commit_strains.append(strain)

        if add_on_commit_strains:
            # wait until the connection commits, then schedule work to add/update the link(s)
            # in ICE. Note that if we don't wait, the Celery task can run before it commits,
            # at which point its initial DB query will indicate an inconsistent database
            # state. This happened repeatably during testing.
            partial = functools.partial(
                _post_commit_link_ice_entry_to_study,      # callback
                user_email, study, add_on_commit_strains,  # args
            )
            connection.on_commit(partial)

        exp_add_count = len(pk_set)
        linkable_count = len(add_on_commit_strains)

        logger.info("Done scheduling post-commit work to submit jobs to Celery: will "
                    "submit ICE link creation task for each %d of %d added strains.",
                    linkable_count, exp_add_count)
    except ChangeFromFixture:
        logger.warning("Detected changes from fixtures, skipping ICE signal handling.")
    # if an error occurs, print a helpful log message, then re-raise it so Django will email
    # administrators
    except Exception:
        logger.exception("Exception scheduling post-commit work. Failed on strain with id %d",
                         strain_pk)


def handle_line_strain_pre_remove(line, pk_set):
    # cache data associated with this strain so we have enough info to remove some or all of
    # ICE's link(s) to this study if appropriate after line -> strain relationship change is
    # completed in EDD
    line.removed_strains = Strain.objects.filter(pk__in=pk_set)


def handle_line_strain_post_remove(line, pk_set):
    removed_strains = line.removed_strains
    logger.debug("removed_strains = %s", removed_strains, )

    # find which user made the update that caused this signal
    update = Update.load_update()
    user_email = update.mod_by.email
    logger.debug("update performed by user %s", user_email)

    # schedule asynchronous work to maintain ICE strain links to this study, failing if any
    # job submission fails (probably because our link to Celery or RabbitMQ is down, and
    # isn't likely to come back up for subsequently attempted task submissions in the loop)
    study = line.study
    strain_pk = 0

    try:
        # narrow down the list of lines that are no longer associated with this strain to
        # just those
        # we want to take action on in ICE.
        remove_on_commit = []
        for strain in removed_strains:
            strain_pk = strain.pk
            # skip any strains that can't be associated with an ICE entry
            if not _is_linkable(strain):
                logger.warning(
                    "Strain with id %d is no longer linked to study id %d, but EDD's "
                    "database entry for the strain doesn't have enough data to facilitate "
                    "removal of the corresponding study link from ICE (if any).  It's "
                    "possible, though unlikely, that the EDD strain has been modified "
                    "since an ICE link was created for it.", strain.pk, study.pk
                )
                continue
            # test whether any lines still exist that link the study to this strain. if not,
            # schedule a task to remove the link from ICE. Note that we could skip this check
            # and just depend on the one in unlink_ice_part_from_study, but that would remove
            # our ability to detect stale tasks in the pipeline
            lines = Line.objects.filter(strains__registry_url=strain.registry_url,
                                        study__pk=study.pk,
                                        study__created__mod_time=study.created.mod_time)
            if lines:
                logger.warning(
                    "Found %d other lines linking study id %d to strain id %d. The ICE link "
                    "to this study won't be removed.", lines.count(), study.pk, strain.pk)
                continue
            remove_on_commit.append(strain)

        if remove_on_commit:
            # wait until the transaction commits, then schedule work to remove the link(s)
            # from ICE. Note that if we don't wait, the Celery task can run before it commits,
            # at which point its initial DB query will indicate an inconsistent database
            # state. This happened repeatably during testing.
            partial = functools.partial(
                _post_commit_unlink_ice_entry_from_study,  # callback
                # args below
                user_email, study, remove_on_commit,
            )
            connection.on_commit(partial)
    except ChangeFromFixture:
        logger.warning("Detected changes from fixtures, skipping ICE signal handling.")
    # if an error occurs, print a helpful log message, then re-raise it so Django will email
    # administrators
    except Exception:
        logger.exception("Exception scheduling post-commit work. Failed on strain with id %d",
                         strain_pk)


@receiver(m2m_changed, sender=Line.strains.through, dispatch_uid=("%s.handle_line_strain_changed"
                                                                  % __name__))
@transaction.atomic(savepoint=False)
def handle_line_strain_changed(sender, instance, action, reverse, model, pk_set, using, **kwargs):
    """
    Handles changes to the Line <-> Strain relationship caused by adding/removing/changing the
    strain associated with a single line in a study. Detects changes that indicate a need to push
    changes across to ICE for the (ICE part -> EDD study) link stored in ICE.
    """

    # ignore calls that indicate a change from the perspective of the model data member we don't
    # presently have implemented. Even if the data member is added later, we don't want to
    # process the same strain/line link twice from both perspectives...
    # it's currently Line that links back to Study and impacts which data we want to push to ICE.
    log_format = {
        'method': handle_line_strain_changed.__name__,
        'action': action,
        'name': instance.name,
        'reverse': reverse,
        'pk_set': pk_set,
    }
    if reverse:
        logger.info(
            'Start %(method)s():%(action)s. Strain = "%(name)s", reverse = %(reverse)s, '
            'pk_set = %(pk_set)s', log_format
        )
        return

    logger.info(
        'Start %(method)s():%(action)s. Line = "%(name)s", reverse = %(reverse)s, '
        'pk_set = %(pk_set)s', log_format
    )

    if not settings.ICE_URL:
        logger.warning('ICE URL is not configured. Skipping ICE experiment link updates.')
        return

    line = instance  # just call it a line for clarity now that we've verified that it is one
    action_function = {
        'pre_clear': handle_line_strain_pre_clear,
        'post_add': handle_line_strain_post_add,
        'pre_remove': handle_line_strain_pre_remove,
        'post_remove': handle_line_strain_post_remove,
    }.get(action, None)
    if action_function:
        action_function(line, pk_set)

    logger.debug("End %s(): %s", handle_line_strain_changed.__name__, action)


def get_abs_study_url(study):
    # Note: urlreverse is an alias for reverse() to avoid conflict with named parameter
    study_relative_url = urlreverse('main:detail', kwargs={'slug': study.slug})
    return get_absolute_url(study_relative_url)


@receiver(post_save, sender=SBMLTemplate)
def template_saved(sender, instance, created, raw, using, update_fields, **kwargs):
    if not raw and (created or update_fields is None or 'sbml_file' in update_fields):
        # TODO: add celery task for template_sync_species
        try:
            template_sync_species(instance)
        except Exception as e:
            logger.warning("Failed to parse and index template reactions in %s", instance)


def template_sync_species(instance):
    doc = instance.parseSBML()
    model = doc.getModel()
    # filter to only those for the updated template
    species_qs = MetaboliteSpecies.objects.filter(sbml_template=instance)
    exchange_qs = MetaboliteExchange.objects.filter(sbml_template=instance)
    # values_list yields a listing of tuples, unwrap the value we want
    exist_species = {s[0] for s in species_qs.values_list('species')}
    exist_exchange = {r[0] for r in exchange_qs.values_list('exchange_name')}
    # creating any records not in the database
    for species in map(lambda s: s.getId(), model.getListOfSpecies()):
        if species not in exist_species:
            MetaboliteSpecies.objects.get_or_create(sbml_template=instance, species=species)
        else:
            exist_species.discard(species)
    reactions = map(lambda r: (r.getId(), r.getListOfReactants()), model.getListOfReactions())
    for reaction, reactants in reactions:
        if len(reactants) == 1 and reaction not in exist_exchange:
            MetaboliteExchange.objects.get_or_create(
                sbml_template=instance,
                exchange_name=reaction,
                reactant_name=reactants[0].getSpecies()
            )
        else:
            exist_exchange.discard(reaction)
    # removing any records in the database not in the template document
    species_qs.filter(species__in=exist_species).delete()
    exchange_qs.filter(exchange_name__in=exist_exchange).delete()


def build_traceback_msg():
    """
    Builds an error message for inclusion into an email to sysadmins
    :return:
    """
    formatted_lines = traceback.format_exc().splitlines()
    traceback_str = '\n'.join(formatted_lines)
    return 'The contents of the full traceback was:\n\n%s' % traceback_str
