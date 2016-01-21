"""
A collection of utility functions used to support common Celery task use cases
"""

from __future__ import absolute_import

import arrow
# use the same email configuration for custom emails as Celery and Django are using in other parts
# of EDD. if deployed to a separate server, we can just copy over the other config files
from django.conf import settings
from edd.celeryconfig import (
    SERVER_EMAIL, CELERY_MIN_WARNING_GRACE_PERIOD_MIN, CELERY_SEND_TASK_ERROR_EMAILS,
    CELERYD_TASK_TIME_LIMIT, CELERYD_TASK_SOFT_TIME_LIMIT
)
from email.mime.text import MIMEText
from email.utils import formataddr
# use smtplib directly to send mail since Celery doesn't seem to expose an API to help with this,
# and it's unclear whether the Django libraries will be available/functional to remote Celery
# workers running outside the context of the EDD Django app (though probably within the context
# of its codebase)
import smtplib
import traceback

INVALID_DELAY = -1

_WARNING_IMPORTANCE = "Warning"

_FULL_PRETTY_PRINT_EMAILS = True
_PARTIAL_PRETTY_PRINT_EMAILS = False


def time_until_retry(start_retry_num, goal_retry_num, est_execution_time, default_retry_delay):
    """
    Computes estimated time until a goal task retry number, assuming exponential backoff between
    execution attempts
    :param start_retry_num: the starting number of elapsed retries. Zero implies that we should
    estimate time starting immediately after the first failed execution attempt, but before any
    retries have been attempted.
    :param goal_retry_num: the exclusive end point for computing time (i.e. compute time until the
    start of retry number X)
    :param default_retry_delay: the default retry delay for the task before exponential backoff has
    been applied
    :param est_execution_time: the estimated execution time in seconds for each attempt to run the
    task
    :return: the time in seconds
    Throws ValueError if task.default_retry_delay is <=1, since exponential backoff would result in
    undesirable results for these values (they'd A: be never change -- 1, B: get smaller,
    or C: alternate sign)
    """

    if start_retry_num >= goal_retry_num:
        raise ValueError("Inconsistent bounds. Inclusive bound start_retry_num can't be >= "
                         "exclusive bound goal_retry_num. %d >= %d"
                         % (start_retry_num, goal_retry_num))

    if default_retry_delay <= 1:
        raise ValueError("Default_retry_delay must be > 1 in order to use exponential backoff")

    expected_exec_time = (goal_retry_num - start_retry_num) * est_execution_time

    expected_wait_time = 0
    for i in range(start_retry_num, goal_retry_num):
        single_wait_time = default_retry_delay ** (i+1)
        expected_wait_time += single_wait_time
    total_expected_duration = expected_exec_time + expected_wait_time
    return total_expected_duration


def compute_exp_retry_delay(task):
    """
    Computes exponential backoff delay for retrying a Task that's experienced one or more Exceptions
    due to an inability to communicate with a remote process.
    :param task: the Celery Task being executed
    :return: the time in seconds to wait before the next execution attempt, or INVALID_DELAY if the
    task has exceeded
    the configured number of retries and should be cancelled. Note that when exponential backoff is
    used for
    Celery tasks, both the number of simultaneously-submitted tasks and the the number of Celery
    workers often impose a
    practical limit on the number of previously unsuccessful tasks that can wake up and
    simultaneously request the same
    resource.  In cases where many tasks are sumbitted at the same time and many worker threads can
    be requesting the same resource, consider adding a bounded random jitter to the retry delay
    to avoid the thundering herd problem (https://en.wikipedia.org/wiki/Thundering_herd_problem).

    Throws ValueError if task.default_retry_delay is <=1, since exponential backoff would result in
    undesirable results for these values (they'd A: be never change -- 1, B: get smaller,
    or C: alternate sign)
    """
    # extract context from the Task
    next_retry_num = task.request.retries + 1
    default_retry_delay = task.default_retry_delay
    _validate_delay(default_retry_delay)

    # compute the delay
    if next_retry_num == task.max_retries:
        return INVALID_DELAY
    return default_retry_delay ** next_retry_num


def _validate_delay(default_retry_delay):
    if default_retry_delay <= 1:
        raise ValueError("default_retry_delay must be > 1 in order to use exponential backoff")


# TODO: either remove test code, or make email formatting configurable (ASCII vs UNICODE,
# HTML vs plaintext).
FORCE_ASCII = True


