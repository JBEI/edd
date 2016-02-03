# coding: utf-8
from __future__ import unicode_literals

from allauth.account import app_settings as allauth_settings
from allauth.account.adapter import DefaultAccountAdapter


class EDDAccountAdapter(DefaultAccountAdapter):
    """ Adapter overrides default behavior for username selection. """

    def populate_username(self, request, user):
        """ Takes a partial user, and sets the username if missing based on existing fields. """
        from allauth.account.utils import user_username, user_email, user_field
        first_name = user_field(user, 'first_name')
        last_name = user_field(user, 'last_name')
        email = user_email(user)
        username = user_username(user)
        if allauth_settings.USER_MODEL_USERNAME_FIELD:
            username = username or self.generate_unique_username([
                email, first_name, last_name, 'user',
            ])
            user_username(user, username)
