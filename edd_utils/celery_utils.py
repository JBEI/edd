"""
A collection of utility functions used to support common Celery task use cases
"""

from __future__ import absolute_import

import traceback
# use smtplib directly to send mail since Celery doesn't seem to expose an API to help with this,
# and it's unclear whether the Django libraries will be available/functional to remote Celery workers
# running outside the context of the EDD Django app (though probably within the context of its codebase)
import smtplib
from email.mime.text import MIMEText
from email.utils import formataddr
# use the same email configuration for custom emails as Celery and Django are using in other parts of EDD.
# if deployed to a separate server, we can just copy over the other config files
from edd.local_settings import *
from edd.celeryconfig import SERVER_EMAIL, CELERY_MIN_WARNING_GRACE_PERIOD_MIN, CELERY_SEND_TASK_ERROR_EMAILS

# import server email address, which is dynamically computed and can't be included in the config file.
# ADMINS has to be reformatted from JSON, so just reference that too

INVALID_DELAY = -1

_WARNING_IMPORTANCE = "Warning"

_FULL_PRETTY_PRINT_EMAILS = True
_PARTIAL_PRETTY_PRINT_EMAILS = False


def time_until_retry(start_retry_num, goal_retry_num, est_execution_time, default_retry_delay):
    """
    Computes estimated time until a goal task retry number, assuming exponential backoff between execution attempts
    :param start_retry_num: the starting number of elapsed retries. Zero implies that we should estimate time starting
    immediately after the first failed execution attempt, but before any retries have been attempted.
    :param goal_retry_num: the exclusive end point for computing time (i.e. compute time until the start of retry number
    X)
    :param default_retry_delay: the default retry delay for the task before exponential backoff has been applied
    :param est_execution_time: the estimated execution time in seconds for each attempt to run the task
    :return: the time in seconds
    Throws ValueError if task.default_retry_delay is <=1, since exponential backoff would result in undesirable
    results for these values (they'd A: be never change -- 1, B: get smaller, or C: alternate sign)
    """

    if start_retry_num >= goal_retry_num:
        raise ValueError("Inconsistent bounds. Inclusive bound start_retry_num can't be >= exclusive bound goal_retry_"
                         "num. %d >= %d" % (start_retry_num, goal_retry_num))

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
    :return: the time in seconds to wait before the next execution attempt, or INVALID_DELAY if the task has exceeded
    the configured number of retries and should be cancelled. Note that when exponential backoff is used for
    Celery tasks, both the number of simultaneously-submitted tasks and the the number of Celery workers often impose a
    practical limit on the number of previously unsuccessful tasks that can wake up and simultaneously request the same
    resource.  In cases where many tasks are sumbitted at the same time and many worker threads can be
    requesting the same resource, consider adding a bounded random jitter to the retry delay to avoid the thundering
    herd problem (https://en.wikipedia.org/wiki/Thundering_herd_problem).

    Throws ValueError if task.default_retry_delay is <=1, since exponential backoff would result in undesirable
    results for these values (they'd A: be never change -- 1, B: get smaller, or C: alternate sign)
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


def email_admins(subject, message, logger):
    """
    Emails administrators on demand from within a running Celery task. This is a custom supplement to the failure
    messages that Celery provides. All exceptions are caught and logged internally in this method since it's unlikely
    that clients can resolve email errors.
    :param subject: the email subject
    :param message: the message body
    """

    # TODO: either remove test code, or make email formatting configurable (ASCII vs UNICODE, HTML vs plaintext).
    # Initial use of this library was surprisingly painful, so only make changes if you have time!

    # extract recipient data from the required Celery dictionary format

    logger.debug("Raw configuration values on following lines:")
    logger.debug("send error emails: " + CELERY_SEND_TASK_ERROR_EMAILS.__str__())
    logger.debug("host: " + EMAIL_HOST)
    logger.debug("port " + EMAIL_PORT.__str__())
    logger.debug("admins: " + ADMINS.__str__())
    logger.debug("sender email: " + SERVER_EMAIL)
    logger.debug("email user = " + EMAIL_HOST_USER)
    logger.debug("email password = " + EMAIL_HOST_PASSWORD)
    logger.debug( "End raw configuration values")

    # return early if task error emails have been silenced
    if not CELERY_SEND_TASK_ERROR_EMAILS:
        logger.warning('NOT sending emails... returning early')
        return

    ###################################################################################################################
    # Format raw values to squeeze them into a working email
    ####################################################################################################################
    formatted_recipients_list = []
    unformatted_recipients_list = []
    for recipient in ADMINS:
        name = recipient[0]
        email_addr = recipient[0]
        formatted = formataddr((name, email_addr))
        formatted_recipients_list.append(formatted)
        unformatted_recipients_list.append(email_addr)

    # convert dictionary supplied by JSON-formatted server.cfg to formats useful to us
    # 1 ) a comma-delimited string in format accepted by GMail smtp server
    # 2 ) list of (name, email) tuples required by Celery,

    # TODO: also converting from the JSON Unicode to ASCII to avoid potential problems with sending email.

    # help prevent problems by forcing usernames & emails to ASCII as listed
    FORCE_ASCII = True

    recipients_str_list = []
    ascii_recipients_tuple_list = []
    for recipient in ADMINS:
        raw_name = recipient[0]
        raw_email = recipient[1]

        formatted_email = ''
        if FORCE_ASCII:
            ascii_name = raw_name.encode('ascii', 'replace')
            ascii_email = raw_email.encode('ascii', 'replace')
            formatted_email = _format_email_address(ascii_name, ascii_email)
            ascii_recipients_tuple_list.append((ascii_name, ascii_email))
        else:
            formatted_email = _format_email_address(raw_name, raw_email)
        recipients_str_list.append(formatted_email)

    sender_name = ' Program'  # non-Celery
    formatted_sender_email = _format_email_address(sender_name, SERVER_EMAIL)
    recipients_str = ", ".join(recipients_str_list)

    logger.debug("Values in use:")
    logger.debug("send error emails: " + CELERY_SEND_TASK_ERROR_EMAILS.__str__())
    logger.debug("host: " + EMAIL_HOST)
    logger.debug("port " + EMAIL_PORT.__str__())
    logger.debug("ADMINS (Celery): " + ascii_recipients_tuple_list.__str__())
    logger.debug("recipients_str (stmp): " + recipients_str)
    logger.debug("sender email: " + formatted_sender_email)
    logger.debug("email user = " + EMAIL_HOST_USER)
    logger.debug("email password = " + EMAIL_HOST_PASSWORD)
    logger.debug("End values in use.")


    # build message headers
    msg = MIMEText(message, 'plain')
    msg['From'] = formatted_sender_email
    msg['To'] = recipients_str
    msg['Subject'] = subject

    logger.debug("Email message on following lines...")
    logger.debug(msg)

    # contact the server and send the email
    server = smtplib.SMTP(EMAIL_HOST, EMAIL_PORT, timeout=EMAIL_TIMEOUT)
    server.set_debuglevel(1)

    try:
        if EMAIL_HOST_USER:
            server.login(EMAIL_HOST_USER, EMAIL_HOST_PASSWORD)
        # .debug("calling sendmail()")
        server.sendmail(formatted_sender_email, recipients_str_list,
                        msg.as_string())
        logger.debug("sendmail() returned")
    except Exception as exc:
        # just log the exception since the email was most likely generated as an indication of error
        logger.exception(exc)
    finally:
        logger.debug("calling quit()")
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
    Constructs an email subject line with standard formatting to include helful context for messages from Custom Celery
    tasks.
    :param task: the task whose execution prompted the message
    :param subject_text: the context-specific text for the email subject
    :param importance: the importance of the email
    :return: the formatted subject text
    """
    return '[' + task.request.hostname + "] " + importance + ": Task " + task.name + " ( " + task.request.id + " ): " \
           + subject_text  # build subject to resemble failure notifications from Celery


def test_time_limit_consistency(task, est_execution_time=0, use_exp_backoff=True):
    """
    Tests time limits for the task parameter and if needed, sends an email to system administrators to inform them that
    a task's time limits are configured inconsistently. Once configuration is set, this check won't add much value, but
    since many limits are configurable in server.cfg, we'll want to check them dynamically and get some indication that
    they don't make sense.
    """

    hard_time_limit = task.time_limit
    soft_time_limit = task.soft_time_limit
    max_retries = task.max_retries

    est_execution_time = 0
    max_execution_time = 0
    if max_retries > 0:
        max_execution_time = time_until_retry(0, task.max_retries, est_execution_time)

    bunk_time_limits = soft_time_limit > hard_time_limit
    bunk_retries = (max_execution_time >= soft_time_limit) or (max_execution_time >= hard_time_limit)

    # if time limits are good, return without attempting to send a warning email
    if not (bunk_time_limits or bunk_retries):
        return

    # build message content (resembles failure notifications from Celery)
    subject = make_standard_email_subject(task, "Inconsistent time limits", _WARNING_IMPORTANCE)
    message = 'Warning: Task ' + task.name + ' ( ' + task.request.id + ') is improperly configured with ' + \
               'inconsistent time limits.\n\n The task will still attempt to run, but may terminate unexpectedly. ' + \
               'Time limits should be configured as follows: max_retry_time (determined by max_retries) < soft_time_' +\
               'limit < time_limit. Actual configured limits are:\n\n' \
              'max_retry_time = %f\n soft_time_limit: %f' % (est_execution_time, task.soft_time_limit)

    # TODO: complete implementation and use this method ot the beginning of each task to help catch configuration errors


def build_task_arg_summary(task):
    return 'Task was called with args:' + task.request.args.__str__() + ' kwargs: ' + task.request.kwargs.__str__()


def build_task_summary_and_traceback(task):
    """
    Builds a string that includes a standard summary of a task's inputs and traceback
    :param task: the celery task
    :return: the task and traceback summary
    """

    formatted_lines = traceback.format_exc().splitlines()
    traceback_str = '\n'.join(formatted_lines)
    return build_task_arg_summary(task) + '\n\nThe contents of the full traceback was:\n\n' + traceback_str


def send_retry_warning_if_applicable(task, est_execution_time, warn_after_retry_num, celery_logger,
                                     skip_moot_warnings=True):
    """
    If conditions for warning administrators have been met, sends an email to notify them of the attempts-do-date
    to execute a task.  This warning allows administrators to act before the task finally fails and requires potentially
    effort-intensive manual intervention. A warning email will be sent if:
    1) task.request.retries == notify_on_retry_num
    2) estimated remaining time before the final retry attempt is sufficiently large that administrators can attempt to
    take action before the task fails.
    Both #2 and the content of the warning email (if sent) will assume that the task uses exponential backoff between
    retries.
    :param task: the task that just failed an execution attempt
    :param est_execution_time: the estimated time in seconds for each execution attempt
    :param warn_after_retry_num: the retry number on which to notify administrators of a failure to complete the task.
    To prevent spam, currently only one warning is supported, though there may be a future use case for multiple warning
    messages. If any error occurs in sending the email, it's logged to the provided logger
    without throwing an Exception.
    :param skip_moot_warnings: true to skip warning messages that will go out within a short window of the final
    execution attempt, when it's unlikely administrators can do anything to resolve the problem before the task finally
    succeeds or fails
    """

    # don't bother sending the warning if the task will fail and generate a separate failure message before anyone
    # can intervene
    if not send_retry_warning(task, est_execution_time, warn_after_retry_num, celery_logger,
                                             skip_moot_warnings):
        return

    # for consistency, build message content  to resemble failure notifications from Celery
    subject = make_standard_email_subject(task, "Multiple failed retries", _WARNING_IMPORTANCE)  # build message content (resembles failure notifications from Celery)

    initial_retry_delay = task.default_retry_delay
    current_retry_num = task.request.retries

    est_elapsed_seconds = 0
    if current_retry_num != 0:
        est_elapsed_seconds = time_until_retry(0, current_retry_num, est_execution_time,
                                                   initial_retry_delay) + est_execution_time

    est_elapsed_time = to_human_relevant_delta(est_elapsed_seconds)
    seconds_to_final_attempt = time_until_retry(current_retry_num, task.max_retries, est_execution_time,
                                                    initial_retry_delay)
    est_remaining_time = to_human_relevant_delta(seconds_to_final_attempt)

    message = 'Warning: Task ' + task.name + ' ( ' + task.request.id + ' ) has failed to complete after ' + (
    task.request.retries + 1).__str__() + \
              ' attempts (~' + est_elapsed_time.__str__() + ').\n\n' + \
              'This task will be automatically retried over the next ' + est_remaining_time + ', with increasing ' \
              'delay between attempts. If no known problem exists that is preventing EDD from communicating with ICE,' \
              ' consider trying to identify and resolve the issue now. If a temporary communication failure is ' \
              'expected, this message is an indication that EDD is functioning as intended! You should get a follow-' \
              'up email when this task finally succeeds or fails.\n\n' \
              + build_task_summary_and_traceback(task)

    email_admins(subject, message, celery_logger)


def send_resolution_message(task, est_execution_time, celery_logger):
    """
    Sends a resolution message informing EDD administrators that a previously problematic task has completed
    successfully after being retried. If any error occurs in sending the email, it's logged to the provided logger
    without throwing an Exception.
    :param task: the task
    """

    # for consistency, build message content  to resemble failure notifications from Celery
    subject = '[' + task.request.hostname + "] Resolved: Task " + task.name + " ( " + task.request.id + ")"

    est_ellapsed_seconds = time_until_retry(0, task.request.retries, est_execution_time,
                                                task.default_retry_delay) + est_execution_time
    est_ellapsed_time = to_human_relevant_delta(est_ellapsed_seconds)

    message = 'Resolved: Task ' + task.name + ' ( ' + task.request.id + ' ) completed successfully after ' + (
    task.request.retries + 1).__str__() + \
              ' attempts (~' + est_ellapsed_time + ').\n\n' + \
              build_task_arg_summary(task) + '\n\n'

    email_admins(subject, message, celery_logger)


SECONDS_PER_HOUR = 3600
HOURS_PER_DAY = 24
SECONDS_PER_MINUTE = 60
SECONDS_PER_MONTH = SECONDS_PER_HOUR * HOURS_PER_DAY * 30
SECONDS_PER_YEAR = SECONDS_PER_MONTH * 12  # NOTE: this causes years to have 360 days, but it's consistent good enough
SECONDS_PER_DAY = SECONDS_PER_HOUR * HOURS_PER_DAY

def to_human_relevant_delta(seconds):
    """
    Converts the input to a human-readable time duration, with only applicable units displayed, and with precision
    limited to a level where humans are likely to take interest based on the largest time increment present in the input.
    Daylight savings time, leap years, etc are not taken into account, months are assumed to have 30 days, and years have
    12 months (=360 days). The minimum time increment displayed for any value is milliseconds. The output of this method
    is intended exclusively for human use, e.g. for displaying task execution time in the GUI and/
    or logs. If you care about precise formatting of the output, this probably isn't the method for you.

    Note that the result is designed to be most useful at lower time increments, and probably needs additional
    formatting (e.g. more liberal and/or configurable use of abbreviations and max. precision) for use at longer time
    intervals. As the output is intended for human use, no guarantee is made that the output will be constant over time,
    though changes can be reasonably expected to make the output more relevant and/or readable.

    NOTE: a Java port of this method also exists in edd-analytics-java. Consider maintaining that implementation
    and its unit tests along with this one.

    :param seconds: time in seconds
    :return:
    """

    def _pluralize(str, quantity):
        if quantity > 1:
            return str + 's'
        return str

    def _append(formatted_duration, part_str):
        if formatted_duration:
            return ' '.join([formatted_duration, part_str])
        else:
            return part_str

    formatted_duration = ''

    # compute years
    if seconds >= SECONDS_PER_YEAR:
        years = seconds // SECONDS_PER_YEAR
        seconds %= SECONDS_PER_YEAR
        years_str = '%d year' % years
        formatted_duration = _append(formatted_duration, years_str)
        formatted_duration = _pluralize(formatted_duration, years)

    # compute months
    if seconds >= SECONDS_PER_MONTH:
        months = seconds // SECONDS_PER_MONTH
        seconds %= SECONDS_PER_MONTH

        months_str = '%d month' % months
        formatted_duration = _append(formatted_duration, months_str)
        formatted_duration = _pluralize(formatted_duration, months)

    # compute days
    if seconds >= SECONDS_PER_DAY:
        days = seconds // SECONDS_PER_DAY
        seconds %= SECONDS_PER_DAY
        days_str = '%d day' % days
        formatted_duration = _append(formatted_duration, days_str)
        formatted_duration = _pluralize(formatted_duration, days)

    # compute hours
    if seconds >= SECONDS_PER_HOUR:
        hours = seconds // SECONDS_PER_HOUR
        seconds %= SECONDS_PER_HOUR
        hours_str = '%d hour' % hours
        formatted_duration = _append(formatted_duration, hours_str)
        formatted_duration = _pluralize(formatted_duration, hours)

    # store results so far so we can detect later whether the time has any increment greater than minutes
    larger_than_minutes = formatted_duration
    minutes = 0

    # compute minutes
    if seconds >= SECONDS_PER_MINUTE:
        minutes = seconds // SECONDS_PER_MINUTE
        seconds %= SECONDS_PER_MINUTE
        minutes_str = '%d minute' % minutes
        formatted_duration = _append(formatted_duration, minutes_str)
        formatted_duration = _pluralize(formatted_duration, minutes)

    # don't compute fractional seconds if humans are unlikely to care
    show_fractional_seconds = (not larger_than_minutes) and (minutes < 10)

    if (seconds > 0) or (not formatted_duration):
        # show ms if no greater time increment exists in the data
        if (seconds < 1) and not formatted_duration:
            formatted_duration = '%d ms' % round(seconds * 1000)
        # otherwise, append either fractional or rounded seconds
        elif show_fractional_seconds:
            decimal_sec_str = '%.2f s' % seconds
            formatted_duration = _append(formatted_duration, decimal_sec_str)
        else:
            int_sec_str = '%d s' % round(seconds)
            formatted_duration = _append(formatted_duration, int_sec_str)

    return formatted_duration


def send_stale_input_warning(task, specific_cause, est_execution_time, uses_exponential_backoff, celery_logger):
    """
    Sends administrators a warning email to EDD administrators indicating that a Celery task has aborted because
    its inputs are stale. If any error occurs in sending the email, it's logged to the provided logger
    without throwing an Exception.
    :param task: the task whose execution prompted sending this message
    :param: specific_cause: a string with a brief phrase indicating the consistency check that failed. If this method
    may be invoked at multiple points in a single task, each should provide a unique string here to aid in failure
    diagnosis.
    :param: est_execution_time estimated execution time in seconds for each run of the task. Used as input to estimating
     overall time from submission to sending this warning.
    :param uses_exponential_backoff: a boolean indicating whether or not successive retries of this task use exponential
    backoff. If True, the email message will include estimates of time since the task was first executed
    :param celery_logger: the logger to use in logging during the send attempt. In most cases this should be Celery's
    logger.
    """

    current_retry_num = task.request.retries

    subject = make_standard_email_subject(task, "Task aborted due to stale or erroneous input",
                                          _WARNING_IMPORTANCE)
    message = "This task has been aborted due to stale or erroneous input.\n\n" + \
        "It's likely that EDD users have made changes since the task was originally submitted, but " + \
        "before it was executed/retried.  This task is now moot, since subsequently submitted tasks " + \
        "will be responsible to push up-to-date data from EDD to ICE. \n\n" + \
        "You may need to investigate why the task received bad input, or was delayed for long enough " + \
        "for this situation to occur. Frequent task self-aborts may indicate a bottleneck in the task " +\
        "execution pipeline. \n\n" \
        "It's also possible that this message indicates a coding error in EDD's Django signal processing " \
        "code. If this is the case, it's likely that a Celery task should have been submitted *after* the database " \
        "transaction committed, but was actually submitted before. Depending on timing (which isn't predictable), " \
        "it's possible that the Celery task's consistency checking detected an inconsistency because the database " \
        "transaction whose results it's attempting to verify have not taken place yet at the time the check is " \
        "performed. Celery tasks should typically only be submitted from post-commit signal handlers.\n\n" \
        "The task's retry number at the time of failure is %d " % current_retry_num

    if uses_exponential_backoff:
        initial_retry_delay = task.default_retry_delay
        time_to_this_retry = est_execution_time
        if current_retry_num > 0:
            time_to_this_retry = time_until_retry(0, current_retry_num, est_execution_time, initial_retry_delay)
        elapsed_time_str = to_human_relevant_delta(time_to_this_retry)
        message += "(estimated to be approximately " + elapsed_time_str + " since its " + \
                      "initial execution attempt). "

    message += "Also note that this message is generated by input consistency checks within each Celery task, so a " \
               "lack of warnings from other tasks may indicate a coding error (an omission) in the silent tasks.\n\n" \
               "The specific failed check that resulted in this notification was: " + specific_cause

    message += '\n\n' + build_task_summary_and_traceback(task)

    email_admins(subject, message, celery_logger)


def send_retry_warning(task, est_execution_time, warn_after_retry_num, celery_logger, skip_moot_warnings=True):
    """
    Tests whether the task should notify administrators of repeated failed executions following the latest failed
    execution attempt. Note that the result is only meaningful if the task uses compute_exp_retry_delay(Task) to
    compute its retry delay.
    :param task: the task being executed
    :param est_execution_time:  estimated execution time for a single run attempt for the task (without retries)
    :param warn_after_retry_num: the retry number after which notification messages should be sent if the task has
    failed repeatedly. To avoid spamming admins, notifications should only be sent on one retry (and probably not the
    first).
    :param skip_moot_warnings: true to skip warning messages that will go out within a short window of the final
    execution attempt, when it's unlikely administrators can do anything to resolve the problem before the task finally
    succeeds or fails
    :return: True if the task should send a warning email, false otherwise
    """

    # if client mis-configured parameters, just print a warning message and return false
    if task.max_retries < warn_after_retry_num:
        celery_logger.warning(
            "Inconsistent input parameters to send_retry_warning_before_failure(): (max_retries = " +
            task.max_retries.__str__() + ") <= (notify_on_retry_num = " + warn_after_retry_num.__str__() +
            "). Retry messages will never be sent.")
        return False

    # Don't bother sending the warning if the task will fail before anyone can
    # help fix it. For now, assume the failure notification is enough if we're within 30 min of the final attempt
    initial_retry_delay = task.default_retry_delay
    current_retry_num = task.request.retries

    is_notification_retry = (current_retry_num == warn_after_retry_num)

    final_retry_num = task.max_retries

    seconds_to_final_attempt = 0
    if current_retry_num != final_retry_num:
        seconds_to_final_attempt = time_until_retry(current_retry_num, final_retry_num, est_execution_time,
                                                    initial_retry_delay)
    warn = is_notification_retry and ((not skip_moot_warnings) or (seconds_to_final_attempt >=
                                      (CELERY_MIN_WARNING_GRACE_PERIOD_MIN * SECONDS_PER_MINUTE)))

    if is_notification_retry and not warn:
            celery_logger.warning("Skipping administrator warning on retry " + warn_after_retry_num +
                                  " since it can't be addressed within the %f minute cutoff" %
                                  CELERY_MIN_WARNING_GRACE_PERIOD_MIN)
    return warn