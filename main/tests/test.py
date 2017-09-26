# -*- coding: utf-8 -*-

""" Note: apparently, Django test runner only searches a module path for
TestCase classes if the file containing the TestCase matches the pattern
test*.py. I find prefixing every filename with 'test' to be ugly, repetitive,
and overall non-Pythonic, therefore: this file is a work-around. It matches the
pattern of test*.py AND imports everything in the module. """

from .adapter import *  # noqa
from .admin import *  # noqa
from .forms import *  # noqa
from .handlers import *  # noqa
from .ice import *  # noqa
from .models import *  # noqa
from .solr import *  # noqa
from .tutorials import *  # noqa
from .utilities import *  # noqa
from .views import *  # noqa
