from celery import shared_task
from celery.utils.log import get_task_logger
from django.conf import settings
from django.contrib.auth import get_user_model
from django.core.mail import send_mail
from django.db import transaction
from django.template.loader import get_template

from main import models, query
from main.signals import study_imported

from . import reporting
from .broker import ImportBroker, LoadRequest
from .executor import DispatchHelper, ImportExecutor
from .models import Category
from .resolver import ImportResolver, TypeResolver

logger = get_task_logger(__name__)
User = get_user_model()


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
    request_uuid,
    user_id,
    layout_id,
    category_id,
    target=None,
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
