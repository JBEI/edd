# -*- coding: utf-8 -*-
"""
Django settings for edd project.

For more information on this file, see
https://docs.djangoproject.com/en/1.7/topics/settings/

For the full list of settings and their values, see
https://docs.djangoproject.com/en/1.7/ref/settings/
"""

# Build paths inside the project like this: os.path.join(BASE_DIR, ...)
import json
import os

import ldap
from django_auth_ldap.config import LDAPSearch, GroupOfUniqueNamesType
from django.conf.global_settings import TEMPLATE_CONTEXT_PROCESSORS as TCP
from kombu.serialization import register
import psycopg2.extensions

from edd_utils.parsers.json_encoders import (
    datetime_dumps, datetime_loads, EXTENDED_JSON_CONTENT_TYPE
)


####################################################################################################
# Load urls and authentication credentials from server.cfg (TODO: some other stuff in there should
# be moved here)
####################################################################################################
BASE_DIR = os.path.dirname(os.path.dirname(__file__))
try:
    with open(os.path.join(BASE_DIR, 'server.cfg')) as server_cfg:
        config = json.load(server_cfg)
except IOError:
    print("Required configuration file server.cfg is missing from %s"
          "Copy from server.cfg-example and fill in appropriate values" % BASE_DIR)
    raise


####################################################################################################
# Register custom serialization code to allow us to serialize datetime objects as JSON (just
# datetimes, for starters)
####################################################################################################
register(EXTENDED_JSON_CONTENT_TYPE, datetime_dumps, datetime_loads,
         content_type='application/x-' + EXTENDED_JSON_CONTENT_TYPE,
         content_encoding='UTF-8')


# Quick-start development settings - unsuitable for production
# See https://docs.djangoproject.com/en/1.7/howto/deployment/checklist/

# SECURITY WARNING: don't run with debug turned on in production!
DEBUG = True

# SECURITY WARNING: keep the secret key used in production secret!
# default quote from http://thedoomthatcametopuppet.tumblr.com/
SECRET_KEY = config['site'].get('secret', 'I was awake and dreaming at the same time, which is why'
                                          ' this only works for local variables')

####################################################################################################
# Set ICE configuration used in multiple places, or that we want to be able to override in
# local_settings.py
####################################################################################################
ICE_SECRET_HMAC_KEY = config['ice'].get('edd_key', '')
ICE_URL = config['ice'].get('url', None)
ICE_REQUEST_TIMEOUT = (10, 10)  # HTTP request connection and read timeouts, respectively (seconds)

####################################################################################################
# Defines whether or not EDD uses Celery. All other Celery-related configuration is in
# celeryconfig.py)
####################################################################################################
USE_CELERY = False

####################################################################################################
# Configure Django email variables
# Note: Some of these are also referenced by
# Celery and custom Celery-related code
####################################################################################################
ADMINS = MANAGERS = tuple(config['site'].get('admins', {}).items())

# most of these just explicitly set the Django defaults, but since  affect Django, Celery, and
# custom Celery support
# code, we enforce them here for consistency
EMAIL_SUBJECT_PREFIX = '[EDD]'
EMAIL_TIMEOUT = 60  # in seconds
EMAIL_HOST = config['email'].get('host', 'localhost')
EMAIL_HOST_USER = config['email'].get('user', '')
EMAIL_HOST_PASSWORD = config['email'].get('password', '')
EMAIL_PORT = 25

####################################################################################################


ALLOWED_HOSTS = []
SITE_ID = 1
LOGIN_REDIRECT_URL = '/'
DEBUG_TOOLBAR_CONFIG = {
    'JQUERY_URL': '/static/main/js/lib/jquery/jquery-2.1.4.min.js',
}

