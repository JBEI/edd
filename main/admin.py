from django import forms
from django.contrib import admin
from django.contrib.auth import get_user_model
from django.contrib.auth.admin import UserAdmin
from django.utils.translation import ugettext_lazy as _
from main.forms import UserAutocompleteWidget
from main.models import *
from main.solr import *


class AttachmentInline(admin.TabularInline):
    """ Inline submodel for editing attachments """
    model = Attachment
    fields = ('file', 'description', 'created', 'mime_type', 'file_size')
    # would like to have file readonly for existing attachments
    # Django cannot currently do this on Inlines; see:
    # https://code.djangoproject.com/ticket/15602
    readonly_fields = ('created', 'file_size')
    extra = 1


class MetadataGroupAdmin(admin.ModelAdmin):
    """ Definition for admin-edit of Metadata Groups """
    fields = ['group_name']


class MetadataTypeAdmin(admin.ModelAdmin):
    """ Definition for admin-edit of Metadata Types """
    fields = ['type_name', 'input_size', 'default_value', 'prefix', 'postfix',
              'group', 'for_context']
    radio_fields = {'group': admin.VERTICAL, 'for_context': admin.VERTICAL}


class ProtocolAdminForm(forms.ModelForm):
    class Meta:
        model = Protocol
        fields = ('name', 'variant_of', 'active', 'owned_by', 'description', 'default_units', )
        help_texts = {
            'owned_by': _('(A user who is allowed to edit this protocol, even if not an Admin.)'),
            'default_units': _('(When measurement data are imported without units, this will ' +
                    'automatically be assigned.)'),
        }
        labels = {
            'name': _('Protocol'),
            'variant_of': _('Variant Of'),
            'active': _('Is Active'),
            'owned_by': _('Owner'),
            'description': _('Description'),
            'default_units': _('Default Units'),
        }
        widgets = {
            'owned_by': UserAutocompleteWidget()
        }

    def clean(self):
        super(ProtocolAdminForm, self).clean()
        print self.cleaned_data
        c_id = self.cleaned_data.get('owned_by', None)
        if c_id is not None:
            c_user = User.objects.get(pk=c_id)
            self.instance.owner = c_user


class ProtocolAdmin(admin.ModelAdmin):
    """ Definition for admin-edit of Protocols """
    form = ProtocolAdminForm
    list_display = ['name', 'description', 'active', 'variant_of', 'owner',]
    inlines = (AttachmentInline, )

    def save_model(self, request, obj, form, change):
        update = Update.load_request_update(request)
        if not change:
            obj.created = update
            obj.owned_by = request.user
        obj.updated = update
        obj.save()

    def save_related(self, request, form, formsets, change):
        #print request.FILES.keys()
        # FIXME get content_type from request.FILES and update Attachment
        return super(ProtocolAdmin, self).save_related(request, form, formsets, change)


class CarbonSourceAdmin(admin.ModelAdmin):
    """ Definition for admin-edit of Carbon Sources """
    fields = ['name', 'description', 'active', 'labeling', 'volume', ]
    list_display = ['name', 'description', 'active', 'labeling', 'volume', ]


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
    inlines = (UserPermissionInline, GroupPermissionInline, AttachmentInline, )
    list_display = ['name', 'description', 'created', 'updated']

    def get_queryset(self, request):
        q = super(StudyAdmin, self).get_queryset(request)
        q = q.select_related('created__mod_by', 'updated__mod_by')
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
admin.site.register(CarbonSource, CarbonSourceAdmin)
admin.site.register(MeasurementType, MeasurementTypeAdmin)
admin.site.register(Study, StudyAdmin)
admin.site.unregister(get_user_model())
admin.site.register(get_user_model(), EDDUserAdmin)
