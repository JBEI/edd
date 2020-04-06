from celery import shared_task
from celery.utils.log import get_task_logger
from django.conf import settings
from django.contrib.auth import get_user_model
from django.core.mail import mail_admins, send_mail
from django.template.loader import get_template
from django.utils.translation import ugettext as _

from edd.notify.backend import RedisBroker
from main import models, query

from . import exceptions
from .table import TableProcessor

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
    try:
        study = models.Study.objects.get(pk=study_id)
        user = User.objects.get(pk=user_id)
        processor = TableProcessor(study, user, import_id)
        notifications = RedisBroker(user)
        try:
            processor.run()
            processor.send_notifications(notifications)
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
