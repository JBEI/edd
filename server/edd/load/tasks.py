from celery import shared_task
from celery.utils.log import get_task_logger
from django.conf import settings
from django.contrib.auth import get_user_model
from django.core.mail import mail_admins, send_mail
from django.db import transaction
from django.template.loader import get_template
from django.utils.translation import gettext as _

from edd.notify.backend import RedisBroker
from main import models, query
from main.signals import study_imported

from . import exceptions, reporting
from .broker import ImportBroker, LoadRequest
from .executor import DispatchHelper, ImportExecutor
from .models import Category
from .resolver import ImportResolver, TypeResolver
from .table import TableProcessor

logger = get_task_logger(__name__)
User = get_user_model()


@shared_task
def import_table_task(study_id, user_id, import_id):
    """
    Task runs the code for importing a table of data.

    :param study_id: the primary key of the target study
    :param user_id: the primary key of the user running the import
    :param import_id: the UUID of this import
    :returns: a message to display via the TaskNotification middleware
    :throws RuntimeError: on any errors occurring while running the import
    """
    try:
        study = models.Study.objects.get(pk=study_id)
        user = User.objects.get(pk=user_id)
        processor = TableProcessor(study, user, import_id)
        notifications = RedisBroker(user)
        try:
            processor.run()
            processor.send_notifications(notifications)
            # legacy import technically supports importing using multiple protocols
            # if any number other than one is used, just leave protocol blank/empty
            study_imported.send(
                sender=TableProcessor,
                study=study,
                user=user,
                protocol=None
                if len(processor.protocols) != 1
                else processor.protocols[0],
                count=len(processor.lines),
            )
        except Exception as e:
            logger.exception("Failure in import_table_task", e)
            processor.send_errors(notifications, e)
            raise
    except Exception as e:
        logger.exception(f"Failure in import_table_task: {e}")
        raise exceptions.ImportTaskError(
            _(f"Failed import to study {study_id}, EDD encountered this problem: {e}")
        ) from e


@shared_task
def send_import_completion_email(study_id, user_id, added, updated, duration):
    """Sends an import completion email to notify the user of a successful import."""
    subject_template = get_template("edd/load/mail/complete_subject.txt")
    text_template = get_template("edd/load/mail/complete_body.txt")
    html_template = get_template("edd/load/mail/complete_body.html")

    study = models.Study.objects.get(pk=study_id)
    user = User.objects.get(pk=user_id)
    context = {
        "added": added,
        "duration": duration,
        "instance_tag": getattr(settings, "EMAIL_SUBJECT_PREFIX", ""),
        "study": study.name,
        "study_uri": query.build_study_url(study.slug),
        "updated": updated,
    }

    subject = subject_template.render(context)
    text = text_template.render(context)
    html = html_template.render(context)

    send_mail(
        subject.strip(), text, settings.SERVER_EMAIL, [user.email], html_message=html
    )


@shared_task
def send_import_failure_email(study_id, user_id, duration, message):
    """Sends an import failure email to notify the user of a failed import."""
    subject_template = get_template("edd/load/mail/failure_subject.txt")
    text_template = get_template("edd/load/mail/failure_body.txt")
    html_template = get_template("edd/load/mail/failure_body.html")

    study = models.Study.objects.get(pk=study_id)
    user = User.objects.get(pk=user_id)
    context = {
        "duration": duration,
        "instance_tag": getattr(settings, "EMAIL_SUBJECT_PREFIX", ""),
        "message": message,
        "study": study.name,
        "study_uri": query.build_study_url(study.slug),
    }

    subject = subject_template.render(context)
    text = text_template.render(context)
    html = html_template.render(context)

    send_mail(
        subject.strip(), text, settings.SERVER_EMAIL, [user.email], html_message=html
    )


@shared_task
def send_import_failure_email_admins(
    study_id, user_id, import_id, duration, message, trace
):
    """Sends an import failure email to notify admins of a failed import."""
    subject_template = get_template("edd/load/mail/admin_failure_subject.txt")
    text_template = get_template("edd/load/mail/admin_failure_body.txt")
    html_template = get_template("edd/load/mail/admin_failure_body.html")

    study = models.Study.objects.get(pk=study_id)
    user = User.objects.get(pk=user_id)
    context = {
        "duration": duration,
        "import_id": import_id,
        "instance_tag": getattr(settings, "EMAIL_SUBJECT_PREFIX", ""),
        "message": message,
        "study": study.name,
        "study_uri": query.build_study_url(study.slug),
        "trace": trace,
        "user": user.email,
    }

    subject = subject_template.render(context)
    text = text_template.render(context)
    html = html_template.render(context)

    mail_admins(subject.strip(), text, html_message=html)


