# coding: utf-8
from __future__ import absolute_import, unicode_literals

from django.test import TestCase as DjangoTestCase
from threadlocals.threadlocals import set_thread_variable


class TestCase(DjangoTestCase):
    """
    Overrides the default Django TestCase to clear out the threadlocal request variable during
    class setUp and tearDown.
    """
    @classmethod
    def setUpClass(cls):
        super(TestCase, cls).setUpClass()
        set_thread_variable('request', None)

    @classmethod
    def tearDownClass(cls):
        super(TestCase, cls).tearDownClass()
        set_thread_variable('request', None)
