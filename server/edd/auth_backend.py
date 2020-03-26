import logging

from allauth.account import models
from allauth.account.auth_backends import AuthenticationBackend as AllauthBackend
from django.conf import settings
from django.contrib.auth import backends, get_user_model
from django.forms import ValidationError
from django.utils.translation import ugettext_lazy as _
from django_auth_ldap.backend import LDAPBackend

logger = logging.getLogger(__name__)


class AllauthLDAPBackend(LDAPBackend):
    """
    Authentication backend that works with an LDAP directory.

    Extension of the Authentication Backend from django_auth_ldap. It creates a
    verified EmailAddress for django-allauth from the email in the LDAP record.
    """

    def authenticate(self, request, username, password, **kwargs):
        user = super().authenticate(request, username, password)
        self._createAndVerifyEmail(user)
        return user

    def _createAndVerifyEmail(self, user):
        # validate user has email in LDAP
        if user and user.email:
            # check if the user has any *other* address set as primary already
            has_primary = (
                models.EmailAddress.objects.exclude(email__iexact=user.email)
                .filter(user=user, primary=True)
                .exists()
            )
            # duplicate email here
            # because update_or_create will drop it
            # due to __iexact lookup
            defaults = {
                "email": user.email,
                "primary": not has_primary,
                "verified": True,
            }
            try:
                models.EmailAddress.objects.update_or_create(
                    user=user, email__iexact=user.email, defaults=defaults
                )
            except Exception:
                logger.exception(
                    "Failed to check or update email verification "
                    f"for {user.email} from LDAP!"
                )


class LocalTestBackend(backends.ModelBackend):
    """
    Authentication backend that approves all login attempts.

    A simple workaround to facilitate offsite EDD Testing. When enabled,
    login attempts that use a valid username will always succeed.
    """

    def authenticate(self, request, username=None, password=None, **kwargs):
        User = get_user_model()
        queryset = User.objects.filter(username=username)
        return queryset.first()


class ManualVerificationMixin:
    """
    Authentication backend mixin for use in manual verification of accounts.

    When used, an account must have manual verification, in addition to
    any validation required by the Account Adapter.
    """

    def authenticate(self, request, **kwargs):
        user = super().authenticate(request, **kwargs)
        if user is not None and not user.profile.approved:
            # default contact, if nothing else set
            contact = settings.SERVER_EMAIL
            # prefer our own setting
            contact = getattr(settings, "EDD_APPROVAL_CONTACT", contact)
            # default message, if nothing else set
            message = _(
                "Your account is currently disabled. Please contact {contact} "
                "to complete the account creation process."
            ).format(contact=contact)
            # prefer our own, again
            message = getattr(settings, "EDD_APPROVAL_MESSAGE", message)
            raise ValidationError(message)
        return user


class ManualVerificationModelBackend(ManualVerificationMixin, backends.ModelBackend):
    pass


class ManualVerificationAllauthBackend(ManualVerificationMixin, AllauthBackend):
    pass
