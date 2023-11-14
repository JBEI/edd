from .base import INSTALLED_APPS, MIDDLEWARE  # noqa: F401

# Minimal settings module to use Django's collectstatic command during Dockerfile build
# Bring in INSTALLED_APPS to find all Django's assets

# set DEBUG off
DEBUG = False

# must set some value in SECRET_KEY so that Django init can happen
SECRET_KEY = "temporary"

# must set default DATABASES key as well for Django init
DATABASES = {"default": {"ENGINE": "django.db.backends.sqlite3", "NAME": "temporary"}}

# must set AUTH_USER_MODEL so Django init does not detect improper configuration
AUTH_USER_MODEL = "profile.User"

# finally, the actual staticfiles settings:
# location where static assets are saved in Docker image
STATIC_ROOT = "/usr/local/edd-static"
# URL where static assets will eventually get served; used in processing references
STATIC_URL = "/static/"
# do not need any hashing/manifest at this stage
STATICFILES_STORAGE = "django.contrib.staticfiles.storage.StaticFilesStorage"
