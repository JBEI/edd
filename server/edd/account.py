import logging

from allauth.account import adapter, app_settings, forms, utils
from django.conf import settings
from django.contrib import auth, sites
from django.contrib.auth.password_validation import password_validators_help_text_html
from django.forms import ValidationError
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


class EDDAccountAdapter(adapter.DefaultAccountAdapter):
    """
    Adapter overrides default behavior for username selection and email verification.
    """

    def can_delete_email(self, email):
        # never allow deleting a primary email when it's required
        if app_settings.EMAIL_REQUIRED and email.primary:
            return False
        return super().can_delete_email(email)

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
        """Takes a partial user, and sets the username, if missing, to user email."""
        email = utils.user_email(user)
        utils.user_username(user) or utils.user_username(user, email)


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

    def save(self, request, **kwargs):
        email = self.cleaned_data["email"]
        try:
            self._check_if_ldap_user(request, email)
            # base class .save() call generates reset token and sends email
            return super().save(request, **kwargs)
        except ValidationError as e:
            logger.warning("Aborted password reset", exc_info=e)
        return None

    def _check_if_ldap_user(self, request, email):
        for user in self._find_ldap_users_by_email(email):
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
            raise ValidationError(f"Password reset request for LDAP user {user}")

    def _find_ldap_users_by_email(self, email):
        # only try looking up in LDAP backends
        ldap_backends = (b for b in auth.get_backends() if hasattr(b, "ldap"))
        for b in ldap_backends:
            if found := b.populate_user(email):
                yield found
        yield from []


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
