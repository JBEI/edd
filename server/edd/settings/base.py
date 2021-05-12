"""
Django settings for the EDD project, as well as some custom EDD-defined configuration.

For more information on this file, see
https://docs.djangoproject.com/en/dev/topics/settings/

For the full list of settings and their values, see
https://docs.djangoproject.com/en/dev/ref/settings/
"""

import ipaddress
import logging

import environ


def load_secret(name, default=None):
    """Check for and load a secret value mounted by Docker in /run/secrets."""
    try:
        with open(f"/run/secrets/{name}") as f:
            return f.read().strip()
    except Exception:
        return default


class IpNetworks:
    """
    Use to define INTERNAL_IPS with netmasks.

    >>> INTERNAL_IPS = IpNetworks(["127.0.0.1", "10.0.0.0/8"])
    >>> "127.0.0.1" in INTERNAL_IPS
    True
    >>> "10.0.8.42" in INTERNAL_IPS
    True
    >>> "192.168.1.42" in INTERNAL_IPS
    False
    """

    networks = []

    def __init__(self, addresses):
        self.networks += [ipaddress.ip_network(address) for address in addresses]

    def __contains__(self, address):
        a = ipaddress.ip_address(address)
        return any(a in network for network in self.networks)


# root is two parents up of directory containing base.py
root = environ.Path(__file__) - 3
# initialize environment, fall back to secrets if not set
env = environ.Env(
    BROKER_URL=(str, load_secret("edd_broker_url")),
    CACHE_URL=(str, "dummycache://"),
    CELERY_RESULT_BACKEND=(str, load_secret("edd_celery_database_url")),
    DATABASE_URL=(str, load_secret("edd_database_url", default="sqlite:///temp.db")),
    EDD_DEBUG=(bool, False),
    LDAP_PASS=(str, load_secret("edd_ldap_password")),
)


# Solr/Haystack Configuration
# TODO: replace custom Solr interface with Haystack
EDD_MAIN_SOLR = {"default": env.search_url(default="solr://solr:8983/solr/")}


# Email Configuration
SERVER_EMAIL = env("EDD_EMAIL", default="root@localhost")
DEFAULT_FROM_EMAIL = env("EDD_EMAIL", default="root@localhost")
EMAIL_SUBJECT_PREFIX = "[EDD] "
EMAIL_TIMEOUT = 60  # in seconds
EMAIL_HOST = "smtp"
EMAIL_HOST_USER = ""
EMAIL_HOST_PASSWORD = ""
EMAIL_PORT = 25


# Security-related Configuration
# Debug flag loaded from environment
DEBUG = env("EDD_DEBUG", default=False)
# default quote from http://thedoomthatcametopuppet.tumblr.com/
SECRET_KEY = env(
    "SECRET_KEY",
    default=load_secret(
        "edd_django_secret",
        default="I was awake and dreaming at the same time, which is why "
        "this only works for local variables",
    ),
)
ALLOWED_HOSTS = ["localhost"]
SITE_ID = 1
USE_X_FORWARDED_HOST = True
SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")
LOGIN_REDIRECT_URL = "/"
# If configured to not do HTTPS redirects, return http:// URLs instead of https://
if env("HTTPS_METHOD", default=None) == "noredirect":  # noqa: F405
    DEFAULT_HTTP_PROTOCOL = "http"
# Default 1000; limits number of parameters in requests. None disables the limit.
DATA_UPLOAD_MAX_NUMBER_FIELDS = None


# Application definition
INSTALLED_APPS = (
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.sites",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    "django.contrib.postgres",
    "django_extensions",  # django-extensions in pip
    "rest_framework",  # djangorestframework in pip
    "rest_framework_swagger",  # django-rest-swagger in pip
    "django_filters",  # django-filter in pip
    # django-allauth in pip; separate apps for each provider
    "allauth",
    "allauth.account",
    "allauth.socialaccount",
    "django.contrib.flatpages",
    "channels",  # channels in pip
    "graphene_django",  # graphene-django in pip
    # EDD apps
    "main.apps.EDDConfig",
    "edd.rest.apps.RESTConfig",
    "edd.describe.apps.DescribeConfig",
    "edd.load.apps.LoadConfig",
    "edd.export.apps.ExportConfig",
    "tools.apps.UtilsConfig",
    "edd.profile.apps.ProfileConfig",
    "edd.branding.apps.BrandingConfig",
    "edd.campaign.apps.CampaignConfig",
    "edd.search.apps.SearchConfig",
)
MIDDLEWARE = (
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "threadlocals.middleware.ThreadLocalMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
)
TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        # force check our templates directory first for overrides
        "DIRS": [root("main", "templates")],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                # required to enable auth templates
                "django.contrib.auth.context_processors.auth",
                "django.template.context_processors.debug",
                "django.template.context_processors.i18n",
                "django.template.context_processors.media",
                "django.template.context_processors.static",
                "django.template.context_processors.tz",
                "django.contrib.messages.context_processors.messages",
                # this gives us access to the original request in templates. see e.g.:
                # http://stackoverflow.com/questions/2882490
                # also required for django-allauth
                "django.template.context_processors.request",
            ]
        },
    }
]
ROOT_URLCONF = "edd.urls"
WSGI_APPLICATION = "edd.wsgi.application"


