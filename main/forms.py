# -*- coding: utf-8 -*-
from __future__ import unicode_literals

import json
import logging
from collections import OrderedDict
from copy import deepcopy

from builtins import str
from django import forms
from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from django.contrib.postgres.forms import HStoreField
from django.core.exceptions import ValidationError
from django.db.models import Prefetch, Q
from django.db.models.base import Model
from django.db.models.manager import BaseManager
from django.http import QueryDict
from django.utils.safestring import mark_safe
from django.utils.translation import ugettext_lazy as _
from form_utils.forms import BetterModelForm
from functools import partial

from jbei.ice.rest.ice import IceApi, IceHmacAuth
from .export import table
from .models import (
    Assay, Attachment, CarbonSource, Comment, Line, Measurement, MeasurementType,
    MeasurementValue, MetadataType, Protocol, Strain, Study, StudyPermission, Update,
    WorklistTemplate, WorklistColumn,
)

User = get_user_model()
logger = logging.getLogger(__name__)


class AutocompleteWidget(forms.widgets.MultiWidget):
    """ Custom widget for a paired autocomplete and hidden ID field. """
    class Media:
        js = (
            'main/js/lib/jquery/jquery.js',
            'main/js/lib/jquery-ui/jquery-ui.min.js',
            'main/js/autocomplete2.js',
            )
        css = {
            'all': (
                'main/js/lib/jquery-ui/jquery-ui.min.css',
                'main/widgets.css',
            ),
        }

    def __init__(self, attrs=None, model=User, opt={}):
        _widgets = (
            forms.widgets.TextInput(attrs=opt.get('text_attr', {})),
            forms.HiddenInput()
            )
        self.model = model
        super(AutocompleteWidget, self).__init__(_widgets, attrs)

    def get_model(self):
        return self.model

    def decompress(self, value):
        # if the value is the actual model instance, don't try to look up model
        if isinstance(value, Model):
            return [self.display_value(value), value.pk]
        elif value:
            SelfModel = self.get_model()
            o = SelfModel.objects.get(pk=value)
            return [self.display_value(o), value]
        return ['', None]

    def display_value(self, value):
        return str(value)

    def value_from_datadict(self, data, files, name):
        widgets = enumerate(self.widgets)
        v = [w.value_from_datadict(data, files, name + '_%s' % i) for i, w in widgets]
        # v[0] is text of field, v[1] is hidden ID
        return v[1]


class MultiAutocompleteWidget(AutocompleteWidget):
    """ Extension to Autocomplete widget that handles multiple autocompleted values.
        All values must be lists; either a list of results from decompress, or a list of values
        to be passed to decompress """
    def __init__(self, **kwargs):
        self._separator = kwargs.pop('separator', ',')
        super(MultiAutocompleteWidget, self).__init__(**kwargs)

    def decompress(self, value):
        if isinstance(value, BaseManager):
            # delegate decompress for individual items
            values = map(super(MultiAutocompleteWidget, self).decompress, value.all())
            # zip together into array of two value-arrays
            values = zip(*values)
            if len(values):
                # join by the separator string
                return [
                    self._separator.join(map(str, values[0])),
                    self._separator.join(map(str, values[1])),
                ]
            else:
                # there are no values, return "empty" structure
                return ['', None]
        return super(MultiAutocompleteWidget, self).decompress(value)

    def render(self, name, value, attrs=None):
        joined = []
        _range = range(len(self.widgets))
        for index in _range:
            joined.append([])
        if value is None:
            value = []
        for item in value:
            if not isinstance(item, list):
                item = self.decompress(item)
            for index in _range:
                joined[index].append(item[index] if len(item) > index else '')
        for index in _range:
            joined[index] = self._separator.join(map(str, joined[index]))
        return super(MultiAutocompleteWidget, self).render(name, joined, attrs)

    def value_from_datadict(self, data, files, name):
        # value from super will be joined by self._separator, so split it to get the true value
        joined = super(MultiAutocompleteWidget, self).value_from_datadict(data, files, name)
        if joined:
            return joined.split(self._separator)
        return []


