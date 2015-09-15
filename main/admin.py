# coding: utf-8

from django import forms
from django.contrib import admin
from django.contrib.auth import get_user_model
from django.contrib.auth.admin import UserAdmin
from django.db.models import Count
from django.utils.translation import ugettext_lazy as _
from django_auth_ldap.backend import LDAPBackend
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


class AssayAdmin(admin.ModelAdmin):
    """ Definition for admin-edit of Assays """
    fields = ('name', 'description', )
    list_display = ('name', 'study_name', 'line_name', 'protocol_name', )
    search_fields = ('name', 'line__name', 'protocol__name', 'line__study__name')

    def get_queryset(self, request):
        q = super(AssayAdmin, self).get_queryset(request)
        return q.select_related('line__study', 'protocol')

    def line_name(self, instance):
        return instance.line.name
    line_name.short_description = _('Line')

    def protocol_name(self, instance):
        return instance.protocol.name
    protocol_name.short_description = _('Protocol')

    def study_name(self, instance):
        return instance.line.study.name
    study_name.short_description = _('Study')


class MetadataGroupAdmin(admin.ModelAdmin):
    """ Definition for admin-edit of Metadata Groups """
    fields = ['group_name']


class MetadataTypeAdmin(admin.ModelAdmin):
    """ Definition for admin-edit of Metadata Types """
    fields = ('type_name', 'input_size', 'default_value', 'prefix', 'postfix',
              'group', 'for_context', )
    list_display = ('type_name', 'prefix', 'default_value', 'postfix', 'is_line', 'is_protocol',
                    'num_lines', 'num_assay', 'group', )
    list_filter = ('group', )
    radio_fields = {'group': admin.VERTICAL, 'for_context': admin.VERTICAL}
    search_fields = ('type_name', )

    def get_queryset(self, request):
        q = super(MetadataTypeAdmin, self).get_queryset(request)
        self._num_lines = Line.metadata_type_frequencies()
        self._num_assay = Assay.metadata_type_frequencies()
        #q = q.annotate(num_lines=Count('line'), num_studies=Count('line__study', distinct=True))
        return q

    def is_line(self, instance):
        return instance.for_line()
    is_line.boolean = True
    is_line.short_description = 'Lines?'

    def is_protocol(self, instance):
        return instance.for_protocol()
    is_protocol.boolean = True
    is_protocol.short_description = 'Protocols/Assays?'

    def num_lines(self, instance):
        return self._num_lines.get(instance.pk, 0)
    num_lines.short_description = '# Lines'

    def num_assay(self, instance):
        return self._num_assay.get(instance.pk, 0)
    num_assay.short_description = '# Assays'


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
        fields = ('name', 'registry_url', 'description', 'active', )
        labels = {
            'name': _('Strain'),
            'registry_url': _('Registry URL'),
            'description': _('Description'),
            'active': _('Is Active'),
        }


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
    search_fields = ('type_name', 'short_name', )

    def get_fields(self, request, obj=None):
        if issubclass(self.model, Metabolite):
            return (('short_name', 'molar_mass', 'charge', ), 'type_name', 'molecular_formula', )
        elif issubclass(self.model, GeneIdentifier):
            return ('type_name', ('location_in_genome', 'positive_strand', 'location_start',
                    'location_end', 'gene_length'), )
        elif issubclass(self.model, Phosphor):
            return ('type_name', 'short_name', ('excitation_wavelength', 'emission_wavelength', ),
                    'reference_type', )
        # always keep check for MeasurementType last
        elif issubclass(self.model, MeasurementType):
            return ('type_name', 'short_name', )
        return ('type_name', 'short_name', )

    def get_list_display(self, request):
        if issubclass(self.model, Metabolite):
            return ('type_name', 'short_name', 'molecular_formula', 'molar_mass', 'charge',
                    '_keywords', '_study_count', )
        elif issubclass(self.model, GeneIdentifier):
            return ('type_name', 'location_in_genome', 'positive_strand', 'location_start',
                    'location_end', 'gene_length', '_study_count', )
        elif issubclass(self.model, Phosphor):
            return ('type_name', 'short_name', 'excitation_wavelength', 'emission_wavelength',
                    'reference_type', '_study_count', )
        # always keep check for MeasurementType last
        elif issubclass(self.model, MeasurementType):
            return ('type_name', 'short_name', '_study_count', )
        return ('type_name', 'short_name', '_study_count', )

    def get_queryset(self, request):
        q = super(MeasurementTypeAdmin, self).get_queryset(request)
        if self.model == MeasurementType:
            q = q.filter(type_group=MeasurementGroup.GENERIC)
        q = q.annotate(num_studies=Count('measurement__assay__line__study', distinct=True))
        return q

    def _keywords(self, obj):
        if issubclass(self.model, Metabolite):
            return obj.keywords_str
        return ''
    _keywords.short_description = 'Keywords'

    def _study_count(self, obj):
        return obj.num_studies
    _study_count.short_description = '# Studies'


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
        q = queryset.select_related(
                'updated__mod_by__userprofile',
                'created__mod_by__userprofile',
            ).prefetch_related(
                'userpermission_set__user',
                'grouppermission_set__group',
            )
        solr.update(list(q))
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
        # Only show attachment inline for NEW templates
        return ((), )

    def get_form(self, request, obj=None, **kwargs):
        # save model for later
        self._obj = obj
        return super(SBMLTemplateAdmin, self).get_form(request, obj, **kwargs)

    def get_formsets_with_inlines(self, request, obj=None):
        for inline in self.get_inline_instances(request, obj):
            if isinstance(inline, AttachmentInline) and obj is None:
                inline.extra = 1
                inline.max_num = 1
            yield inline.get_formset(request, obj), inline

    def get_queryset(self, request):
        q = super(SBMLTemplateAdmin, self).get_queryset(request)
        q = q.select_related('sbml_file')
        return q

    def save_model(self, request, obj, form, change):
        if change:
            sbml = obj.sbml_file.file
            sbml_data = validate_sbml_attachment(sbml.read())
            obj.biomass_exchange_name = self._extract_biomass_exchange_name(sbml_data.getModel())
        elif len(form.files) == 1:
            sbml = list(form.files.values())[0]
            sbml_data = validate_sbml_attachment(sbml.read())
            sbml_model = sbml_data.getModel()
            obj.biomass_exchange_name = self._extract_biomass_exchange_name(sbml_model)
            obj.name = obj.biomass_exchange_name
            # stash the object so save_related can set obj.sbml_file
            self._obj = obj
        super(SBMLTemplateAdmin, self).save_model(request, obj, form, change)

    def save_related(self, request, form, formsets, change):
        super(SBMLTemplateAdmin, self).save_related(request, form, formsets, change)
        if not change and len(form.files) == 1:
            # there will only be one file at this point
            self._obj.sbml_file = self._obj.files.all()[0]
            self._obj.description = self._obj.sbml_file.description
            self._obj.save()

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
    actions = UserAdmin.actions + ['solr_index', 'update_groups_from_ldap', ]
    # list_display is a tuple
    list_display = UserAdmin.list_display + ('date_joined', 'last_login', )

    def solr_index(self, request, queryset):
        solr = UserSearch()
        # optimize queryset to fetch profile with JOIN, and single 
        # queries for group/institutions instead of one per record
        q = queryset.select_related('userprofile')
        q = q.prefetch_related('groups', 'userprofile__institutions')
        solr.update(q)
    solr_index.short_description = 'Index in Solr'

    def update_groups_from_ldap(self, request, queryset):
        backend = LDAPBackend()
        for user in queryset:
            ldap_user = backend.get_user(user.pk)
            try:
                ldap_user.ldap_user._mirror_groups()
            except Exception, e:
                # _mirror_groups fails when ldap_user is not Active, so delete all groups
                user.groups.clear()
    update_groups_from_ldap.short_description = 'Update Groups from LDAP'


admin.site.register(MetadataGroup, MetadataGroupAdmin)
admin.site.register(MetadataType, MetadataTypeAdmin)
admin.site.register(Protocol, ProtocolAdmin)
admin.site.register(Strain, StrainAdmin)
admin.site.register(CarbonSource, CarbonSourceAdmin)
admin.site.register(MeasurementType, MeasurementTypeAdmin)
admin.site.register(Metabolite, MeasurementTypeAdmin)
admin.site.register(GeneIdentifier, MeasurementTypeAdmin)
admin.site.register(ProteinIdentifier, MeasurementTypeAdmin)
admin.site.register(Phosphor, MeasurementTypeAdmin)
admin.site.register(Study, StudyAdmin)
admin.site.register(Assay, AssayAdmin)
admin.site.register(SBMLTemplate, SBMLTemplateAdmin)
admin.site.unregister(get_user_model())
admin.site.register(get_user_model(), EDDUserAdmin)
