from celery import shared_task
from celery.utils.log import get_task_logger
from django.contrib.auth import get_user_model
from django.contrib.sites.models import Site
from django.template.loader import get_template

logger = get_task_logger(__name__)
User = get_user_model()


@shared_task
def send_approved_account_email(user_pk):
    subject_template = get_template("edd/profile/email/approved_account.subject.txt")
    text_template = get_template("edd/profile/email/approved_account.body.txt")
    site = Site.objects.get_current()
    user = User.profiles.get(pk=user_pk)
    context = {"current_site": site, "user": user}
    subject = subject_template.render(context).strip()
    text = text_template.render(context).strip()
    user.email_user(subject, text)
