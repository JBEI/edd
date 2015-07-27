from __future__ import absolute_import

# Make sure the celery app is imported when
# Django starts so that @shared_task will use this app.
from .celery import task_exchange as celery_app