class UserAutocompleteWidget(AutocompleteWidget):
    """ Autocomplete widget for Users """
    def __init__(self, attrs=None, opt={}):
        opt.update({'text_attr': {'class': 'autocomp autocomp_user', }, })
        super(UserAutocompleteWidget, self).__init__(attrs=attrs, model=User, opt=opt)


class GroupAutocompleteWidget(AutocompleteWidget):
    """ Autocomplete widget for Groups """
    def __init__(self, attrs=None, opt={}):
        opt.update({'text_attr': {'class': 'autocomp autocomp_group', }, })
        super(GroupAutocompleteWidget, self).__init__(attrs=attrs, model=Group, opt=opt)


class RegistryValidator(object):
    def __init__(self, existing_strain=None):
        self.existing_strain = existing_strain
        self.count = None
        self.entry = None

    def load_part_from_ice(self, registry_id):
        update = Update.load_update()
        user_email = update.mod_by.email
        try:
            ice = IceApi(IceHmacAuth.get(username=user_email))
            self.entry = ice.get_entry(registry_id)
            self.entry.url = ''.join((ice.base_url, '/entry/', str(self.entry.id),))
        except Exception:
            logger.exception('Exception loading part %(part_id)s from ICE for user '
                             '%(user_email)s' % {
                                'part_id': registry_id,
                                'user_email': user_email, })
            raise ValidationError(
                _('Failed to load strain %(uuid)s from ICE'),
                code='ice failure',
                params={"uuid": registry_id,},
            )

    def save_strain(self):
        if self.entry and self.existing_strain:
            self.existing_strain.registry_id = self.entry.uuid
            self.existing_strain.registry_url = self.entry.url
            self.existing_strain.save()
        elif self.entry:
            Strain.objects.create(
                name=self.entry.name,
                description=self.entry.short_description,
                registry_id=self.entry.uuid,
                registry_url=self.entry.url,
            )

    def validate(self, value):
        try:
            if isinstance(value, (list, tuple)):
                for v in value:
                    self.validate(v)
                return
            qs = Strain.objects.filter(registry_id=value)
            if self.existing_strain:
                qs = qs.exclude(pk__in=[self.existing_strain])
            self.count = qs.count()
            if self.count == 0:
                logger.info('No EDD Strain found with registry_id %s. Searching ICE...', value)
                self.load_part_from_ice(value)
                self.save_strain()
            elif self.count > 1:
                raise ValidationError(
                    _('Selected ICE record is already linked to EDD strains: %(strains)s'),
                    code='existing records',
                    params={"strains": list(qs), },
                )
        except ValueError:
            raise ValidationError(
                _('Error querying for an EDD strain with registry_id %(uuid)s'),
                code='query failure',
                params={"uuid": value, },
            )


class RegistryAutocompleteWidget(AutocompleteWidget):
    """ Autocomplete widget for Registry strains """
    def __init__(self, attrs=None, opt={}):
        opt.update({'text_attr': {'class': 'autocomp autocomp_reg', }, })
        super(RegistryAutocompleteWidget, self).__init__(attrs=attrs, model=Strain, opt=opt)

    def decompress(self, value):
        """ Overriding since Strain uses registry_id for lookups. """
        if isinstance(value, Strain):
            return [self.display_value(value), value.registry_id, ]
        elif value:
            try:
                o = Strain.objects.get(registry_id=value)
                return [self.display_value(o), value, ]
            except Strain.DoesNotExist:
                pass
        return ['', None, ]


class MultiRegistryAutocompleteWidget(MultiAutocompleteWidget, RegistryAutocompleteWidget):
    pass


class CarbonSourceAutocompleteWidget(AutocompleteWidget):
    """ Autocomplete widget for carbon sources """
    def __init__(self, attrs=None, opt={}):
        opt.update({'text_attr': {'class': 'autocomp autocomp_carbon', }, })
        super(CarbonSourceAutocompleteWidget, self).__init__(
            attrs=attrs, model=CarbonSource, opt=opt)

    def display_value(self, value):
        return value.name


class MultiCarbonSourceAutocompleteWidget(MultiAutocompleteWidget, CarbonSourceAutocompleteWidget):
    pass


