"""
Defines configuration specific to EDD itself; i.e. values read by code in this repo,
and not values used to configure third-party plugins.
"""

from .base import env, load_secret

# TODO: *all* values here should be loaded from environment or be undefined;
#   values read from here should have a sane default at point-of-use
#   GOOD: getattr(settings, "EDD_MYSETTING", "A sensible default")
#   BAD: settings.EDD_MYSETTING


# Display / Branding related settings
# --------------------
# Load in version and deployment information to display in the page footers
EDD_VERSION_NUMBER = env("EDD_VERSION", default="unversioned-build")
# Setting deployment env makes visual changes to distinguish test/prod easily
EDD_DEPLOYMENT_ENVIRONMENT = env("EDD_DEPLOYMENT_ENVIRONMENT", default="TEST")
# Override EDD_EXTERNAL_SCRIPTS to load outside JavaScript into the base template
# EDD_EXTERNAL_SCRIPTS = []


# Application management related settings
# EDD_ALLOW_SIGNUP: False disables signup; callable will be called with a
#   request object; string type will attempt to import and call module
EDD_ALLOW_SIGNUP = True
# EDD_ONLY_SUPERUSER_CREATE: True disables all study creation by non-superusers.
EDD_ONLY_SUPERUSER_CREATE = False
# EDD_DEFAULT_STUDY_READ_GROUPS: list of groups that automatically get READ
#   access on study creation
# EDD_DEFAULT_STUDY_READ_GROUPS = ['GROUP NAME']
# EDD_ENABLE_GRAPHQL: True adds the URL route to GraphQL endpoint
# EDD_ENABLE_GRAPHQL = False


# Registry / ICE related settings
# --------------------
ICE_KEY_ID = env("ICE_NAME", default="edd")
ICE_SECRET_HMAC_KEY = env(
    "ICE_HMAC_KEY", default=load_secret("edd_ice_key", default=None)
)
ICE_ADMIN_ACCOUNT = env("ICE_ADMIN_USER", default="Administrator")
ICE_URL = env("ICE_URL", default=None)
# HTTP request connection and read timeouts, respectively (seconds)
# TODO: below values should have defaults defined at point-of-use
ICE_REQUEST_TIMEOUT = (10, 10)
ICE_FOLDER_SEARCH_PAGE_SIZE = 100
ICE_VERIFY_CERT = True


# Measurement Type related settings
# --------------------
# Override REQUIRE_UNIPROT_ACCESSION_IDS to change acceptable protein IDs
# REQUIRE_UNIPROT_ACCESSION_IDS = True


# Import related settings
# --------------------
# TODO: below values should have defaults defined at point-of-use
EDD_IMPORT_PAGE_SIZE = 1000
EDD_IMPORT_PAGE_LIMIT = 1000
EDD_IMPORT_CACHE_LENGTH = 60 * 60 * 24
EDD_IMPORT_LOOKUP_ERR_LIMIT = 50


# Index page related settings
# TODO: below values should have defaults defined at point-of-use
# EDD_LATEST_CACHE: defines the cache that holds the latest viewed studies
EDD_LATEST_CACHE = "default"
