from django.contrib import admin
from django.utils import timezone
from main.models import *


class MetadataGroupAdmin(admin.ModelAdmin):
    """
    Definition for admin-edit of Metadata Groups
    """
    fields = ['group_name']


class MetadataTypeAdmin(admin.ModelAdmin):
    """
    Definition for admin-edit of Metadata Types
    """
    fields = ['type_name', 'input_size', 'default_value', 'prefix', 'postfix',
              'group', 'for_context']
    radio_fields = {'group': admin.VERTICAL, 'for_context': admin.VERTICAL}


class ProtocolAdmin(admin.ModelAdmin):
    """
    Definition for admin-edit of Protocols
    """
    fields = ['protocol_name', 'description', 'active', 'variant_of']
    list_display = ['protocol_name', 'description', 'active', 'variant_of', 'owner',]

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
    actions = ['solr_index']
    exclude = ['study_name', 'description', 'active', 'updates', 'comments',
               'files', 'contact', 'contact_extra']
    fields = []
    inlines = [UserPermissionInline, GroupPermissionInline]
    list_display = ['study_name', 'description', 'created', 'updated']

    def solr_index(self, request, queryset):
        pass
    solr_index.short_description = 'Index in Solr'


admin.site.register(MetadataGroup, MetadataGroupAdmin)
admin.site.register(MetadataType, MetadataTypeAdmin)
admin.site.register(Protocol, ProtocolAdmin)
admin.site.register(MeasurementType, MeasurementTypeAdmin)
admin.site.register(Study, StudyAdmin)
