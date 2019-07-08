# coding: utf-8

from django.contrib import admin

from .models import Institution, InstitutionID, UserProfile


class InstitutionInline(admin.TabularInline):
    model = InstitutionID
    extra = 1


class UserProfileAdmin(admin.ModelAdmin):
    fields = ("user", "initials", "description", "preferences")
    inlines = (InstitutionInline,)
    list_display = ("user", "initials")

    def get_readonly_fields(self, request, obj=None):
        if obj:
            return self.readonly_fields + ("user",)
        return self.readonly_fields


class InstitutionAdmin(admin.ModelAdmin):
    pass


admin.site.register(UserProfile, UserProfileAdmin)
admin.site.register(Institution, InstitutionAdmin)
