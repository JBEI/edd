# coding: utf-8
"""
Defines the client-side Celery "app" (API instance) used by EDD to asynchronously execute tasks on
the Celery cluster.
"""

import os

from celery import Celery

# Ensure that there is at least a default settings module configured, using EDD settings
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'edd.settings')

# set up a Celery "app" for use by EDD. A Celery "app" is an instance of
# the Celery API, this instance defines EDD's interface with Celery.
app = Celery('edd')
app.config_from_object('django.conf:settings', namespace='CELERY')
app.autodiscover_tasks()


@app.task(bind=True)
def debug_task(self):
    print('Request: {0!r}'.format(self.request))
