""" Authentication-specific settings saved here. """

AUTH_USER_MODEL = "profile.User"

# Django Allauth Settings
# NOTE: this section applies IFF base.py includes allauth apps in INSTALLED_APPS
ACCOUNT_ADAPTER = "edd.account.EDDAccountAdapter"
# NOTE: override ACCOUNT_DEFAULT_HTTP_PROTOCOL in local.py with 'http' when in dev environment
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
ACCOUNT_USERNAME_REQUIRED = False
SOCIALACCOUNT_ADAPTER = "edd.account.EDDSocialAccountAdapter"
SOCIALACCOUNT_PROVIDERS = {
    "github": {"SCOPE": ["user"]},
    "google": {"SCOPE": ["email", "profile"]},
    "linkedin": {
        "SCOPE": ["r_basicprofile", "r_emailaddress"],
        "PROFILE_FIELDS": [
            "id",
            "first-name",
            "last-name",
            "email-address",
            "picture-url",
            "public-profile-url",
        ],
    },
}
