"""
Defines the client-side Celery "app" (API instance) used by EDD to asynchronously execute tasks on
the Celery cluster.
"""

import os

from celery import Celery
from kombu.serialization import register

# Ensure that there is at least a default settings module configured, using EDD settings
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "edd.settings")


def register_json_serialization():
    from .utilities import JSONDecoder, JSONEncoder

    # register our custom JSON serialization code
    register(
        name="edd-json",
        encoder=JSONEncoder.dumps,
        decoder=JSONDecoder.loads,
        content_type="application/x-edd-json",
        content_encoding="UTF-8",
    )


register_json_serialization()

# set up a Celery "app" for use by EDD. A Celery "app" is an instance of
# the Celery API, this instance defines EDD's interface with Celery.
app = Celery("edd")
app.config_from_object("django.conf:settings", namespace="CELERY")
app.autodiscover_tasks()