def _send_wizard_email(request_uuid, user_id, template_base, **kwargs):
    load = LoadRequest.fetch(request_uuid)
    user = User.objects.get(pk=user_id)
    if load.email_when_complete:
        subject_template = get_template(f"{template_base}_subject.txt")
        text_template = get_template(f"{template_base}_body.txt")
        html_template = get_template(f"{template_base}_body.html")
        study = load.study
        context = {
            "instance_tag": getattr(settings, "EMAIL_SUBJECT_PREFIX", ""),
            "study": study.name,
            "study_uri": query.build_study_url(study.slug),
            **load.unstash_errors(),
            **kwargs,
        }

        subject = subject_template.render(context)
        text = text_template.render(context)
        html = html_template.render(context)

        send_mail(
            subject.strip(),
            text,
            settings.SERVER_EMAIL,
            [user.email],
            html_message=html,
        )


@shared_task
def send_wizard_failed_email(request_uuid, user_id):
    _send_wizard_email(request_uuid, user_id, "edd/load/mail/wizard_failed")


@shared_task
def send_wizard_paused_email(request_uuid, user_id):
    _send_wizard_email(request_uuid, user_id, "edd/load/mail/wizard_paused")


@shared_task
def send_wizard_success_email(request_uuid, user_id, added, updated):
    _send_wizard_email(
        request_uuid,
        user_id,
        "edd/load/mail/wizard_success",
        added=added,
        updated=updated,
    )


@shared_task
def wizard_execute_loading(request_uuid, user_id):
    load = LoadRequest.fetch(request_uuid)
    user = User.objects.get(pk=user_id)
    dispatch = DispatchHelper(load, user)
    with reporting.tracker(request_uuid):
        broker = ImportBroker()
        try:
            with transaction.atomic(savepoint=True), models.Update.fake_request(
                user, "!edd.load.tasks.wizard_execute_loading"
            ):
                executor = ImportExecutor(load, user)
                executor.start()
                context = broker.json_context(request_uuid)
                executor.parse_context(context)
                for n, page in enumerate(broker.json_pages(request_uuid), 1):
                    logger.debug(f"Importing page {n} for {request_uuid}")
                    executor.import_series_data(page)
                added, updated = executor.finish_import()
            load.transition(LoadRequest.Status.COMPLETED, raise_errors=True)
            dispatch.wizard_complete(added=added, updated=updated)
            send_wizard_success_email.delay(request_uuid, user_id, added, updated)
            # The loading / import process does not directly deal with lines;
            # but, the metrics care about number of lines, so can try to query after.
            # All the changing Assays should share a single Update record.
            # So: query the study, then query the Lines that share same updated field.
            study = load.study
            lines_qs = models.Line.objects.filter(
                study=study,
                assay__protocol=load.protocol,
                assay__updated_id=study.updated_id,
            )
            study_imported.send(
                sender=ImportExecutor,
                study=load.study,
                user=user,
                protocol=load.protocol,
                count=lines_qs.distinct().count(),
            )
        except Exception:
            load.transition(LoadRequest.Status.FAILED)
            send_wizard_failed_email.delay(request_uuid, user_id)
            dispatch.wizard_problem()


@shared_task
def wizard_parse_and_resolve(
    request_uuid, user_id, layout_id, category_id, target=None
):
    load = LoadRequest.fetch(request_uuid)
    user = User.objects.get(pk=user_id)
    dispatch = DispatchHelper(load, user)
    with reporting.tracker(request_uuid):
        try:
            category = Category.objects.get(pk=category_id)
            type_resolver = TypeResolver(user, category)
            parsed = load.parse_with_layout(layout_id)
            resolver = ImportResolver(load, parsed)
            resolver.resolve(type_resolver)
            if target is not None:
                reporting.raise_errors(request_uuid)
                wizard_execute_loading.delay(request_uuid, user_id)
            elif load.status == LoadRequest.Status.READY:
                dispatch.wizard_ready()
            else:
                dispatch.wizard_needs_input()
                load.stash_errors()
                send_wizard_paused_email.delay(request_uuid, user_id)
        except Exception:
            dispatch.wizard_problem()
            send_wizard_failed_email.delay(request_uuid, user_id)
            raise