class MetadataTypeAutocompleteWidget(AutocompleteWidget):
    """ Autocomplete widget for types of metadata """
    def __init__(self, attrs=None, opt={}):
        opt.update({'text_attr': {'class': 'autocomp autocomp_type', }, })
        super(MetadataTypeAutocompleteWidget, self).__init__(
            attrs=attrs, model=MetadataType, opt=opt)


class MeasurementTypeAutocompleteWidget(AutocompleteWidget):
    """ Autocomplete widget for types of metadata """
    def __init__(self, attrs=None, opt={}):
        """ Set opt with {'text_attr': {'class': 'autocomp autocomp_XXX'}} to override. """
        my_opt = {'text_attr': {'class': 'autocomp autocomp_measure', }, }
        my_opt.update(**opt)
        super(MeasurementTypeAutocompleteWidget, self).__init__(
            attrs=attrs, model=MeasurementType, opt=my_opt,
        )


class CreateStudyForm(forms.ModelForm):
    """ Form to create a new study. """
    class Meta:
        model = Study
        fields = ['name', 'description', 'contact', ]
        labels = {
            'name': _('Study Name'),
            'description': _('Description'),
            'contact': _('Contact'),
        }
        widgets = {
            'name': forms.widgets.TextInput(attrs={'size': 50}),
            'description': forms.widgets.Textarea(attrs={'cols': 100}),
            'contact': UserAutocompleteWidget(),
        }

    def __init__(self, *args, **kwargs):
        # removes default hard-coded suffix of colon character on all labels
        kwargs.setdefault('label_suffix', '')
        super(CreateStudyForm, self).__init__(*args, **kwargs)

    def save(self, commit=True, force_insert=False, force_update=False, *args, **kwargs):
        # save the study
        s = super(CreateStudyForm, self).save(commit=commit, *args, **kwargs)
        # make sure the creator has write permission, and ESE has read
        s.userpermission_set.update_or_create(
            user=s.created.mod_by,
            permission_type=StudyPermission.WRITE,
        )
        # XXX hard-coding the ID is gross, do it better
        s.grouppermission_set.update_or_create(
            group_id=1,
            permission_type=StudyPermission.READ,
        )
        return s


class CreateAttachmentForm(forms.ModelForm):
    """ Form to create a new attachment. """
    class Meta:
        model = Attachment
        fields = ('file', 'description', )
        labels = {
            'file': _('Attachment'),
            'description': _('Description'),
        }
        widgets = {
            'description': forms.widgets.TextInput(),
        }

    def __init__(self, *args, **kwargs):
        # removes default hard-coded suffix of colon character on all labels
        kwargs.setdefault('label_suffix', '')
        # store the parent EDDObject
        self._parent = kwargs.pop('edd_object', None)
        super(CreateAttachmentForm, self).__init__(*args, **kwargs)

    def save(self, commit=True, force_insert=False, force_update=False, *args, **kwargs):
        a = super(CreateAttachmentForm, self).save(commit=False, *args, **kwargs)
        a.object_ref = self._parent
        if commit:
            a.save()
        return a


class CreateCommentForm(forms.ModelForm):
    """ Form to create a new comment. """
    class Meta:
        model = Comment
        fields = ('body', )
        labels = {
            'body': _('')
        }

    def __init__(self, *args, **kwargs):
        # removes default hard-coded suffix of colon character on all labels
        kwargs.setdefault('label_suffix', '')
        # store the parent EDDObject
        self._parent = kwargs.pop('edd_object', None)
        super(CreateCommentForm, self).__init__(*args, **kwargs)

    def save(self, commit=True, force_insert=False, force_update=False, *args, **kwargs):
        c = super(CreateCommentForm, self).save(commit=False, *args, **kwargs)
        c.object_ref = self._parent
        if commit:
            c.save()
        return c


class EDDHStoreField(HStoreField):
    def to_python(self, value):
        if not value:
            return {}
        try:
            value = json.loads(value)
        except ValueError:
            raise ValidationError(
                self.error_messages['invalid_json'],
                code='invalid_json',
            )
        return value


