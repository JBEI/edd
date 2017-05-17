# coding: utf-8
from __future__ import absolute_import, unicode_literals

import logging
import os
import re
import urlparse

from django.core import mail
from django.views import debug
from itertools import chain
from six import string_types
from textwrap import TextWrapper

# specify a default settings, in case DJANGO_SETTINGS_MODULE env is not set
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "edd.settings")

from django.conf import settings  # noqa

# patch the default formatter to use a unicode format string
logging._defaultFormatter = logging.Formatter("%(message)s")
logger = logging.getLogger(__name__)

# If configured, make sure the celery app is imported when
# Django starts so that @shared_task will use this app.
if hasattr(settings, 'USE_CELERY') and settings.USE_CELERY:
    logger.info("Using Celery distributed task queue")
    from .celery import app as celery_app  # noqa
else:
    logger.info("Celery distributed task queue is not configured")


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


# monkey-patch django.core.mail.mail_admins to properly wrap long lines
_mail_admins = mail.mail_admins
def mail_admins(subject, message, *args, **kwargs):  # noqa
    """
    Wraps the mail_admins function from Django to wrap long lines in emails. The exim mail server
    used in EDD dis-allows lines longer than 998 bytes.
    """
    wrapper = TextWrapper(width=79, break_on_hyphens=False, replace_whitespace=False,
                          subsequent_indent='  ')
    message = '\n'.join(chain(*[wrapper.wrap(line) for line in message.splitlines()]))
    _mail_admins(subject, message, *args, **kwargs)
mail.mail_admins = mail_admins
