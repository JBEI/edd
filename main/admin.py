from django.contrib import admin
from django.contrib.auth import get_user_model
from django.contrib.auth.admin import UserAdmin
from main.models import *
from main.solr import *


class MetadataGroupAdmin(admin.ModelAdmin):
    """ Definition for admin-edit of Metadata Groups """
    fields = ['group_name']


class MetadataTypeAdmin(admin.ModelAdmin):
    """ Definition for admin-edit of Metadata Types """
    fields = ['type_name', 'input_size', 'default_value', 'prefix', 'postfix',
              'group', 'for_context']
    radio_fields = {'group': admin.VERTICAL, 'for_context': admin.VERTICAL}


class ProtocolAdmin(admin.ModelAdmin):
    """ Definition for admin-edit of Protocols """
    fields = ['name', 'description', 'active', 'variant_of']
    list_display = ['name', 'description', 'active', 'variant_of', 'owner',]

    def save_model(self, request, obj, form, change):
        update = Update.load_request_update(request)
        if not change:
            obj.created = update
            obj.owned_by = request.user
        obj.updated = update
        obj.save()


class MeasurementTypeAdmin(admin.ModelAdmin):
    """ Definition for admin-edit of Measurement Types """
    fields = ['type_name', 'short_name', 'type_group']
    list_display = ['type_name', 'short_name', 'type_group']


class UserPermissionInline(admin.TabularInline):
    """ Inline submodel for editing user permissions """
    model = UserPermission
    extra = 1


class GroupPermissionInline(admin.TabularInline):
    """ Inline submodel for editing group permissions """
    model = GroupPermission
    extra = 1


class StudyAdmin(admin.ModelAdmin):
    """ Definition for admin-edit of Studies """
    actions = ['solr_index']
    exclude = ['name', 'description', 'active', 'updates', 'comments',
               'files', 'contact', 'contact_extra', 'metadata']
    fields = []
    inlines = [UserPermissionInline, GroupPermissionInline]
    list_display = ['name', 'description', 'created', 'updated']

    def get_queryset(self, request):
        q = super(StudyAdmin, self).get_queryset(request)
        #
        return q

    def solr_index(self, request, queryset):
        solr = StudySearch(ident=request.user)
        # optimize queryset to fetch several related fields
        q = queryset.prefetch_related('updates__mod_by__userprofile')
        q = q.prefetch_related('userpermission_set__user', 'grouppermission_set__group')
        solr.update(q)
    solr_index.short_description = 'Index in Solr'


class EDDUserAdmin(UserAdmin):
    """ Definition for admin-edit of user accounts """
    # actions is a list
    actions = UserAdmin.actions + ['solr_index', ]
    # list_display is a tuple
    list_display = UserAdmin.list_display + ('date_joined', 'last_login', )

    def solr_index(self, request, queryset):
        solr = UserSearch()
        # optimize queryset to fetch profile with JOIN, and single 
        # queries for group/institutions instead of one per record
        q = queryset.select_related('userprofile')
        q = q.prefetch_related('groups')
        q = q.prefetch_related('userprofile__institutions')
        print q.query
        solr.update(q)
    solr_index.short_description = 'Index in Solr'


admin.site.register(MetadataGroup, MetadataGroupAdmin)
admin.site.register(MetadataType, MetadataTypeAdmin)
admin.site.register(Protocol, ProtocolAdmin)
admin.site.register(MeasurementType, MeasurementTypeAdmin)
admin.site.register(Study, StudyAdmin)
admin.site.unregister(get_user_model())
admin.site.register(get_user_model(), EDDUserAdmin)