class LineForm(forms.ModelForm):
    """ Form to create/edit a line. """
    # include hidden field for applying form changes to multiple Line instances by ID
    ids = forms.CharField(required=False, widget=forms.HiddenInput())

    class Meta:
        model = Line
        fields = (
            'name', 'description', 'control', 'contact', 'experimenter', 'carbon_source',
            'strains', 'meta_store',
        )
        labels = {
            'name': _('Line'),
            'description': _('Description'),
            'control': _('Is Control?'),
            'contact': _('Contact'),
            'experimenter': _('Experimenter'),
            'carbon_source': _('Carbon Source'),
            'strains': _('Strains'),
        }
        widgets = {
            'description': forms.Textarea(attrs={'rows': 2}),
            'contact': UserAutocompleteWidget(),
            'experimenter': UserAutocompleteWidget(),
            'carbon_source': MultiCarbonSourceAutocompleteWidget(),
            'strains': MultiRegistryAutocompleteWidget(),
            'meta_store': forms.HiddenInput(),
        }

    def __init__(self, *args, **kwargs):
        # removes default hard-coded suffix of colon character on all labels
        kwargs.setdefault('label_suffix', '')
        # store the parent Study
        self._study = kwargs.pop('study', None)
        super(LineForm, self).__init__(*args, **kwargs)
        # alter all fields to include a "bulk-edit" checkbox in label
        # initially hidden via "off" class
        for fieldname, field in self.fields.items():
            field.label = mark_safe(
                '<input type="checkbox" class="off bulk" name="%s" checked="checked" '
                'value/>%s' % (self.add_prefix('_bulk_%s' % fieldname), field.label)
                )
        # make sure strain is keyed by registry_id instead of pk, and validates uuid
        strains_field = self.fields['strains']

        def __clean(self, value):
            # validator creates Strain record if missing, now can check value
            for v in value:
                self.run_validators(v)
            return self.__clean(value)
        strains_field.__clean = strains_field.clean
        strains_field.clean = partial(__clean, strains_field)
        strains_field.to_field_name = 'registry_id'
        strains_field.validators = [RegistryValidator().validate, ]
        # keep a flag for bulk edit, treats meta_store slightly differently
        self._bulk = False
        # override form field handling of HStore
        meta = self.fields['meta_store']
        meta.to_python = EDDHStoreField.to_python.__get__(meta, EDDHStoreField)

    @classmethod
    def initial_from_model(cls, line, prefix=None):
        """ Builds a dict of initial form values from a Line model """
        initial = {}
        for fieldname in cls._meta.fields:
            widget = cls._meta.widgets.get(fieldname, None)
            value = getattr(line, fieldname)
            fieldkey = '%s-%s' % (prefix, fieldname) if prefix else fieldname
            # need to split MultiWidget values into each widget value
            if isinstance(widget, forms.widgets.MultiWidget):
                for i, part in enumerate(widget.decompress(value)):
                    initial['%s_%s' % (fieldkey, i)] = part
            # HStoreField gives back a dict; must serialize to json
            elif isinstance(value, dict):
                initial[fieldkey] = json.dumps(value)
            # everything else shove value into fieldname
            else:
                initial[fieldkey] = str(value)
        return initial

    def check_bulk_edit(self):
        self._bulk = True
        exclude = []
        # Look for "bulk-edit" checkboxes for each field
        for field in self.visible_fields():
            check = self.add_prefix('_bulk_%s' % field.name)
            if check not in self.data:
                exclude.append(field.name)
        # remove fields without a check from self, preventing processing
        for fieldname in exclude:
            # Removing excluded key from fields
            del self.fields[fieldname]

    def clean_meta_store(self):
        # go through and delete any keys with None values
        meta = self.cleaned_data['meta_store']
        none_keys = []
        for key, value in meta.items():
            if value is None:
                none_keys.append(key)
        for key in none_keys:
            # Removing None-valued key from meta
            del meta[key]
        if self.is_editing() and self._bulk:
            # Bulk edit updating meta_store
            in_place = {}
            in_place.update(self.instance.meta_store)
            in_place.update(meta)
            meta = in_place
        return meta

    def is_editing(self):
        return self.instance.pk is not None

    def save(self, commit=True, force_insert=False, force_update=False, *args, **kwargs):
        line = super(LineForm, self).save(commit=False, *args, **kwargs)
        line.study = self._study
        if commit:
            line.save()
            # since we forced commit=False in the first save, need to explicitly call save_m2m
            self.save_m2m()
        return line


