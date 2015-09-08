"""
Django settings for edd project.

For more information on this file, see
https://docs.djangoproject.com/en/1.7/topics/settings/

For the full list of settings and their values, see
https://docs.djangoproject.com/en/1.7/ref/settings/
"""

# Build paths inside the project like this: os.path.join(BASE_DIR, ...)
import os
import json
import ldap
from django_auth_ldap.config import LDAPSearch, GroupOfUniqueNamesType
from django.conf.global_settings import TEMPLATE_CONTEXT_PROCESSORS as TCP
from django.conf.global_settings import LOGIN_REDIRECT_URL
BASE_DIR = os.path.dirname(os.path.dirname(__file__))


try:
    with open(os.path.join(BASE_DIR, 'server.cfg')) as server_cfg:
        config = json.load(server_cfg)
except IOError:
    print "Must have a server.cfg, copy from server.cfg-example and fill in appropriate values"
    raise


# Quick-start development settings - unsuitable for production
# See https://docs.djangoproject.com/en/1.7/howto/deployment/checklist/

# SECURITY WARNING: keep the secret key used in production secret!
# default quote from http://thedoomthatcametopuppet.tumblr.com/
SECRET_KEY = config['site'].get('secret', 'I was awake and dreaming at the same time, which is why \
                                            this only works for local variables')
# SECURITY WARNING: don't run with debug turned on in production!
DEBUG = True
TEMPLATE_DEBUG = True
ADMINS = MANAGERS = (
        ('William', 'wcmorrell@lbl.gov'),
    )
EMAIL_SUBJECT_PREFIX = '[EDD] '
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
    'django.contrib.sites', # recommended for registration app
    'django.contrib.contenttypes',
    'django.contrib.sessions',
    'django.contrib.messages',
    'django.contrib.staticfiles',
    'django.contrib.postgres',
    'django_extensions',
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

# this gives us access to the original request in templates
# see e.g.: http://stackoverflow.com/questions/2882490
TEMPLATE_CONTEXT_PROCESSORS = TCP + (
    'django.core.context_processors.request',
)

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


# Solr/Haystack Configuration
EDD_MAIN_SOLR = {
    'default': {
        'URL': config['solr'].get('url', 'http://localhost:8080/'),
    },
}


# Database
# https://docs.djangoproject.com/en/1.7/ref/settings/#databases
DATABASES = {
    'default': {
        'ENGINE': config['db'].get('driver', 'django.db.backends.postgresql_psycopg2'),
        'NAME': config['db'].get('database', 'edd'),
        'USER': config['db'].get('user', 'edduser'),
        'PASSWORD': config['db'].get('pass', ''),
        'HOST': config['db'].get('host', 'localhost'),
        'PORT': config['db'].get('port', '5432'),
    },
}


# Internationalization
# https://docs.djangoproject.com/en/1.7/topics/i18n/
LANGUAGE_CODE = 'en-us'
TIME_ZONE = 'America/Los_Angeles'
USE_I18N = True
USE_L10N = True
USE_TZ = True


# Static files (CSS, JavaScript, Images)
# https://docs.djangoproject.com/en/1.7/howto/static-files/
# Keeping all static files in the static directory of the project
STATIC_ROOT = os.path.join(BASE_DIR, 'static', '')
STATIC_URL = '/static/'

# File upload location
MEDIA_ROOT = '/var/www/uploads'
MEDIA_URL = '/uploads/'

try:
    from .local_settings import *
except ImportError:
    pass
