from celery import shared_task
from celery.utils.log import get_task_logger
from django.conf import settings
from django.contrib.auth import get_user_model
from django.core.mail import mail_admins, send_mail
from django.template.loader import get_template

from main import models, query

from .broker import DescribeErrorReport

logger = get_task_logger(__name__)
User = get_user_model()


@shared_task
def send_describe_failed_email_admin(
    request, user_pk, study_uuid, duration, **kwargs
):
    errs_report = DescribeErrorReport(request=request)
    subject_template = get_template("edd/describe/mail/admin_failure_subject.txt")
    html_template = get_template("edd/describe/mail/admin_failure_body.html")
    text_template = get_template("edd/describe/mail/admin_failure_body.html")
    study = models.Study.objects.get(uuid=study_uuid)
    user = User.objects.get(pk=user_pk)
    context = {
        "duration": duration,
        "instance_tag": getattr(settings, "EMAIL_SUBJECT_PREFIX", ""),
        "request_uuid": request,
        "study": study.name,
        "study_uri": query.build_study_url(study.slug),
        "user": user,
        **errs_report.unstash_errors(),
        **kwargs,
    }

    subject = subject_template.render(context).strip()
    text = text_template.render(context)
    html = html_template.render(context)

    mail_admins(subject.strip(), text, html_message=html)


@shared_task
def send_describe_failed_email_user(
    request, user_pk, study_uuid, duration, **kwargs
):
    errs_report = DescribeErrorReport(request=request)
    subject_template = get_template("edd/describe/mail/user_failure_subject.txt")
    html_template = get_template("edd/describe/mail/user_failure_body.html")
    text_template = get_template("edd/describe/mail/user_failure_body.html")
    study = models.Study.objects.get(uuid=study_uuid)
    user = User.objects.get(pk=user_pk)

    context = {
        "duration": duration,
        "instance_tag": getattr(settings, "EMAIL_SUBJECT_PREFIX", ""),
        "study": study.name,
        "study_uri": query.build_study_url(study.slug),
        "user": user,
        **errs_report.unstash_errors(),
        **kwargs,
    }
    subject = subject_template.render(context).strip()
    text = text_template.render(context)
    html = html_template.render(context)

    send_mail(
        subject.strip(), text, settings.SERVER_EMAIL, [user.email], html_message=html,
    )


@shared_task
def send_describe_success_email(
    request, user_pk, study_uuid, lines_created, duration, **kwargs
):
    report = DescribeErrorReport(request=request)
    subject_template = get_template("edd/describe/mail/user_success_subject.txt")
    html_template = get_template("edd/describe/mail/user_success_body.html")
    text_template = get_template("edd/describe/mail/user_success_body.html")
    study = models.Study.objects.get(uuid=study_uuid)
    user = User.objects.get(pk=user_pk)

    context = {
        "duration": duration,
        "instance_tag": getattr(settings, "EMAIL_SUBJECT_PREFIX", ""),
        "lines_created": lines_created,
        "study": study.name,
        "study_uri": query.build_study_url(study.slug),
        "user": user,
        **report.unstash_errors(),
        **kwargs,
    }
    subject = subject_template.render(context).strip()
    text = text_template.render(context)
    html = html_template.render(context)

    send_mail(subject, text, settings.SERVER_EMAIL, [user.email], html_message=html)
