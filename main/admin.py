from django.contrib import admin
from django.utils import timezone
from main.models import *


class ProtocolAdmin(admin.ModelAdmin):
    """
    Definition for admin-edit of Protocols
    """
    fields = ['protocol_name', 'description', 'active', 'variant_of']
    list_display = ['protocol_name', 'description', 'active', 'variant_of', 'creator', 'owner',
                    'last_modified']

    def save_model(self, request, obj, form, change):
        update = Update.load_request_update(request)
        if not change:
            obj.created = update
            obj.owned_by = request.user
        obj.updated = update
        obj.save()


class MeasurementTypeAdmin(admin.ModelAdmin):
    """
    Definition for admin-edit of Measurement Types
    """
    fields = ['type_name', 'short_name', 'type_group']
    list_display = ['type_name', 'short_name', 'type_group']


class UserPermissionInline(admin.TabularInline):
    """
    """
    model = UserPermission
    extra = 1


class GroupPermissionInline(admin.TabularInline):
    """
    """
    model = GroupPermission
    extra = 1
    

class StudyAdmin(admin.ModelAdmin):
    """
    Definition for admin-edit of Studies
    """
    fields = None
    exclude = ['study_name', 'description', 'active', 'created', 'updated', 'contact',
               'contact_extra']
    list_display = ['study_name', 'description']
    inlines = [UserPermissionInline, GroupPermissionInline]


admin.site.register(Protocol, ProtocolAdmin)
admin.site.register(MeasurementType, MeasurementTypeAdmin)
admin.site.register(Study, StudyAdmin)
