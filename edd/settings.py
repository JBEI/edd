# -*- coding: utf-8 -*-
"""
Django settings for edd project.

For more information on this file, see
https://docs.djangoproject.com/en/dev/topics/settings/

For the full list of settings and their values, see
https://docs.djangoproject.com/en/dev/ref/settings/
"""

import environ
import ldap

from django_auth_ldap.config import LDAPSearch, GroupOfUniqueNamesType
from django.conf.global_settings import TEMPLATE_CONTEXT_PROCESSORS as TCP
from psycopg2.extensions import ISOLATION_LEVEL_SERIALIZABLE


root = environ.Path(__file__) - 2  # root is parent directory of directory containing settings.py
BASE_DIR = root()
env = environ.Env(
    EDD_DEBUG=(bool, True),
)
# TODO remove this once working through docker-compose
env.read_env(root('secrets.env'))

# SECURITY WARNING: do not run with debug turned on in production!
# Override in local_settings.py or set DEBUG=off in environment or secrets.env
DEBUG = env('EDD_DEBUG')

# SECURITY WARNING: keep the secret key used in production secret!
# default quote from http://thedoomthatcametopuppet.tumblr.com/
SECRET_KEY = env('SECRET_KEY', default='I was awake and dreaming at the same time, which is why '
                                       'this only works for local variables')

####################################################################################################
# Set ICE configuration used in multiple places, or that we want to be able to override in
# local_settings.py
####################################################################################################
ICE_SECRET_HMAC_KEY = env('ICE_HMAC_KEY')
ICE_URL = 'https://registry-test.jbei.org/'
ICE_REQUEST_TIMEOUT = (10, 10)  # HTTP request connection and read timeouts, respectively (seconds)

####################################################################################################
# Defines whether or not EDD uses Celery. All other Celery-related configuration is in
# celeryconfig.py)
####################################################################################################
USE_CELERY = False

####################################################################################################
# Configure Django email variables
# Note: Some of these are also referenced by Celery and custom Celery-related code
####################################################################################################
ADMINS = MANAGERS = (
    ('William', 'wcmorrell@lbl.gov'),
    ('Mark', 'mark.forrer@lbl.gov'),
)

# most of these just explicitly set the Django defaults, but since  affect Django, Celery, and
# custom Celery support
# code, we enforce them here for consistency
EMAIL_SUBJECT_PREFIX = '[EDD] '
EMAIL_TIMEOUT = 60  # in seconds
EMAIL_HOST = 'localhost'
EMAIL_HOST_USER = ''
EMAIL_HOST_PASSWORD = ''
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
    'django.contrib.sites',
    'django.contrib.contenttypes',
    'django.contrib.sessions',
    'django.contrib.messages',
    'django.contrib.staticfiles',
    'django.contrib.postgres',
    'django_extensions',  # django-extensions in pip
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

####################################################################################################
# Template configuration
####################################################################################################
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

####################################################################################################
# Authentication
####################################################################################################

# See https://pythonhosted.org/django-auth-ldap/install.html
# See https://docs.djangoproject.com/en/dev/howto/auth-remote-user/
AUTHENTICATION_BACKENDS = (
    'main.account.adapter.AllauthLDAPBackend',  # 'django_auth_ldap.backend.LDAPBackend',
    'django.contrib.auth.backends.RemoteUserBackend',
    'django.contrib.auth.backends.ModelBackend',
    # `allauth` specific authentication methods, such as login by e-mail
    'allauth.account.auth_backends.AuthenticationBackend',
)
ROOT_URLCONF = 'edd.urls'
WSGI_APPLICATION = 'edd.wsgi.application'
# LDAP Configuration
# https://pythonhosted.org/django-auth-ldap/example.html
AUTH_LDAP_SERVER_URI = 'ldaps://identity.lbl.gov:636'
AUTH_LDAP_BIND_DN = 'uid=jbei_auth,cn=operational,cn=other'
AUTH_LDAP_BIND_PASSWORD = env('LDAP_PASS')
AUTH_LDAP_USER_SEARCH = LDAPSearch(
    'ou=People,dc=lbl,dc=gov', ldap.SCOPE_ONELEVEL,
    '(&(uid=%(user)s)(objectclass=lblperson)(lblaccountstatus=active))'
)
AUTH_LDAP_GROUP_SEARCH = LDAPSearch(
    'ou=JBEI-Groups,ou=Groups,dc=lbl,dc=gov', ldap.SCOPE_ONELEVEL,
    '(objectclass=groupofuniquenames)',
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


ACCOUNT_ADAPTER = 'main.account.adapter.EDDAccountAdapter'
# NOTE: should override in local_settings with 'http' when running in dev environment
ACCOUNT_DEFAULT_HTTP_PROTOCOL = 'https'
ACCOUNT_EMAIL_REQUIRED = True
ACCOUNT_EMAIL_VERIFICATION = 'mandatory'
ACCOUNT_USERNAME_REQUIRED = False
SOCIALACCOUNT_ADAPTER = 'main.account.adapter.EDDSocialAccountAdapter'
SOCIALACCOUNT_PROVIDERS = {
    'github': {
        'SCOPE': ['user', ],
    },
    'google': {
        'SCOPE': ['email', 'profile', ],
    },
    'linkedin': {
        'SCOPE': ['r_basicprofile', 'r_emailaddress', ],
        'PROFILE_FIELDS': [
            'id', 'first-name', 'last-name', 'email-address', 'picture-url', 'public-profile-url',
        ],
    },
}


####################################################################################################
# Solr/Haystack Configuration
####################################################################################################
EDD_MAIN_SOLR = {
    'default': env.search_url(),
}

####################################################################################################
# Databases
####################################################################################################
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
# https://docs.djangoproject.com/en/dev/topics/i18n/
LANGUAGE_CODE = 'en-us'
TIME_ZONE = 'America/Los_Angeles'
USE_I18N = True
USE_L10N = True
USE_TZ = True

####################################################################################################
# Static files (CSS, JavaScript, Images)
####################################################################################################
# https://docs.djangoproject.com/en/dev/howto/static-files/
# Keeping all static files in the static directory of the project
STATIC_ROOT = root('static')
STATIC_URL = '/static/'

####################################################################################################
#  File upload location
####################################################################################################
MEDIA_ROOT = '/var/www/uploads'
MEDIA_URL = '/uploads/'

####################################################################################################
#  local_settings.py: enables any configuration here to be overridden without changing this file.
####################################################################################################
try:
    from .local_settings import *  # noqa
except ImportError:
    pass
