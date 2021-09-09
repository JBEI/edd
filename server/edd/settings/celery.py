"""
Defines configuration for EDD's Celery worker(s), and for Celery-specific
custom EDD configuration options. Note that some of EDD's Celery tasks
override defaults configured here to accomodate their specific needs.

For Celery configuration reference, see:
https://docs.celeryproject.org/en/latest/configuration.html
"""

from .base import env

# Broker Settings
CELERY_BROKER_URL = env("BROKER_URL")

CELERY_ACCEPT_CONTENT = {"json", "edd-json"}
CELERY_TASK_SERIALIZER = "edd-json"
CELERY_RESULT_SERIALIZER = "edd-json"
CELERY_TASK_DEFAULT_EXCHANGE = "edd"
CELERY_TASK_DEFAULT_QUEUE = "edd"
CELERY_TASK_DEFAULT_ROUTING_KEY = "edd"
CELERY_TASK_PUBLISH_RETRY = False

# Try fixing problems with connection pool to RabbitMQ by disabling pool
# See: https://github.com/celery/celery/issues/4226
CELERY_BROKER_POOL_LIMIT = None

CELERY_RESULT_BACKEND = env("CELERY_RESULT_BACKEND")
