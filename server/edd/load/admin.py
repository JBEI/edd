"""Defines admin UI for the edd.load app."""

import logging

from django import forms
from django.contrib import admin
from django.utils.translation import gettext_lazy as _

from . import models

logger = logging.getLogger(__name__)


class LayoutForm(forms.ModelForm):
    class Meta:
        model = models.Layout
        fields = ("name", "description")
        labels = {
            "name": _("Layout"),
            "description": _("Description"),
        }


class ParsersInline(admin.TabularInline):
    model = models.ParserMapping


class LayoutAdmin(admin.ModelAdmin):
    form = LayoutForm
    list_display = ("name", "description")
    inlines = [ParsersInline]
    search_fields = ["name", "description"]


class ProtocolCategoryInline(admin.TabularInline):
    """Inline submodel for import category contents."""

    model = models.Category.protocols.through
    autocomplete_fields = ["protocol"]


class CategoryLayoutInline(admin.TabularInline):
    model = models.Category.layouts.through
    autocomplete_fields = ["layout"]


class CategoryAdmin(admin.ModelAdmin):
    """Definition for admin-edit of Protocols."""

    fields = (
        "name",
        "sort_key",
        "type_group",
    )
    radio_fields = {"type_group": admin.HORIZONTAL}
    list_display = (
        "name",
        "sort_key",
        "type_group",
    )
    list_filter = ("type_group",)
    inlines = (ProtocolCategoryInline, CategoryLayoutInline)

    def get_readonly_fields(self, request, obj=None):
        if obj and obj.pk is not None:
            return ["name"]
        return []


class DefaultUnitAdmin(admin.ModelAdmin):
    def get_fields(self, request, obj=None):
        return [("measurement_type", "unit", "protocol", "parser")]

    def get_list_display(self, request):
        return ["measurement_type", "unit", "protocol", "parser"]


class MeasurementNameTransformAdmin(admin.ModelAdmin):
    def get_fields(self, request, obj=None):
        return [("input_type_name", "edd_type_name", "parser")]

    def get_list_display(self, request):
        return ["input_type_name", "edd_type_name", "parser"]


admin.site.register(models.Category, CategoryAdmin)
admin.site.register(models.Layout, LayoutAdmin)
admin.site.register(models.DefaultUnit, DefaultUnitAdmin)
admin.site.register(models.MeasurementNameTransform, MeasurementNameTransformAdmin)
