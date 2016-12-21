# coding: utf-8
from __future__ import absolute_import, unicode_literals

import logging
import os

# specify a default settings, in case DJANGO_SETTINGS_MODULE env is not set
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "edd.settings")

from django.conf import settings  # noqa

# patch the default formatter to use a unicode format string
logging._defaultFormatter = logging.Formatter("%(message)s")
logger = logging.getLogger(__name__)

# If configured, make sure the celery app is imported when
# Django starts so that @shared_task will use this app.
if hasattr(settings, 'USE_CELERY') and settings.USE_CELERY:
    logger.info("Using Celery distributed task queue")
    from .celery import app as celery_app  # noqa
else:
    logger.info("Celery distributed task queue is not configured")
