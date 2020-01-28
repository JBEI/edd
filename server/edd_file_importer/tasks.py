# coding: utf-8
import json
import traceback

import arrow
from celery import shared_task
from celery.utils.log import get_task_logger
from django.conf import settings
from django.contrib.auth import get_user_model
from django.core.mail import mail_admins, send_mail
from django.http.request import HttpRequest
from django.template.loader import get_template
from django.urls import reverse
from django.utils.translation import ugettext_lazy as _
from threadlocals.threadlocals import set_thread_variable

from main.importer.table import ImportBroker
from main.query import build_study_url

from .exceptions import (
    CommunicationError,
    EDDImportError,
    IllegalTransitionError,
    MissingParameterError,
    UnexpectedError,
    add_errors,
    raise_errors,
)
from .exceptions.core import err_type_count, first_err_category, track_msgs
from .importer.table import ImportExecutor, ImportParseExecutor, ImportResolver
from .models import Import
from .notify.backend import ImportWsBroker
from .utilities import build_ui_payload, test_required_inputs, update_import_status

logger = get_task_logger(__name__)

_fetch_fields = (
    "category",
    "file",
    "file_format",
    "protocol",
    "study",
    "x_units",
    "y_units",
)


@shared_task
def process_import_file(import_pk, user_pk, requested_status, initial_upload):
    """
    The back end Celery task supporting import Step 2, "Upload", and also single-request
    imports.  Parses and verifies the file format and content, which includes verifying
    identifiers with external databases (e.g. PubChem, UniProt). Then proceeds to additional
    steps if requested / allowed.
    """
    import_ = None
    ws = None
    user = None
    start = arrow.utcnow()
    try:
        # fetch database state and get broker references for the uploaded import
        import_ = (
            Import.objects.filter(pk=import_pk).select_related(*_fetch_fields).get()
        )
        User = get_user_model()
        user = User.objects.get(pk=user_pk)
        ws = ImportWsBroker(user)
        track_msgs(import_.uuid)
        logger.info(f"Processing file for import {import_pk} for {user.username}")

        # look up the right parser, and parse the file, checking for file format errors
        parser = ImportParseExecutor(import_, user, ws)
        parsed = parser.parse()  # raises EDDImportError

        # resolve the file content against EDD and external databases (raises EDDImportError)
        resolver = ImportResolver(import_, parsed, user)
        import_, context = resolver.resolve(initial_upload, requested_status)

        required_inputs = context["required_post_resolve"]
        if required_inputs:
            if not requested_status:
                # if client didn't request to submit, publish a WS notification re: additional
                # required inputs *without* causing the import to fail. Submitted imports will have
                # a notification generated by attempt_status_transition()
                test_required_inputs(import_, context, ws, user)
        else:
            # import READY, so publish a WS notification re: its new status
            msg = _('Your file "{file_name}" is ready to import').format(
                file_name=import_.file.filename
            )
            payload = build_ui_payload(import_)
            ws.notify(msg, tags=["import-status-update"], payload=payload)

        # if client requested a status transition, likely to SUBMITTED, verify
        # that import state is consistent with attempting it, then do. Raises EDDImportError.
        attempt_status_transition(
            import_, context, requested_status, user, ws=ws, run_async=False
        )
    except Exception as e:
        handle_task_exception(import_, e, user, start, ws, True)
    finally:
        set_thread_variable("request", None)
        # clear messages for this import so each workflow is tracked independently
        if import_:
            track_msgs(import_.uuid, False)


@shared_task
def complete_import_task(import_pk, user_pk, ws=None):
    """
    Executes an import that's been successfully parsed/resolved and cached in Redis.  Precondition
    for running this task is that the Import is in SUBMITTED state.

    :param import_pk: the primary key
    :param user_pk: the primary key of the user running the import
    :param ws: the import websocket to use in generating user notifications. This parameter can
        only be used when executing this code synchronously.
    :throws RuntimeError: on any errors occurring while running the import
    """
    start = arrow.utcnow()
    import_ = None
    try:
        # load import data stored in the database
        fetch_fields = ("category", "file", "protocol", "study", "x_units", "y_units")
        import_ = (
            Import.objects.filter(pk=import_pk).select_related(*fetch_fields).get()
        )

        # create a fake request that will get picked up by the update system
        fake_request = HttpRequest()
        fake_request.update_obj = import_.updated
        set_thread_variable("request", fake_request)

        User = get_user_model()
        user = User.objects.get(pk=user_pk)
        broker = ImportBroker()
        ws = ImportWsBroker(user) if not ws else ws

        track_msgs(import_.uuid)

        # execute the import in a transaction
        context = json.loads(broker.load_context(import_.uuid))
        with ImportExecutor(import_, user) as executor:
            # update status to PROCESSING, sending notifications
            logger.info(f"Executing import {import_pk} for {user.username}")
            update_import_status(import_, Import.Status.PROCESSING, user, ws)

            executor.parse_context(context)

            # process the import, one page at a time
            pages = broker.load_pages(import_.uuid)
            for num, page in enumerate(pages, 1):
                parsed_page = json.loads(page)
                item_count = len(parsed_page)
                logger.info(f"Importing page {num} of {item_count} records from cache")
                executor.import_series_data(parsed_page)

            # wrap up
            total_added, total_updated = executor.finish_import()

        warnings_payload = build_ui_payload(import_)
        _send_success_notifications(
            ws,
            import_,
            user,
            start,
            total_added,
            total_updated,
            payload=warnings_payload,
        )
    except Exception as e:
        handle_task_exception(import_, e, user, start, ws, False)
    finally:
        set_thread_variable("request", None)
        # clear messages for this import so each request is tracked independently
        if import_:
            track_msgs(import_.uuid, False)