def email_admins(subject, message, logger):
    """
    Emails administrators on demand from within a running Celery task. This is a custom supplement
    to the failure messages that Celery provides. All exceptions are caught and logged internally in
    this method  since it's unlikely that clients can resolve email errors.
    :param subject: the email subject
    :param message: the message body
    """

    # Initial use of this library was surprisingly painful, so only make changes if you have time!

    # extract recipient data from the required Celery dictionary format
    logger.debug("Raw configuration values on following lines:")
    logger.debug("send error emails: " + CELERY_SEND_TASK_ERROR_EMAILS.__str__())
    logger.debug("host: " + settings.EMAIL_HOST)
    logger.debug("port " + settings.EMAIL_PORT.__str__())
    logger.debug("admins: " + settings.ADMINS.__str__())
    logger.debug("sender email: " + SERVER_EMAIL)
    logger.debug("email user = " + settings.EMAIL_HOST_USER)
    logger.debug("email password = " + settings.EMAIL_HOST_PASSWORD)
    logger.debug("End raw configuration values")

    # return early if task error emails have been silenced
    if not CELERY_SEND_TASK_ERROR_EMAILS:
        logger.warning('NOT sending emails... returning early')
        return

    ################################################################################################
    # Format raw values to squeeze them into a working email
    ################################################################################################
    formatted_recipients_list = []
    unformatted_recipients_list = []
    for recipient in settings.ADMINS:
        formatted = formataddr(recipient)
        formatted_recipients_list.append(formatted)
        email_addr = recipient[1]
        unformatted_recipients_list.append(email_addr)

    # convert dictionary supplied by JSON-formatted server.cfg to formats useful to us
    # 1 ) a comma-delimited string in format accepted by GMail smtp server
    # 2 ) list of (name, email) tuples required by Celery,

    # TODO: also converting from the JSON Unicode to ASCII to avoid potential problems with sending
    # email. help prevent problems by forcing usernames & emails to ASCII as listed

    recipients_str_list = []
    ascii_recipients_tuple_list = []

    if FORCE_ASCII:
        # ascii_email_recipients_tuple_list = [(admin[0].encode('ascii', 'replace'),
        #                                      admin[1].encode('ascii', 'replace'))
        #                                      for admin in ADMINS]

        recipients_str_list = [
            _format_email_address(
                admin[0].encode('ascii', 'replace'),
                admin[1].encode('ascii', 'replace'),
            )
            for admin in settings.ADMINS
        ]
    else:
        recipients_str_list = [
            _format_email_address(admin[0], admin[1]) for admin in settings.ADMINS
        ]

    sender_name = ' Program'  # non-Celery
    formatted_sender_email = _format_email_address(sender_name, SERVER_EMAIL)
    recipients_str = ", ".join(recipients_str_list)

    logger.debug("Values in use:")
    logger.debug("send error emails: " + CELERY_SEND_TASK_ERROR_EMAILS.__str__())
    logger.debug("host: " + settings.EMAIL_HOST)
    logger.debug("port " + settings.EMAIL_PORT.__str__())
    logger.debug("ADMINS (Celery): " + ascii_recipients_tuple_list.__str__())
    logger.debug("recipients_str (stmp): " + recipients_str)
    logger.debug("sender email: " + formatted_sender_email)
    logger.debug("email user = " + settings.EMAIL_HOST_USER)
    logger.debug("email password = " + settings.EMAIL_HOST_PASSWORD)
    logger.debug("End values in use.")

    # build message headers
    msg = MIMEText(message, 'plain')
    msg['From'] = formatted_sender_email
    msg['To'] = recipients_str
    msg['Subject'] = subject

    logger.debug("Email message on following lines...")
    logger.debug(msg)

    # contact the server and send the email
    server = smtplib.SMTP(settings.EMAIL_HOST, settings.EMAIL_PORT, timeout=settings.EMAIL_TIMEOUT)
    server.set_debuglevel(1)

    try:
        # log into the server if credentials are configured
        if settings.EMAIL_HOST_USER:
            server.login(settings.EMAIL_HOST_USER, settings.EMAIL_HOST_PASSWORD)
        server.sendmail(formatted_sender_email, recipients_str_list, msg.as_string())
        logger.debug("sendmail() returned")

    except Exception:
        # just log the exception since the email was most likely generated as an indication of error
        # Note that logger.exception automatically includes the traceback in its log.
        logger.exception('Error emailing administrators. Subject = "%s"' % subject)
    finally:
        logger.debug("calling sendmail's quit()")
        server.quit()

    logger.debug("Done.")


def _format_email_address(name, address):
    if _FULL_PRETTY_PRINT_EMAILS:
        return name + ' <' + address + '>'
    elif _PARTIAL_PRETTY_PRINT_EMAILS:
        return '<' + address + '>'
    return address


