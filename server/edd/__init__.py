# coding: utf-8

import logging
import re
from itertools import chain
from textwrap import TextWrapper

from django.core import mail
from django.test import TestCase as DjangoTestCase
from django.views import debug
from six import string_types
from six.moves.urllib.parse import urlparse, urlunparse
from threadlocals.threadlocals import set_thread_variable

from .celery import app as celery_app

# patch the default formatter to use a unicode format string
logging._defaultFormatter = logging.Formatter("%(message)s")
logger = logging.getLogger(__name__)
HIDDEN_SETTING = re.compile(r"URL|BACKEND")


class TestCase(DjangoTestCase):
    """
    Overrides the default Django TestCase to clear out the threadlocal request
    variable during class setUp and tearDown.
    """

    @classmethod
    def setUpClass(cls):
        super(TestCase, cls).setUpClass()
        set_thread_variable("request", None)

    @classmethod
    def tearDownClass(cls):
        set_thread_variable("request", None)
        super(TestCase, cls).tearDownClass()

    def setUp(self):
        super(TestCase, self).setUp()
        set_thread_variable("request", None)

    def tearDown(self):
        set_thread_variable("request", None)
        super(TestCase, self).tearDown()


def monkey_patch_cleanse_setting():
    # monkey-patch django.views.debug.cleanse_setting to check for CELERY_RESULT_BACKEND
    _cleanse_setting = debug.cleanse_setting

    def cleanse_setting(key, value):
        cleansed = _cleanse_setting(key, value)
        if HIDDEN_SETTING.search(key):
            try:
                parsed = None
                if isinstance(value, string_types):
                    parsed = urlparse(value)
                if parsed and parsed.password:
                    # urlparse returns a read-only tuple, use a list to rewrite parts
                    parsed_list = list(parsed)
                    parsed_list[1] = parsed.netloc.replace(
                        f":{parsed.password}", ":**********", 1
                    )
                    # put Humpty Dumpty back together again
                    cleansed = urlunparse(parsed_list)
            except Exception:
                logger.exception("Exception cleansing URLs for error reporting")
        return cleansed

    debug.cleanse_setting = cleanse_setting


def monkey_patch_mail_admins():
    # monkey-patch django.core.mail.mail_admins to properly wrap long lines
    _mail_admins = mail.mail_admins

    def mail_admins(subject, message, *args, **kwargs):
        """
        Wraps the mail_admins function from Django to wrap long lines in emails.
        The exim mail server used in EDD dis-allows lines longer than 998 bytes.
        """
        wrapper = TextWrapper(
            width=79,
            break_on_hyphens=False,
            replace_whitespace=False,
            subsequent_indent="  ",
        )
        message = "\n".join(
            chain(*(wrapper.wrap(line) for line in message.splitlines()))
        )
        _mail_admins(subject, message, *args, **kwargs)

    mail.mail_admins = mail_admins


def monkey_patch_postgres_wrapper():
    # monkey-patch django.db.backends.postgresql.base.DatabaseWrapper
    from django.db.backends.postgresql.base import DatabaseWrapper

    # remove requirement for length on varchar fields
    DatabaseWrapper.data_types.update(
        CharField="varchar",
        FileField="varchar",
        FilePathField="varchar",
        SlugField="varchar",
    )


monkey_patch_cleanse_setting()
monkey_patch_mail_admins()
monkey_patch_postgres_wrapper()


__all__ = ("celery_app", "TestCase")
