import logging
import re
from itertools import chain, product
from textwrap import TextWrapper
from urllib.parse import urlparse, urlunparse
from uuid import uuid4

from django.core import mail
from django.test import TestCase as DjangoTestCase
from django.views import debug
from threadlocals.threadlocals import set_thread_variable

from .celery import app as celery_app

logger = logging.getLogger(__name__)
HIDDEN_SETTING = re.compile(r"URL|BACKEND")
_sentinel = object()


def receiver(signal, sender=None, dispatch_uid=_sentinel, **kwargs):
    """
    A better version of the django.dispatch.receiver decorator. Can handle
    lists or tuples in the sender kwarg, in addition to the signal argument.
    Will generate a dispatch_uid for each connect, unless None is explicitly
    passed in for dispatch_uid.
    """

    def _decorator(func):
        signal_list = signal if isinstance(signal, (list, tuple)) else [signal]
        sender_list = sender if isinstance(sender, (list, tuple)) else [sender]
        for sig, send in product(signal_list, sender_list):
            uid = uuid4() if dispatch_uid is _sentinel else dispatch_uid
            sig.connect(func, sender=send, dispatch_uid=uid, **kwargs)
        return func

    return _decorator


class TestCase(DjangoTestCase):
    """
    Overrides the default Django TestCase to clear out the threadlocal request
    variable during class setUp and tearDown.
    """

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        set_thread_variable("request", None)

    @classmethod
    def tearDownClass(cls):
        set_thread_variable("request", None)
        super().tearDownClass()

    def setUp(self):
        super().setUp()
        set_thread_variable("request", None)

    def tearDown(self):
        set_thread_variable("request", None)
        super().tearDown()


class SafeExceptionReporterFilter(debug.SafeExceptionReporterFilter):
    url_settings = re.compile(r"URL|BACKEND")

    def cleanse_setting(self, key, value):
        # use the base implementation
        cleansed = super().cleanse_setting(key, value)
        # if the setting is a URL, try to parse it and replace any password
        if self.url_settings.search(key):
            try:
                parsed = None
                if isinstance(value, str):
                    parsed = urlparse(value)
                if parsed and parsed.password:
                    # urlparse returns a read-only tuple, use a list to rewrite parts
                    parsed_list = list(parsed)
                    parsed_list[1] = parsed.netloc.replace(
                        f":{parsed.password}", f":{self.cleansed_substitute}", 1
                    )
                    # put Humpty Dumpty back together again
                    cleansed = urlunparse(parsed_list)
            except Exception:
                logger.exception("Exception cleansing URLs for error reporting")
        return cleansed


def monkey_patch_mail():
    # monkey-patch django.core.mail.mail_admins to properly wrap long lines
    _mail_admins = mail.mail_admins
    _send_mail = mail.send_mail

    wrapper = TextWrapper(
        width=79,
        break_on_hyphens=False,
        replace_whitespace=False,
        subsequent_indent="  ",
    )

    def mail_admins(subject, message, *args, **kwargs):
        """
        Wraps the mail_admins function from Django to wrap long lines in emails.
        The exim mail server used in EDD dis-allows lines longer than 998 bytes.
        """
        message = "\n".join(
            chain(*(wrapper.wrap(line) for line in message.splitlines()))
        )
        _mail_admins(subject, message, *args, **kwargs)

    def send_mail(subject, message, from_email, recipient_list, *args, **kwargs):
        """
        Wraps the send_mail function from Django to wrap long lines in emails.
        The exim mail server used in EDD dis-allows lines longer than 998 bytes.
        """
        message = "\n".join(
            chain(*(wrapper.wrap(line) for line in message.splitlines()))
        )
        _send_mail(subject, message, from_email, recipient_list, *args, **kwargs)

    mail.mail_admins = mail_admins
    mail.send_mail = send_mail


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


def monkey_patch_requests_timeout():
    import requests

    base_send = requests.Session.send

    def send(*args, **kwargs):
        # if no explicit timeout is set, use 10 seconds connect/read timeouts
        if kwargs.get("timeout", None) is None:
            kwargs["timeout"] = (10, 10)
        return base_send(*args, **kwargs)

    send.__doc__ = base_send.__doc__
    requests.Session.send = send


monkey_patch_mail()
monkey_patch_postgres_wrapper()
monkey_patch_requests_timeout()


__all__ = ("celery_app", "receiver", "TestCase")
