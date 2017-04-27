# -*- coding: utf-8 -*-
"""
Defines remote tasks to be executed asynchronously by the Celery distributed task queue. To
implement an asychronous task to be remotely executed by Celery, define a carefully-defined
function here and decorate it with @task_queue.task.
For information about Celery itself, see http://www.celeryproject.org/.
See celeryconfig.py for EDD's Celery configuration and defaults. Also see JBEI reminders list for
Celery task implementation. See celery_utils.py for common supporting utility methods.
"""

from __future__ import absolute_import, unicode_literals

from builtins import str
from celery import shared_task
from celery.utils.log import get_task_logger
from celery.exceptions import SoftTimeLimitExceeded
from django.conf import settings
from django.core.exceptions import MultipleObjectsReturned
from django.db import transaction
from django.utils.translation import ugettext

from edd_utils.celery_utils import (
    INVALID_DELAY, send_retry_warning_if_applicable, test_time_limit_consistency,
)
from edd_utils.celery_utils import compute_exp_retry_delay
from edd_utils.celery_utils import send_stale_input_warning
from edd_utils.celery_utils import send_resolution_message
from edd_utils.celery_utils import make_standard_email_subject, email_admins
from jbei.rest.auth import HmacAuth
from jbei.rest.clients.ice import IceApi, parse_entry_id
from main.models import Line, Strain


# use the built-in Celery worker logging
logger = get_task_logger(__name__)

_INVALID_DELAY = -1

_WARNING_IMPORTANCE = "Warning"
_STALE_OR_ERR_INPUT = ugettext('Stale or erroneous input')


@shared_task(bind=True)
def debug_task(self):
    logger.info('Request: {0!r}'.format(self.request))


@shared_task
def add(x, y):
    return x + y


@shared_task
def test_failure(default_retry_delay=2):
    raise Exception('testing exception case')


# retry 5 times ~= 1 min total duration, with warning notification at  ~6 s = #3
@shared_task(bind=True, default_retry_delay=2, max_retries=5)
def test_repeated_retry_failure(self, fail_for_outdated_input=False, succeed_on_final_attempt=True):
    """
    A test task that simulates repeated failure. Helpful in testing error, warning, and resolution
    notifications, and serves as a basic example for future Celery task implementations.
    The task will repeatedly fail, sending a warning message to administrators prior to its eventual
    failure.
       :param fail_for_outdated_input: true to simulate task failure due to inputs being outdated
       (no retries will occur).
       :param succeed_on_final_attempt: true to simulate task success on the final attempt,
       resulting in a resolution
       notification
    :return:
    """

    warn_at_retry_num = 3
    est_execution_time = 0
    use_exponential_backoff = True

    # verify that dynamically-configurable time limits are self-consistent, and email administrators
    # if they aren't
    test_time_limit_consistency(self, logger, est_execution_time, use_exponential_backoff)

    if fail_for_outdated_input:
        raise LookupError('Task inputs were detected to be stale')

    try:
        retry_num = self.request.retries
        if (not succeed_on_final_attempt) or (retry_num < self.max_retries):
            raise Exception('Testing repeated exception, retry = %d' % retry_num)

    # if Celery is about to forcibly terminate the worker,
    #  perform cleanup and then fail the task by throwing an Exception
    except SoftTimeLimitExceeded as stl:
        raise stl  # no cleanup to perform in this example

    # database values provided as inputs are no longer valid...something has changed
    # since it was submitted. Email administrators to warn them of a possible problem, then succeed.
    except LookupError:
        specific_cause = 'Test program configured to simulate stale data'
        send_stale_input_warning(self, specific_cause, est_execution_time, use_exponential_backoff,
                                 logger)
        return _STALE_OR_ERR_INPUT

    # assume all other Exceptions are the result of communication errors with EDD and/or ICE. Warn
    # administrators about the problem if this is the right time for a warning, then schedule the
    # next execution attempt
    except Exception as exc:
        # if conditions are met, send a warning email to administrators so they can take action
        # before the task fails and requires more manual effort to correct
        send_retry_warning_if_applicable(self, est_execution_time,
                                         warn_at_retry_num, logger,
                                         skip_moot_warnings=False)

        # compute a reasonable delay and schedule a retry
        retry_delay = compute_exp_retry_delay(self)
        raise self.retry(exc=exc, countdown=retry_delay)  # @task_queue.task

    finally:
        transaction.rollback()  # we only used the transaction for repeatable reads

    # if we've published a warning message due to initial failure(s), publish a resolution message
    # on success. possible this will be delivered without any warning message if there wasn't time
    # for anyone to address the warning before the final execution attempt, but the resolution
    # message may still be useful to have
    if self.request.retries > warn_at_retry_num:
        send_resolution_message(self, est_execution_time, logger)

    return ugettext('Success')


