from django.contrib.admin import AdminSite, apps
from django.utils.module_loading import import_string
from django.utils.translation import gettext_lazy as _


class AdminConfig(apps.AdminConfig):
    default_site = "edd.admin.EDDAdminSite"


class EDDAdminSite(AdminSite):
    index_title = _("Settings Index")
    login_template = "account/login.html"
    logout_template = "account/logout.html"
    site_header = _("EDD Administration")
    site_title = _("EDD Administration")

    @property
    def login_form(self):
        return import_string("allauth.account.forms.LoginForm")