# Database configuration
# https://docs.djangoproject.com/en/dev/ref/settings/#databases
DATABASES = {"default": env.db()}


# Cache configuration
# https://docs.djangoproject.com/en/1.9/topics/cache/
CACHES = {"default": env.cache()}
SESSION_ENGINE = "django.contrib.sessions.backends.cache"
SESSION_CACHE_ALIAS = "default"


# Django REST Framework
# http://www.django-rest-framework.org/api-guide/settings/
REST_FRAMEWORK = {
    # Use Django's standard `django.contrib.auth` authentication.
    "DEFAULT_AUTHENTICATION_CLASSES": (
        "rest_framework.authentication.SessionAuthentication",
        "rest_framework_simplejwt.authentication.JWTAuthentication",
    ),
    "DEFAULT_PERMISSION_CLASSES": (
        # Note: DjangoModelPermissions would be better, but documentation won't support it
        "rest_framework.permissions.IsAuthenticated",
    ),
    "DEFAULT_RENDERER_CLASSES": ("rest_framework.renderers.JSONRenderer",),
    "DEFAULT_PAGINATION_CLASS": "edd.rest.paginators.ClientConfigurablePagination",
    "DEFAULT_FILTER_BACKENDS": (
        "django_filters.rest_framework.DjangoFilterBackend",
        "rest_framework.filters.OrderingFilter",
    ),
    # see: https://www.django-rest-framework.org/community/3.10-announcement/
    "DEFAULT_SCHEMA_CLASS": "rest_framework.schemas.coreapi.AutoSchema",
    "TEST_REQUEST_DEFAULT_FORMAT": "json",
}
# rest API documentation
SWAGGER_SETTINGS = {
    "SECURITY_DEFINITIONS": {
        "basic": {"type": "basic"},
        "Bearer": {"in": "header", "name": "Authorization", "type": "apiKey"},
    },
    "USE_SESSION_AUTH": True,
    "VALIDATOR_URL": None,
}


# WebSockets / Channels
ASGI_APPLICATION = "edd.routing.application"
CHANNEL_LAYERS = {
    "default": {
        "BACKEND": "channels_redis.core.RedisChannelLayer",
        "CONFIG": {
            "hosts": ["redis://redis:6379/2"],
            "symmetric_encryption_keys": [SECRET_KEY],
        },
    }
}


# GraphQL / Graphene
GRAPHENE = {"SCHEMA": "edd.schema.schema"}


# Logging
LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "formatters": {
        "simple": {
            "format": "%(asctime)s Thread %(thread)d %(name)-12s %(levelname)-8s %(message)s"
        }
    },
    "handlers": {
        "console": {
            "level": "INFO",
            "class": "logging.StreamHandler",
            "formatter": "simple",
        }
    },
    "loggers": {
        "daphne": {"level": "INFO", "handlers": ["console"]},
        "django": {"level": "DEBUG", "handlers": ["console"]},
        "django.db.backends": {"level": "WARNING", "handlers": ["console"]},
        "edd": {"level": "INFO", "handlers": ["console"]},
        "main": {"level": "INFO", "handlers": ["console"]},
        # for everything else, display warnings and above
        "": {"level": "WARNING", "handlers": ["console"]},
    },
}
# have logging module capture messages sent through warnings module
logging.captureWarnings(True)


# Internationalization
# https://docs.djangoproject.com/en/dev/topics/i18n/
LANGUAGE_CODE = "en-us"
TIME_ZONE = "America/Los_Angeles"
USE_I18N = True
USE_L10N = True
USE_TZ = True


# Static files (CSS, JavaScript, Images)
# https://docs.djangoproject.com/en/dev/howto/static-files/
# Use the Docker image version hash to distinguish static asset manifest(s)
with open("/edd.hash") as f:
    EDD_VERSION_HASH = f.read().strip()
STATIC_ROOT = "/var/www/static"
STATIC_URL = "/static/"
STATICFILES_DIRS = [
    "/usr/local/edd-static",
]
STATICFILES_MANIFEST = f"staticfiles.{EDD_VERSION_HASH}.json"
STATICFILES_STORAGE = "edd.utilities.StaticFilesStorage"


# File upload location
MEDIA_ROOT = "/var/www/uploads"
MEDIA_URL = "/uploads/"
