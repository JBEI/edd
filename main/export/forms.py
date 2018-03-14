# -*- coding: utf-8 -*-

import logging

from collections import OrderedDict
from django import forms
from django.db.models import Prefetch
from django.http import QueryDict
from django.utils.translation import ugettext_lazy as _
from future.utils import viewitems

from . import table
from ..models import (
    Assay, Line, Measurement, Protocol, Study, WorklistTemplate, WorklistColumn,
)


logger = logging.getLogger(__name__)


class ExportSelectionForm(forms.Form):
    """ Form used for selecting objects to export. """
    studyId = forms.ModelMultipleChoiceField(
        queryset=Study.objects.all(),
        required=False,
        widget=forms.MultipleHiddenInput
    )
    lineId = forms.ModelMultipleChoiceField(
        queryset=Line.objects.all(),
        required=False,
        widget=forms.MultipleHiddenInput
    )
    assayId = forms.ModelMultipleChoiceField(
        queryset=Assay.objects.all(),
        required=False,
        widget=forms.MultipleHiddenInput
    )
    measurementId = forms.ModelMultipleChoiceField(
        queryset=Measurement.objects.all(),
        required=False,
        widget=forms.MultipleHiddenInput
    )

    def __init__(self, user=None, exclude_disabled=True, *args, **kwargs):
        # removes default hard-coded suffix of colon character on all labels
        kwargs.setdefault('label_suffix', '')
        self._user = user
        self._exclude_disabled = exclude_disabled
        if self._user is None:
            raise ValueError("ExportSelectionForm requires a user parameter")
        self._selection = None
        super(ExportSelectionForm, self).__init__(*args, **kwargs)
        if exclude_disabled:
            for fn in ['studyId', 'lineId', 'assayId', 'measurementId']:
                self.fields[fn].queryset = self.fields[fn].queryset.filter(active=True)

    def clean(self):
        data = super(ExportSelectionForm, self).clean()
        # incoming IDs
        studyId = data.get('studyId', [])
        lineId = data.get('lineId', [])
        assayId = data.get('assayId', [])
        measureId = data.get('measurementId', [])
        self._selection = table.ExportSelection(
            self._user, exclude_disabled=self._exclude_disabled,
            studyId=studyId, lineId=lineId, assayId=assayId, measureId=measureId,
        )
        return data

    def get_selection(self):
        if self._selection is None:
            if self.is_valid():
                return self._selection
            else:
                raise ValueError("Export Selection is invalid")
        return self._selection
    selection = property(get_selection)


class WorklistForm(forms.Form):
    """ Form used for selecting worklist export options. """
    template = forms.ModelChoiceField(
        empty_label=None,
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
            separator=table.ExportOption.COMMA_SEPARATED_TOKEN,
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
        for name, field in viewitems(self._created_fields):
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
    layout = forms.ChoiceField(
        choices=table.ExportOption.LAYOUT_CHOICE,
        label=_('Layout export with'),
        required=False,
    )
    separator = forms.TypedChoiceField(
        choices=table.ExportOption.SEPARATOR_CHOICE,
        coerce=table.ExportOption.coerce_separator,
        label=_('Field separators'),
        required=False,
    )
    data_format = forms.ChoiceField(
        choices=table.ExportOption.FORMAT_CHOICE,
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
        choices=list(map(table.ColumnChoice.get_field_choice, Study.export_columns())),
        coerce=table.ColumnChoice.coerce(Study.export_columns()),
        label=_('Study fields to include'),
        required=False,
        widget=forms.CheckboxSelectMultiple,
    )
    line_meta = forms.TypedMultipleChoiceField(
        choices=list(map(table.ColumnChoice.get_field_choice, Line.export_columns())),
        coerce=table.ColumnChoice.coerce(Line.export_columns()),
        label=_('Line fields to include'),
        required=False,
        widget=forms.CheckboxSelectMultiple,
    )
    protocol_meta = forms.TypedMultipleChoiceField(
        choices=list(map(table.ColumnChoice.get_field_choice, Protocol.export_columns())),
        coerce=table.ColumnChoice.coerce(Protocol.export_columns()),
        label=_('Protocol fields to include'),
        required=False,
        widget=forms.CheckboxSelectMultiple,
    )
    assay_meta = forms.TypedMultipleChoiceField(
        choices=list(map(table.ColumnChoice.get_field_choice, Assay.export_columns())),
        coerce=table.ColumnChoice.coerce(Assay.export_columns()),
        label=_('Assay fields to include'),
        required=False,
        widget=forms.CheckboxSelectMultiple,
    )
    measure_meta = forms.TypedMultipleChoiceField(
        choices=list(map(table.ColumnChoice.get_field_choice, Measurement.export_columns())),
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
            "layout": prefs.get('export.csv.layout', table.ExportOption.DATA_COLUMN_BY_LINE),
            "separator": prefs.get('export.csv.separator', table.ExportOption.COMMA_SEPARATED),
            "data_format": prefs.get('export.csv.data_format', table.ExportOption.ALL_DATA),
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
            separator=self.cell_separator,
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
    options = property(get_options)

    def get_separator(self):
        token = self.cleaned_data.get('separator', table.ExportOption.COMMA_SEPARATED)
        return token if token else table.ExportOption.COMMA_SEPARATED
    cell_separator = property(get_separator)

    def _init_options(self):
        # sometimes self.data is a plain dict instead of a QueryDict
        data = QueryDict(mutable=True)
        data.update(self.data)
        # update available choices based on instances in self._selection
        if self._selection and hasattr(self._selection, 'lines'):
            columns = self._selection.line_columns
            choices = map(table.ColumnChoice.get_field_choice, columns)
            self.fields['line_meta'].choices = list(choices)
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
