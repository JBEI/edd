# coding: utf-8

from django import forms
from django.conf import settings
from django.contrib import admin, messages
from django.contrib.auth import get_user_model
from django.contrib.auth.admin import UserAdmin
from django.core.validators import RegexValidator
from django.db import connection
from django.core.urlresolvers import reverse
from django.db.models import Count, Q
from django.http import HttpResponseRedirect
from django.shortcuts import render
from django.utils.html import escape, format_html
from django.utils.safestring import mark_safe
from django.utils.translation import ugettext_lazy as _
from django_auth_ldap.backend import LDAPBackend

import logging

from . import models
from .export.sbml import validate_sbml_attachment
from .forms import (
    MeasurementTypeAutocompleteWidget, MetadataTypeAutocompleteWidget, RegistryAutocompleteWidget,
    RegistryValidator, UserAutocompleteWidget
)
from .solr import StudySearch, UserSearch

logger = logging.getLogger(__name__)


class AttachmentInline(admin.TabularInline):
    """ Inline submodel for editing attachments """
    model = models.Attachment
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
    list_display = ('type_name', 'prefix', 'default_value', 'postfix', 'for_context',
                    'num_lines', 'num_assay', 'group', )
    list_filter = ('group', )
    radio_fields = {'group': admin.VERTICAL, 'for_context': admin.VERTICAL}
    search_fields = ('type_name', )

    def get_queryset(self, request):
        q = super(MetadataTypeAdmin, self).get_queryset(request)
        self._num_lines = models.Line.metadata_type_frequencies()
        self._num_assay = models.Assay.metadata_type_frequencies()
        # q = q.annotate(num_lines=Count('line'), num_studies=Count('line__study', distinct=True))
        return q

    def num_lines(self, instance):
        return self._num_lines.get(instance.pk, 0)
    num_lines.short_description = '# Lines'

    def num_assay(self, instance):
        return self._num_assay.get(instance.pk, 0)
    num_assay.short_description = '# Assays'


class EDDObjectAdmin(admin.ModelAdmin):
    """ Parent class for EDD Object model admin classes """
    search_fields = ['name', 'description', ]


class ProtocolAdminForm(forms.ModelForm):
    class Meta:
        model = models.Protocol
        fields = (
            'name', 'variant_of', 'active', 'owned_by', 'description', 'default_units',
            'categorization',
        )
        help_texts = {
            'owned_by': _('(A user who is allowed to edit this protocol, even if not an Admin.)'),
            'default_units': _('(When measurement data are imported without units, this will '
                               'automatically be assigned.)'),
            'categorization': _('(Determines the handling of data in SBML exports.)'),
        }
        labels = {
            'name': _('Protocol'),
            'variant_of': _('Variant Of'),
            'active': _('Is Active'),
            'owned_by': _('Owner'),
            'description': _('Description'),
            'default_units': _('Default Units'),
            'categorization': _('Categorization'),
        }
        widgets = {
            'owned_by': UserAutocompleteWidget()
        }

    def clean(self):
        super(ProtocolAdminForm, self).clean()
        c_user = self.cleaned_data.get('owned_by', None)
        if c_user is not None:
            self.instance.owner = c_user


class ProtocolAdmin(EDDObjectAdmin):
    """ Definition for admin-edit of Protocols """
    form = ProtocolAdminForm
    list_display = ['name', 'description', 'active', 'variant_of', 'categorization', 'owner', ]
    inlines = (AttachmentInline, )

    def save_model(self, request, obj, form, change):
        if not change:
            obj.owned_by = request.user
        super(ProtocolAdmin, self).save_model(request, obj, form, change)


