import json
import traceback

import arrow
from celery import shared_task
from celery.utils.log import get_task_logger
from django.conf import settings
from django.contrib.auth import get_user_model
from django.core.mail import mail_admins, send_mail
from django.db import transaction
from django.http.request import HttpRequest
from django.template.loader import get_template
from django.utils.translation import ugettext as _
from threadlocals.threadlocals import set_thread_variable

from edd.notify.backend import RedisBroker
from main import models, query

from . import exceptions
from .broker import ImportBroker
from .table import TableImport

logger = get_task_logger(__name__)
User = get_user_model()


@shared_task(bind=True)
def import_table_task(self, study_id, user_id, import_id):
    """
    Task runs the code for importing a table of data.

    :param study_id: the primary key of the target study
    :param user_id: the primary key of the user running the import
    :param import_id: the UUID of this import
    :returns: a message to display via the TaskNotification middleware
    :throws RuntimeError: on any errors occurring while running the import
    """
    start = arrow.utcnow()
    study = None
    user = None
    import_params = None
    try:
        # load all the import data into memory from DB/from cache, leaving it in cache for
        # potential later reuse
        study = models.Study.objects.get(pk=study_id)
        user = User.objects.get(pk=user_id)
        notifications = RedisBroker(user)

        # set a fake request object with update info
        fake_request = HttpRequest()

        try:
            # load global context for the import
            broker = ImportBroker()
            import_params = json.loads(broker.load_context(import_id))
            if "update_id" in import_params:
                update_id = import_params.get("update_id")
                fake_request.update_obj = models.Update.objects.get(pk=update_id)
            else:
                fake_request.update_obj = models.Update.load_update(user=user)
            set_thread_variable("request", fake_request)

            # load paged series data
            pages = broker.load_pages(import_id)

            # do the import
            total_added = 0
            total_updated = 0
            importer = TableImport(study, user)
            importer.parse_context(import_params)

            with transaction.atomic(savepoint=False):
                for page in pages:
                    parsed_page = json.loads(page)
                    added, updated = importer.import_series_data(parsed_page)
                    total_added += added
                    total_updated += updated
                importer.finish_import()

            # if requested, notify user of completion (e.g. for a large import)
            if import_params.get("emailWhenComplete", False):
                send_import_completion_email.delay(
                    study_id,
                    user_id,
                    added,
                    updated,
                    start.humanize(only_distance=True),
                )
            message = _(
                "Finished import to {study}: {total_added} added and {total_updated} "
                "updated measurements.".format(
                    study=study.name,
                    total_added=total_added,
                    total_updated=total_updated,
                )
            )
            notifications.notify(message, tags=("legacy-import-message",))
            notifications.mark_read(self.request.id)

        except Exception as e:
            logger.exception("Failure in import_table_task", e)
            duration = start.humanize(only_distance=True)
            trace = "\n\t".join(traceback.format_exc().splitlines())
            send_import_failure_email_admins.delay(
                study_id, user_id, import_id, duration, str(e), trace
            )
            if import_params.get("emailWhenComplete", False):
                send_import_failure_email.delay(study_id, user_id, duration, str(e))
            message = _(
                "Failed import to {study}, EDD encountered this problem: {e}"
            ).format(study=study.name, e=e)
            notifications.notify(message, tags=("legacy-import-message",))
            notifications.mark_read(self.request.id)
            raise
        finally:
            set_thread_variable("request", None)
    except Exception as e:
        logger.exception(f"Failure in import_table_task: {e}")
        raise exceptions.ImportTaskError(
            _(f"Failed import to study {study_id}, EDD encountered this problem: {e}")
        ) from e


@shared_task
def send_import_completion_email(study_id, user_id, added, updated, duration):
    """
    Sends an import completion email to notify the user of a successful import.
    """
    subject_template = get_template("edd/load/mail/complete_subject.txt")
    text_template = get_template("edd/load/mail/complete_body.txt")
    html_template = get_template("edd/load/mail/complete_body.txt")

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
    """
    Sends an import failure email to notify the user of a failed import.
    """
    subject_template = get_template("edd/load/mail/failure_subject.txt")
    text_template = get_template("edd/load/mail/failure_body.txt")
    html_template = get_template("edd/load/mail/failure_body.txt")

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
    """
    Sends an import failure email to notify admins of a failed import.
    """
    subject_template = get_template("edd/load/mail/admin_failure_subject.txt")
    text_template = get_template("edd/load/mail/admin_failure_body.txt")
    html_template = get_template("edd/load/mail/admin_failure_body.txt")

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