def make_standard_email_subject(task, subject_text, importance):
    """
    Constructs an email subject line with standard formatting to include helpful context for
    messages from Custom Celery tasks.
    :param task: the task whose execution prompted the message
    :param subject_text: the context-specific text for the email subject
    :param importance: the importance of the email
    :return: the formatted subject text
    """
    # build subject to resemble failure notifications from Celery
    return '[%(hostname)s] %(importance)s: Task %(task_name)s ( %(task_id)s ): %(subject_text)s' % {
        'hostname': task.request.hostname,
        'importance': importance,
        'task_name': task.name,
        'task_id': task.request.id,
        'subject_text': subject_text,
    }


def test_time_limit_consistency(task, celery_logger, est_execution_time=0, use_exp_backoff=True):
    """
    Tests time limits for the task parameter and if needed, sends an email to system administrators
    to inform them that a task's time limits are configured inconsistently. Once configuration is
    set, this check won't add much value, but since many limits are configurable in server.cfg,
    we'll want to check them dynamically and get some indication that they don't make sense.
    Celery should do most of this work for us, but doesn't seem to have a lot of consistency checks.
    :param est_execution_time: the estimated execution time in seconds for each attempt to run the
    task
    """

    hard_time_limit = task.time_limit if task.time_limit is not None else CELERYD_TASK_TIME_LIMIT
    soft_time_limit = (task.soft_time_limit if task.soft_time_limit is not None
                       else CELERYD_TASK_SOFT_TIME_LIMIT)
    est_final_retry_time = time_until_retry(0, task.max_retries, est_execution_time,
                                            task.default_retry_delay)

    bunk_time_limits = soft_time_limit >= hard_time_limit or est_execution_time >= soft_time_limit

    # if time limits are good, return without attempting to send a warning email
    if not bunk_time_limits:
        return

    # build message content (resembles failure notifications from Celery)
    subject = make_standard_email_subject(task, "Inconsistent time limits", _WARNING_IMPORTANCE)
    message = ('Warning: Task %(task_name)s ( %(task_id)s) is improperly configured with '
               'inconsistent time limits.\n\n '
               'The task will still attempt to run, but may terminate unexpectedly. Time limits '
               'should be configured as follows: exp_run_time << soft_time_limit <  '
               'hard_time_limit. Actual configured values (in seconds) are:\n\n'
               'est_execution_time: %(est_execution_time)d\n'
               'soft_time_limit: %(soft_time_limit)d\n'
               'hard_time_limit: %(hard_time_limit)d\n'
               'max retry period: = %(max_retry_time)f\n ' % {
                   'task_name': task.name,
                   'task_id': task.request.id,
                   'est_execution_time': est_execution_time,
                   'soft_time_limit': soft_time_limit,
                   'hard_time_limit': hard_time_limit,
                   'max_retry_time': est_final_retry_time
               })

    # send the message
    email_admins(subject, message, celery_logger)


def build_task_arg_summary(task):
    return 'Task was called with args: %s kwargs: %s ' % (str(task.request.args),
                                                          str(task.request.kwargs))


def build_task_summary_and_traceback(task):
    """
    Builds a string that includes a standard summary of a task's inputs and traceback
    :param task: the celery task
    :return: the task and traceback summary
    """

    formatted_lines = traceback.format_exc().splitlines()
    traceback_str = '\n'.join(formatted_lines)
    return ('%s\n\nThe contents of the full traceback was:\n\n%s'
            % (build_task_arg_summary(task), traceback_str))


