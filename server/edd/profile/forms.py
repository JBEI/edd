from django import forms
from django.utils.translation import gettext_lazy as _

from . import models

bootstrap_text = forms.TextInput(attrs={"aria-invalid": "false", "class": "form-control"})
bootstrap_pass = forms.PasswordInput(attrs={"aria-invalid": "false", "class": "form-control"})
bootstrap_select = forms.Select(attrs={"aria-invalid": "false", "class": "form-select"})


class BasicProfileForm(forms.ModelForm):
    display_name = forms.CharField(
        help_text=_("This is how your name will appear in EDD."),
        label=_("Display Name"),
        max_length=100,
        required=False,
        widget=bootstrap_text,
    )
    initials = forms.CharField(
        help_text=_("Some places in EDD use initials to save space."),
        label=_("Initials"),
        max_length=4,
        required=False,
        widget=bootstrap_text,
    )

    error_css_class = "is-invalid"
    template_name = "main/forms/simple_bootstrap.html"

    class Meta:
        fields = ("display_name", "initials")
        model = models.UserProfile


class AddAppLinkForm(forms.ModelForm):
    apptype = forms.ModelChoiceField(
        empty_label=None,
        help_text="",
        label=_("Application Type"),
        queryset=models.AppType.objects.all(),
        required=True,
        widget=bootstrap_select,
    )
    comment = forms.CharField(
        help_text=_("Any reminder for what this application is for."),
        label=_("Comment"),
        required=False,
        widget=bootstrap_text,
    )
    secret_id = forms.CharField(
        help_text=_("Some applications need an identifier to match the secret value."),
        label=_("Secret ID"),
        required=False,
        widget=bootstrap_text,
    )
    secret = forms.CharField(
        help_text=_("Authentication token to use for connecting to the application."),
        label=_("Secret"),
        required=True,
        widget=bootstrap_pass,
    )
    # NOTE: in local testing, URLField will *not* validate Docker hostnames like http://ice:8080/
    # temporarily switch to CharField or insert AppLink via console if needed for local test
    url = forms.URLField(
        assume_scheme="https",
        help_text=_("This should direct EDD to the API of the application."),
        label=_("URL"),
        required=True,
        widget=bootstrap_text,
    )

    error_css_class = "is-invalid"
    template_name = "main/forms/simple_bootstrap.html"

    class Meta:
        fields = ("apptype", "comment", "secret_id", "secret", "url")
        model = models.AppLink

    def __init__(self, *, profile, data=None, **kwargs):
        if data is not None:
            to_create = models.AppLink(profile=profile)
            super().__init__(data=data, instance=to_create, **kwargs)
        else:
            super().__init__(**kwargs)
