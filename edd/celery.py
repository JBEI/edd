# Defines the Celery "app" used by EDD
# to asynchronously execute tasks on the celery cluster

from __future__ import absolute_import
import os
from celery import Celery
from edd.celeryconfig import EDD_RABBITMQ_USERNAME, EDD_RABBITMQ_PASSWORD, RABBITMQ_HOST, EDD_VHOST # TODO put this shared data in server.cfg instead

# inform Celery it's operating in the context of our Django project
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'edd.settings')

# set up a Celery "app" for use by EDD. A Celery "app" is just an unfortunately-named instance of the Celery API,
# This instance defines EDD's interface with Celery.
task_exchange= Celery('edd', broker='amqp://' + EDD_RABBITMQ_USERNAME + ':' + EDD_RABBITMQ_PASSWORD + '@' + RABBITMQ_HOST + EDD_VHOST)

# load configuration from celeryconfig.py file instead of hard-coding here
# using a String here means the worker won't have to pickle the object when
# using Windows. Pickle is insecure for production.
task_exchange.config_from_object('edd.celeryconfig')

# auto-discover celery tasks in all included Django apps, provided they
# use the tasks.py convention (EDD presently doesn't). If implementing,
# remove CELERY_IMPORTS = ('edd.remote_tasks',) from celeryconfig.py
# task_exchange.autodiscover_tasks(lambda: settings.INSTALLED_APPS)

if __name__ == '__main__':
    task_exchange.start()