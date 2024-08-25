"""Authentication-specific settings saved here."""

AUTH_USER_MODEL = "profile.User"

# Django Allauth Settings
# NOTE: this section applies IFF base.py includes allauth apps in INSTALLED_APPS
ACCOUNT_ADAPTER = "edd.account.EDDAccountAdapter"
ACCOUNT_DEFAULT_HTTP_PROTOCOL = "https"
ACCOUNT_EMAIL_REQUIRED = True
ACCOUNT_EMAIL_VERIFICATION = "mandatory"
ACCOUNT_FORMS = {
    "add_email": "edd.account.AddEmailForm",
    "change_password": "edd.account.ChangePasswordForm",
    "reset_password": "edd.account.ResetPasswordForm",
    "reset_password_from_key": "edd.account.ResetPasswordKeyForm",
    "set_password": "edd.account.SetPasswordForm",
    "signup": "edd.account.SignupForm",
}
ACCOUNT_PREVENT_ENUMERATION = True
ACCOUNT_USERNAME_REQUIRED = False