@shared_task(bind=True,
             default_retry_delay=settings.CELERY_INITIAL_ICE_RETRY_DELAY,
             max_retries=settings.CELERY_MAX_ICE_RETRIES)
def link_ice_entry_to_study(self, edd_user_email, strain_pk, study_pk, study_url,
                            old_study_name=None, **kwargs):
    """
    Contacts ICE to link an ICE strain to an EDD study that uses it. In the
    anticipated common case, this is triggered by creation of a single line within the confines
    of an EDD study. However, to avoid (though not entirely prevent) race conditions, EDD updates
    the entire list of study links associated with that strain. As a future improvement, we could
    request that ICE expose atomic add/remove operations in its API, since that would cover the
    most common use cases, leaving only EDD strain creation/edits to update multiple sets of ICE
    links that could still be done as individual add or remove
    calls.config['db'].get('database', 'edd'),
    If the linking process fails, it will be retried until success, until the maximum number of
    retries is reached, or until the inputs are stale due to concurrent user edits via the EDD user
    interface.
    TODO: Note that throughput would be faster if we passed a list of (edd_study_id, ice_strain_id)
    tuples to this method, but that could significantly complicate the retry and/or
    post-task-failure cleanup scenarios...we we should think more about those cases and optimize
    later if needed after initial functionality is working.
    :param edd_user_email: email address of the edd user who the change will be attributed to
    :param strain_pk: primary key of the EDD strain whose link to to the line/study motivated the
    change
    :param study_pk: primary key of the EDD study
    :param study_url: the absolute url of the EDD study
    :param old_study_name: optional previous name of the edd study (if recently renamed).
    TODO: remove old_study_name if ICE behavior unchanged for SYNBIO-1196
    """

    est_execution_time = 0.050  # 50 ms
    uses_exponential_backoff = True

    try:
        # verify that dynamically-configurable time limits are self-consistent, and email
        # administrators if they aren't
        test_time_limit_consistency(self, logger, est_execution_time,
                                    uses_exponential_backoff)

        # Verify that the EDD study->line->strain relationship that motivated this ICE push is still
        #  valid. Since execution of this task may be delayed due to high load, or since the task
        # may have been retried multiple times over the course of a significant time period, it's
        # always possible that EDD data has been changed since the ICE communication task was
        # pushed to Celery. Our initial settings assume that the primary reason for failure of
        # this task is a network partition or short downtime for ICE or EDD, and we automatically
        # retry the inter-system communication to reduce the system administration burden for
        # EDD. However, this creates a situation where ICE may be unreachable for minutes, hours,
        # or days (depending on configuration) while EDD is still running. This significant
        # potential delay creates the possibility for this
        # task to have cached stale EDD data from the time at which it was submitted.

        strain = None
        with transaction.atomic(savepoint=False):  # using=config['db'].get('database', 'edddjango')
            # Note: we query from line since it has the strain and study links

            line = (Line.objects.filter(study__pk=study_pk, strains__pk=strain_pk)
                                .select_related('study__created')
                                .prefetch_related('strains')
                                .first())

            if line is None:
                raise Line.DoesNotExist("No lines found linking strain id %s to study id %d"
                                        % (strain_pk, study_pk))

            # get the associated strain AND raise an exception for  unsupported multiple strain
            # case
            strain = line.strains.get(pk=strain_pk)

        registry_url = strain.registry_url
        registry_id = strain.registry_id

        # as a workaround for SYNBIO-1207, prefer the ICE id extracted from the URL, which is much
        # more likely to be the locally-unique numeric ID visible from the ICE UI. Not certain
        # what recent EDD changes have done to new strain creation, but at least some
        # pre-existing strains will work better with this method.
        # TODO: after removing the workaround, use, ice_strain_id = str(strain.registry_id.), or if
        # using Python 3, maybe strain.registry_id.to_python()
        workaround_strain_entry_id = parse_entry_id(strain.registry_url)
        if workaround_strain_entry_id is None:
            logger.warning("Failed to extract strain ID from URL '%s'", strain.registry_url)
            return ugettext('EDD strain contains invalid URL')

        # finish early if we don't have enough information to find the ICE entry for this strain
        # TODO: raise an exception here once strain data are more dependable (SYNBIO-1350)
        if (not registry_url) or (not registry_id):
            logger.warning("Registry URL and registry ID must both be entered in order to "
                           "create push an EDD  study ID to ICE. Cannot create a link for "
                           "strain with id %s" % strain.name)
            return ugettext('EDD strain contains insufficient data')

        # make a request via ICE's REST API to link the ICE strain to the EDD study that references
        # it
        study = line.study
        ice = IceApi(auth=HmacAuth(key_id=settings.ICE_KEY_ID, username=edd_user_email),
                     verify_ssl_cert=settings.VERIFY_ICE_CERT)
        ice.timeout = settings.ICE_REQUEST_TIMEOUT
        ice.write_enabled = True
        ice.link_entry_to_study(str(workaround_strain_entry_id), study.pk, study_url, study.name,
                                logger=logger, old_study_name=old_study_name)

    # catch Exceptions that indicate the database relationships have changed
    except (Line.DoesNotExist, Strain.DoesNotExist):
        logger.warning("Marking task %s as complete without taking any action since its "
                       "inputs are stale.  One or more relationships that motivated task "
                       "submission been removed." % self.request.id)
        specific_cause = ("No (strain, line, study) relationship was found in the EDD database "
                          "matching the one implied by inputs")
        send_stale_input_warning(self, specific_cause, est_execution_time, uses_exponential_backoff,
                                 logger)

        return _STALE_OR_ERR_INPUT  # succeed after sending the warning

    # if Exception indicates our query was invalid, just fail without retrying -- no way to recover
    except MultipleObjectsReturned as m:
        raise m

    # if Celery is about to forcibly terminate the worker, perform cleanup and then fail the task by
    #  re-raising the Exception
    except SoftTimeLimitExceeded as stl:
        # no cleanup to do in this case... just re-raise the Exception
        raise stl

    except Exception as exc:
        # if conditions are met, send a warning email to administrators so they can take action
        # before the task fails and requires more manual effort to correct
        send_retry_warning_if_applicable(
            self, est_execution_time, settings.CELERY_WARN_AFTER_RETRY_NUM_FOR_ICE, logger
        )

        # compute a reasonable delay and schedule a retry
        retry_delay = compute_exp_retry_delay(self)
        if retry_delay == INVALID_DELAY:
            raise exc

        logger.info("%s: retrying again in %d seconds" % (__name__, retry_delay))
        raise self.retry(exc=exc, countdown=retry_delay)

    # on success, publish a resolution message if a warning message was previously published.
    # possible this will be delivered without any warning message if there wasn't time for anyone to
    # address the warning before the final execution attempt, but the resolution message may
    # still be useful to have
    if self.request.retries > settings.CELERY_WARN_AFTER_RETRY_NUM_FOR_ICE:
        send_resolution_message(self, est_execution_time, logger)

    return ugettext('Link added/updated')


