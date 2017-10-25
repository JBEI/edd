# -*- coding: utf-8 -*-
"""
Django settings for the EDD project, as well as some custom EDD-defined configuration.

For more information on this file, see
https://docs.djangoproject.com/en/dev/topics/settings/

For the full list of settings and their values, see
https://docs.djangoproject.com/en/dev/ref/settings/
"""

import environ


root = environ.Path(__file__) - 3  # root is two parents up of directory containing base.py
BASE_DIR = root()
DOCKER_SENTINEL = object()
env = environ.Env(
    EDD_DEBUG=(bool, True),
    ICE_HMAC_KEY=(str, ''),
    LDAP_PASS=(str, None),
)
# Use the SECRET_KEY to detect if env is setup via Docker; if not, load from file secrets.env
if env('SECRET_KEY', default=DOCKER_SENTINEL) is DOCKER_SENTINEL:
    env.read_env(root('secrets.env'))  # read passwords into the environment from secrets.env

###################################################################################################
# Custom EDD-defined configuration options
###################################################################################################

EDD_VERSION_NUMBER = env('EDD_VERSION', default='2.1.1')

# Optionally alter the UI to make a clear distinction between deployment environments (e.g. to
# help prevent developers from accidentally altering data in production). Any value that starts
# with the prefix "DEVELOPMENT" or "TEST" will change EDD's background color and print a the value
# of this variable at the top of each page.
EDD_DEPLOYMENT_ENVIRONMENT = env('EDD_DEPLOYMENT_ENVIRONMENT', default='PRODUCTION')

# override to allow arbitrary text instead of requiring protein ID's to fit the pattern of Uniprot
# accession id's (though at present validity isn't confirmed, only format).
# See http://www.uniprot.org/
REQUIRE_UNIPROT_ACCESSION_IDS = True

# by default, don't expose EDD's nascent DRF-based REST API until we can do more testing
# This option is needed to support the bulk line creation script, but should only be exposed on
# a secure network because of known security problems in the first version.
PUBLISH_REST_API = False

##############################
# ICE configuration used in multiple places, or that we want to be able to override in local.py
##############################
ICE_KEY_ID = env('ICE_NAME', default='edd')
ICE_SECRET_HMAC_KEY = env('ICE_HMAC_KEY', default=None)
ICE_ADMIN_ACCOUNT = env('ICE_ADMIN_USER', default='Administrator')
ICE_URL = env('ICE_URL', default='https://registry-test.jbei.org/')
# HTTP request connection and read timeouts, respectively (seconds)
ICE_REQUEST_TIMEOUT = (10, 10)

# Be very careful in changing this value!! Useful to avoid heachaches in *LOCAL* testing against a
# non-TLS ICE deployment. Also barring another solution, useful as a temporary/risky workaround for
# testing ICE communication from offsite...for example, `manage.py test_ice_communication` observed
# failing DNS lookup from offsite if directed to registry.jbei.org, but fails SSL verification if
# directed to registry.jbei.lbl.gov.
# WARNING: Use in any context other than local testing can expose user credentials to a
# third party!
VERIFY_ICE_CERT = True

# specify the name of the JSON serializer in use
EDD_SERIALIZE_NAME = 'edd-json'

##############################
# Solr/Haystack Configuration
##############################
EDD_MAIN_SOLR = {
    'default': env.search_url(default='solr://solr:8983/solr/'),
}


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
DEBUG = env('EDD_DEBUG', default=False)

# SECURITY WARNING: keep the secret key used in production secret!
# default quote from http://thedoomthatcametopuppet.tumblr.com/
SECRET_KEY = env('SECRET_KEY', default='I was awake and dreaming at the same time, which is why '
                                       'this only works for local variables')

ALLOWED_HOSTS = []
SITE_ID = 1
USE_X_FORWARDED_HOST = True

LOGIN_REDIRECT_URL = '/'

