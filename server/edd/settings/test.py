"""Test-specific settings."""

from .auth import *  # noqa: F401, F403
from .base import *  # noqa: F401, F403
from .celery import *  # noqa: F401, F403
from .edd import *  # noqa: F401, F403

# try to load overridden settings from local.py, if present
try:
    from .local import *  # noqa: F401, F403
except ImportError:
    print("Did not find local settings; did you rename settings/local.py-example?")
