import logging

from allauth.account import adapter, forms, utils
from allauth.account.models import EmailAddress
from allauth.core import exceptions
from allauth.socialaccount import adapter as social
from allauth.socialaccount.providers import registry
from django.conf import settings
from django.contrib import auth, messages, sites
from django.contrib.auth.password_validation import password_validators_help_text_html
from django.db.models import Q
from django.shortcuts import redirect
from django.urls import reverse
from django.utils.module_loading import import_string
from django.utils.translation import gettext_lazy as _

logger = logging.getLogger(__name__)


def deny_signup(request):
    """
    Used to illustrate overriding EDD signup behavior. A function taking a
    request to the signup view can return a boolean to indicate whether to
    allow the signup or return a page stating signup is closed.
    """
    return False


class AbortResetEmail(Exception):
    """
    Raised when the default password reset email should not be sent.
    """

    pass


class EDDAccountAdapter(adapter.DefaultAccountAdapter):
    """
    Adapter overrides default behavior for username selection and email verification.
    """

    def confirm_email(self, request, email_address):
        super().confirm_email(request, email_address)
        contact = getattr(settings, "EDD_APPROVAL_CONTACT", None)
        if contact and request:
            current_site = sites.shortcuts.get_current_site(request)
            user = email_address.user
            path = reverse(
                "admin:profile_userprofile_change",
                kwargs={"object_id": user.profile.pk},
            )
            context = {
                "activate_url": request.build_absolute_uri(path),
                "current_site": current_site,
                "user": user,
            }
            adapter.get_adapter(request).send_mail(
                "account/email/approval_requested",
                contact,
                context,
            )

    def get_email_confirmation_url(self, request, emailconfirmation):
        # This is super hacky but whatevs
        url = super().get_email_confirmation_url(request, emailconfirmation)
        if getattr(settings, "DEFAULT_HTTP_PROTOCOL", None) == "http":
            url = url.replace("https://", "http://", 1)
        return url

    def is_open_for_signup(self, request):
        allow_signup = getattr(settings, "EDD_ALLOW_SIGNUP", None)
        if isinstance(allow_signup, str):
            allow_signup = import_string(allow_signup)
        if callable(allow_signup):
            return allow_signup(request)
        elif isinstance(allow_signup, bool):
            return allow_signup
        return super().is_open_for_signup(request)

    def populate_username(self, request, user):
        """
        Takes a partial user, and sets the username, if missing,
        to user email.
        """
        email = utils.user_email(user)
        username = utils.user_username(user)
        if not username:
            utils.user_username(user, email)

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
            raise AbortResetEmail()
        # if a social account and not LDAP, notify to login with social account
        for user in social_users - ldap_users:
            self._reset_for_social(request, email, user)
            raise AbortResetEmail()
        # any local users can reset a local password
        return local_users

    def _reset_for_ldap(self, request, email, user):
        context = {
            "current_site": sites.shortcuts.get_current_site(request),
            "request": request,
            "user": user,
        }
        adapter.get_adapter(request).send_mail(
            "account/email/ldap_reset_requested",
            email,
            context,
        )

    def _reset_for_social(self, request, email, user):
        context = {
            "current_site": sites.shortcuts.get_current_site(request),
            "provider": user.socialaccount_set.first(),
            "request": request,
            "user": user,
        }
        adapter.get_adapter(request).send_mail(
            "account/email/social_reset_requested",
            email,
            context,
        )

    def _find_ldap_users_by_email(self, email):
        # only try looking up in LDAP backends
        ldap_backends = (b for b in auth.get_backends() if hasattr(b, "ldap"))
        for b in ldap_backends:
            # return first matching LDAP user
            if found := b.populate_user(email):
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


class EDDSocialAccountAdapter(social.DefaultSocialAccountAdapter):
    """
    Adapter overrides default behavior if a social account is using an email for
    an existing account.
    """

    def pre_social_login(self, request, sociallogin):
        if sociallogin.is_existing:
            return
        if "email" not in sociallogin.account.extra_data:
            return
        qs = EmailAddress.objects.filter(
            email__iexact=sociallogin.account.extra_data["email"]
        )
        if qs.exists():
            user = qs[0].user
            found = user.socialaccount_set.first()
            provider = registry.by_id(found.provider) if found else None
            social = registry.by_id(sociallogin.account.provider)
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
            raise exceptions.ImmediateHttpResponse(redirect("/accounts/login"))


def make_a11y_form(form):
    for visible in form.visible_fields():
        # class required to be styled by Bootstrap
        visible.field.widget.attrs["class"] = "form-control"
        # prevent fields from being announced as invalid when form is first displayed
        visible.field.widget.attrs["aria-invalid"] = "false"
        # don't use placeholders, favor explicit labels and help texts
        del visible.field.widget.attrs["placeholder"]


class ResetPasswordForm(forms.ResetPasswordForm):
    error_css_class = "is-invalid"
    template_name = "main/forms/simple_bootstrap.html"

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        make_a11y_form(self)

    def clean_email(self):
        # base class will raise a user-visible error if no matching email found
        # we should not be confirming/denying any email exists via web
        email = self.cleaned_data["email"]
        email = adapter.get_adapter().clean_email(email)
        # here is where base class would raise an error if no matches found
        return email

    def save(self, request, **kwargs):
        email = self.cleaned_data["email"]
        account_adapter = adapter.get_adapter(request)
        if callable(account_adapter.password_reset_request):
            try:
                self.users = account_adapter.password_reset_request(request, email)
            except AbortResetEmail:
                return email
        else:
            # if adapter does not have password_reset_request, fall back to base behavior
            self.users = utils.filter_users_by_email(email)
        # base class .save() call generates reset token and sends email to self.users
        return super().save(request, **kwargs)


class SignupForm(forms.SignupForm):
    error_css_class = "is-invalid"
    template_name = "main/forms/simple_bootstrap.html"

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.fields["password1"].help_text = password_validators_help_text_html()
        self.fields["password1"].widget.attrs["aria-describedby"] = "id_password1_help"
        self.fields["password2"].label = _("Re-enter password")
        make_a11y_form(self)


class AddEmailForm(forms.AddEmailForm):
    error_css_class = "is-invalid"
    template_name = "main/forms/simple_bootstrap.html"

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        make_a11y_form(self)


class ChangePasswordForm(forms.ChangePasswordForm):
    error_css_class = "is-invalid"
    template_name = "main/forms/simple_bootstrap.html"

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        make_a11y_form(self)


class SetPasswordForm(forms.SetPasswordForm):
    error_css_class = "is-invalid"
    template_name = "main/forms/simple_bootstrap.html"

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.fields["password1"].help_text = password_validators_help_text_html()
        self.fields["password1"].widget.attrs["aria-describedby"] = "id_password1_help"
        self.fields["password2"].label = _("Re-enter password")
        make_a11y_form(self)


class ResetPasswordKeyForm(forms.ResetPasswordKeyForm):
    error_css_class = "is-invalid"
    template_name = "main/forms/simple_bootstrap.html"

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.fields["password1"].help_text = password_validators_help_text_html()
        self.fields["password1"].widget.attrs["aria-describedby"] = "id_password1_help"
        self.fields["password2"].label = _("Re-enter password")
        make_a11y_form(self)