class StrainAdmin(EDDObjectAdmin):
    """ Definition for admin-edit of Strains """
    actions = ['merge_with_action', ]
    list_display = (
        'name', 'description', 'hyperlink_strain', 'num_lines', 'num_studies', 'created',
    )

    def __init__(self, *args, **kwargs):
        super(StrainAdmin, self).__init__(*args, **kwargs)
        self.ice_validator = RegistryValidator()

    def has_add_permission(self, request):
        """ Disable adding via admin interface. Strains are automatically added when referenced
            via the main.forms.RegistryValidator. """
        return False

    def get_fields(self, request, obj=None):
        self.ice_validator = RegistryValidator(existing_strain=obj)
        assert(obj)
        # existing strain with link to ICE
        return ['name', 'description', 'registry_url', 'study_list', ]

    def formfield_for_dbfield(self, db_field, **kwargs):
        if db_field.name == 'registry_id':
            kwargs['widget'] = RegistryAutocompleteWidget()
            kwargs['validators'] = [self.ice_validator.validate, ]
        return super(StrainAdmin, self).formfield_for_dbfield(db_field, **kwargs)

    def get_readonly_fields(self, request, obj=None):
        assert(obj)
        if not obj.registry_id:  # existing strain without link to ICE
            return ['study_list', ]
        return ['name', 'description', 'registry_url', 'study_list', ]

    def get_queryset(self, request):
        q = super(StrainAdmin, self).get_queryset(request)
        q = q.annotate(num_lines=Count('line'), num_studies=Count('line__study', distinct=True))
        q = q.select_related('created__mod_by')
        return q

    def hyperlink_strain(self, instance):
        if instance.registry_url:
            return format_html('<a href="{}" target="_new">ICE entry</a>', instance.registry_url)
        return '-'
    hyperlink_strain.admin_order_field = 'registry_url'
    hyperlink_strain.short_description = 'ICE Link'

    class MergeWithStrainForm(forms.Form):
        # same name as admin site uses for checkboxes to select items for actions
        _selected_action = forms.CharField(widget=forms.MultipleHiddenInput)
        strain = forms.ModelChoiceField(
            models.Strain.objects.exclude(Q(registry_id=None) | Q(registry_url=None)),
            widget=RegistryAutocompleteWidget,
            to_field_name='registry_id',
        )

    def merge_with_action(self, request, queryset):
        form = None
        # only allow merges when registry_id or registry_url are None
        queryset = queryset.filter(Q(registry_id=None) | Q(registry_url=None))
        if 'merge' in request.POST:
            form = self.MergeWithStrainForm(request.POST)
            if form.is_valid():
                strain = form.cleaned_data['strain']
                # Update all lines referencing strains in queryset to reference `strain` instead
                lines = models.Line.objects.filter(strains__in=queryset)
                for line in lines:
                    line.strains.remove(*queryset.all())
                    line.strains.add(strain)
                strain_count = queryset.count()
                queryset.delete()
                messages.info(
                    request,
                    _("Merged %(strain_count)d strains, updating %(line_count)d lines.") % {
                        'strain_count': strain_count,
                        'line_count': lines.count(),
                    }
                )
                return HttpResponseRedirect(request.get_full_path())
        if not form:
            form = self.MergeWithStrainForm(
                initial={'_selected_action': request.POST.getlist(admin.ACTION_CHECKBOX_NAME)},
            )
        return render(request, 'admin/merge_strain.html', context={
            'strains': queryset,
            'form': form
        })
    merge_with_action.short_description = 'Merge records into …'

    # annotated queryset with count of lines referencing strain, need method to load annotation
    def num_lines(self, instance):
        return instance.num_lines
    num_lines.admin_order_field = 'num_lines'
    num_lines.short_description = '# Lines'

    # annotated queryset with count of studies referencing strain, need method to load annotation
    def num_studies(self, instance):
        return instance.num_studies
    num_studies.admin_order_field = 'num_studies'
    num_studies.short_description = '# Studies'

    def save_model(self, request, obj, form, change):
        if self.ice_validator.count != 0:
            messages.error(request, _('A strain record already exists for that ICE entry!'))
            return
        if self.ice_validator.entry:
            obj.registry_url = self.ice_validator.entry.url
        super(StrainAdmin, self).save_model(request, obj, form, change)

    def study_list(self, instance):
        qs = models.Study.objects.filter(line__strains=instance).distinct()
        count = qs.count()
        if count:
            html = ', '.join([
                '<a href="%(link)s">%(name)s</a>' % {
                    'link': reverse('admin:main_study_change', args=[s.id]),
                    'name': escape(s.name)
                }
                for s in qs[:10]
            ])
            if count > 10:
                html += (', and %s more.' % (count - 10, ))
            return mark_safe(html)
        return None
    study_list.short_description = 'Referenced in Studies'