class AssayForm(forms.ModelForm):
    """ Form to create/edit an assay. """
    # include hidden field for applying form changes to an Assay instance by ID
    assay_id = forms.CharField(required=False, widget=forms.HiddenInput())

    class Meta:
        model = Assay
        fields = (
            'name', 'description', 'protocol', 'experimenter',
        )
        help_texts = {
            'name': _('If left blank, a name in form [Line]-[Protocol]-[#] will be generated. '),
        }
        labels = {
            'name': _('Name'),
            'description': _('Description'),
            'protocol': _('Protocol'),
            'experimenter': _('Experimenter'),
        }
        widgets = {
            'description': forms.Textarea(attrs={'rows': 2}),
            'experimenter': UserAutocompleteWidget(),
        }

    def __init__(self, *args, **kwargs):
        # removes default hard-coded suffix of colon character on all labels
        kwargs.setdefault('label_suffix', '')
        # store the parent Line
        self._lines = kwargs.pop('lines', [])
        super(AssayForm, self).__init__(*args, **kwargs)
        self.fields['protocol'].queryset = Protocol.objects.order_by('name')

    def is_editing(self):
        return self.instance.pk is not None

    def save(self, commit=True, force_insert=False, force_update=False, *args, **kwargs):
        assay = super(AssayForm, self).save(commit=False, *args, **kwargs)

        # quick function to copy assay instance from form, and set to correct line
        def link_assay(line_id):
            clone = deepcopy(assay)
            clone.line_id = line_id
            return clone
        all_assays = map(link_assay, self._lines)
        if commit:
            [a.save() for a in all_assays]
        return all_assays


class MeasurementForm(forms.ModelForm):
    """ Form to create/edit a measurement. """
    class Meta:
        model = Measurement
        fields = ('measurement_type', 'y_units', 'compartment', )
        help_texts = {
            'measurement_type': _(''),
            'y_units': _('Select the units used for these measurements'),
            'compartment': _('(optional) Select if the measurement is inside or outside'
                             ' the organism')
        }
        labels = {
            'measurement_type': _('Type'),
            'y_units': _('Units'),
            'compartment': _('Compartment'),
        }
        widgets = {
            'measurement_type': MeasurementTypeAutocompleteWidget(),
        }

    def __init__(self, *args, **kwargs):
        # removes default hard-coded suffix of colon character on all labels
        kwargs.setdefault('label_suffix', '')
        # store the parent Assays
        self._assays = kwargs.pop('assays', [])
        super(MeasurementForm, self).__init__(*args, **kwargs)

    def save(self, commit=True, force_insert=False, force_update=False, *args, **kwargs):
        measure = super(MeasurementForm, self).save(commit=False, *args, **kwargs)

        # quick function to copy measurement instance from form, and set to correct assay
        def link_measure(assay_id):
            clone = deepcopy(measure)
            clone.assay_id = assay_id
            return clone
        all_measures = map(link_measure, self._assays)
        if commit:
            [m.save() for m in all_measures]
        return all_measures


class MeasurementValueForm(BetterModelForm):
    """ Form for an individual measurement value. """
    class Meta:
        fields = ('x', 'y', )
        fieldsets = [('', {'fields': ['x', 'y', ], }), ]
        model = MeasurementValue
        widgets = {
            'x': forms.widgets.NumberInput(),
            'y': forms.widgets.NumberInput(),
        }


MeasurementValueFormSet = forms.models.inlineformset_factory(
    Measurement, MeasurementValue, can_delete=False, extra=0, form=MeasurementValueForm, )