def _send_success_notifications(
    ws, import_, user, start, total_added, total_updated, payload
):
    if total_added and total_updated:
        summary = _("Added {total_added} values and updated {total_updated}.").format(
            total_added=total_added, total_updated=total_updated
        )
    elif total_updated:
        summary = _("Updated {total_updated} values").format(
            total_updated=total_updated
        )
    else:
        summary = _("Added {total_added} values").format(total_added=total_added)

    study = import_.study
    duration = start.humanize(only_distance=True)
    logger.info(
        f'Completed import to study {study.pk}, "{build_study_url(study.slug)}" '
        f"{duration}"
    )

    update_import_status(
        import_, Import.Status.COMPLETED, user, ws, summary=summary, payload=payload
    )

    # if requested, notify user of completion (e.g. for a large import)
    # TODO: include warning content
    send_import_success_email(import_, user, start, total_added, total_updated, payload)


def handle_task_exception(import_, exception, user, start, import_ws, processing_step):
    """
    Sends user WS and email notifications when an exception propagates to one of the main Celery
    tasks.
    """

    if not import_:
        logger.exception("Import not found")
        return

    # log the exception along with any other errors already reported
    if isinstance(exception, EDDImportError):
        # report the exception.  if it's already been reported, uniqueness guarantee of
        # EDDImportException.details (a set) will prevent duplicate downstream reporting
        add_errors(import_.uuid, exception)
    else:
        # wrap and then report the exception so reports get consistent categorization
        add_errors(
            import_.uuid,
            UnexpectedError(
                details=str(exception),
                resolution=_("EDD Administrators have been notified of the problem"),
            ),
        )

    # build a payload including any errors/warnings aggregated earlier in the process
    import_.status = Import.Status.FAILED
    payload = build_ui_payload(import_)

    # gather some additional detail so it can be displayed in the notification UI to give at
    # least a generic description of what went wrong in case user navigated away
    category_str = first_err_category(import_.uuid)
    notify_menu_postfix = _('The problem was: "{category}"').format(
        category=_(category_str)
    )

    unique_categories = {err["category"] for err in payload["errors"]}
    if len(unique_categories) > 1:
        others = len(unique_categories) - 1
        notify_menu_postfix = "{notify_menu_postfix} (+{others} others)".format(
            notify_menu_postfix=notify_menu_postfix, others=others
        )

    # build a more descriptive error message for the logs
    study_url = (
        reverse("main:overview", kwargs={"slug": import_.study.slug}) if import_ else ""
    )
    file_name = import_.file.filename if import_ else ""
    import_task = "processing" if processing_step else "completing"
    msg = (
        f'Exception {import_task} import upload for file "{file_name}".  '
        f"Study is {study_url}{notify_menu_postfix}"
    )
    logger.exception(msg)

    # save the FAILED status and send WS notifications
    update_import_status(
        import_,
        Import.Status.FAILED,
        user,
        import_ws,
        payload=payload,
        summary=notify_menu_postfix,
    )

    # send user & admin email notifications if requested/relevant.
    # most errors in this step are predicted / user error, so only email admins for
    # unanticipated or non-user-addressable problems
    uuid = import_.uuid
    email_admins = err_type_count(uuid, err_class=CommunicationError) or err_type_count(
        uuid, err_class=UnexpectedError
    )
    send_import_failure_emails(import_, payload, user, start, email_admins)


def attempt_status_transition(
    import_, context, requested_status, user, run_async=False, ws=None
):
    """
    Attempts a status transition to the client-requested status.  Does nothing if no status
    transition is requested, raises an EDDImportError if import status doesn't match the
    requested transition, or schedules a Celery task to execute the import
    :param run_async True to attempt the import asynchronously in a separate Celery task, or False
    to run it synchronously.
    :raises EDDImportError if the import isn't in the correct state to fulfill the requested
    state transition
    :raises celery.exceptions.OperationalError if an error occurred while submitting the Celery
    task to finalize the import
    """
    ws = ImportWsBroker(user) if not ws else ws

    # if client requested a status transition, verify that state is correct to perform it
    submit = _verify_status_transition(import_, context, requested_status, ws, user)

    if not submit:
        return

    if requested_status == Import.Status.SUBMITTED:
        update_import_status(import_, Import.Status.SUBMITTED, user, ws)

        # run the tasks, either synchronously or asynchronously
        if run_async:
            complete_import_task.delay(import_.pk, user.pk)
        else:
            complete_import_task(import_.pk, user.pk, ws)