class CarbonSourceAdmin(EDDObjectAdmin):
    """ Definition for admin-edit of Carbon Sources """
    fields = ['name', 'description', 'active', 'labeling', 'volume', ]
    list_display = ['name', 'description', 'active', 'labeling', 'volume', 'created', ]


class MeasurementTypeAdmin(admin.ModelAdmin):
    """ Definition for admin-edit of Measurement Types """
    actions = ['merge_with_action']

    def get_fields(self, request, obj=None):
        return [
            ('type_name', 'short_name', ),
            'alt_names',
            'type_source',
            'study_list',
        ]

    def get_list_display(self, request):
        return ['type_name', 'short_name', '_study_count', 'type_source', ]

    def get_merge_autowidget(self):
        return MeasurementTypeAutocompleteWidget

    def get_merge_form(self, request):
        class MergeForm(forms.Form):
            # same name as admin site uses for checkboxes to select items for actions
            _selected_action = forms.CharField(widget=forms.MultipleHiddenInput)
            mtype = forms.ModelChoiceField(
                self.get_queryset(request),
                label=self.model._meta.verbose_name,
                widget=self.get_merge_autowidget(),
            )
        return MergeForm

    def get_queryset(self, request):
        qs = super(MeasurementTypeAdmin, self).get_queryset(request)
        if self.model == models.MeasurementType:
            qs = qs.filter(type_group=models.MeasurementType.Group.GENERIC)
        qs = qs.annotate(num_studies=Count('measurement__assay__line__study', distinct=True))
        return qs

    def get_readonly_fields(self, request, obj=None):
        # TODO: need to make a custom ModelForm to properly handle alt_names
        return ['alt_names', 'type_source', 'study_list', ]

    def get_search_fields(self, request):
        return ['type_name', 'short_name', 'alt_names', ]

    def merge_with_action(self, request, queryset):
        MergeForm = self.get_merge_form(request)
        form = None
        if 'merge' in request.POST:
            form = MergeForm(request.POST)
            if form.is_valid():
                mtype = form.cleaned_data['mtype']
                # update all measurements referencing mtype
                models.Measurement.objects.filter(
                    measurement_type__in=queryset,
                ).update(measurement_type=mtype)
                queryset.delete()
                return HttpResponseRedirect(request.get_full_path())
        if not form:
            form = MergeForm(
                initial={'_selected_action': request.POST.getlist(admin.ACTION_CHECKBOX_NAME)},
            )
        return render(request, 'admin/merge_measurement_type.html', context={
            'types': queryset,
            'form': form,
        })
    merge_with_action.short_description = 'Merge records into …'

    def save_model(self, request, obj, form, change):
        # Save Datasource of editing user first
        source = models.Datasource(name=request.user.username)
        source.save()
        obj.type_source = source
        super(MeasurementTypeAdmin, self).save_model(request, obj, form, change)

    def study_list(self, instance):
        relevant_study = Q(line__assay__measurement__measurement_type=instance)
        qs = models.Study.objects.filter(relevant_study).distinct()
        count = qs.count()
        if count:
            html = ', '.join([
                '<a href="%(link)s">%(name)s</a>' % {
                    'link': reverse('admin:main_study_change', args=[s.id]),
                    'name': escape(s.name)
                }
                for s in qs[:10]
            ])
            if count > 10:
                html += (', and %s more.' % (count - 10, ))
            return mark_safe(html)
        return None
    study_list.short_description = 'Referenced in Studies'

    def _study_count(self, obj):
        return obj.num_studies
    _study_count.admin_order_field = 'num_studies'
    _study_count.short_description = '# Studies'


class TagListFilter(admin.SimpleListFilter):
    title = _('Tag')
    parameter_name = 'tags'

    def lookups(self, request, model_admin):
        lookups = []
        with connection.cursor() as cursor:
            cursor.execute('SELECT DISTINCT unnest(tags) FROM metabolite')
            lookups = [item + item for item in cursor.fetchall()]
        return lookups

    def queryset(self, request, queryset):
        tag = self.value()
        if tag:
            return queryset.filter(tags__contains=[self.value(), ])
        return queryset


