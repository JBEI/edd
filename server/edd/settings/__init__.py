"""Settings for the Experiment Data Depot."""

from .auth import *  # noqa: F403
from .base import *  # noqa: F403
from .celery import *  # noqa: F403
from .edd import *  # noqa: F403

# try to load overridden settings from local.py, if present
try:
    from .local import *  # noqa: F403
except ImportError:
    print("Did not find local settings module")

# If configured to not do HTTPS redirects, return http:// URLs instead of https://
if env("HTTPS_METHOD", default=None) == "noredirect":  # noqa: F405
    ACCOUNT_DEFAULT_HTTP_PROTOCOL = "http"
    DEFAULT_HTTP_PROTOCOL = "http"
