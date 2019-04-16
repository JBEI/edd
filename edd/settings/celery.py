# -*- coding: utf-8 -*-
"""
Defines configuration for EDD's Celery worker(s), and for Celery-specific custom EDD configuration
options. Note that some of EDD's Celery tasks override defaults configured here to accomodate
their specific needs.
For Celery configuration reference, see http://docs.celeryproject.org/en/latest/configuration.html
"""

from .base import env


###################################################################################################
# General settings for celery.
###################################################################################################
# Broker Settings
CELERY_BROKER_URL = env('BROKER_URL')

# specify the name of the JSON serializer in use
EDD_SERIALIZE_NAME = 'edd-json'

CELERY_ACCEPT_CONTENT = {'json', EDD_SERIALIZE_NAME}
CELERY_TASK_SERIALIZER = EDD_SERIALIZE_NAME
CELERY_RESULT_SERIALIZER = EDD_SERIALIZE_NAME
CELERY_TASK_DEFAULT_EXCHANGE = 'edd'
CELERY_TASK_DEFAULT_QUEUE = 'edd'
CELERY_TASK_DEFAULT_ROUTING_KEY = 'edd'
CELERY_TASK_PUBLISH_RETRY = False

# Try fixing problems with connection pool to RabbitMQ by disabling pool
# See: https://github.com/celery/celery/issues/4226
CELERY_BROKER_POOL_LIMIT = None


###################################################################################################
# Configure database backend to store task state and results
###################################################################################################
CELERY_RESULT_BACKEND = env('CELERY_RESULT_BACKEND')
