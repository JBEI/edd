# coding: utf-8
from __future__ import unicode_literals

from django.db import models
from django.contrib.sites.models import Site


class Branding(models.Model):
    """
    Branding associated with EDD instance
    """
    logo_name = models.TextField(blank=True, null=True)
    logo_file = models.ImageField(upload_to='uploads/', null=True)
    flavicon_file = models.ImageField(upload_to='uploads/', default='/static/main/images/edd_letters.png', null=True)
    style_sheet = models.FileField(upload_to='uploads/', null=True)

    def __str__(self):
        return self.logo_name


class Page(models.Model):
    """
    Join Branding and Site models
    """
    site = models.OneToOneField(
        Site,
        unique=True,
    )
    branding = models.ForeignKey(
        Branding,
        on_delete=models.CASCADE,
    )
