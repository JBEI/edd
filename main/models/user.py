# coding: utf-8
"""
Overrides and monkey-patching to the Django User model.
"""

import logging

from django.contrib.auth import get_user_model
from django.utils.translation import ugettext as _


logger = logging.getLogger(__name__)


def guess_initials(user):
    return (user.first_name or '')[:1] + (user.last_name or '')[:1]


def User_profile(self):
    try:
        from edd.profile.models import UserProfile
        try:
            return self.userprofile
        except UserProfile.DoesNotExist:
            return UserProfile.objects.create(user=self, initials=guess_initials(self))
    except Exception:
        logger.exception('Failed to load a profile object for %s', self)
        return None


def User_initials(self):
    return self.profile.initials if self.profile else _('?')


def User_institution(self):
    if self.profile and self.profile.institutions.count():
        return self.profile.institutions.all()[:1][0].institution_name
    return None


def User_institutions(self):
    if self.profile:
        return self.profile.institutions.all()
    return []


def User_to_json(self, depth=0):
    # FIXME this may be excessive - how much does the frontend actually need?
    return {
        "id": self.pk,
        "uid": self.username,
        "email": self.email,
        "initials": self.initials,
        "name": self.get_full_name(),
        "institution": self.institution,
        "description": "",
        "lastname": self.last_name,
        "groups": None,
        "firstname": self.first_name,
        "disabled": not self.is_active
    }


def User_system_user(cls):
    return cls.objects.get(username='system')


def User_to_solr_json(self):
    format_string = '%Y-%m-%dT%H:%M:%SZ'
    return {
        'id': self.pk,
        'username': self.username,
        # TODO add full name to profile, to override default first+[SPACE]+last
        'fullname': self.get_full_name(),
        'name': [self.first_name, self.last_name, ],
        'email': self.email,
        'initials': self.initials,
        'group': ['@'.join(('%s' % g.pk, g.name)) for g in self.groups.all()],
        'institution': ['@'.join(('%s' % i.pk, i.institution_name)) for i in self.institutions],
        'date_joined': self.date_joined.strftime(format_string),
        'last_login': None if self.last_login is None else self.last_login.strftime(format_string),
        'is_active': self.is_active,
        'is_staff': self.is_staff,
        'is_superuser': self.is_superuser,
    }


# this will get replaced by the actual model as soon as the app is initialized
User = None


def patch_user_model():
    global User
    User = get_user_model()
    User.add_to_class("profile", property(User_profile))
    User.add_to_class("to_json", User_to_json)
    User.add_to_class("to_solr_json", User_to_solr_json)
    User.add_to_class("initials", property(User_initials))
    User.add_to_class("institution", property(User_institution))
    User.add_to_class("institutions", property(User_institutions))
    User.system_user = classmethod(User_system_user)
