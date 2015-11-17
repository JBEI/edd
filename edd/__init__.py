# coding: utf-8
from __future__ import absolute_import, unicode_literals

import logging

from edd.settings import USE_CELERY

logger = logging.getLogger(__name__)

# If configured, make sure the celery app is imported when
# Django starts so that @shared_task will use this app.
if USE_CELERY:
    logger.info("Using Celery distributed task queue")
    from .celery import task_exchange as celery_app  # noqa
else:
    logger.info("Celery distributed task queue is not configured")
