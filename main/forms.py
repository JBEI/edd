from copy import deepcopy
from django import forms
from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from django.core.exceptions import ValidationError
from django.db.models.base import Model
from django.db.models.manager import BaseManager
from django.utils.safestring import mark_safe
from django.utils.translation import ugettext_lazy as _
from main.ice import IceApi
from main.models import *

import json


User = get_user_model()


class AutocompleteWidget(forms.widgets.MultiWidget):
    """ Custom widget for a paired autocomplete and hidden ID field. """
    class Media:
        js = (
            'main/js/lib/jquery/jquery.js',
            'main/js/lib/jquery-ui/jquery-ui.min.js',
            'main/js/autocomplete2.js',
            )
        css = {
            'all': ('main/js/lib/jquery-ui/jquery-ui.min.css', ),
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
            return [ self.display_value(value), value.pk ]
        elif value:
            SelfModel = self.get_model()
            o = SelfModel.objects.get(pk=value)
            return [ self.display_value(o), value ]
        return [ '', None ]

    def display_value(self, value):
        return str(value)

    def value_from_datadict(self, data, files, name):
        widgets = enumerate(self.widgets)
        v = [ w.value_from_datadict(data, files, name + '_%s' % i) for i, w in widgets ]
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
            # zip together into array of two values
            values = zip(*values)
            # join by the separator string
            return [
                self._separator.join(map(str, values[0])),
                self._separator.join(map(str, values[1])),
                ]
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
        opt.update({ 'text_attr': { 'class': 'autocomp autocomp_user', }, })
        super(UserAutocompleteWidget, self).__init__(attrs=attrs, model=User, opt=opt)


class GroupAutocompleteWidget(AutocompleteWidget):
    """ Autocomplete widget for Groups """
    def __init__(self, attrs=None, opt={}):
        opt.update({ 'text_attr': { 'class': 'autocomp autocomp_group', }, })
        super(GroupAutocompleteWidget, self).__init__(attrs=attrs, model=Group, opt=opt)


class RegistryAutocompleteWidget(AutocompleteWidget):
    """ Autocomplete widget for Registry strains """
    def __init__(self, attrs=None, opt={}):
        opt.update({ 'text_attr': { 'class': 'autocomp autocomp_reg', }, })
        super(RegistryAutocompleteWidget, self).__init__(attrs=attrs, model=Strain, opt=opt)

    def validate_strain(self, value):
        try:
            Strain.objects.get(registry_id=value)
        except ValueError, e:
            # TODO set up logging
            # this error gets caught in overload of LineForm.is_valid()
            raise ValidationError(
                '"%(value)s" is not a valid strain identifier',
                code='invalid-strain',
                params={'value': value},
                )
            return ''
        except Strain.DoesNotExist, e:
            # attempt to create strain from ICE
            try:
                up = Update.load_update()
                ice = IceApi(ident=up.mod_by)
                (part, url) = ice.fetch_part(value)
                if part:
                    strain = Strain(
                        name=part['name'],
                        description=part['shortDescription'],
                        registry_id=part['recordId'],
                        registry_url=url,
                        )
                    strain.save()
            except Exception, e:
                # TODO set up logging
                raise e
        return value

    def value_from_datadict(self, data, files, name):
        value = super(RegistryAutocompleteWidget, self).value_from_datadict(data, files, name)
        return self.validate_strain(value)

class MultiRegistryAutocompleteWidget(MultiAutocompleteWidget, RegistryAutocompleteWidget):
    def value_from_datadict(self, data, files, name):
        # value from super will be joined by self._separator, so split it to get the true value
        joined = super(RegistryAutocompleteWidget, self).value_from_datadict(data, files, name)
        if joined:
            return map(self.validate_strain, joined.split(self._separator))
        return []


class CarbonSourceAutocompleteWidget(AutocompleteWidget):
    """ Autocomplete widget for carbon sources """
    def __init__(self, attrs=None, opt={}):
        opt.update({ 'text_attr': { 'class': 'autocomp autocomp_carbon', }, })
        super(CarbonSourceAutocompleteWidget, self).__init__(attrs=attrs, model=CarbonSource, opt=opt)

    def display_value(self, value):
        return value.name

class MultiCarbonSourceAutocompleteWidget(MultiAutocompleteWidget, CarbonSourceAutocompleteWidget):
    pass


class MetadataTypeAutocompleteWidget(AutocompleteWidget):
    """ Autocomplete widget for types of metadata """
    def __init__(self, attrs=None, opt={}):
        opt.update({ 'text_attr': { 'class': 'autocomp autocomp_meta', }, })
        super(MetadataTypeAutocompleteWidget, self).__init__(attrs=attrs, model=MetadataType, opt=opt)


class MeasurementTypeAutocompleteWidget(AutocompleteWidget):
    """ Autocomplete widget for types of metadata """
    def __init__(self, attrs=None, opt={}):
        opt.update({ 'text_attr': { 'class': 'autocomp autocomp_measure', }, })
        super(MeasurementTypeAutocompleteWidget, self).__init__(attrs=attrs, model=MeasurementType, opt=opt)


class CreateStudyForm(forms.ModelForm):
    """ Form to create a new study. """
    class Meta:
        model = Study
        fields = ['name', 'description', 'contact', ]
        labels = {
            'name': _('Study'),
            'contact': _('Contact'),
            'description': _('Description'),
        }
        widgets = {
            'contact': UserAutocompleteWidget()
        }

    def __init__(self, *args, **kwargs):
        # removes default hard-coded suffix of colon character on all labels
        kwargs.setdefault('label_suffix', '')
        super(CreateStudyForm, self).__init__(*args, **kwargs)


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
            'description': forms.Textarea(attrs={ 'rows': 2 }),
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
                '<input type="checkbox" class="off bulk" name="_bulk_%s" checked="checked"/>%s' %
                (fieldname, field.label)
                )
        # make sure strain is keyed by registry_id instead of pk
        self.fields['strains'].to_field_name = 'registry_id'

    @classmethod
    def initial_from_model(cls, line, prefix=None):
        """ Builds a dict of initial form values from a Line model """
        initial = {}
        for fieldname in cls._meta.fields:
            widget = cls._meta.widgets.get(fieldname, None)
            value = getattr(line, fieldname)
            # need to split MultiWidget values into each widget value
            if isinstance(widget, forms.widgets.MultiWidget):
                for i, part in enumerate(widget.decompress(value)):
                    initial[fieldname + '_%s' % i] = part
            # HStoreField gives back a dict; must serialize to json
            elif isinstance(value, dict):
                initial[fieldname] = json.dumps(value)
            # everything else shove value into fieldname
            else:
                initial[fieldname] = value
        return initial

    def check_bulk_edit(self):
        exclude = []
        # Look for "bulk-edit" checkboxes for each field
        for fieldname, field in self.fields.items():
            check = '_bulk_%s' % (fieldname)
            if not self.data.has_key(check):
                exclude.append(fieldname)
        # remove fields without a check from self, preventing processing
        for fieldname in exclude:
            del self.fields[fieldname]

    def is_editing(self):
        return self.instance.pk != None

    def is_valid(self):
        # Validation from the RegistryAutocompleteWidget never gets caught in default handlers
        try:
            return super(LineForm, self).is_valid()
        except ValidationError, e:
            self.add_error(None, e)
            return False

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
            'description': forms.Textarea(attrs={ 'rows': 2 }),
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
        return self.instance.pk != None

    def save(self, commit=True, force_insert=False, force_update=False, *args, **kwargs):
        assay = super(AssayForm, self).save(commit=False, *args, **kwargs)
        # quick function to copy assay instance from form, and set to correct line
        def link_assay(line_id):
            clone = deepcopy(assay)
            clone.line_id = line_id
            return clone
        all_assays = map(link_assay, self._lines)
        if commit:
            [ a.save() for a in all_assays ]
        return all_assays


class MeasurementForm(forms.ModelForm):
    """ Form to create/edit a measurement. """
    class Meta:
        model = Measurement
        fields = ('measurement_type', 'y_units', 'compartment', )
        help_texts = {
            'measurement_type': _(''),
            'y_units': _('Select the units used for these measurements'),
            'compartment': _('(optional) Select if the measurement is inside or outside the organism')
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
        # store the parent Line
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
            [ m.save() for m in all_measures ]
        return all_measures