class MetaboliteAdmin(MeasurementTypeAdmin):
    list_filter = [TagListFilter, ]

    def get_fields(self, request, obj=None):
        return super(MetaboliteAdmin, self).get_fields(request, obj) + [
            'pubchem_cid',
            ('molecular_formula', 'molar_mass', 'charge', ),  # grouping in tuple puts in a row
            'smiles',
            'id_map',
            'tags',
        ]

    def get_list_display(self, request):
        # complete override
        return [
            'type_name',
            'short_name',
            'pubchem_cid',
            'molecular_formula',
            'molar_mass',
            'charge',
            '_tags',
            '_study_count',
            'type_source',
        ]

    def get_merge_autowidget(self):
        opt = {'text_attr': {'class': 'autocomp', 'eddautocompletetype': 'Metabolite'}}
        return MeasurementTypeAutocompleteWidget(opt=opt)

    def get_queryset(self, request):
        qs = super(MetaboliteAdmin, self).get_queryset(request)
        qs = qs.select_related('type_source')
        return qs

    def get_readonly_fields(self, request, obj=None):
        readonly = super(MetaboliteAdmin, self).get_readonly_fields(request, obj)
        # TODO: need to make a custom ModelForm to properly handle id_map and tags
        readonly = readonly + ['id_map', 'tags', ]
        if obj and obj.pubchem_cid is None:
            return readonly
        return readonly + ['pubchem_cid', ]

    def _tags(self, obj):
        return ', '.join(obj.tags)


class ProteinAdmin(MeasurementTypeAdmin):

    def get_form(self, request, obj=None, **kwargs):
        """
        Override default generated admin form to add specialized help text and verification for
        Uniprot accession ID's. This is a bit indirect since type_name is inherited from
        MeasurementTypeAdmin.
        """

        # override the type_name label to indicate it should be a UniProt accession ID
        if settings.REQUIRE_UNIPROT_ACCESSION_IDS:
            labels = kwargs.get('labels')
            if not labels:
                labels = {}
                kwargs['labels'] = labels
            labels['type_name'] = _('Protein Name')
            labels['accession_id'] = _('UniProt Accession ID')

        generated_form = super(ProteinAdmin, self).get_form(request, obj, **kwargs)

        # require that newly-created ProteinIdentifiers have an accession ID matching the
        # expected pattern. existing ID's that don't conform should still be editable
        new_identifier = not obj
        if new_identifier and settings.REQUIRE_UNIPROT_ACCESSION_IDS:
            generated_form.base_fields['type_name'].validators.append(RegexValidator(
                    regex=models.ProteinIdentifier.accession_pattern,
                    message=_('New entries must be valid UniProt accession IDs')))
        return generated_form

    def get_fields(self, request, obj=None):
        return super(ProteinAdmin, self).get_fields(request, obj) + [
            'accession_id',
            ('length', 'mass',),
        ]

    def get_list_display(self, request):
        # complete override
        return [
            'type_name', 'short_name', 'accession_id', 'length', 'mass', '_study_count',
            'type_source',
        ]

    def get_merge_autowidget(self):
        opt = {'text_attr': {'class': 'autocomp', 'eddautocompletetype': 'Protein'}}
        return MeasurementTypeAutocompleteWidget(opt=opt)

    def get_queryset(self, request):
        qs = super(ProteinAdmin, self).get_queryset(request)
        qs = qs.select_related('type_source')
        return qs

    def get_readonly_fields(self, request, obj=None):
        # only allow editing accession ID when it is not already set
        if obj and obj.accession_id is None:
            return ['type_source', 'study_list', ]
        return ['accession_id', 'type_source', 'study_list', ]

    def get_search_results(self, request, queryset, search_term):
        search_term = models.ProteinIdentifier.match_accession_id(search_term)
        return super(ProteinAdmin, self).get_search_results(request, queryset, search_term)


class GeneAdmin(MeasurementTypeAdmin):
    def get_fields(self, request, obj=None):
        return super(GeneAdmin, self).get_fields(request, obj) + [
            ('gene_length'),  # join these on the same row
        ]

    def get_list_display(self, request):
        # complete override
        return [
            'type_name', 'gene_length', '_study_count', 'type_source',
        ]

    def get_merge_autowidget(self):
        opt = {'text_attr': {'class': 'autocomp', 'eddautocompletetype': 'Gene'}}
        return MeasurementTypeAutocompleteWidget(opt=opt)


