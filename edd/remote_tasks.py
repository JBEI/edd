# Defines remote tasks to be executed asynchronously
# by the Celery distributed task queue. To implement an
# asychronous task to be remotely executed by Celery,
# just define a funtion here and decorate it with @task_queue.task

from __future__ import absolute_import
from celery import shared_task

# from main.ice import IceApi

@shared_task(bind=True)
def debug_task(self):
    print('Request: {0!r}'.format(self.request))
    
# def test_retry():
#     raise Exception('testing retry')
#     except:
#         retry()

@shared_task
def add(x, y):
    return x + y

@shared_task
def test_failure():
    raise Exception('testing exception case')
    
# @task_queue.task
# def store_part_characterization(tbd):
#     IceApi.store_part_attributes(tdb)



    
    


