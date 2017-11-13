# -*- coding: utf-8 -*-
""" Settings for the Experiment Data Depot. """

# import baseline settings included in EDD's git repo
from .base import *  # noqa


###################################################################################################
#  local.py: enables any configuration here to be overridden without changing this file.
###################################################################################################
try:
    from .local import *  # noqa
except ImportError:
    print('No "local.py" was found. Using default settings')