class ExportSelectionForm(forms.Form):
    """ Form used for selecting objects to export. """
    studyId = forms.ModelMultipleChoiceField(
        queryset=Study.objects.filter(active=True),
        required=False,
        widget=forms.MultipleHiddenInput
        )
    lineId = forms.ModelMultipleChoiceField(
        queryset=Line.objects.filter(active=True),
        required=False,
        widget=forms.MultipleHiddenInput
        )
    assayId = forms.ModelMultipleChoiceField(
        queryset=Assay.objects.filter(active=True),
        required=False,
        widget=forms.MultipleHiddenInput
        )
    measurementId = forms.ModelMultipleChoiceField(
        queryset=Measurement.objects.filter(active=True),
        required=False,
        widget=forms.MultipleHiddenInput
        )

    def __init__(self, *args, **kwargs):
        # removes default hard-coded suffix of colon character on all labels
        kwargs.setdefault('label_suffix', '')
        self._user = kwargs.pop('user', None)
        if self._user is None:
            raise ValueError("ExportSelectionForm requires a user parameter")
        self._selection = None
        super(ExportSelectionForm, self).__init__(*args, **kwargs)

    def clean(self):
        data = super(ExportSelectionForm, self).clean()
        # incoming IDs
        studyId = data.get('studyId', [])
        lineId = data.get('lineId', [])
        assayId = data.get('assayId', [])
        measureId = data.get('measurementId', [])
        self._selection = table.ExportSelection(self._user, studyId, lineId, assayId, measureId)
        return data

    def get_selection(self):
        if self._selection is None:
            if self.is_valid():
                return self._selection
            else:
                raise ValueError("Export Selection is invalid")
        return self._selection


class WorklistForm(forms.Form):
    """ Form used for selecting worklist export options. """
    template = forms.ModelChoiceField(
        queryset=WorklistTemplate.objects.prefetch_related(
            Prefetch('worklistcolumn_set', queryset=WorklistColumn.objects.order_by('ordering', )),
        ),
        required=False,
    )

    def __init__(self, *args, **kwargs):
        # removes default hard-coded suffix of colon character on all labels
        kwargs.setdefault('label_suffix', '')
        super(WorklistForm, self).__init__(*args, **kwargs)
        self.defaults_form = None
        self.flush_form = None
        self._options = None
        self._worklist = None

    def clean(self):
        data = super(WorklistForm, self).clean()
        template = data.get('template', None)
        columns = []
        blank_mod = 0
        blank_columns = []
        if template:
            dform = self.create_defaults_form(template)
            fform = self.create_flush_form(template)
            if dform.is_valid():
                columns = dform.columns
            if fform.is_valid():
                blank_mod = fform.cleaned_data['row_count']
                blank_columns = fform.columns
        self._options = table.ExportOption(
            layout=table.ExportOption.DATA_COLUMN_BY_LINE,
            separator=table.ExportOption.COMMA_SEPARATED,
            data_format=table.ExportOption.ALL_DATA,
            line_section=False,
            protocol_section=False,
            columns=columns,
            blank_columns=blank_columns,
            blank_mod=blank_mod,
        )
        self._worklist = template
        return data

    def create_defaults_form(self, template):
        self.defaults_form = WorklistDefaultsForm(
            self.data, self.files, prefix='defaults', template=template,
        )
        return self.defaults_form

    def create_flush_form(self, template):
        self.flush_form = WorklistFlushForm(
            self.data, self.files, prefix='flush', template=template,
        )
        return self.flush_form

    def get_options(self):
        if self._options is None:
            if not self.is_valid():
                raise ValueError("Export options are invalid")
        return self._options
    options = property(get_options)

    def get_worklist(self):
        if self._worklist is None:
            if not self.is_valid():
                raise ValueError("Worklist options are invalid")
        return self._worklist
    worklist = property(get_worklist)


