# coding: utf-8
import logging
from typing import Any, Dict, List

import django.core.mail as mail
from django.conf import settings
from django.template.loader import get_template
from django.urls import reverse
from django.utils.translation import ugettext_lazy as _

from edd.notify.backend import RedisBroker as NotificationWsBroker
from main.models import (
    GeneIdentifier,
    MeasurementType,
    Metabolite,
    Phosphor,
    ProteinIdentifier,
)
from main.query import get_absolute_url

from .exceptions import (
    CompartmentNotFoundError,
    DuplicationWarning,
    MissingAssayTimeError,
    OverwriteWarning,
    TimeUnresolvableError,
    UnitsNotProvidedError,
    add_errors,
    warnings,
)
from .exceptions.core import build_messages_summary, err_type_count, warn_type_count
from .models import Import
from .notify.backend import ImportWsBroker

logger = logging.getLogger(__name__)


MTYPE_GROUP_TO_CLASS = {
    MeasurementType.Group.GENERIC: MeasurementType,
    MeasurementType.Group.METABOLITE: Metabolite,
    MeasurementType.Group.GENEID: GeneIdentifier,
    MeasurementType.Group.PROTEINID: ProteinIdentifier,
    MeasurementType.Group.PHOSPHOR: Phosphor,
}


def build_ui_payload(import_: Import) -> Dict[str, List[Any]]:
    """
    Builds a dict to return to the browser as a JSON Websocket message payload.
    """

    payload: Dict[str, List[Any]] = {
        "pk": import_.pk,
        "uuid": import_.uuid,
        "status": import_.status,
    }
    msg_payload: Dict[str, List[Any]] = build_messages_summary(import_.uuid)
    payload.update(msg_payload)
    return payload


def test_required_inputs(
    import_: Import, context: Dict[str, Any], ws: ImportWsBroker, user
):
    """
    Tests required inputs determined during import file processing and sends error / warning
    websocket and email messages based on context.  Informs the client of missing required inputs
    that are needed.
    :returns: True if there are no additional required inputs, False otherwise
    """

    # test provided inputs against the ones required to supplement file content after the resolve
    # step
    required_inputs = [
        item
        for item in context.get("required_post_resolve", [])
        if not getattr(import_, item, None)
    ]

    if not required_inputs:
        return True

    logger.info(f"Required post resolve: {required_inputs}")
    logger.info(
        f"Import config: allow_overwrite={import_.allow_overwrite}, "
        f"allow_duplication={import_.allow_duplication}, "
        f"email_when_complete={import_.email_when_complete}"
    )

    # explode the required inputs into user-facing error / warning messages to deliver to the UI.
    # any required input that there isn't a workflow for setting is treated as an error.
    if "compartment" in required_inputs:
        add_errors(import_.uuid, CompartmentNotFoundError())
    if "time" in required_inputs:
        if context["matched_assays"]:
            # send MissingAssayTimeError since we don't have state available at this point to know
            # which assays specifically were missing times.  Potentially less precise error msg
            # here should only occur during REST API use across multiple requests...unlikely at
            # this point and not fully supported yet
            add_errors(import_.uuid, MissingAssayTimeError())
        else:
            add_errors(import_.uuid, TimeUnresolvableError())
    else:
        conflicted_vals = context["conflicted_vals"]
        if conflicted_vals:
            if context["matched_assays"] and "allow_overwrite" in required_inputs:
                msg = _(
                    "{count} values will be overwritten".format(count=conflicted_vals)
                )

                warnings(import_.uuid, OverwriteWarning(details=[msg]))
            elif "allow_duplication" in required_inputs:
                msg = _("{count} values will be duplicated").format(
                    count=conflicted_vals
                )
                warnings(import_.uuid, DuplicationWarning(details=msg))

    if "units" in required_inputs:
        add_errors(import_.uuid, UnitsNotProvidedError())

    payload = build_ui_payload(import_)
    payload["required_inputs"] = required_inputs
    warnings_only = warn_type_count(import_.uuid) and not err_type_count(import_.uuid)
    ws_notify_required_input(import_, ws, payload, warnings_only, required_inputs)

    # ignore any submit attempts if the user needs to acknowledge warnings first
    if warnings_only and import_.email_when_complete:
        _send_import_paused_email(import_, payload, user)

    return False


