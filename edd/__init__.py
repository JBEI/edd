# coding: utf-8

import logging
import re

from django.core import mail
from django.views import debug
from itertools import chain
from six import string_types
from six.moves.urllib.parse import urlparse, urlunparse
from textwrap import TextWrapper

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
                parsed = urlparse(value)
            if parsed and parsed.password:
                # urlparse returns a read-only tuple, use a list to rewrite parts
                parsed_list = list(parsed)
                parsed_list[1] = parsed.netloc.replace(':%s' % parsed.password, ':**********', 1)
                # put Humpty Dumpty back together again
                cleansed = urlunparse(parsed_list)
        except Exception:
            logger.exception('Exception cleansing URLs for error reporting')
    return cleansed
debug.cleanse_setting = cleanse_setting  # noqa: E305


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
mail.mail_admins = mail_admins  # noqa: E305


__all__ = ['celery_app']
