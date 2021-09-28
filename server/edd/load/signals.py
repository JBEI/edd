"""Signals and handlers for loading data into EDD."""

import django

# create signals for errors and warnings
errors_reported = django.dispatch.Signal()
warnings_reported = django.dispatch.Signal()