def send_retry_warning_if_applicable(task, est_execution_time, warn_after_retry_num, celery_logger,
                                     skip_moot_warnings=True):
    """
    If conditions for warning administrators have been met, sends an email to notify them of the
    attempts-do-date to execute a task.  This warning allows administrators to act before the
    task finally fails and requires potentially effort-intensive manual intervention. A warning
    email will be sent if:
    1) task.request.retries == notify_on_retry_num
    2) estimated remaining time before the final retry attempt is sufficiently large that
    administrators can attempt to take action before the task fails.
    Both #2 and the content of the warning email (if sent) will assume that the task uses
    exponential backoff between retries.
    :param task: the task that just failed an execution attempt
    :param est_execution_time: the estimated time in seconds for each execution attempt
    :param warn_after_retry_num: the retry number on which to notify administrators of a failure to
    complete the task.
    To prevent spam, currently only one warning is supported, though there may be a future use case
    for multiple warning messages. If any error occurs in sending the email, it's logged to the
    provided logger without throwing an Exception.
    :param skip_moot_warnings: true to skip warning messages that will go out within a short window
    of the final execution attempt, when it's unlikely administrators can do anything to resolve
    the problem before the task finally succeeds or fails
    """

    # don't bother sending the warning if the task will fail and generate a separate failure message
    # before anyone can intervene
    if not send_retry_warning(task, est_execution_time, warn_after_retry_num, celery_logger,
                              skip_moot_warnings):
        return

    # for consistency, build message content  to resemble failure notifications from Celery
    subject = make_standard_email_subject(task, "Multiple failed retries", _WARNING_IMPORTANCE)

    initial_retry_delay = task.default_retry_delay
    current_retry_num = task.request.retries

    est_elapsed_seconds = 0
    if current_retry_num != 0:
        est_elapsed_seconds = time_until_retry(0, current_retry_num, est_execution_time,
                                               initial_retry_delay) + est_execution_time

    est_time_since_initial_attempt = arrow.utcnow().replace(seconds=-est_elapsed_seconds).humanize()
    seconds_to_final_attempt = time_until_retry(current_retry_num, task.max_retries,
                                                est_execution_time, initial_retry_delay)
    est_time_to_final_attempt = arrow.utcnow().replace(seconds=+seconds_to_final_attempt).humanize()

    message = ('Warning: Task %(task_name)s (%(task_id)s) has failed to complete after '
               '%(attempt_count)s attempts. The first attempt is estimated to have been '
               'roughly %(first_attempt_delta)s.\n\n'
               'This task will be automatically retried until the final attempt %('
               'final_attempt_delta)s, with increasing delay between attempts. If no known problem '
               'exists that is '
               'preventing EDD from  communicating with ICE, consider trying to identify and '
               'resolve the issue now. If  a temporary communication failure is expected, '
               'this message is an indication that EDD is functioning as intended! You should get '
               'a follow-up email when this task finally succeeds or fails.\n\n'
               '%(summary_and_traceback)s' % {
                   'task_name': task.name,
                   'task_id': task.request.id,
                   'attempt_count': (task.request.retries + 1),
                   'first_attempt_delta': est_time_since_initial_attempt,
                   'final_attempt_delta': est_time_to_final_attempt,
                   'summary_and_traceback': build_task_summary_and_traceback(task)})
    email_admins(subject, message, celery_logger)


def send_resolution_message(task, est_execution_time, celery_logger):
    """
    Sends a resolution message informing EDD administrators that a previously problematic task has
    completed successfully after being retried. If any error occurs in sending the email, it's
    logged to the provided logger without throwing an Exception.
    :param task: the task
    """

    # for consistency, build message content  to resemble failure notifications from Celery
    subject = '[%s] Resolved: Task %s (%s)' % (task.request.hostname, task.name, task.request.id)

    est_elapsed_seconds = time_until_retry(0, task.request.retries, est_execution_time,
                                           task.default_retry_delay) + est_execution_time
    est_start_time_str = arrow.utcnow().replace(seconds=-est_elapsed_seconds).humanize()

    message = ('Resolved: Task %s ( %s ) completed successfully after %d attempts. The initial '
               'attempt was roughly %s\n\n' +
               build_task_arg_summary(task) + '\n\n') % (task.name, task.request.id,
                                                         task.request.retries + 1,
                                                         est_start_time_str)

    email_admins(subject, message, celery_logger)


SECONDS_PER_HOUR = 3600
HOURS_PER_DAY = 24
SECONDS_PER_MINUTE = 60
SECONDS_PER_MONTH = SECONDS_PER_HOUR * HOURS_PER_DAY * 30
SECONDS_PER_YEAR = SECONDS_PER_MONTH * 12  # causes years to have 360 days, but consistent/good
# enough
SECONDS_PER_DAY = SECONDS_PER_HOUR * HOURS_PER_DAY


