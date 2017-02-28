# coding: utf-8

from django.contrib import admin

from .models import Branding


class BrandingAdmin(admin.ModelAdmin):
    list_display = ('logo_name', 'logo_file', 'flavicon_file', 'style_sheets')
    fieldsets = (
        (None, {
            "fields": ('logo_name', 'logo_file', 'flavicon_file', 'style_sheets')
        }),
    )

admin.site.register(Branding, BrandingAdmin)
