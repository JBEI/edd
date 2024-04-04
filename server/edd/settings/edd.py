"""
Defines configuration specific to EDD itself; i.e. values read by code in this repo,
and not values used to configure third-party plugins.
"""

from .base import env, load_secret

# TODO: *all* values here should be loaded from environment or be undefined;
#   values read from here should have a sane default at point-of-use
#   GOOD: getattr(settings, "EDD_MYSETTING", "A sensible default")
#   BAD: settings.EDD_MYSETTING


### Display / Branding related settings
# Load in version and deployment information to display in the page footers
EDD_VERSION_NUMBER = env("EDD_VERSION", default="unversioned-build")
# Setting deployment env makes visual changes to distinguish test/prod easily
EDD_DEPLOYMENT_ENVIRONMENT = env("EDD_DEPLOYMENT_ENVIRONMENT", default="TEST")
# Override EDD_EXTERNAL_SCRIPTS to load outside JavaScript into the base template
# EDD_EXTERNAL_SCRIPTS = []


### Application management related settings
# EDD_ALLOW_SIGNUP: False disables signup; callable will be called with a
#   request object; string type will attempt to import and call module
EDD_ALLOW_SIGNUP = True
# EDD_ALLOW_SHOW_PASSWORD: False removes the "Show password" button
EDD_ALLOW_SHOW_PASSWORD = env("EDD_ALLOW_SHOW_PASSWORD", default=False)
# EDD_ONLY_SUPERUSER_CREATE: True disables all study creation by non-superusers.
EDD_ONLY_SUPERUSER_CREATE = False
# EDD_DEFAULT_STUDY_READ_GROUPS: list of groups that automatically get READ
#   access on study creation
# EDD_DEFAULT_STUDY_READ_GROUPS = ['GROUP NAME']
# EDD_ENABLE_GRAPHQL: True adds the URL route to GraphQL endpoint
# EDD_ENABLE_GRAPHQL = False


### Registry / ICE related settings
ICE_KEY_ID = env("ICE_NAME", default="edd")
ICE_SECRET_HMAC_KEY = env(
    "ICE_HMAC_KEY",
    default=load_secret("edd_ice_key", default=None),
)
ICE_ADMIN_ACCOUNT = env("ICE_ADMIN_USER", default="Administrator")
ICE_URL = env("ICE_URL", default=None)


### Measurement Type related settings
# Override REQUIRE_UNIPROT_ACCESSION_IDS to change acceptable protein IDs
# REQUIRE_UNIPROT_ACCESSION_IDS = True


### Import related settings
# EDD_IMPORT_ERR_REPORTING_LIMIT: number of occurrences for each unique error
#   categorization after which further errors will be elided from the UI.
# EDD_IMPORT_ERR_REPORTING_LIMIT = 0
# EDD_ALLOW_IMPORT_ANONYMOUS_LINES: flag to allow the import to create new Line
#   records from import files directly.
# EDD_ALLOW_IMPORT_ANONYMOUS_LINES = True
# EDD_ALLOW_IMPORT_PROVISIONAL_TYPES: flag to allow the import to create
#   provisional types for unknown measurements
# EDD_ALLOW_IMPORT_PROVISIONAL_TYPES = True


### Index page related settings
# EDD_LATEST_CACHE: defines the cache that holds the latest viewed studies
# EDD_LATEST_CACHE = "default"
