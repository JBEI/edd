# -*- coding: utf-8 -*-
""" Authentication-specific settings saved here. """

import ldap

from django_auth_ldap.config import LDAPSearch, GroupOfUniqueNamesType

from .base import env

# See https://pythonhosted.org/django-auth-ldap/install.html
# See https://docs.djangoproject.com/en/dev/howto/auth-remote-user/
AUTHENTICATION_BACKENDS = (
    # 'main.account.adapter.AllauthLDAPBackend',  # 'django_auth_ldap.backend.LDAPBackend',
    # 'django.contrib.auth.backends.RemoteUserBackend',
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

###################################################################################################
# Django Allauth Settings
# NOTE: this section applies IFF base.py includes allauth apps in INSTALLED_APPS
ACCOUNT_ADAPTER = 'main.account.adapter.EDDAccountAdapter'
# NOTE: override ACCOUNT_DEFAULT_HTTP_PROTOCOL in local.py with 'http' when in dev environment
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
###################################################################################################