def _verify_status_transition(import_, context, requested_status, ws, user):
    """
    :return: True if status transition is allowed, False otherwise
    """
    if requested_status is None:
        return False

    # clients may only directly request a status transition to SUBMITTED...and eventually
    # ABORTED.  Reject all other status change requests.
    if requested_status != Import.Status.SUBMITTED:
        msg = _("Clients may not request transition to {status}.").format(
            status=requested_status
        )
        raise_errors(import_.uuid, IllegalTransitionError(details=msg))

    if import_.status not in (
        Import.Status.READY,
        Import.Status.RESOLVED,
        Import.Status.ABORTED,
        Import.Status.FAILED,
    ):
        msg = _(
            "Transition from {start} to {end} is not allowed or not yet supported"
        ).format(start=import_.status, end=Import.Status.SUBMITTED)
        raise_errors(import_.uuid, IllegalTransitionError(details=msg))

    if not import_.file:
        raise_errors(import_.uuid, MissingParameterError(details="File"))

    return test_required_inputs(import_, context, ws, user)


def send_import_success_email(import_, user, start, added, updated, payload):
    """
    Sends an import completion email to notify the user of a successful (large) import
    """

    # if user didn't opt in, do nothing
    if not import_.email_when_complete:
        return

    study = import_.study
    subject_prefix = getattr(settings, "EMAIL_SUBJECT_PREFIX", "")

    # build plaintext message
    duration = start.humanize(only_distance=True)
    context = {
        "added": added,
        "file": import_.file.filename,
        "updated": updated,
        "duration": duration,
        "study": study.name,
        "study_uri": build_study_url(study.slug),
        "warnings": payload["warnings"] if "warnings" in payload else [],
    }

    text_template = get_template("edd_file_importer/email/import_success.txt")
    html_template = get_template("edd_file_importer/email/import_success.html")
    text = text_template.render(context)
    html = html_template.render(context)

    send_mail(
        _('{subject_prefix}Import Complete for "{file}"!').format(
            subject_prefix=subject_prefix, file=import_.file.filename
        ),
        text,
        settings.SERVER_EMAIL,
        [user.email],
        html_message=html,
        fail_silently=False,
    )


# TODO: render errors in email so users can still get specific error feedback after navigating
# away from the UI
def send_import_failure_emails(import_, err_payload, user, start, email_admins=True):
    """
    Sends an import failure email to notify the user of a failed (large) import. Note that
    failure modes exist that aren't covered by this notification but it does capture the most
    likely error path (custom EDD import code).
    :param err_payload: the payload dict sent to the UI as JSON
    """
    # if error occurred earlier in the process, abort
    if not import_:
        return

    study = import_.study
    subject_prefix = getattr(settings, "EMAIL_SUBJECT_PREFIX", "")
    subject = _("{prefix}Import Failed".format(prefix=subject_prefix))
    study_uri = build_study_url(study.slug)
    file_name = import_.file.filename

    context = {
        "import_pk": import_.pk,
        "uuid": import_.uuid,
        "errors": err_payload["errors"],
        "warnings": err_payload["warnings"] if "warnings" in err_payload else [],
        "username": user.username,
        "email": user.email,
        "file": file_name,
        "study": study.name,
        "study_uri": study_uri,
        "admins_notified": email_admins,
        "duration": start.humanize(only_distance=True),
    }
    user_text_template = get_template("edd_file_importer/email/import_failure_user.txt")
    user_html_template = get_template(
        "edd_file_importer/email/import_failure_user.html"
    )
    text = user_text_template.render(context)
    html = user_html_template.render(context)

    # send user-facing email, if requested
    if import_.email_when_complete:
        send_mail(
            subject,
            text,
            settings.SERVER_EMAIL,
            [user.email],
            html_message=html,
            fail_silently=True,
        )

    if not email_admins:
        return

    context["traceback_lines"] = traceback.format_exc().splitlines()

    # build traceback string to include in a bare-bones admin notification email
    # send admin-facing email until we have a logstash server / notification mechanism to
    # replace it
    admin_html_template = get_template(
        "edd_file_importer/email/import_failure_admin.html"
    )
    admin_text_template = get_template(
        "edd_file_importer/email/import_failure_admin.txt"
    )

    html = admin_html_template.render(context)
    text = admin_text_template.render(context)
    mail_admins(_("User import failed"), text, html_message=html, fail_silently=True)
