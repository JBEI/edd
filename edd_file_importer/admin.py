# coding: utf-8

"""
Defines admin UI for the edd_file_importer app
"""

import logging

from django import forms
from django.contrib import admin
from django.utils.translation import ugettext_lazy as _

from . import models
from main.admin import EDDObjectAdmin

logger = logging.getLogger(__name__)


class ImportCategoryForm(forms.ModelForm):
    class Meta:
        model = models.ImportCategory
        fields = ('name', 'display_order', 'active', 'description')
        labels = {
            'name': _('Category'),
            'active': _('Is Active'),
            'description': _('Description'),
        }


class ImportFormatForm(forms.ModelForm):
    class Meta:
        model = models.ImportFormat
        fields = ('name', 'active', 'description', 'parser_class')
        labels = {
            'name': _('Format'),
            'active': _('Is Active'),
            'description': _('Description'),
            'parser_class': _('Parser class'),
        }


class ImportFormatAdmin(EDDObjectAdmin):
    form = ImportFormatForm
    list_display = ('name', 'description', 'active', 'created', 'updated')


class ProtocolCategoriesInline(admin.TabularInline):
    """ Inline submodel for import category contents """
    model = models.ImportCategory.protocols.through
    autocomplete_fields = ('protocol',)


class CategoryFormatsInline(admin.TabularInline):
    model = models.ImportCategory.file_formats.through
    autocomplete_fields = ('format',)


class ImportCategoryAdmin(EDDObjectAdmin):
    """ Definition for admin-edit of Protocols """
    form = ImportCategoryForm
    list_display = ('name', 'description', 'display_order', 'active', 'created', 'updated')
    inlines = (ProtocolCategoriesInline, CategoryFormatsInline)

    def get_queryset(self, request):
        q = super(ImportCategoryAdmin, self).get_queryset(request)
        q = q.select_related('created__mod_by', 'updated__mod_by')
        return q

    def get_readonly_fields(self, request, obj=None):
        # make built-in
        if obj and obj.uuid in ():
            return ('name', 'display_order', 'description')  # everything but active

        return []


admin.site.register(models.ImportCategory, ImportCategoryAdmin)
admin.site.register(models.ImportFormat, ImportFormatAdmin)
