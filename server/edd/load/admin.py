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


class CategoryLayoutInline(admin.TabularInline):
    autocomplete_fields = ["layout"]
    model = models.Category.layouts.through


class CategoryAdmin(admin.ModelAdmin):
    """Definition for admin-edit of Protocols."""

    fields = (
        "name",
        "sort_key",
        "type_group",
    )
    inlines = (CategoryLayoutInline,)
    list_display = (
        "name",
        "sort_key",
        "type_group",
    )
    list_filter = ("type_group",)
    radio_fields = {"type_group": admin.HORIZONTAL}

    def get_readonly_fields(self, request, obj=None):
        if obj and obj.pk is not None:
            return ["name"]
        return []


class DefaultUnitAdmin(admin.ModelAdmin):
    autocomplete_fields = ("measurement_type", "unit", "protocol")
    fields = (("measurement_type", "unit", "protocol", "parser"),)
    list_display = ("measurement_type", "unit", "protocol", "parser")
    list_fields = ("unit", "protocol", "parser")


class MeasurementNameTransformAdminForm(forms.ModelForm):

    edd_type_name = forms.ModelChoiceField(
        queryset=edd_models.MeasurementType.objects.filter(),
        widget=AutocompleteSelect(
            models.MeasurementNameTransform._meta.get_field("edd_type_name"),
            admin.site,
        ),
    )

    class Meta:
        model = models.MeasurementNameTransform
        fields = ("input_type_name", "edd_type_name", "parser")
        labels = {
            "edd_type_name": _("EDD Measurement Type"),
        }


class MeasurementNameTransformAdmin(admin.ModelAdmin):
<<<<<<< HEAD
    autocomplete_fields = ("edd_type_name",)
    fields = (("input_type_name", "edd_type_name", "parser"),)
    list_display = ("input_type_name", "edd_type_name", "parser")
    list_fields = ("input_type_name", "parser")
=======
    form = MeasurementNameTransformAdminForm
    list_fields = ("input_type_name", "parser")

    def get_fields(self, request, obj=None):
        return [("input_type_name", "edd_type_name", "parser")]

    def get_list_display(self, request):
        return ["input_type_name", "edd_type_name", "parser"]
>>>>>>> 36bfb229 (Fixing error importing large EDD file)


admin.site.register(models.Category, CategoryAdmin)
admin.site.register(models.Layout, LayoutAdmin)
admin.site.register(models.DefaultUnit, DefaultUnitAdmin)
admin.site.register(models.MeasurementNameTransform, MeasurementNameTransformAdmin)
