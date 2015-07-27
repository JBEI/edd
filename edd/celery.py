# Defines the Celery "app" used by EDD
# to asynchronously execute tasks on the celery cluster

from __future__ import absolute_import

import os

from celery import Celery

# set the default Django settings module for the 'celery' program.
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'edd.settings')

from django.conf import settings

task_exchange = Celery('edd', broker='amqp://guest@localhost//')

# lood configuration from celeryconfig.py file instead of hard-coding here
# using a String here means the worker won't have to pickle the object when
# using Windows. Pickle is insecure for production.
task_exchange.config_from_object('edd.celeryconfig')

# auto-discover celery tasks in all included Django apps, provided they
# use the tasks.py convention
task_exchange.autodiscover_tasks(lambda: settings.INSTALLED_APPS)
    
if __name__ == '__main__':
    task_exchange.start()