from celery import shared_task
from celery.utils.log import get_task_logger

from . import solr

logger = get_task_logger(__name__)


@shared_task
def reindex_all(force=False):
    study_core = solr.StudyAdminSearch()
    user_core = solr.UserSearch()
    measurement_core = solr.MeasurementTypeSearch()

    for searcher in (user_core, study_core, measurement_core):
        needs_sync = force or searcher.get_queryset().count() != len(searcher)
        if needs_sync:
            searcher.reindex()
