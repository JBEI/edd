# -*- coding: utf-8 -*-
"""
Django settings for edd project.

For more information on this file, see
https://docs.djangoproject.com/en/dev/topics/settings/

For the full list of settings and their values, see
https://docs.djangoproject.com/en/dev/ref/settings/
"""

import environ

from django.conf.global_settings import TEMPLATE_CONTEXT_PROCESSORS as TCP
from psycopg2.extensions import ISOLATION_LEVEL_SERIALIZABLE

from jbei.rest.auth import HmacAuth


root = environ.Path(__file__) - 3  # root is two parents up of directory containing base.py
BASE_DIR = root()
DOCKER_SENTINEL = object()
env = environ.Env(
    EDD_DEBUG=(bool, True),
    ICE_HMAC_KEY=(str, ''),
)
# Use the SECRET_KEY to detect if env is setup via Docker; if not, load from file secrets.env
if env('SECRET_KEY', default=DOCKER_SENTINEL) is DOCKER_SENTINEL:
    env.read_env(root('secrets.env'))


###################################################################################################
# Set ICE configuration used in multiple places, or that we want to be able to override in local.py
###################################################################################################
ICE_KEY_ID = 'edd'
ICE_SECRET_HMAC_KEY = env('ICE_HMAC_KEY')
ICE_URL = 'https://registry-test.jbei.org/'
ICE_REQUEST_TIMEOUT = (10, 10)  # HTTP request connection and read timeouts, respectively (seconds)
HmacAuth.register_key(ICE_KEY_ID, ICE_SECRET_HMAC_KEY)


###################################################################################################
# Configure Django email variables
# Note: Some of these are also referenced by Celery and custom Celery-related code
###################################################################################################
ADMINS = MANAGERS = (
    ('William', 'wcmorrell@lbl.gov'),
    ('Mark', 'mark.forrer@lbl.gov'),
)

# most of these just explicitly set the Django defaults, but since it affects Django, Celery, and
# custom Celery support code, we enforce them here for consistency
SERVER_EMAIL = 'jbei-edd-admin@lists.lbl.gov'
EMAIL_SUBJECT_PREFIX = '[EDD] '
EMAIL_TIMEOUT = 60  # in seconds
EMAIL_HOST = 'smtp'
EMAIL_HOST_USER = ''
EMAIL_HOST_PASSWORD = ''
EMAIL_PORT = 25


###################################################################################################
# Basic Django configuration
###################################################################################################

# SECURITY WARNING: do not run with debug turned on in production!
# Override in local.py or set DEBUG=off in environment or secrets.env
DEBUG = env('EDD_DEBUG')

# SECURITY WARNING: keep the secret key used in production secret!
# default quote from http://thedoomthatcametopuppet.tumblr.com/
SECRET_KEY = env('SECRET_KEY', default='I was awake and dreaming at the same time, which is why '
                                       'this only works for local variables')

ALLOWED_HOSTS = []
SITE_ID = 1
USE_X_FORWARDED_HOST = True
LOGIN_REDIRECT_URL = '/'

# Application definition
INSTALLED_APPS = (
    'django.contrib.admin',
    'django.contrib.auth',
    'django.contrib.sites',
    'django.contrib.contenttypes',
    'django.contrib.sessions',
    'django.contrib.messages',
    'django.contrib.staticfiles',
    'django.contrib.postgres',
    'django_extensions',  # django-extensions in pip
    'rest_framework',  # djangorestframework in pip
    'form_utils',  # django-form-utils in pip
    # django-allauth in pip; separate apps for each provider
    'allauth',
    'allauth.account',
    'allauth.socialaccount',
    # 'allauth.socialaccount.providers.github',
    # 'allauth.socialaccount.providers.google',
    # 'allauth.socialaccount.providers.linkedin_oauth2',

    # EDD apps
    'main',
    'edd_utils',
    'edd.profile',
)
MIDDLEWARE_CLASSES = (
    'django.contrib.sessions.middleware.SessionMiddleware',
    'django.middleware.common.CommonMiddleware',
    'django.middleware.csrf.CsrfViewMiddleware',
    'django.contrib.auth.middleware.AuthenticationMiddleware',
    'django.contrib.auth.middleware.RemoteUserMiddleware',
    'django.contrib.auth.middleware.SessionAuthenticationMiddleware',
    'threadlocals.middleware.ThreadLocalMiddleware',
    'django.contrib.messages.middleware.MessageMiddleware',
    'django.middleware.clickjacking.XFrameOptionsMiddleware',
)


###################################################################################################
# Template configuration
###################################################################################################
# Configure a simple setup that tells Django to load templates from the defined "templates"
# subdirectories inside each installed application (added in 1.9, required starting in Django 1.10)
TEMPLATES = [
    {
        'BACKEND': 'django.template.backends.django.DjangoTemplates',
        'DIRS': [  # DIRS is a list of filesystem paths, NOT app names
            root('edd_utils', 'templates'),
            root('main', 'templates'),
        ],
        'APP_DIRS': True,
        'OPTIONS': {
            'debug': DEBUG,  # only strictly needed when the value differs from DEBUG. Included
                             # explicitly here since it was in the prior version of this file
            'context_processors': TCP + [
                # this gives us access to the original request in templates. see e.g.:
                # http://stackoverflow.com/questions/2882490
                # also required for django-allauth
                'django.template.context_processors.request',
                # required to enable auth templates
                'django.contrib.auth.context_processors.auth',
            ],
        }
    },
]