# Application definition
INSTALLED_APPS = (
    'django.contrib.admin',
    'django.contrib.auth',
    'django.contrib.sites',     # recommended for registration app +
                                # useful for computing URLs from signal handlers
    'django.contrib.contenttypes',
    'django.contrib.sessions',
    'django.contrib.messages',
    'django.contrib.staticfiles',
    'django.contrib.postgres',
    'django_extensions',  # django-extensions in pip
    'form_utils',  # django-form-utils in pip
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

####################################################################################################
# Template configuration
####################################################################################################
# Configure a simple setup that tells Django to load templates from the defined "templates"
# subdirectories inside each installed application (added in 1.9, required starting in Django 1.10)
TEMPLATES = [
    {
        'BACKEND': 'django.template.backends.django.DjangoTemplates',
        'DIRS': ['edd_utils.templates', 'main.templates'],
        'APP_DIRS': True,
        'OPTIONS': {
            'debug': DEBUG,  # only strictly needed when the value differs from DEBUG. Included
                             # explicitly here since it was in the prior version of this file
            'context_processors': TCP + [
                # this gives us access to the original request in templates. see e.g.:
                # http://stackoverflow.com/questions/2882490
                'django.template.context_processors.request',
                # required to enable auth templates
                'django.contrib.auth.context_processors.auth'
            ],
        }
    },
]

####################################################################################################
# Authentication
####################################################################################################

# See https://pythonhosted.org/django-auth-ldap/install.html
# See https://docs.djangoproject.com/en/1.7/howto/auth-remote-user/
AUTHENTICATION_BACKENDS = (
    'django_auth_ldap.backend.LDAPBackend',
    'django.contrib.auth.backends.RemoteUserBackend',
    'django.contrib.auth.backends.ModelBackend',
)
ROOT_URLCONF = 'edd.urls'
WSGI_APPLICATION = 'edd.wsgi.application'
# LDAP Configuration
# https://pythonhosted.org/django-auth-ldap/example.html
AUTH_LDAP_SERVER_URI = config['ldap'].get('uri', '')
AUTH_LDAP_BIND_DN = config['ldap'].get('dn', '')
AUTH_LDAP_BIND_PASSWORD = config['ldap'].get('pass', '')
AUTH_LDAP_USER_SEARCH = LDAPSearch(
    config['ldap'].get('people_base_dn', ''),
    ldap.SCOPE_ONELEVEL,
    config['ldap'].get('people_search', '(uid=%(user)s)')
)
AUTH_LDAP_GROUP_SEARCH = LDAPSearch(
    config['ldap'].get('group_base_dn', ''),
    ldap.SCOPE_ONELEVEL,
    config['ldap'].get('group_search', '(objectClass=groupOfUniqueNames)'),
)
AUTH_LDAP_GROUP_TYPE = GroupOfUniqueNamesType(name_attr='cn')
AUTH_LDAP_MIRROR_GROUPS = True
AUTH_LDAP_USER_ATTR_MAP = {
    'first_name': 'givenName',
    'last_name': 'sn',
    'email': 'mail',
}
AUTH_LDAP_PROFILE_ATTR_MAP = {
    'employee_number': 'lblempnum',
}

# Add security checks for user passwords
# AUTH_PASSWORD_VALIDATORS = [
#     {
#         'NAME': 'django.contrib.auth.password_validation.UserAttributeSimilarityValidator',
#     },
#     {
#         'NAME': 'django.contrib.auth.password_validation.MinimumLengthValidator',
#     },
#     {
#         'NAME': 'django.contrib.auth.password_validation.CommonPasswordValidator',
#     },
#     {
#         'NAME': 'django.contrib.auth.password_validation.NumericPasswordValidator',
#     },
# ]

####################################################################################################
# Solr/Haystack Configuration
####################################################################################################
EDD_MAIN_SOLR = {
    'default': {
        'URL': config['solr'].get('url', 'http://localhost:8080/'),
    },
}

####################################################################################################
# Databases
####################################################################################################
# https://docs.djangoproject.com/en/1.7/ref/settings/#databases
DATABASES = {
    'default': {
        'ENGINE': config['db'].get('driver', 'django.db.backends.postgresql'),
        'NAME': config['db'].get('database', 'edd'),
        'USER': config['db'].get('user', 'edduser'),
        'PASSWORD': config['db'].get('pass', ''),
        'HOST': config['db'].get('host', 'localhost'),
        'PORT': config['db'].get('port', '5432'),
        'OPTIONS': {
            # prevent non-repeatable and phantom reads, which are possible with default 'read
            # committed' level. The serializable level matches typical developer expectations for
            # how the DB works, and keeps code relatively simple (though at a computational cost,
            # and with a small chance of requiring repeated client requests if unlikely
            # serialization errors occur).
            #
            # Seems unlikely that the costs of greater consistency will be significant issues
            # unless EDD gets very high load, at which point we can consider additional resulting
            # code complexity / development time as justified. Ideally, Django will eventually
            # support READ_ONLY transactions, which we should use by default to help mitigate the
            # computational burden.
            'isolation_level': psycopg2.extensions.ISOLATION_LEVEL_SERIALIZABLE,
        },
    },
}

####################################################################################################
# Logging
####################################################################################################
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

####################################################################################################
# Internationalization
####################################################################################################
# https://docs.djangoproject.com/en/1.7/topics/i18n/
LANGUAGE_CODE = 'en-us'
TIME_ZONE = 'America/Los_Angeles'
USE_I18N = True
USE_L10N = True
USE_TZ = True

####################################################################################################
# Static files (CSS, JavaScript, Images)
####################################################################################################
# https://docs.djangoproject.com/en/1.7/howto/static-files/
# Keeping all static files in the static directory of the project
STATIC_ROOT = os.path.join(BASE_DIR, 'static', '')
STATIC_URL = '/static/'

####################################################################################################
#  File upload location
####################################################################################################
MEDIA_ROOT = config['site'].get('media_root', '/var/www/uploads')
MEDIA_URL = config['site'].get('media_url', '/uploads/')

####################################################################################################
#  local_settings.py: enables any configuration here to be overridden without changing this file.
####################################################################################################
try:
    from .local_settings import *
except ImportError:
    pass
