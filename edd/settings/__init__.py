# -*- coding: utf-8 -*-
""" Settings for the Experiment Data Depot. """

# import baseline settings included in EDD's git repo
from .base import *  # noqa
from .auth import *  # noqa
from .celery import *  # noqa

# try to load overridden settings from local.py, if present
try:
    from .local import *  # noqa
except ImportError as e:
    print("Did not find local settings; did you rename settings/local.py-example?")

# After all settings are imported, do any necessary registration of values
try:
    from jbei.rest.auth import HmacAuth
    HmacAuth.register_key(ICE_KEY_ID, ICE_SECRET_HMAC_KEY)  # noqa
except ImportError as e:
    print("Failed to import REST authenticators; some features may not work.")
except Exception as e:
    print("Failed to register ICE authenticator; connection to ICE may not work: %s" % e)
