from __future__ import absolute_import

from edd.settings import config

# If configured, make sure the celery app is imported when
# Django starts so that @shared_task will use this app.
if 'celery' in config:
    from .celery import task_exchange as celery_app
