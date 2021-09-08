from django.contrib import admin

from . import models


class StudyLogAdmin(admin.ModelAdmin):
    """Shows StudyLog events via the Admin site."""

    actions = None
    date_hierarchy = "timestamp"
    list_display = ("timestamp", "study", "event", "user", "detail")
    list_display_links = None
    list_filter = ("event",)
    search_fields = ("study__name", "study__slug", "user__username", "user__email")
    view_on_site = False

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        return False


admin.site.register(models.StudyLog, StudyLogAdmin)