def send_stale_input_warning(task, specific_cause, est_execution_time, uses_exponential_backoff,
                             celery_logger):
    """
    Sends administrators a warning email to EDD administrators indicating that a Celery task has
    aborted because its inputs are stale. If any error occurs in sending the email, it's logged
    to the provided logger without throwing an Exception.
    :param task: the task whose execution
    prompted sending this message
    :param: specific_cause: a string with a brief phrase indicating
    the consistency check that failed. If this method may be invoked at multiple points in a
    single task, each should provide a unique string here to aid in failure diagnosis.
    :param: est_execution_time estimated execution time in seconds for each run of the task. Used as
    input to estimating overall time from submission to sending this warning.
    :param uses_exponential_backoff: a boolean indicating whether or not successive retries of
    this task use exponential backoff. If True, the email message will include estimates of time
    since the task was first executed
    :param celery_logger: the logger to use in logging during the send attempt. In most cases
    this should be Celery's logger.
    """

    current_retry_num = task.request.retries

    subject = make_standard_email_subject(task, "Task aborted due to stale or erroneous input",
                                          _WARNING_IMPORTANCE)
    message = ("This task has been aborted due to stale or erroneous input.\n\n"
               "It's likely that EDD users have made changes since the task was originally "
               "submitted, but before it was executed/retried.  This task is now moot, since "
               "subsequently submitted tasks will be responsible to push up-to-date data from EDD "
               "to ICE. \n\n"
               "You may need to investigate why the task received bad input, or was delayed for "
               "long enough for this situation to occur. Frequent task self-aborts may indicate a "
               "bottleneck in the task execution pipeline. \n\n"
               "It's also possible that this message indicates a coding error in EDD's Django "
               "signal processing code. If this is the case, it's likely that a Celery task should "
               "have been submitted *after* the database transaction committed, but was actually "
               "submitted before. Depending on timing (which isn't predictable), it's possible that"
               " the Celery task's consistency checking detected an inconsistency because the "
               "database transaction whose results it's attempting to verify have not taken place "
               "yet at the time the check is performed. Celery tasks should typically only be "
               "submitted from post-commit signal handlers.\n\n"
               "The task's retry number at the time of failure is %d "
               % current_retry_num)

    if uses_exponential_backoff:
        initial_retry_delay = task.default_retry_delay
        time_to_this_retry = est_execution_time
        if current_retry_num > 0:
            time_to_this_retry = time_until_retry(0, current_retry_num, est_execution_time,
                                                  initial_retry_delay)
        initial_attempt_delta = arrow.utcnow().replace(seconds=-time_to_this_retry).humanize()
        message += ("(initial execution attpmet is estimated to be approximately %s). "
                    % initial_attempt_delta)

    message += ("Also note that this message is generated by input consistency checks within each "
                "Celery task, so a lack of warnings from other tasks may indicate a coding error "
                "(an omission) in the silent tasks.\n\nThe specific failed check that resulted in "
                "this notification was: %s" % specific_cause)

    message += '\n\n' + build_task_summary_and_traceback(task)

    email_admins(subject, message, celery_logger)


def send_retry_warning(task, est_execution_time, warn_after_retry_num, celery_logger,
                       skip_moot_warnings=True):
    """
    Tests whether the task should notify administrators of repeated failed executions following the
    latest failed execution attempt. Note that the result is only meaningful if the task uses
    compute_exp_retry_delay(Task) to compute its retry delay.
    :param task: the task being executed
    :param est_execution_time:  estimated execution time for a single run attempt for the task
    (without retries)
    :param warn_after_retry_num: the retry number after which notification messages should be sent
    if the task has
    failed repeatedly. To avoid spamming admins, notifications should only be sent on one retry
    (and probably not the first).
    :param skip_moot_warnings: true to skip warning messages that will go out within a short
    window of the final execution attempt, when it's unlikely administrators can do anything to
    resolve the problem before the task finally succeeds or fails
    :return: True if the task should send a warning email, false otherwise
    """

    # if client mis-configured parameters, just print a warning message and return false
    if task.max_retries < warn_after_retry_num:
        celery_logger.warning(
            "Inconsistent input parameters to send_retry_warning_before_failure(): "
            "(max_retries = %d) <= (notify_on_retry_num = %d). Retry messages will never be sent."
            % (task.max_retries, warn_after_retry_num))
        return False

    # Don't bother sending the warning if the task will fail before anyone can help fix it. For
    # now, assume the failure notification is enough if we're within 30 min of the final attempt
    initial_retry_delay = task.default_retry_delay
    current_retry_num = task.request.retries

    is_notification_retry = (current_retry_num == warn_after_retry_num)

    final_retry_num = task.max_retries

    seconds_to_final_attempt = 0
    if current_retry_num != final_retry_num:
        seconds_to_final_attempt = time_until_retry(current_retry_num, final_retry_num,
                                                    est_execution_time, initial_retry_delay)
    warn = is_notification_retry and ((not skip_moot_warnings) or (seconds_to_final_attempt >=
                                      (CELERY_MIN_WARNING_GRACE_PERIOD_MIN * SECONDS_PER_MINUTE)))

    if is_notification_retry and not warn:
            celery_logger.warning("Skipping administrator warning on retry %d since it can't be "
                                  "addressed within the %f minute cutoff"
                                  % (warn_after_retry_num, CELERY_MIN_WARNING_GRACE_PERIOD_MIN))
    return warn
