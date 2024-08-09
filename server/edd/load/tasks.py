from celery import shared_task
from celery.utils.log import get_task_logger
from django.conf import settings
from django.contrib.auth import get_user_model
from django.contrib.sites.models import Site
from django.core.mail import send_mail
from django.template.loader import get_template

from main import models, query

from .broker import LoadRequest
from .forms import ResolveTokensForm
from .serializers import RecordsSerializer, SessionSerializer

logger = get_task_logger(__name__)
User = get_user_model()


@shared_task
def send_bulk_abuse_email(user_pk, study_uuid):
    if nag_targets := getattr(settings, "EDD_IMPORT_BULK_ABUSE_CONTACTS", []):
        subject_template = get_template("edd/load/mail/bulk_abuse_subject.txt")
        text_template = get_template("edd/load/mail/bulk_abuse_body.txt")
        study = models.Study.objects.get(uuid=study_uuid)
        user = User.objects.get(pk=user_pk)

        context = {
            "current_site": Site.objects.get_current(),
            "instance_tag": getattr(settings, "EMAIL_SUBJECT_PREFIX", ""),
            "study_name": study.name,
            "study_uri": query.build_study_url(study.slug),
            "user": user,
        }
        subject = subject_template.render(context).strip()
        text = text_template.render(context)

        send_mail(subject, text, settings.SERVER_EMAIL, nag_targets)


def submit_process(load_request, user, background=True) -> None:
    task = wizard_process.delay if background else wizard_process
    task(load_request.request_uuid, user.pk)


def submit_rest(study_uuid: str, user: User, payload: any) -> any:
    load = LoadRequest(study_uuid=study_uuid)
    load.store()
    key = load.form_payload_save(payload)
    run_rest_import.delay(load.request_uuid, key, user.id)
    response = SessionSerializer(load)
    return response.data


def submit_update(
    load_request,
    payload_key,
    user,
    background=True,
    save_when_done=False,
) -> None:
    task = wizard_update.delay if background else wizard_update
    task(
        load_request.request_uuid,
        payload_key,
        user.pk,
        save_when_done=save_when_done,
    )


def submit_save(load_request, user, background=True) -> None:
    task = wizard_save.delay if background else wizard_save
    task(load_request.request_uuid, user.pk)


@shared_task
def run_rest_import(request_uuid, payload_key, user_id):
    load = LoadRequest.fetch(request_uuid)
    try:
        payload = load.form_payload_restore(payload_key)
        serializer = RecordsSerializer(data=payload)
        user = User.objects.get(pk=user_id)
        # payload must have passed serialization before task call
        assert serializer.is_valid()
        compartment, protocol, records = serializer.save()
        # update request object with protocol, compartment
        load.compartment = compartment
        load.protocol_uuid = protocol
        load.store()
        # parse payload into resolved Record objects
        with load.lock_status(
            active=load.Status.UPDATING,
            failed=load.Status.FAILED,
            success=load.Status.PROCESSED,
        ):
            load.process(records, user)
        # immediately following, commit resolved Record objects to database
        with load.lock_status(
            active=load.Status.SAVING,
            expect=load.Status.PROCESSED,
            failed=load.Status.FAILED,
            success=load.Status.COMPLETED,
        ):
            load.commit(user)
    except Exception as e:
        logger.exception("Failed to process REST import", exc_info=e)
        load.transition(LoadRequest.Status.FAILED)
        raise e


@shared_task
def wizard_process(request_uuid, user_id):
    try:
        load = LoadRequest.fetch(request_uuid)
        with load.lock_status(
            active=load.Status.UPDATING,
            failed=load.Status.FAILED,
            success=load.Status.PROCESSED,
        ):
            load.process(load.read(), User.objects.get(pk=user_id))
    except Exception as e:
        logger.exception("Unexpected error in wizard_process", exc_info=e)


@shared_task
def wizard_save(request_uuid, user_id):
    try:
        load = LoadRequest.fetch(request_uuid)
        user = User.objects.get(pk=user_id)
        with load.lock_status(
            active=load.Status.SAVING,
            expect=load.Status.PROCESSED,
            failed=load.Status.FAILED,
            success=load.Status.PROCESSED,
        ):
            load.commit(user)
        if load.request.unresolved_length() == 0:
            load.transition(load.Status.COMPLETED)
    except Exception as e:
        load.transition(LoadRequest.Status.FAILED)
        logger.exception("Unexpected error in wizard_save", exc_info=e)


@shared_task
def wizard_update(request_uuid, payload_key, user_id, save_when_done=False):
    try:
        load = LoadRequest.fetch(request_uuid)
        payload = load.form_payload_restore(payload_key)
        form = ResolveTokensForm(load_request=load, data=payload)
        with load.lock_status(
            active=load.Status.UPDATING,
            failed=load.Status.FAILED,
            success=load.Status.PROCESSED,
        ):
            if form.is_valid():
                load.resolve_tokens(form)
        bulk_line = form.get_count_created_bulk_lines()
        bulk_type = form.get_count_created_bulk_types()
        if bulk_line or bulk_type:
            send_bulk_abuse_email.delay(user_id, load.study_uuid)
        if save_when_done:
            wizard_save.delay(request_uuid, user_id)
    except Exception as e:
        logger.exception("Unexpected error in wizard_update", exc_info=e)
