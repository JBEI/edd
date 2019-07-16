# coding: utf-8

from django.contrib.sites.models import clear_site_cache
from django.db import models
from django.db.models.signals import pre_delete, pre_save
from django.utils.translation import ugettext_lazy as _


class Branding(models.Model):
    """Branding associated with EDD instance"""

    logo_name = models.TextField(
        default="EDD",
        help_text=_("Alt text for the institution logo displayed in navbar"),
    )
    logo_file = models.ImageField(
        help_text=_("Image file for institution logo shown next to EDD logo in navbar"),
        null=True,
    )
    favicon_file = models.ImageField(
        help_text=_("Image file returned for site favicon"), null=True
    )
    style_sheet = models.FileField(
        blank=True,
        help_text=_("Custom CSS rules to include for site branding"),
        null=True,
    )
    sites = models.ManyToManyField("sites.Site", through="Page")
    login_welcome = models.TextField(
        blank=True,
        help_text=_("Login welcome message HTML displayed with the login page"),
        null=True,
    )

    def __str__(self):
        return self.logo_name


class Page(models.Model):
    """Join Branding and Site models"""

    site = models.OneToOneField("sites.Site", unique=True, on_delete=models.CASCADE)
    branding = models.ForeignKey(Branding, on_delete=models.CASCADE)


# without clearing cache on save, UI will read a stale Branding object
pre_save.connect(clear_site_cache, sender=Branding)
pre_save.connect(clear_site_cache, sender=Page)
pre_delete.connect(clear_site_cache, sender=Branding)
pre_delete.connect(clear_site_cache, sender=Page)
