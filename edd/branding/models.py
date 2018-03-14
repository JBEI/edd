# coding: utf-8

from django.db import models


class Branding(models.Model):
    """
    Branding associated with EDD instance
    """
    logo_name = models.TextField(default='EDD')
    logo_file = models.ImageField(null=True)
    favicon_file = models.ImageField(null=True)
    style_sheet = models.FileField(null=True, blank=True)
    sites = models.ManyToManyField('sites.Site', through='Page')

    def __str__(self):
        return self.logo_name


class Page(models.Model):
    """
    Join Branding and Site models
    """
    site = models.OneToOneField(
        'sites.Site',
        unique=True,
        on_delete=models.CASCADE,
    )
    branding = models.ForeignKey(
        Branding,
        on_delete=models.CASCADE,
    )
