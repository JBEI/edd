# coding: utf-8

from django.contrib import admin
from django.contrib.sites.shortcuts import get_current_site

from .models import Branding, Page


class JoinedInLine(admin.TabularInline):
    """ Inline submodel for setting site"""
    model = Page
    extra = 0
    # customize fields to get site name and site url.
    raw_id_fields = ('site', 'branding')


class BrandingAdmin(admin.ModelAdmin):
    actions = ['use_this_branding']
    list_display = ('logo_name', 'logo_file', 'favicon_file', 'style_sheet')
    fieldsets = (
        (None, {
            "fields": ('logo_name', 'logo_file', 'favicon_file', 'style_sheet')
        }),
    )

    def use_this_branding(self, request, queryset):
        # get selected branding
        selected = queryset[0]
        # get current site
        current_site = get_current_site(request)
        # update site and branding
        Page.objects.update_or_create(
            site=current_site,
            defaults={
                'branding': selected
            })
        self.message_user(request, "%s set to current branding" % selected.logo_name)
    inlines = [JoinedInLine]


admin.site.register(Branding, BrandingAdmin)
