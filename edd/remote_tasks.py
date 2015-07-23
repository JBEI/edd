# Defines remote tasks to be executed asynchronously
# by the Celery distributed task queue. To implement an
# asychronous task to be remotely executed by Celery,
# just define a funtion here and decorate it with @task_queue.task

from edd.celery import task_queue
# from main.ice import IceApi

@task_queue.task
def add(x, y):
    return x + y

@task_queue.task
def test_failure():
    raise Exception('testing exception case')
    
# @task_queue.task
# def store_part_characterization(tbd):
#     IceApi.store_part_attributes(tdb)



    
    


