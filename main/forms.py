from django import forms
from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from django.db.models.base import Model
from django.db.models.manager import BaseManager
from django.utils.safestring import mark_safe
from django.utils.translation import ugettext_lazy as _
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

class MultiRegistryAutocompleteWidget(MultiAutocompleteWidget, RegistryAutocompleteWidget):
    pass


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
    """ Form to create a new line. """
    # include hidden field for applying form changes to multiple Line instances by ID
    ids = forms.CharField(required=False, widget=forms.HiddenInput())
    # TODO meta_store included as hidden field; populate with JSON of MetadataType.id to value
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
        # alter all fields to include a "bulk-edit" checkbox in label, initially hidden via "off" class
        for fieldname, field in self.fields.items():
            field.label = mark_safe(
                '<input type="checkbox" class="off bulk" name="_bulk_%s" checked="checked"/>%s' %
                (fieldname, field.label)
                )

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
            else:
                initial[fieldname] = value
        return initial

    def check_bulk_edit(self):
        exclude = []
        for fieldname, field in self.fields.items():
            check = '_bulk_%s' % (fieldname)
            if not self.data.has_key(check):
                print('Not checked field %s' % (fieldname))
                exclude.append(fieldname)
        for fieldname in exclude:
            del self.fields[fieldname]

    def save(self, commit=True, force_insert=False, force_update=False, *args, **kwargs):
        line = super(LineForm, self).save(commit=False, *args, **kwargs)
        line.study = self._study
        if commit:
            line.save()
            # since we forced commit=False in the first save, need to explicitly call save_m2m
            self.save_m2m()
        return line
