from celery import shared_task
from celery.utils.log import get_task_logger
from django.contrib.auth import get_user_model

from .broker import SetupRequest
from .exceptions import SetupException
from .forms import ResolveTokensForm
from .serializers import RecordsSerializer, SessionSerializer

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


def submit_rest(study_uuid: str, user: User, payload: any) -> any:
    setup = SetupRequest(study_uuid=study_uuid)
    setup.store()
    key = setup.form_payload_stash(payload)
    setup_rest_payload.delay(setup.request_uuid, key, user.id)
    response = SessionSerializer(setup)
    return response.data


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


@shared_task(ignore_result=True)
def setup_commit(request_uuid, user_id):
    try:
        setup = SetupRequest.fetch(request_uuid)
        with setup.lock_status(
            active=setup.Status.SAVING,
            expect=setup.Status.READY,
            failed=setup.Status.FAILED,
            success=setup.Status.READY,
        ):
            setup.commit(User.objects.get(pk=user_id))
        # if setup has no unresolved records, transition again to DONE
        if setup.records_unresolved == 0:
            setup.transition(setup.Status.DONE)
    except SetupException as e:
        raise e
    except Exception as e:
        raise SetupException() from e


@shared_task(ignore_result=True)
def setup_process(request_uuid, user_id):
    try:
        setup = SetupRequest.fetch(request_uuid)
        with setup.lock_status(
            active=setup.Status.UPDATING,
            expect=setup.Status.READY,
            failed=setup.Status.FAILED,
            success=setup.Status.READY,
        ):
            setup.process_upload(User.objects.get(pk=user_id))
    except Exception as e:
        logger.exception("Failed to process upload", exc_info=e)
        # NO transition, user should see parse progress normally
        raise SetupException() from e


@shared_task(ignore_result=True)
def setup_rest_payload(request_uuid, payload_key, user_id):
    setup = SetupRequest.fetch(request_uuid)
    try:
        payload = setup.form_payload_fetch(payload_key)
        serializer = RecordsSerializer(data=payload)
        # payload must have passed serialization before task call
        assert serializer.is_valid()
        records = serializer.save()
        user = User.objects.get(pk=user_id)
        # parse payload into resolved Record objects
        with setup.lock_status(
            active=setup.Status.UPDATING,
            expect=setup.Status.CREATED,
            failed=setup.Status.READY,
            success=setup.Status.READY,
        ):
            setup.process_payload(records, user)
        # immediately following, commit resolved Record objects to database
        with setup.lock_status(
            active=setup.Status.UPDATING,
            expect=setup.Status.READY,
            failed=setup.Status.READY,
            success=setup.Status.DONE,
        ):
            setup.commit(user)
    except Exception as e:
        setup.transition(setup.Status.FAILED)
        raise e


@shared_task(ignore_result=True)
def setup_update(request_uuid, payload_key, user_id):
    try:
        setup = SetupRequest.fetch(request_uuid)
        payload = setup.form_payload_fetch(payload_key)
        form = ResolveTokensForm(setup_request=setup, data=payload)
        with setup.lock_status(
            active=setup.Status.UPDATING,
            expect=setup.Status.READY,
            failed=setup.Status.READY,
            success=setup.Status.READY,
        ):
            setup.process_form(form)
    except Exception as e:
        logger.exception("Failed to process form", exc_info=e)
        # NO transition, user should see form errors
        raise SetupException() from e
