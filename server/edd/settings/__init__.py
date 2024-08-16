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

# After all settings are imported, do any necessary registration of values
try:
    from jbei.rest.auth import HmacAuth

    HmacAuth.register_key(ICE_KEY_ID, ICE_SECRET_HMAC_KEY)  # noqa: F405
except ImportError:
    print("Failed to import REST authenticators; some features may not work.")
except Exception as e:
    print(f"Failed to register ICE authenticator; connection to ICE may not work: {e}")
