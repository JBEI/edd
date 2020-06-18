from django.contrib import admin
from django.utils.translation import gettext_lazy as _

from .models import Institution, InstitutionID, UserProfile


class InstitutionInline(admin.TabularInline):
    model = InstitutionID
    extra = 1


class UserProfileAdmin(admin.ModelAdmin):
    actions = ["disable_account_action", "enable_account_action"]
    fields = ("user", "approved", "initials", "description", "preferences")
    inlines = (InstitutionInline,)
    list_display = ("user", "approved", "initials")

    def disable_account_action(self, request, queryset):
        queryset.update(approved=False)

    disable_account_action.short_description = _("Disable selected accounts")

    def enable_account_action(self, request, queryset):
        queryset.update(approved=True)

    enable_account_action.short_description = _("Enable selected accounts")

    def get_readonly_fields(self, request, obj=None):
        if obj:
            return self.readonly_fields + ("user",)
        return self.readonly_fields


class InstitutionAdmin(admin.ModelAdmin):
    pass


admin.site.register(UserProfile, UserProfileAdmin)
admin.site.register(Institution, InstitutionAdmin)
