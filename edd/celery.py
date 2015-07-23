# Defines the Celery "app" used by EDD
# to asynchronously execute tasks on the celery cluster

from __future__ import absolute_import

from celery import Celery

task_queue = Celery('edd', broker='amqp://guest@localhost//')

# lood configuration from celeryconfig.py file instead of hard-coding here
# using a String here means the worker won't have to pickle the object when
# using Windows. Pickel is insecure for production.
task_queue.config_from_object('edd.celeryconfig')
    
if __name__ == '__main__':
    task_queue.start()
    
    #TODO: test code -- remove prior to actual use