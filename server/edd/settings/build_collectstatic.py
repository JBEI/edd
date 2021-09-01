from .base import EDD_VERSION_HASH, INSTALLED_APPS, env  # noqa: F401

# Minimal settings module to use Django's collectstatic command during Dockerfile build

# set DEBUG off so that the collectstatic command will hash files for the manifest
DEBUG = False

# must set some value in SECRET_KEY so that Django init can happen
SECRET_KEY = "temporary"

# must set default DATABASES key as well for Django init
DATABASES = {"default": {"ENGINE": "django.db.backends.sqlite3", "NAME": "temporary"}}

# must set AUTH_USER_MODEL so Django init does not detect improper configuration
AUTH_USER_MODEL = "profile.User"

# TODO: code in EDD is written assuming these settings are always available
EDD_MAIN_SOLR = {}

# finally, the actual staticfiles settings:
# location where static assets are saved in Docker image
STATIC_ROOT = "/usr/local/edd-static"
# URL where static assets will eventually get served; used in processing references
STATIC_URL = "/static/"
# save the manifest specific to this build version
STATICFILES_MANIFEST = f"staticfiles.{EDD_VERSION_HASH}.json"
# use storage that uses the altered manifest name
STATICFILES_STORAGE = "edd.utilities.StaticFilesStorage"
