# coding: utf-8

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
        set_thread_variable('request', None)
        super(TestCase, cls).tearDownClass()

    def setUp(self):
        super(TestCase, self).setUp()
        set_thread_variable('request', None)

    def tearDown(self):
        set_thread_variable('request', None)
        super(TestCase, self).tearDown()
