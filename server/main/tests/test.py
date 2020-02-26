"""
Note: apparently, Django test runner only searches a module path for
TestCase classes if the file containing the TestCase matches the pattern
test*.py. I find prefixing every filename with 'test' to be ugly, repetitive,
and overall non-Pythonic, therefore: this file is a work-around. It matches the
pattern of test*.py AND imports everything in the module.
"""

from .adapter import *  # noqa: F401, F403
from .admin import *  # noqa: F401, F403
from .forms import *  # noqa: F401, F403
from .handlers import *  # noqa: F401, F403
from .ice import *  # noqa: F401, F403
from .models import *  # noqa: F401, F403
from .solr import *  # noqa: F401, F403
from .tasks import *  # noqa: F401, F403
from .tutorials import *  # noqa: F401, F403
from .views import *  # noqa: F401, F403
