# -*- coding: utf-8 -*-
from .base import env, INSTALLED_APPS  # noqa: F401

# Minimal settings module to use Django's collectstatic command during Dockerfile build

# Load in values from environment
EDD_VERSION_HASH = env("EDD_VERSION_HASH", default="_")

# set DEBUG off so that the collectstatic command will hash files for the manifest
DEBUG = False

# must set some value in SECRET_KEY so that Django init can happen
SECRET_KEY = "temporary"

# must set default DATABASES key as well for Django init
DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.sqlite3",
        "NAME": "temporary",
    }
}

# TODO: code in EDD is written assuming these settings are always available
EDD_MAIN_SOLR = {}

# finally, the actual staticfiles settings:
# location where static assets are saved in Docker image
STATIC_ROOT = f"/usr/local/edd-static/{EDD_VERSION_HASH}"
# URL where static assets will eventually get served; used in processing references
STATIC_URL = f"/static/{EDD_VERSION_HASH}/"
# storage generates a staticfiles.json manifest mapping name to hashed name
STATICFILES_STORAGE = "django.contrib.staticfiles.storage.ManifestStaticFilesStorage"
