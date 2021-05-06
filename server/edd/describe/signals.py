"""Signals and handlers the edd.describe app """

import logging

import django

logger = logging.getLogger(__name__)

# create signals for errors and warnings
errors_reported = django.dispatch.Signal(providing_args=["key", "errors"])
warnings_reported = django.dispatch.Signal(providing_args=["key", "warnings"])
