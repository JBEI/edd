# coding: utf-8
from __future__ import absolute_import, unicode_literals

import logging
import re
import urlparse

from django.views import debug
from six import string_types

from .celery import app as celery_app

# patch the default formatter to use a unicode format string
logging._defaultFormatter = logging.Formatter("%(message)s")
logger = logging.getLogger(__name__)

# monkey-patch django.views.debug.cleanse_setting to check for CELERY_RESULT_BACKEND
_cleanse_setting = debug.cleanse_setting
HIDDEN_SETTING = re.compile(r'URL|BACKEND')
def cleanse_setting(key, value):  # noqa
    cleansed = _cleanse_setting(key, value)
    if HIDDEN_SETTING.search(key):
        try:
            parsed = None
            if isinstance(value, string_types):
                parsed = urlparse.urlparse(value)
            if parsed and parsed.password:
                # urlparse returns a read-only tuple, use a list to rewrite parts
                parsed_list = list(parsed)
                parsed_list[1] = parsed.netloc.replace(':%s' % parsed.password, ':**********', 1)
                # put Humpty Dumpty back together again
                cleansed = urlparse.urlunparse(parsed_list)
        except:
            logger.exception('Exception cleansing URLs for error reporting')
    return cleansed
debug.cleanse_setting = cleanse_setting


__all__ = ['celery_app']
