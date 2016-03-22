# -*- coding: utf-8 -*-
from __future__ import unicode_literals

import environ
import errno
import os

from .base import *  # noqa

root = environ.Path(__file__) - 2  # we get this out of `from .base import *` too

MEDIA_ROOT = root('uploads')
MEDIA_URL = '/uploads/'

INSTALLED_APPS = INSTALLED_APPS + (
    'debug_toolbar',
)
DEBUG_TOOLBAR_CONFIG = {
    'JQUERY_URL': '/static/main/js/lib/jquery/jquery-2.1.4.min.js',
}

USE_CELERY = False

ACCOUNT_DEFAULT_HTTP_PROTOCOL = 'http'

EDD_ONLY_SUPERUSER_CREATE = True


def get_log_filename(name='edd.log'):
    logdir = root('log')
    try:
        os.mkdir(logdir)
    except OSError as e:
        if e.errno != errno.EEXIST:
            raise e
    return root('log', name)

LOGGING = {
    'version': 1,
    'disable_existing_loggers': False,
    'formatters': {
        'simple': {
            'format': '%(asctime)s Thread %(thread)d %(name)-12s %(levelname)-8s %(message)s',
        },
    },
    'filters': {
        'require_debug_true': {
            '()': 'django.utils.log.RequireDebugTrue',
        },
    },
    'handlers': {
        'console': {
            'level': 'DEBUG',
            'filters': ['require_debug_true', ],
            'class': 'logging.StreamHandler',
            'formatter': 'simple',
        },
        'file': {
            'level': 'DEBUG',
            'class': 'logging.FileHandler',
            'filename': get_log_filename(),
            'formatter': 'simple',
        },
        'queryfile': {
            'level': 'DEBUG',
            'class': 'logging.FileHandler',
            'filename': get_log_filename('query.log'),
            'formatter': 'simple',
        },
    },
    'loggers': {
        'django.db.backends': {
            'level': 'DEBUG',
            'handlers': ['console', 'queryfile', ],
            'propagate': False,
        },
        'main': {
            'level': 'DEBUG',
            'handlers': ['console', 'file', ],
            'propagate': False,
        },
        'edd': {
            'level': 'DEBUG',
            'handlers': ['console', 'file', ],
            'propagate': False,
        },
        '': {
            'level': 'DEBUG',
            'handlers': ['console', ],
        }
    },
}
