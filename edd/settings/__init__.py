# -*- coding: utf-8 -*-
""" Settings for the Experiment Data Depot. """

from .base import *  # noqa
from .auth import *  # noqa
from .celery import *  # noqa
try:
    from .local import *  # noqa
except ImportError as e:
    print("Did not find local settings; did you rename settings/local.py-example?")
