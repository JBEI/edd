"""
Custom database fields to use on EDD models.
"""

from django import forms
from django.db import models


class VarCharField(models.TextField):
    """
    Take advantage of postgres VARCHAR = TEXT, to have unlimited CharField,
    using TextInput widget (<input type="text"> instead of <textarea>).
    """

    def formfield(self, **kwargs):
        defaults = {"widget": forms.TextInput}
        defaults.update(kwargs)
        return super().formfield(**defaults)


class FileField(models.FileField):
    """
    Django default FileField sets a max_length of 100 if none is otherwise set.
    This is not what we want to do with a Postgres database, where `varchar` is
    more prefered than `varchar(100)`.
    """

    def __init__(self, **kwargs):
        # in parent __init__()
        # kwargs.setdefault("max_length", 100) is called
        # which then sets self.max_length
        explicit_max = "max_length" in kwargs
        super().__init__(**kwargs)
        # unless explicitly added a max_length
        # remove it, so Postgres can use varchar over varchar(100)
        if not explicit_max:
            self.max_length = None
