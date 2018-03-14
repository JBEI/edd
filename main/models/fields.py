# coding: utf-8
"""
Custom database fields to use on EDD models.
"""

from django import forms
from django.db import models


class VarCharField(models.TextField):
    """ Take advantage of postgres VARCHAR = TEXT, to have unlimited CharField, using TextInput
        widget. """
    def formfield(self, **kwargs):
        defaults = {'widget': forms.TextInput}
        defaults.update(kwargs)
        return super(VarCharField, self).formfield(**defaults)
