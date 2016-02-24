# coding: utf-8
from __future__ import absolute_import, unicode_literals

import importlib
import logging
import os

# specify a default settings, in case DJANGO_SETTINGS_MODULE env is not set
settings_module = os.environ.setdefault("DJANGO_SETTINGS_MODULE", "edd.settings")

# dynamically import the settings module configured via environment variable OR specific command
# within the host script. Note that we can't use django.conf.settings here, since we're only
# importing custom EDD settings that unfortunately aren't persisted by django.conf.settings as are
#  the django-defined settings (although we define both in the same file).
custom_settings = importlib.import_module(settings_module)

# patch the default formatter to use a unicode format string
logging._defaultFormatter = logging.Formatter("%(message)s")
logger = logging.getLogger(__name__)

# If configured, make sure the celery app is imported when
# Django starts so that @shared_task will use this app.
if custom_settings.USE_CELERY:
    logger.info("Using Celery distributed task queue")
    from .celery import task_exchange as celery_app  # noqa
else:
    logger.info("Celery distributed task queue is not configured")
