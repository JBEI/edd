# coding: utf-8
from __future__ import unicode_literals

from django.db import models
from django.contrib.sites.models import Site


class Branding(models.Model):
    """
    Branding associated with EDD instance
    """
    logo_name = models.TextField(default='EDD')
    logo_file = models.ImageField(null=True)
    favicon_file = models.ImageField(null=True)
    style_sheet = models.FileField(null=True, blank=True)
    sites = models.ManyToManyField(Site, through='Page')

    def __str__(self):
        return self.logo_name


class Page(models.Model):
    """
    Join Branding and Site models
    """
    site = models.OneToOneField(
        Site,
        unique=True,
        on_delete=models.CASCADE,
    )
    branding = models.ForeignKey(
        Branding,
        on_delete=models.CASCADE,
    )
