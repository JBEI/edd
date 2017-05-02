# coding: utf-8
from __future__ import absolute_import, unicode_literals

from celery import shared_task
from celery.utils.log import get_task_logger
from django.conf import settings
from django.core.urlresolvers import reverse
from django.db.models import F
from django.http import QueryDict
from django.utils.translation import ugettext as _
from requests.exceptions import RequestException

from . import models
from .importer.table import TableImport
from .redis import ScratchStorage
from .utilities import get_absolute_url
from jbei.rest.auth import HmacAuth
from jbei.rest.clients.ice import IceApi


logger = get_task_logger(__name__)


def build_study_url(slug):
    path = reverse('main:overview', kwargs={'slug': slug})
    return get_absolute_url(path)


def create_ice_connection(user_token):
    auth = HmacAuth(key_id=settings.ICE_KEY_ID, username=user_token)
    ice = IceApi(auth=auth, verify_ssl_cert=settings.VERIFY_ICE_CERT)
    ice.timeout = settings.ICE_REQUEST_TIMEOUT
    ice.write_enabled = True
    return ice


@shared_task
def import_table_task(study_id, user_id, data_path):
    try:
        storage = ScratchStorage()
        study = models.Study.objects.get(pk=study_id)
        user = models.User.objects.get(pk=user_id)
        data = storage.load(data_path)
        importer = TableImport(study, user)
        # data stored as urlencoded string, convert back to QueryDict
        (added, updated) = importer.import_data(QueryDict(data))
        storage.delete(data_path)
    except Exception as e:
        logger.exception('Failure in import_task: %s', e)
        raise RuntimeError(
            _('Failed import to %(study)s, EDD encountered this problem: %(problem)s') % {
                'problem': e,
                'study': study.name,
            }
        )
    return _(
        'Finished import to %(study)s: %(added)d added, %(updated)d updated measurements.' % {
            'added': added,
            'study': study.name,
            'updated': updated,
        }
    )


def delay_calculation(task):
    # delay is default + 2**n seconds
    return task.default_retry_delay + (2 ** (task.request.retries + 1))


@shared_task(bind=True)
def link_ice_entry_to_study(self, user_token, strain, study):
    # check that strain and study are still linked
    query = models.Strain.objects.filter(pk=strain, line__study__pk=study)
    if query.exists():
        try:
            ice = create_ice_connection(user_token)
            record = query.annotate(
                study_slug=F('line__study__slug'),
                study_name=F('line__study__name'),
            ).distinct().get()
            url = build_study_url(record.study_slug)
            ice.link_entry_to_study(record.registry_id, study, url, record.study_name)
        except RequestException as e:
            # Retry when there are errors communicating with ICE
            raise self.retry(exc=e, countdown=delay_calculation(self), max_retries=10)
        except Exception as e:
            raise e


@shared_task(bind=True)
def unlink_ice_entry_from_study(self, user_token, strain, study):
    query = models.Strain.objects.filter(pk=strain, line__study__pk=study)
    if not query.exists():
        try:
            ice = create_ice_connection(user_token)
            record = models.Strain.objects.get(pk=strain)
            study_obj = models.Study.objects.get(pk=study)
            url = build_study_url(study_obj.slug)
            ice.unlink_entry_from_study(record.registry_id, study, url)
        except RequestException as e:
            # Retry when there are errors communicating with ICE
            raise self.retry(exc=e, countdown=delay_calculation(self), max_retries=10)
        except Exception as e:
            raise e