###################################################################################################
# Solr/Haystack Configuration
###################################################################################################
EDD_MAIN_SOLR = {
    'default': env.search_url(default='solr://solr:8983/solr/'),
}


###################################################################################################
# Databases
###################################################################################################
# https://docs.djangoproject.com/en/dev/ref/settings/#databases
DATABASES = {
    'default': env.db(),
}
# Prevent non-repeatable and phantom reads, which are possible with default 'read committed'
# level. The serializable level matches typical developer expectations for how the DB works, and
# keeps code relatively simple (though at a computational cost, and with a small chance of
# requiring repeated client requests if unlikely serialization errors occur).
# Seems unlikely that the costs of greater consistency will be significant issues unless EDD gets
# very high load, at which point we can consider additional resulting code complexity and
# development time as justified. Ideally, Django will eventually support READ_ONLY transactions,
# which we should use by default to help mitigate the computational burden.
DATABASES['default'].update(OPTIONS={'isolation_level': ISOLATION_LEVEL_SERIALIZABLE})


###################################################################################################
# Caches
###################################################################################################
# https://docs.djangoproject.com/en/1.9/topics/cache/
CACHES = {
    'default': env.cache(),
}

SESSION_ENGINE = 'django.contrib.sessions.backends.cache'
SESSION_CACHE_ALIAS = 'default'


####################################################################################################
# REST API Framework
####################################################################################################

PUBLISH_REST_API = False  # by default, don't publish the API until we can do more testing
REST_FRAMEWORK = {
    # Use Django's standard `django.contrib.auth` authentication.
    'DEFAULT_AUTHENTICATION_CLASSES': (
        'rest_framework.authentication.SessionAuthentication',
    ),
    # Note: in addition to requiring authentication for access, EDD uses custom study-level
    # permissions that should be enforced by custom code at the REST API implementation level. We
    # could also optionally override our model managers for more safety at the cost of
    # convenience for developers.
    'DEFAULT_PERMISSION_CLASSES': (
        'rest_framework.permissions.DjangoModelPermissions',
    ),

    # TODO: disable the browsable API to prevent access until we've had time to do a more careful
    # design / testing of the API. See issues linked to SYNBIO-1299.
    # 'DEFAULT_RENDERER_CLASSES': (
    #     'rest_framework.renderers.JSONRenderer',
    # ),
    # allow default client-configurable pagination for REST API result size
    'DEFAULT_PAGINATION_CLASS': 'edd.rest.paginators.ClientConfigurablePagination',
}

SWAGGER_SETTINGS = {
    'api_version': '0.1',
    'api_path': '/rest/',
    'base_path': '/docs/',

}


###################################################################################################
# Logging
###################################################################################################
# Default logging configuration -- for production
LOGGING = {
    'version': 1,
    'disable_existing_loggers': False,
    'formatters': {
        'simple': {
            'format': '%(asctime)s Thread %(thread)d %(name)-12s %(levelname)-8s %(message)s',
        },
    },
    'filters': {
        'require_debug_true': {
            '()': 'django.utils.log.RequireDebugTrue',
        },
    },
    'handlers': {
        'console': {
            'level': 'INFO',
            'class': 'logging.StreamHandler',
            'formatter': 'simple',
        },
    },
    'loggers': {
        # specify formatting for Django log messages, and also force tracebacks for uncaught
        # exceptions to be logged. Without this, django only logs cryptic 1-liners for uncaught
        # exceptions...see SYNBIO-1262 for an example where this was very misleading.
        'django': {
            'level': 'DEBUG',
            'handlers': ['console', ],
        },
        'django.db.backends': {
            'level': 'WARNING',
            'handlers': ['console', ],
        },
        'main': {
            'level': 'INFO',
            'handlers': ['console', ],
        },
        'edd': {
            'level': 'INFO',
            'handlers': ['console', ],
        },
    },
}


###################################################################################################
# Internationalization
###################################################################################################
# https://docs.djangoproject.com/en/dev/topics/i18n/
LANGUAGE_CODE = 'en-us'
TIME_ZONE = 'America/Los_Angeles'
USE_I18N = True
USE_L10N = True
USE_TZ = True


###################################################################################################
# Static files (CSS, JavaScript, Images)
###################################################################################################
# https://docs.djangoproject.com/en/dev/howto/static-files/
STATIC_ROOT = '/var/www/static'
STATIC_URL = '/static/'
STATICFILES_STORAGE = 'django.contrib.staticfiles.storage.CachedStaticFilesStorage'


###################################################################################################
#  File upload location
###################################################################################################
MEDIA_ROOT = '/var/www/uploads'
MEDIA_URL = '/uploads/'
