# coding: utf-8
"""
Defines the client-side Celery "app" (API instance) used by EDD to asynchronously execute tasks on
the Celery cluster.
"""

from __future__ import absolute_import, unicode_literals

import os

from celery import Celery
from kombu.serialization import register

from edd_utils.parsers.json_encoders import (
    datetime_dumps, datetime_loads, EXTENDED_JSON_CONTENT_TYPE
)

# Ensure that there is at least a default settings module configured, using EDD settings
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'edd.settings')

from django.conf import settings  # noqa


###################################################################################################
# Register custom serialization code to allow us to serialize datetime objects as JSON (just
# datetimes, for starters). Used by Celery tasks to serialize dates.
###################################################################################################
register(EXTENDED_JSON_CONTENT_TYPE, datetime_dumps, datetime_loads,
         content_type='application/x-' + EXTENDED_JSON_CONTENT_TYPE,
         content_encoding='UTF-8')

# set up a Celery "app" for use by EDD. A Celery "app" is an instance of
# the Celery API, this instance defines EDD's interface with Celery.
app = Celery('edd', broker=settings.BROKER_URL)
app.config_from_object(settings)


if __name__ == '__main__':
    app.start()
