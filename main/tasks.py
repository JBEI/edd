# coding: utf-8
from __future__ import absolute_import, unicode_literals

import logging

from celery import shared_task
from django.conf import settings
from django.core.urlresolvers import reverse
from django.db.models import F

from . import models
from .utilities import get_absolute_url
from jbei.rest.auth import HmacAuth
from jbei.rest.clients.ice import IceApi


logger = logging.getLogger(__name__)


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
def link_ice_entry_to_study(user_token, strain, study):
    # check that strain and study are still linked
    query = models.Strain.objects.filter(pk=strain, line__study__pk=study)
    if query.exists():
        ice = create_ice_connection(user_token)
        record = query.annotate(
            study_slug=F('line__study__slug'),
            study_name=F('line__study__name'),
        ).distinct().get()
        url = build_study_url(record.study_slug)
        ice.link_entry_to_study(record.registry_id, study, url, record.study_name)


@shared_task
def unlink_ice_entry_from_study(user_token, strain, study):
    query = models.Strain.objects.filter(pk=strain, line__study__pk=study)
    if not query.exists():
        ice = create_ice_connection(user_token)
        record = models.Strain.objects.get(pk=strain)
        study_obj = models.Study.objects.get(pk=study)
        url = build_study_url(study_obj.slug)
        ice.unlink_entry_from_study(record.registry_id, study, url)
