# Defines the Celery "app" used by EDD
# to asynchronously execute tasks on the celery cluster

from __future__ import absolute_import

from celery import Celery
from edd.celeryconfig import EDD_RABBITMQ_USERNAME, EDD_RABBITMQ_PASSWORD, RABBITMQ_HOST, EDD_VHOST # TODO put this shared data in server.cfg instead

task_queue = Celery('edd', broker='amqp://' + EDD_RABBITMQ_USERNAME + ':' + EDD_RABBITMQ_PASSWORD + '@' + RABBITMQ_HOST + EDD_VHOST)

# load configuration from celeryconfig.py file instead of hard-coding here
# using a String here means the worker won't have to pickle the object when
# using Windows. Pickle is insecure for production.
task_queue.config_from_object('edd.celeryconfig')
    
if __name__ == '__main__':
    task_queue.start()