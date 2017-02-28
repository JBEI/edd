# coding: utf-8
from __future__ import unicode_literals

from django.db import models
from django.contrib.sites.models import Site

class Branding(models.Model):
    """
    Branding associated with EDD instance
    """
    logo_name = models.TextField(blank=True, null=True)
    logo_file = models.TextField(blank=True, null=True)
    flavicon_file = models.TextField(blank=True, null=True)
    style_sheets = models.TextField(blank=True, null=True)
    sites = models.ManyToManyField(Site)

    def __str__(self):
        return self.logo_name
