import logging

from edd import receiver
from main import signals

from . import models

logger = logging.getLogger(__name__)


@receiver(signals.study_created)
def log_study_created(sender, study, user, **kwargs):
    logger.debug(f"Got signal study_created from {sender}")
    models.StudyLog.objects.create(
        event=models.StudyLog.Event.CREATED, study=study, user=user,
    )


@receiver(signals.study_described)
def log_study_described(sender, study, user, count, **kwargs):
    logger.debug(f"Got signal study_described from {sender}")
    models.StudyLog.objects.create(
        detail={"count": count},
        event=models.StudyLog.Event.DESCRIBED,
        study=study,
        user=user,
    )


@receiver(signals.study_exported)
def log_study_exported(sender, study, user, count, cross, **kwargs):
    logger.debug(f"Got signal study_exported from {sender}")
    models.StudyLog.objects.create(
        detail={"count": count},
        event=models.StudyLog.Event.EXPORTED,
        study=None if cross else study,
        user=user,
    )


@receiver(signals.study_imported)
def log_study_imported(sender, study, user, protocol, count, **kwargs):
    logger.debug(f"Got signal study_imported from {sender}")
    models.StudyLog.objects.create(
        detail={"count": count, "protocol": protocol.uuid},
        event=models.StudyLog.Event.IMPORTED,
        study=study,
        user=user,
    )


@receiver(signals.study_permission_change)
def log_study_permission_change(
    sender, study_id, user, permission, selector, applied, **kwargs
):
    logger.debug(f"Got signal study_permission_change from {sender}")
    # even if study is getting deleted, this will run *before* deletion
    study = models.StudyLog.lookup_study(study_id)
    detail = {"permission": permission, "slug": study.slug}
    if applied:
        detail.update(added=selector)
    else:
        detail.update(removed=selector)
        # don't allow setting foreign key ref
        # removal could be from deleting the study + cascade to permission
        study = None
    models.StudyLog.objects.create(
        detail=detail, event=models.StudyLog.Event.PERMISSION, study=study, user=user,
    )


@receiver(signals.study_viewed)
def log_study_viewed(sender, study, user, **kwargs):
    logger.debug(f"Got signal study_viewed from {sender}")
    models.StudyLog.objects.create(
        event=models.StudyLog.Event.VIEWED, study=study, user=user,
    )


@receiver(signals.study_worklist)
def log_study_worklist(sender, study, user, count, cross, **kwargs):
    logger.debug(f"Got signal study_worklist from {sender}")
    models.StudyLog.objects.create(
        detail={"count": count},
        event=models.StudyLog.Event.WORKLIST,
        study=None if cross else study,
        user=user,
    )