@shared_task(bind=True,
             default_retry_delay=settings.CELERY_INITIAL_ICE_RETRY_DELAY,
             max_retries=settings.CELERY_MAX_ICE_RETRIES)
def unlink_ice_entry_from_study(self, edd_user_email, study_pk, study_url, strain_registry_url,
                                strain_registry_id, **kwargs):
    """
    Removes the link information that associates an ICE part with the specified EDD study.
    :param edd_user_email: the email address of the EDD user that the ICE change will be attributed
     to
    :param study_pk: the primary key of the EDD study (which may have just been deleted)
    :param study_url: the absolute URL of the EDD study whose link(s) should be removed from the
    ICE part
    :param strain_registry_url: the URL of the ICE strain (which may have just been deleted from the
     EDD database)
    :param strain_registry_id: the UUID of the ICE strain (which may have just been deleted from the
     EDD database)
    """

    logger.info("Start unlink_part_from_study()")

    est_execution_time = 0.025
    use_exponential_backoff = True

    try:

        # verify that dynamically-configurable time limits are self-consistent, and email
        # administrators if they aren't
        test_time_limit_consistency(self, logger, est_execution_time,
                                    use_exponential_backoff)

        # verify that no lines exist that link this study to an ICE strain with the provided URL
        with transaction.atomic(savepoint=False):

            lines = (Line.objects.filter(strains__registry_url=strain_registry_url,
                                         study__pk=study_pk)
                     .prefetch_related('strains').select_related('object_ref'))

            # if any lines were found linking the study to the strain, send a warning email to
            # admins, then succeed
            if lines:

                # build a message describing the unexpected line-> study links
                msg = None
                for line in lines:
                    strains_str = ''
                    for strain in line.strains.all():
                        strains_str = ', '.join(('\"%s\" (id=%d)' % (strain.name, strain.id)))
                    line_refs_str = 'Line "%s" (id=%d) references strain(s) {%s}' % (line.name,
                                                                                     line.pk,
                                                                                     strains_str)
                    if msg:
                        msg = ', '.join([msg, line_refs_str])
                    else:
                        msg = line_refs_str
                specific_cause = msg

                # warn administrators that this occurred
                logger.warning("Marking task %s as complete without taking any action since "
                               "its inputs are stale.  One or more relationships that "
                               "motivated task submission have been modified."
                               % self.request.id)
                send_stale_input_warning(self, specific_cause, est_execution_time,
                                         use_exponential_backoff, logger)
                return _STALE_OR_ERR_INPUT  # succeed after sending the warning

        # remove the study link from ICE
        ice = IceApi(auth=HmacAuth(key_id=settings.ICE_KEY_ID, username=edd_user_email),
                     verify_ssl_cert=settings.VERIFY_ICE_CERT)
        ice.timeout = settings.ICE_REQUEST_TIMEOUT
        ice.write_enabled = True
        removed = ice.unlink_entry_from_study(strain_registry_id, study_pk, study_url,
                                              logger)

        # if no link existed to remove, send a warning email, since something may have gone wrong.
        # seems likely that this task should never have been scheduled in the first place
        if not removed:
            subject = make_standard_email_subject(self, 'No link to remove', _WARNING_IMPORTANCE)
            message = ('''Warning: Task %s couldn't remove study link "%s" from part "%s"'''
                       '''because there was no such link to remove. No known error has occurred,'''
                       ''' but this situation shouldn't occur during normal operation.\n\n'''
                       '''You may need to investigate why ICE's state didn't match EDD's in this '''
                       '''instance. Note that  the links are user-editable in ICE, so it's '''
                       '''possible that the link was manually deleted  (verifiable via the GUI).'''
                       % (self.name, study_url, strain_registry_url))
            email_admins(subject, message, logger)
            return ugettext('Non-existent link')

    # if Celery is about to forcibly terminate the worker, perform cleanup and then fail the task by
    #  re-raising the Exception
    except SoftTimeLimitExceeded as stl:
        # no cleanup to do in this case... just re-raise the Exception
        raise stl

    except Exception as exc:
        # if conditions are met, send a warning email to administrators so they can take action
        # before the task fails and requires more manual effort to correct
        send_retry_warning_if_applicable(
            self, est_execution_time, settings.CELERY_WARN_AFTER_RETRY_NUM_FOR_ICE, logger)

        # compute a reasonable delay and schedule a retry
        retry_delay = compute_exp_retry_delay(self)
        logger.info(__name__ + ": retrying again in %d seconds" % retry_delay)
        raise self.retry(exc=exc, countdown=retry_delay)

    # on success, publish a resolution message if a warning message was previously published.
    # possible this will be delivered without any warning message if there wasn't time for anyone to
    # address the warning before the final execution attempt, but the resolution message may
    # still be useful to have
    if self.request.retries > settings.CELERY_WARN_AFTER_RETRY_NUM_FOR_ICE:
        send_resolution_message(self, est_execution_time, logger)

    return ugettext('Link removed')
