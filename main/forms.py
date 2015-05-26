from django import forms
from django.contrib.auth import get_user_model
from django.utils.translation import ugettext_lazy as _
from main.models import *


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

    def __init__(self, attrs=None, model=User):
        _widgets = (
            forms.widgets.TextInput(attrs={ 'class': 'autocomp autocomp_user' }),
            forms.HiddenInput()
            )
        self.model = model
        super(AutocompleteWidget, self).__init__(_widgets, attrs)

    def get_model(self):
        return self.model

    def decompress(self, value):
        if value:
            Model = self.get_model()
            o = Model.objects.get(pk=value)
            return [ str(o), value ]
        return [ '', None ]

    def value_from_datadict(self, data, files, name):
        widgets = enumerate(self.widgets)
        v = [ w.value_from_datadict(data, files, name + '_%s' % i) for i, w in widgets ]
        # v[0] is text of field, v[1] is hidden ID
        return v[1]


class UserAutocompleteWidget(AutocompleteWidget):
    pass


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


class CreateLineForm(forms.ModelForm):
    """ Form to create a new line. """
    class Meta:
        model = Line
        fields = ['name', 'description', 'control', 'contact', ]
        labels = {
            'name': _('Line'),
            'description': _('Description'),
            'control': _('Is Control?'),
            'contact': _('Contact'),
        }
        widgets = {
            'contact': UserAutocompleteWidget()
        }

    def __init__(self, *args, **kwargs):
        # removes default hard-coded suffix of colon character on all labels
        kwargs.setdefault('label_suffix', '')
        super(CreateLineForm, self).__init__(*args, **kwargs)
