from django import forms
from main.models import Study


class CreateStudyForm(forms.ModelForm):
    """
    Form to create a new study.
    """
    class Meta:
        model = Study
        fields = ['study_name', 'description', 'contact', 'contact_extra']
