"""
Defines the Celery "app" used by EDD to asynchronously execute tasks on the Celery cluster
"""

from __future__ import absolute_import
import os
import json
from celery import Celery
from edd.local_settings import config

# extract values for easy reference
RABBITMQ_HOST = config['rabbitmq'].get('hostname')
EDD_RABBITMQ_USERNAME = config['rabbitmq'].get('edd_user')
EDD_RABBITMQ_PASSWORD = config['rabbitmq'].get('edd_pass')
RABBITMQ_PORT = config['rabbitmq'].get('port')
EDD_VHOST = config['rabbitmq'].get('edd_vhost')
BROKER_URL = 'amqp://' + EDD_RABBITMQ_USERNAME + ':' + EDD_RABBITMQ_PASSWORD + '@' + RABBITMQ_HOST + ':' + RABBITMQ_PORT + '/' + EDD_VHOST

# CONTRARY to the documentation, DON'T inform Celery it's operating in the context of our Django project...
# For unknown reasons, this prevents error emails from getting through...event when the conflicted ADMINS
# parameter is undefined in the Django settings.py (though possible still getting a default value from Django and silently causing a problem).
# With our configuration files separated out from the Django ones (again, contrary to the recommendation), it's unclear
# in the docementation whether this setting would provide any other benefit anyway. If ADMIN is the problem, its value is displayed
# identically in Flower either way (working or broken).
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'edd.local_settings')

# set up a Celery "app" for use by EDD. A Celery "app" is just an unfortunately-named instance of the Celery API,
# This instance defines EDD's interface will use to interface with Celery.
task_exchange = Celery('edd',
                       broker='amqp://' + EDD_RABBITMQ_USERNAME + ':' + EDD_RABBITMQ_PASSWORD + '@' + RABBITMQ_HOST + EDD_VHOST)

# load configuration from celeryconfig.py file instead of hard-coding here
# using a String here means the worker won't have to pickle the object when
# using Windows. Pickle is insecure for production.
task_exchange.config_from_object('edd.local_settings')
task_exchange.config_from_object('edd.celeryconfig')

# auto-discover celery tasks in all included Django apps, provided they
# use the tasks.py convention (EDD presently doesn't). If implementing,
# remove CELERY_IMPORTS = ('edd.remote_tasks',) from celeryconfig.py
# task_exchange.autodiscover_tasks(lambda: settings.INSTALLED_APPS)

if __name__ == '__main__':
    task_exchange.start()
