"""Defines admin UI for the edd.load app."""

import logging

from django import forms
from django.contrib import admin
from django.contrib.admin.widgets import AutocompleteSelect
from django.utils.translation import gettext_lazy as _

from main import models as edd_models

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


class DefaultUnitAdminForm(forms.ModelForm):

    measurement_type = forms.ModelChoiceField(
        queryset=edd_models.MeasurementType.objects.filter(),
        widget=AutocompleteSelect(
            models.DefaultUnit._meta.get_field("measurement_type"), admin.site,
        ),
    )

    class Meta:
        model = models.DefaultUnit
        fields = ("measurement_type", "unit", "protocol", "parser")
        labels = {
            "measurement_type": _("Measurement Type"),
        }


class DefaultUnitAdmin(admin.ModelAdmin):
    form = DefaultUnitAdminForm
    list_fields = ("unit", "protocol", "parser")

    def get_fields(self, request, obj=None):
        return [("measurement_type", "unit", "protocol", "parser")]

    def get_list_display(self, request):
        return ["measurement_type", "unit", "protocol", "parser"]


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
    form = MeasurementNameTransformAdminForm
    list_fields = ("input_type_name", "parser")

    def get_fields(self, request, obj=None):
        return [("input_type_name", "edd_type_name", "parser")]

    def get_list_display(self, request):
        return ["input_type_name", "edd_type_name", "parser"]


admin.site.register(models.Category, CategoryAdmin)
admin.site.register(models.Layout, LayoutAdmin)
admin.site.register(models.DefaultUnit, DefaultUnitAdmin)
admin.site.register(models.MeasurementNameTransform, MeasurementNameTransformAdmin)