class WorklistDefaultsForm(forms.Form):
    """ Sub-form used to select the default values used in columns of a worklist export. """

    def __init__(self, *args, **kwargs):
        self._template = kwargs.pop('template', None)
        self._lookup = OrderedDict()
        self._created_fields = {}
        super(WorklistDefaultsForm, self).__init__(*args, **kwargs)
        # create a field for default values in each column of template
        for x in self._template.worklistcolumn_set.order_by('ordering', ):
            form_name = 'col.%s' % (x.pk, )
            self.initial[form_name] = x.get_default()
            self.fields[form_name] = self._created_fields[form_name] = forms.CharField(
                help_text=x.help_text,
                initial=x.get_default(),
                label=str(x),
                required=False,
                widget=forms.TextInput(attrs={'size': 30}),
            )
            self._lookup[form_name] = x

    def clean(self):
        data = super(WorklistDefaultsForm, self).clean()
        # this is SUPER GROSS, but apparently the only way to change the form output from here is
        #   to muck with the source data, by poking the undocumented _mutable property of QueryDict
        self.data._mutable = True
        # if no incoming data for field, fall back to default (initial) instead of empty string
        for name, field in self._created_fields.items():
            key = self.add_prefix(name)
            value = field.widget.value_from_datadict(self.data, self.files, key)
            if not value:
                value = field.initial
            self.data[key] = data[key] = value
            self._lookup[name].default_value = value
        # flip back _mutable property
        self.data._mutable = False
        return data

    def get_columns(self):
        return [x.get_column() for x in self._lookup.values()]
    columns = property(get_columns)


class WorklistFlushForm(WorklistDefaultsForm):
    """ Adds a field to take a number of rows to output before inserting a flush row with selected
        defaults. Entering 0 means no flush rows. """
    row_count = forms.IntegerField(
        initial=0, help_text='The number of worklist rows before a flush row is inserted',
        min_value=0, required=False, widget=forms.NumberInput(attrs={'size': 5}),
    )