# Default 1000; limits number of parameters in requests. None disables the limit.
DATA_UPLOAD_MAX_NUMBER_FIELDS = None

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
    'rest_framework_swagger',  # django-rest-swagger in pip
    'django_filters',  # django-filter in pip
    'messages_extends',  # django-messages-extends in pip
    # django-allauth in pip; separate apps for each provider
    'allauth',
    'allauth.account',
    'allauth.socialaccount',
    'django.contrib.flatpages',

    # EDD apps
    'main',
    'edd_utils',
    'edd.profile',
    'edd.branding',
    'edd.rest',
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
    'main.utilities.EDDSettingsMiddleware',
    'edd.profile.middleware.TaskNotification',
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
            root('main', 'templates'),
        ],
        'APP_DIRS': True,
        'OPTIONS': {
            'debug': DEBUG,  # only strictly needed when the value differs from DEBUG. Included
                             # explicitly here since it was in the prior version of this file
            'context_processors': [
                # required to enable auth templates
                'django.contrib.auth.context_processors.auth',
                'django.template.context_processors.debug',
                'django.template.context_processors.i18n',
                'django.template.context_processors.media',
                'django.template.context_processors.static',
                'django.template.context_processors.tz',
                'django.contrib.messages.context_processors.messages',
                # this gives us access to the original request in templates. see e.g.:
                # http://stackoverflow.com/questions/2882490
                # also required for django-allauth
                'django.template.context_processors.request',
            ],
        }
    },
]


###################################################################################################
# Databases
###################################################################################################
# https://docs.djangoproject.com/en/dev/ref/settings/#databases
DATABASES = {
    'default': env.db(),
}


###################################################################################################
# Caches
###################################################################################################
# https://docs.djangoproject.com/en/1.9/topics/cache/
CACHES = {
    'default': env.cache(),
}

SESSION_ENGINE = 'django.contrib.sessions.backends.cache'
SESSION_CACHE_ALIAS = 'default'
EDD_LATEST_CACHE = 'default'


###################################################################################################
# REST API Framework
###################################################################################################
# http://www.django-rest-framework.org/api-guide/settings/

REST_FRAMEWORK = {
    # Use Django's standard `django.contrib.auth` authentication.
    'DEFAULT_AUTHENTICATION_CLASSES': (
        'rest_framework.authentication.SessionAuthentication',
    ),
    # Note: in addition to requiring authentication for access, EDD uses custom study-level
    # permissions that should be enforced by custom code at the REST API implementation level. We
    # could also optionally override our model managers for more safety at the cost of
    # convenience for developers (e.g. while using the Django ORM via the command line).
    'DEFAULT_PERMISSION_CLASSES': (
        # Note: DjangoModelPermissions would be better, but documentation won't support it
        'rest_framework.permissions.IsAuthenticated',
    ),

    # disable DRF's built in HTML browsable API in favor of using the more fully-featured Swagger
    # instead
    'DEFAULT_RENDERER_CLASSES': (
        'rest_framework.renderers.JSONRenderer',
    ),
    # allow default client-configurable pagination for REST API result size
    'DEFAULT_PAGINATION_CLASS': 'edd.rest.paginators.ClientConfigurablePagination',

    'DEFAULT_FILTER_BACKENDS': (
        'django_filters.rest_framework.DjangoFilterBackend',
    ),

    'TEST_REQUEST_DEFAULT_FORMAT': 'json',
}

# rest API documentation
SWAGGER_SETTINGS = {
    'api_version': '0.3',
    'api_path': '/',
    'base_path': '/rest/docs',
    'is_authenticated': True,
    'permission_denied_handler': 'edd.rest.views.permission_denied_handler',
    'info': {
        'contact': 'jbei-edd-admin@lists.lbl.gov',
        'description': "Documentation for the Experiment Data Depot's (EDD's) "
                       "REST API. Both the REST API and this documentation are evolving "
                       "works-in-progress. This initial API isn't mature, so use / create "
                       "dependencies at your own risk!",
        'license': 'BSD 3-Clause',
        'licenseUrl': 'https://raw.githubusercontent.com/JBEI/edd/master/LICENSE.txt',
        'title': 'EDD REST API',
    },

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
