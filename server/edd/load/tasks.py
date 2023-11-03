from celery import shared_task
from celery.utils.log import get_task_logger
from django.contrib.auth import get_user_model

from .broker import LoadRequest
from .forms import ResolveTokensForm

logger = get_task_logger(__name__)
User = get_user_model()


def submit_process(load_request, user, background=True) -> bool:
    task = wizard_process.delay if background else wizard_process
    if load_request.ok_to_process():
        task(load_request.request_uuid, user.pk)
        return True
    return False


def submit_update(
    load_request,
    payload_key,
    user,
    background=True,
    save_when_done=False,
) -> bool:
    task = wizard_update.delay if background else wizard_update
    if load_request.ok_to_process():
        task(
            load_request.request_uuid,
            payload_key,
            user.pk,
            save_when_done=save_when_done,
        )
        return True
    return False


def submit_save(load_request, user, background=True) -> bool:
    task = wizard_save.delay if background else wizard_save
    if load_request.ok_to_save():
        task(load_request.request_uuid, user.pk)
        return True
    return False


@shared_task
def wizard_process(request_uuid, user_id):
    try:
        load = LoadRequest.fetch(request_uuid)
        try:
            load.process(load.read(), User.objects.get(pk=user_id))
        except Exception as e:
            logger.exception("Failed to process upload", exc_info=e)
            load.transition(LoadRequest.Status.FAILED)
    except Exception as e:
        logger.exception("Unexpected error in wizard_process", exc_info=e)


@shared_task
def wizard_save(request_uuid, user_id):
    try:
        load = LoadRequest.fetch(request_uuid)
        user = User.objects.get(pk=user_id)
        load.commit(user)
    except Exception as e:
        load.transition(LoadRequest.Status.FAILED)
        logger.exception("Unexpected error in wizard_save", exc_info=e)


@shared_task
def wizard_update(request_uuid, payload_key, user_id, save_when_done=False):
    try:
        load = LoadRequest.fetch(request_uuid)
        payload = load.form_payload_restore(payload_key)
        form = ResolveTokensForm(load_request=load, data=payload)
        if form.is_valid():
            load.resolve_tokens(form)
        if save_when_done and load.ok_to_save():
            wizard_save.delay(request_uuid, user_id)
    except Exception as e:
        logger.exception("Unexpected error in wizard_update", exc_info=e)
