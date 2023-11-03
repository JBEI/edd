"""Defines admin UI for the edd.load app."""

import logging

from django.contrib import admin

from . import models

logger = logging.getLogger(__name__)


class DefaultUnitAdmin(admin.ModelAdmin):
    autocomplete_fields = ("measurement_type", "unit", "protocol")
    fields = (("measurement_type", "unit", "protocol", "parser"),)
    list_display = ("measurement_type", "unit", "protocol", "parser")
    list_fields = ("unit", "protocol", "parser")


class MeasurementNameTransformAdmin(admin.ModelAdmin):
    autocomplete_fields = ("edd_type_name",)
    fields = (("input_type_name", "edd_type_name", "parser"),)
    list_display = ("input_type_name", "edd_type_name", "parser")
    list_fields = ("input_type_name", "parser")


admin.site.register(models.DefaultUnit, DefaultUnitAdmin)
admin.site.register(models.MeasurementNameTransform, MeasurementNameTransformAdmin)