class PhosphorAdmin(MeasurementTypeAdmin):
    def get_fields(self, request, obj=None):
        return super(PhosphorAdmin, self).get_fields(request, obj) + [
            ('excitation_wavelength', 'emission_wavelength', ),
            'reference_type', 'study_list',
        ]

    def get_list_display(self, request):
        # complete override
        return [
            'type_name', 'short_name', 'excitation_wavelength', 'emission_wavelength',
            'reference_type', '_study_count',
        ]

    def get_merge_autowidget(self):
        opt = {'text_attr': {'class': 'autocomp', 'eddautocompletetype': 'Phosphor'}}
        return MeasurementTypeAutocompleteWidget(opt=opt)


class UserPermissionInline(admin.TabularInline):
    """ Inline submodel for editing user permissions """
    model = models.UserPermission
    extra = 1

    def formfield_for_foreignkey(self, db_field, request, **kwargs):
        if db_field.name == 'user':
            kwargs['widget'] = UserAutocompleteWidget()
        return db_field.formfield(**kwargs)


class GroupPermissionInline(admin.TabularInline):
    """ Inline submodel for editing group permissions """
    model = models.GroupPermission
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
    fields = (
        'name', 'description', 'sbml_file',
        'biomass_calculation', 'biomass_exchange_name',
    )
    list_display = (
        'name', 'description',
        'biomass_calculation', 'biomass_exchange_name',
        'created',
    )
    inlines = (AttachmentInline, )

    def formfield_for_foreignkey(self, db_field, request, **kwargs):
        if db_field.name == 'sbml_file':
            kwargs['queryset'] = models.Attachment.objects.filter(object_ref=self._obj)
        return super(SBMLTemplateAdmin, self).formfield_for_foreignkey(db_field, request, **kwargs)

    def get_fields(self, request, obj=None):
        if obj:
            return self.fields
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
            if not obj.biomass_exchange_name:
                obj.biomass_exchange_name = self._extract_biomass_exchange_name(
                    sbml_data.getModel()
                )
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
            except Exception:
                # _mirror_groups fails when ldap_user is not Active, so delete all groups
                user.groups.clear()
    update_groups_from_ldap.short_description = 'Update Groups from LDAP'


class WorklistColumnInline(admin.TabularInline):
    """ Inline submodel for editing worklist columns. """
    model = models.WorklistColumn
    fields = ('ordering', 'heading', 'meta_type', 'default_value', 'help_text', )
    ordering = ('ordering', 'heading', )
    extra = 1

    def formfield_for_foreignkey(self, db_field, request, **kwargs):
        if db_field.name == 'meta_type':
            kwargs['widget'] = MetadataTypeAutocompleteWidget()
        return db_field.formfield(**kwargs)


class WorklistTemplateAdmin(EDDObjectAdmin):
    fields = ('name', 'description', 'protocol', )
    list_display = ('name', 'description', 'protocol', )
    inlines = (WorklistColumnInline, )


class MeasurementUnitAdmin(admin.ModelAdmin):
    pass


admin.site.register(models.MetadataGroup, MetadataGroupAdmin)
admin.site.register(models.MetadataType, MetadataTypeAdmin)
admin.site.register(models.Protocol, ProtocolAdmin)
admin.site.register(models.Strain, StrainAdmin)
admin.site.register(models.CarbonSource, CarbonSourceAdmin)
admin.site.register(models.MeasurementType, MeasurementTypeAdmin)
admin.site.register(models.Metabolite, MetaboliteAdmin)
admin.site.register(models.GeneIdentifier, GeneAdmin)
admin.site.register(models.ProteinIdentifier, ProteinAdmin)
admin.site.register(models.Phosphor, PhosphorAdmin)
admin.site.register(models.Study, StudyAdmin)
admin.site.register(models.Assay, AssayAdmin)
admin.site.register(models.SBMLTemplate, SBMLTemplateAdmin)
admin.site.register(models.WorklistTemplate, WorklistTemplateAdmin)
admin.site.register(models.MeasurementUnit, MeasurementUnitAdmin)
admin.site.unregister(get_user_model())
admin.site.register(get_user_model(), EDDUserAdmin)
