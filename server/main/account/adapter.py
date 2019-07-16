# coding: utf-8

import logging

from allauth.account import adapter, app_settings, models, utils
from allauth.exceptions import ImmediateHttpResponse
from allauth.socialaccount import providers
from allauth.socialaccount.adapter import DefaultSocialAccountAdapter
from django.conf import settings
from django.contrib import auth, messages, sites
from django.db.models import Q
from django.shortcuts import redirect
from django.utils.module_loading import import_string
from django.utils.translation import ugettext_lazy as _
from django_auth_ldap.backend import LDAPBackend
from six import string_types

logger = logging.getLogger(__name__)


class EDDAccountAdapter(adapter.DefaultAccountAdapter):
    """
    Adapter overrides default behavior for username selection and email verification.
    """

    def get_email_confirmation_url(self, request, emailconfirmation):
        # This is super hacky but whatevs
        url = super().get_email_confirmation_url(request, emailconfirmation)
        if getattr(settings, "DEFAULT_HTTP_PROTOCOL", None) == "http":
            url = url.replace("https://", "http://", 1)
        return url

    def is_open_for_signup(self, request):
        allow_signup = getattr(settings, "EDD_ALLOW_SIGNUP", None)
        if isinstance(allow_signup, string_types):
            allow_signup = import_string(allow_signup)
        if callable(allow_signup):
            return allow_signup(request)
        elif isinstance(allow_signup, bool):
            return allow_signup
        return super().is_open_for_signup(request)

    def populate_username(self, request, user):
        """
        Takes a partial user, and sets the username if missing based on existing fields.
        """
        first_name = utils.user_field(user, "first_name")
        last_name = utils.user_field(user, "last_name")
        email = utils.user_email(user)
        username = utils.user_username(user)
        if app_settings.USER_MODEL_USERNAME_FIELD:
            username = username or self.generate_unique_username(
                [email, first_name, last_name, "user"]
            )
            utils.user_username(user, username)

    def password_reset_request(self, request, email):
        """
        Gives a list of users with local accounts that may have passwords reset.
        If matching users with email are not local accounts, generates email
        instructing to use the correct login method instead of resetting password.
        """
        ldap_users = set(self._find_ldap_users_by_email(email))
        local_users = set(self._find_local_users_by_email(email))
        social_users = set(self._find_social_users_by_email(email))
        # notify how to reset LDAP password
        for user in ldap_users:
            self._reset_for_ldap(request, email, user)
        # if a social account and not LDAP, notify to login with social account
        for user in social_users - ldap_users:
            self._reset_for_social(request, email, user)
        # any remaining users can reset a local password
        return local_users - ldap_users - social_users

    def _reset_for_ldap(self, request, email, user):
        context = {
            "current_site": sites.shortcuts.get_current_site(request),
            "request": request,
            "user": user,
        }
        adapter.get_adapter(request).send_mail(
            "account/email/ldap_reset_requested", email, context
        )

    def _reset_for_social(self, request, email, user):
        context = {
            "current_site": sites.shortcuts.get_current_site(request),
            "provider": user.socialaccount_set.first(),
            "request": request,
            "user": user,
        }
        adapter.get_adapter(request).send_mail(
            "account/email/social_reset_requested", email, context
        )

    def _find_ldap_users_by_email(self, email):
        # only try looking up in LDAP backends
        ldap_backends = (b for b in auth.get_backends() if hasattr(b, "ldap"))
        for b in ldap_backends:
            # return first matching LDAP user
            found = b.populate_user(email)
            if found:
                return [found]
        return []

    def _find_local_users_by_email(self, email):
        User = auth.get_user_model()
        # find either on the email field or the EmailAddress model
        return User.objects.filter(
            Q(email__iexact=email) | Q(emailaddress__email__iexact=email)
        )

    def _find_social_users_by_email(self, email):
        base = self._find_local_users_by_email(email)
        return base.filter(socialaccount__isnull=False).prefetch_related(
            "socialaccount_set"
        )


class EDDSocialAccountAdapter(DefaultSocialAccountAdapter):
    """
    Adapter overrides default behavior if a social account is using an email for
    an existing account.
    """

    def pre_social_login(self, request, sociallogin):
        if sociallogin.is_existing:
            return
        if "email" not in sociallogin.account.extra_data:
            return
        qs = models.EmailAddress.objects.filter(
            email__iexact=sociallogin.account.extra_data["email"]
        )
        if qs.exists():
            user = qs[0].user
            account = user.socialaccount_set.first()
            provider = providers.registry.by_id(account.provider) if account else None
            social = providers.registry.by_id(sociallogin.account.provider)
            messages.error(
                request,
                _(
                    "A {provider} account already exists for {email}. "
                    "Please log in with that account and link with your "
                    "{social} account on the profile page."
                ).format(
                    email=user.email,
                    provider=provider.name if provider else _("local or LDAP"),
                    social=social.name,
                ),
            )
            raise ImmediateHttpResponse(redirect("/accounts/login"))


class AllauthLDAPBackend(LDAPBackend):
    """
    Extension of the Authentication Backend from django_auth_ldap, which creates
    a verified EmailAddress for django-allauth from the email in the LDAP record.
    """

    def authenticate(self, request, username, password, **kwargs):
        user = super().authenticate(request, username, password)
        self._createAndVerifyEmail(user)
        return user

    def _createAndVerifyEmail(self, user):
        if user and user.email:
            has_primary = models.EmailAddress.objects.filter(
                user=user, primary=True
            ).exists()
            defaults = {"primary": not has_primary, "verified": True}
            try:
                models.EmailAddress.objects.update_or_create(
                    user=user, email__iexact=user.email, defaults=defaults
                )
            except Exception:
                logger.exception(
                    f"Failed to check or update email verification for {user.email} from LDAP!"
                )


class LocalTestBackend(auth.backends.ModelBackend):
    """
    A simple workaround to facilitate offsite EDD Testing. When enabled,
    login attempts that use a valid username will always succeed.
    """

    def authenticate(self, username=None, password=None, **kwargs):
        User = auth.get_user_model()
        queryset = User.objects.filter(username=username)
        return queryset.first()