def ws_notify_required_input(
    import_: Import,
    ws: ImportWsBroker,
    payload: Dict[str, Any],
    warnings_only: bool,
    required_inputs: List[str],
):

    file_name = import_.file.filename
    if warnings_only:
        msg = _(
            "Acknowledge warnings before your import can continue for file "
            '"{file_name}"'
        ).format(file_name=file_name)
    else:
        vals = map(lambda item: '"{item}"'.format(item=item), required_inputs)
        vals = ", ".join(vals)
        logger.debug(f"missing_inputs: {vals}")
        msg = _(
            "Import may not be submitted without providing required values {vals}"
        ).format(vals=vals)
    ws.notify(msg, tags=["import-status-update"], payload=payload)


def _send_import_paused_email(import_: Import, payload, user):
    """
    Sends an email to notify the user of a paused import.
    :param payload: the payload dict sent to the UI as JSON
    """

    study = import_.study
    subject_prefix = getattr(settings, "EMAIL_SUBJECT_PREFIX", "")
    subject = _("{prefix}Import Paused".format(prefix=subject_prefix))
    rel_study_url = reverse("main:detail", kwargs={"slug": study.slug})

    context = {
        "import_pk": import_.pk,
        "uuid": import_.uuid,
        "errors": payload["errors"] if "errors" in payload else {},
        "warnings": payload["warnings"] if "warnings" in payload else {},
        "username": user.username,
        "email": user.email,
        "file": import_.file.filename,
        "study": study.name,
        "study_uri": get_absolute_url(rel_study_url),
    }
    user_text_template = get_template("edd_file_importer/email/import_paused_user.txt")
    user_html_template = get_template("edd_file_importer/email/import_paused_user.html")
    text = user_text_template.render(context)
    html = user_html_template.render(context)

    # send user-facing email
    mail.send_mail(
        subject,
        text,
        settings.SERVER_EMAIL,
        [user.email],
        html_message=html,
        fail_silently=True,
    )


def update_import_status(
    import_: Import,
    status: str,
    user,
    import_ws: ImportWsBroker,
    summary: str = "",
    payload: Dict[str, Any] = None,
    notify_ws: NotificationWsBroker = None,
):
    """
        Updates an import's status and sends related user notifications.  To avoid extra database
        queries, import status is only updated if the "status" parameter is different than the
        status set in the import.  Notifications are always sent.
    """
    logger.info(
        f"Updating import status to {status} for {import_.uuid}, user={user.username}"
    )

    # update the import status, unless it was already set by surrounding code
    if status != import_.status:
        import_.status = status
        import_.save()

    # build and send an async notification of the status update
    file_name = truncate_filename(import_) if import_.file else "[undefined]"
    status_str = (
        "is {status}".format(status=status.lower())
        if status != Import.Status.FAILED
        else str(status.lower())
    )
    if not summary:
        msg = _('Your import for file "{file_name}" {status_str}').format(
            file_name=file_name, status_str=status_str
        )
    else:
        msg = _('Your import for file "{file_name}" {status_str}. {summary}').format(
            file_name=file_name, status_str=status_str, summary=summary
        )
    payload = {} if not payload else payload
    payload.update({"status": status, "uuid": import_.uuid, "pk": import_.pk})

    # always notify the import page via its socket so we get guaranteed delivery order
    import_ws.notify(msg, tags=["import-status-update"], payload=payload)

    # duplicate user notifications for final disposition of the import to the notification menu
    # so they're visible if user has navigated away from the import page.  Import page will silence
    # them if visible / active
    final_disposition = (Import.Status.COMPLETED, Import.Status.FAILED)
    if status in final_disposition:
        if notify_ws is None:
            notify_ws = NotificationWsBroker(user)
        notify_ws.notify(msg, tags=["import-status-update"], payload=payload)


def truncate_filename(import_):
    cutoff = 35
    name = import_.file.filename
    if len(name) > cutoff:
        return f"{name[: cutoff - 3]}..."
    return name
