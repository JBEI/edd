from django import forms
from django.contrib.auth import get_user_model
from django.utils.translation import ugettext_lazy as _
from main.models import *


User = get_user_model()


class CreateStudyForm(forms.ModelForm):
    """
    Form to create a new study.
    """
    class Meta:
        model = Study
        fields = ['name', 'contact', 'description', ]
        labels = {
            'name': _('Study'),
            'contact': _('Contact'),
            'description': _('Description'),
        }
    # use own definition of contact, contact_id
    contact = forms.CharField()
    contact.widget.attrs['class'] = 'autocomp autocomp_user'
    contact_id = forms.IntegerField(widget=forms.HiddenInput())

    def __init__(self, *args, **kwargs):
        kwargs.setdefault('label_suffix', '')
        super(CreateStudyForm, self).__init__(*args, **kwargs)

    def clean(self):
        super(CreateStudyForm, self).clean()
        c_id = self.cleaned_data['contact_id']
        c_text = self.cleaned_data['contact']
        if c_id == None:
            self.instance.contact = None
            self.instance.contact_extra = c_text
        else:
            c_user = User.objects.get(pk=c_id)
            self.instance.contact = c_user
            self.instance.contact_extra = c_text


class CreateLineForm(forms.ModelForm):
    """
    Form to create a new line.
    """
    class Meta:
        model = Line
        fields = ['name', 'contact', 'description', 'control', ]
    # use own definition of contact, contact_id
    contact = forms.CharField()
    contact.widget.attrs['class'] = 'autocomp autocomp_user'
    contact_id = forms.IntegerField(widget=forms.HiddenInput())

    def __init__(self, *args, **kwargs):
        kwargs.setdefault('label_suffix', '')
        super(CreateStudyForm, self).__init__(*args, **kwargs)