class ExportOptionForm(forms.Form):
    """ Form used for changing options on exports. """
    DATA_COLUMN_BY_LINE = 'dbyl'
    DATA_COLUMN_BY_POINT = 'dbyp'
    LINE_COLUMN_BY_DATA = 'lbyd'
    LAYOUT_CHOICE = (
        (DATA_COLUMN_BY_LINE, _('columns of metadata types, and rows of lines/assays')),
        (DATA_COLUMN_BY_POINT, _('columns of metadata types, and rows of single points')),
        (LINE_COLUMN_BY_DATA, _('columns of lines/assays, and rows of metadata types')),
    )
    COMMA_SEPARATED = 'csv'
    TAB_SEPARATED = 'tsv'
    SEPARATOR_CHOICE = (
        (COMMA_SEPARATED, _('Comma-separated (CSV)')),
        (TAB_SEPARATED, _('Tab-separated')),
    )
    ALL_DATA = 'all'
    SUMMARY_DATA = 'summary'
    NONE_DATA = 'none'
    FORMAT_CHOICE = (
        (ALL_DATA, _('All')),
        (SUMMARY_DATA, _('Summarize')),
        (NONE_DATA, _('None')),
    )

    layout = forms.ChoiceField(
        choices=LAYOUT_CHOICE,
        label=_('Layout export with'),
        required=False,
    )
    separator = forms.ChoiceField(
        choices=SEPARATOR_CHOICE,
        label=_('Field separators'),
        required=False,
    )
    data_format = forms.ChoiceField(
        choices=FORMAT_CHOICE,
        label=_('Include measurement data'),
        required=False,
    )
    line_section = forms.BooleanField(
        label=_('Include Lines in own section'),
        required=False,
    )
    protocol_section = forms.BooleanField(
        label=_('Include a section for each Protocol'),
        required=False,
    )
    study_meta = forms.TypedMultipleChoiceField(
        choices=map(table.ColumnChoice.get_field_choice, Study.export_columns()),
        coerce=table.ColumnChoice.coerce(Study.export_columns()),
        label=_('Study fields to include'),
        required=False,
        widget=forms.CheckboxSelectMultiple,
    )
    line_meta = forms.TypedMultipleChoiceField(
        choices=map(table.ColumnChoice.get_field_choice, Line.export_columns()),
        coerce=table.ColumnChoice.coerce(Line.export_columns()),
        label=_('Line fields to include'),
        required=False,
        widget=forms.CheckboxSelectMultiple,
    )
    protocol_meta = forms.TypedMultipleChoiceField(
        choices=map(table.ColumnChoice.get_field_choice, Protocol.export_columns()),
        coerce=table.ColumnChoice.coerce(Protocol.export_columns()),
        label=_('Protocol fields to include'),
        required=False,
        widget=forms.CheckboxSelectMultiple,
    )
    assay_meta = forms.TypedMultipleChoiceField(
        choices=map(table.ColumnChoice.get_field_choice, Assay.export_columns()),
        coerce=table.ColumnChoice.coerce(Assay.export_columns()),
        label=_('Assay fields to include'),
        required=False,
        widget=forms.CheckboxSelectMultiple,
    )
    measure_meta = forms.TypedMultipleChoiceField(
        choices=map(table.ColumnChoice.get_field_choice, Measurement.export_columns()),
        coerce=table.ColumnChoice.coerce(Measurement.export_columns()),
        label=_('Measurement fields to include'),
        required=False,
        widget=forms.CheckboxSelectMultiple,
    )

    def __init__(self, *args, **kwargs):
        # removes default hard-coded suffix of colon character on all labels
        kwargs.setdefault('label_suffix', '')
        self._selection = kwargs.pop('selection', None)
        super(ExportOptionForm, self).__init__(*args, **kwargs)
        self._options = None
        self._init_options()

    @classmethod
    def initial_from_user_settings(cls, user):
        """ Looks for preferences in user profile to set form choices; if found, apply, otherwise
            sets all options. """
        prefs = {}
        if hasattr(user, 'userprofile'):
            prefs = user.userprofile.prefs
        return {
            "layout": prefs.get('export.csv.layout', cls.DATA_COLUMN_BY_LINE),
            "separator": prefs.get('export.csv.separator', cls.COMMA_SEPARATED),
            "data_format": prefs.get('export.csv.data_format', cls.ALL_DATA),
            "study_meta": prefs.get('export.csv.study_meta', '__all__'),
            "line_meta": prefs.get('export.csv.line_meta', '__all__'),
            "protocol_meta": prefs.get('export.csv.protocol_meta', '__all__'),
            "assay_meta": prefs.get('export.csv.assay_meta', '__all__'),
            "measure_meta": prefs.get('export.csv.measure_meta', '__all__'),
        }

    def clean(self):
        data = super(ExportOptionForm, self).clean()
        columns = []
        for m in ['study_meta', 'line_meta', 'protocol_meta', 'assay_meta', 'measure_meta']:
            columns.extend(data.get(m, []))
        self._options = table.ExportOption(
            layout=data.get('layout', table.ExportOption.DATA_COLUMN_BY_LINE),
            separator=data.get('separator', table.ExportOption.COMMA_SEPARATED),
            data_format=data.get('data_format', table.ExportOption.ALL_DATA),
            line_section=data.get('line_section', False),
            protocol_section=data.get('protocol_section', False),
            columns=columns,
        )
        return data

    def get_options(self):
        if self._options is None:
            if not self.is_valid():
                raise ValueError("Export options are invalid")
        return self._options

    def get_separator(self):
        choice = self.cleaned_data.get('separator', self.COMMA_SEPARATED)
        if choice == self.TAB_SEPARATED:
            return '\t'
        return ','

    def _init_options(self):
        # sometimes self.data is a plain dict instead of a QueryDict
        data = QueryDict(mutable=True)
        data.update(self.data)
        # update available choices based on instances in self._selection
        if self._selection and hasattr(self._selection, 'lines'):
            columns = self._selection.line_columns
            self.fields['line_meta'].choices = map(table.ColumnChoice.get_field_choice, columns)
            self.fields['line_meta'].coerce = table.ColumnChoice.coerce(columns)
        # set all _meta options if no list of options was passed in
        for meta in ['study_meta', 'line_meta', 'protocol_meta', 'assay_meta', 'measure_meta']:
            if self.initial.get(meta, None) == '__all__':
                self.initial.update({
                    meta: [choice[0] for choice in self.fields[meta].choices],
                })
                # update incoming data with default initial if not already set
                if meta not in data and 'layout' not in data:
                    data.setlist(meta, self.initial.get(meta, []))
        self.data = data
