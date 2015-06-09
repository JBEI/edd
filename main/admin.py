from django import forms
from django.contrib import admin
from django.contrib.auth import get_user_model
from django.contrib.auth.admin import UserAdmin
from django.db.models import Count
from django.utils.translation import ugettext_lazy as _
from main.forms import UserAutocompleteWidget
from main.models import *
from main.sbml_export import validate_sbml_attachment
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


class EDDObjectAdmin(admin.ModelAdmin):
    """ Parent class for EDD Object model admin classes """
    def save_model(self, request, obj, form, change):
        update = Update.load_request_update(request)
        if not change:
            obj.created = update
        obj.updated = update
        super(EDDObjectAdmin, self).save_model(request, obj, form, change)


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


class ProtocolAdmin(EDDObjectAdmin):
    """ Definition for admin-edit of Protocols """
    form = ProtocolAdminForm
    list_display = ['name', 'description', 'active', 'variant_of', 'owner',]
    inlines = (AttachmentInline, )

    def save_model(self, request, obj, form, change):
        if not change:
            obj.owned_by = request.user
        super(ProtocolAdmin, self).save_model(request, obj, form, change)


class StrainAdminForm(forms.ModelForm):
    class Meta:
        model = Strain
        exclude = ('updates', )


class StrainAdmin(EDDObjectAdmin):
    """ Definition for admin-edit of Strains """
    form = StrainAdminForm
    list_display = ('name', 'description', 'num_lines', 'num_studies', 'created', )

    def get_queryset(self, request):
        q = super(StrainAdmin, self).get_queryset(request)
        q = q.annotate(num_lines=Count('line'), num_studies=Count('line__study', distinct=True))
        return q

    # annotated queryset with count of lines referencing strain, need method to load annotation
    def num_lines(self, instance):
        return instance.num_lines
    num_lines.short_description = '# Lines'

    # annotated queryset with count of studies referencing strain, need method to load annotation
    def num_studies(self, instance):
        return instance.num_studies
    num_studies.short_description = '# Studies'


class CarbonSourceAdmin(EDDObjectAdmin):
    """ Definition for admin-edit of Carbon Sources """
    fields = ['name', 'description', 'active', 'labeling', 'volume', ]
    list_display = ['name', 'description', 'active', 'labeling', 'volume', 'created', ]


class MeasurementTypeAdmin(admin.ModelAdmin):
    """ Definition for admin-edit of Measurement Types """
    fields = ['type_name', 'short_name', 'type_group']
    list_display = ['type_name', 'short_name', 'type_group']


class UserPermissionInline(admin.TabularInline):
    """ Inline submodel for editing user permissions """
    model = UserPermission
    extra = 1

    def formfield_for_foreignkey(self, db_field, request, **kwargs):
        if db_field.name == 'user':
            kwargs['widget'] = UserAutocompleteWidget()
        return db_field.formfield(**kwargs)

class GroupPermissionInline(admin.TabularInline):
    """ Inline submodel for editing group permissions """
    model = GroupPermission
    extra = 1


class StudyAdmin(EDDObjectAdmin):
    """ Definition for admin-edit of Studies """
    actions = ['solr_index', ]
    exclude = ['name', 'description', 'active', 'updates', 'comments',
               'files', 'contact', 'contact_extra', 'metadata', ]
    fields = []
    inlines = (UserPermissionInline, GroupPermissionInline, AttachmentInline, )
    list_display = ['name', 'description', 'created', 'updated', ]

    def get_queryset(self, request):
        q = super(StudyAdmin, self).get_queryset(request)
        q = q.select_related('created__mod_by', 'updated__mod_by')
        return q

    def solr_index(self, request, queryset):
        solr = StudySearch(ident=request.user)
        # optimize queryset to fetch several related fields
        q = queryset.prefetch_related(
                'updates__mod_by__userprofile',
                'userpermission_set__user',
                'grouppermission_set__group',
                )
        solr.update(q)
    solr_index.short_description = 'Index in Solr'


class SBMLTemplateAdmin(EDDObjectAdmin):
    """ Definition fro admin-edit of SBML Templates """
    fields = ('name', 'description', 'sbml_file', 'biomass_calculation', )
    list_display = ('name', 'description', 'biomass_calculation', 'created', )
    inlines = (AttachmentInline, )

    def formfield_for_foreignkey(self, db_field, request, **kwargs):
        if db_field.name == 'sbml_file':
            kwargs['queryset'] = Attachment.objects.filter(object_ref=self._obj)
        return super(SBMLTemplateAdmin, self).formfield_for_foreignkey(db_field, request, **kwargs)

    def get_fields(self, request, obj=None):
        if obj:
            return ('name', 'description', 'sbml_file', 'biomass_calculation' ,)
        return ((), )

    def get_form(self, request, obj=None, **kwargs):
        # save model for later
        self._obj = obj
        return super(SBMLTemplateAdmin, self).get_form(request, obj, **kwargs)

    def get_queryset(self, request):
        q = super(SBMLTemplateAdmin, self).get_queryset(request)
        q = q.select_related('sbml_file')
        return q

    def save_model(self, request, obj, form, change):
        print "SBMLTemplateAdmin save_model: sbml = %s" % (obj.sbml_file, )
        if change:
            sbml = Attachment.objects.get(pk=obj.sbml_file).file
            sbml_data = validate_sbml_attachment(sbml.read())
            obj.biomass_exchange_name = self._extract_biomass_exchange_name(sbml_data.getModel())
        else:
            if len(form.files) == 1:
                sbml = list(form.files.values())[0]
                sbml_data = validate_sbml_attachment(sbml.read())
                sbml_model = sbml_data.getModel()
                obj.biomass_exchange_name = self._extract_biomass_exchange_name(sbml_model)
                # FIXME need to set obj.sbml_file at some point (after save?)
        super(SBMLTemplateAdmin, self).save_model(request, obj, form, change)

    def _extract_biomass_exchange_name(self, sbml_model):
        possible_exchange_ids = set()
        for reaction in sbml_model.getListOfReactions():
            rxid = reaction.getId()
            if ('biomass' in rxid) and ('core' in rxid):
                possible_exchange_ids.add(rxid)
        exchange_name = ''
        if len(possible_exchange_ids) == 1:
            exchange_name = list(possible_exchange_ids)[0]
        return exchange_name


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
        q = q.prefetch_related('groups', 'userprofile__institutions')
        print q.query
        solr.update(q)
    solr_index.short_description = 'Index in Solr'


admin.site.register(MetadataGroup, MetadataGroupAdmin)
admin.site.register(MetadataType, MetadataTypeAdmin)
admin.site.register(Protocol, ProtocolAdmin)
admin.site.register(Strain, StrainAdmin)
admin.site.register(CarbonSource, CarbonSourceAdmin)
admin.site.register(MeasurementType, MeasurementTypeAdmin)
admin.site.register(Study, StudyAdmin)
admin.site.register(SBMLTemplate, SBMLTemplateAdmin)
admin.site.unregister(get_user_model())
admin.site.register(get_user_model(), EDDUserAdmin)
