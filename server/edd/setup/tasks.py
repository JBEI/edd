from celery import shared_task
from celery.utils.log import get_task_logger
from django.contrib.auth import get_user_model

from .broker import SetupRequest
from .forms import ResolveTokensForm

logger = get_task_logger(__name__)
User = get_user_model()


def submit_commit(setup_request: SetupRequest, user: User, background=True) -> None:
    task = setup_commit.delay if background else setup_commit
    # TODO any checks on SetupRequest?
    task(setup_request.request_uuid, user.pk)


def submit_process(setup_request: SetupRequest, user: User, background=True) -> None:
    task = setup_process.delay if background else setup_process
    if setup_request.is_process_ready():
        task(setup_request.request_uuid, user.pk)


def submit_update(
    setup_request: SetupRequest,
    payload_key: str,
    user: User,
    background=True,
) -> None:
    task = setup_update.delay if background else setup_update
    # TODO any checks on SetupRequest?
    task(
        setup_request.request_uuid,
        payload_key,
        user.pk,
    )


@shared_task
def setup_commit(request_uuid, user_id):
    try:
        setup = SetupRequest.fetch(request_uuid)
        setup.commit(User.objects.get(pk=user_id))
    except Exception as e:
        logger.exception("Failed to commit experiment setup", exc_info=e)


@shared_task
def setup_process(request_uuid, user_id):
    try:
        setup = SetupRequest.fetch(request_uuid)
        setup.process_upload(User.objects.get(pk=user_id))
    except Exception as e:
        logger.exception("Failed to process upload", exc_info=e)


@shared_task
def setup_update(request_uuid, payload_key, user_id):
    try:
        setup = SetupRequest.fetch(request_uuid)
        payload = setup.form_payload_fetch(payload_key)
        form = ResolveTokensForm(setup_request=setup, data=payload)
        setup.process_form(form)
    except Exception as e:
        logger.exception("Failed to process form", exc_info=e)
