import itertools
import logging
from collections import defaultdict

from django import forms
from django.contrib.auth import get_user_model
from django.urls import reverse
from django.utils.translation import gettext_lazy as _

from edd.search import widgets as autocomplete
from edd.search.registry import RegistryValidator

from .. import models

logger = logging.getLogger(__name__)
User = get_user_model()


class ModifyLineForm(forms.ModelForm):
    """Form to create/edit a line or group of lines."""

    name = forms.CharField(
        help_text="",
        label=_("Line Name"),
        required=True,
        widget=forms.widgets.TextInput(
            attrs={
                "aria-invalid": "false",
                "class": "form-control",
                "data-validation-text": _("Line Name is required."),
                "pattern": models.Line.strict_name_pattern,
            },
        ),
    )
    description = forms.CharField(
        help_text="",
        label=_("Description"),
        required=False,
        widget=forms.widgets.Textarea(attrs={"class": "form-control"}),
    )
    control = forms.BooleanField(
        help_text="",
        label=_("Is Control?"),
        required=False,
        widget=forms.widgets.CheckboxInput(attrs={"class": "form-check-input"}),
    )
    contact = forms.ModelChoiceField(
        empty_label=None,
        help_text="",
        label=_("Contact"),
        queryset=User.objects.all(),
        required=False,
        widget=autocomplete.UserAutocomplete(),
    )
    experimenter = forms.ModelChoiceField(
        empty_label=None,
        help_text="",
        label=_("Experimenter"),
        queryset=User.objects.all(),
        required=False,
        widget=autocomplete.UserAutocomplete(),
    )
    strains = forms.ModelMultipleChoiceField(
        help_text="",
        label=_("Strains"),
        queryset=models.Strain.objects.all(),
        required=False,
        to_field_name="registry_id",
        validators=[RegistryValidator()],
        widget=autocomplete.RegistryAutocomplete(),
    )

    error_css_class = "is-invalid"
    template_name = "main/forms/line.html"

    class Meta:
        fields = (
            "name",
            "description",
            "control",
            "contact",
            "experimenter",
            "strains",
        )
        model = models.Line

    def __init__(self, study, bulk=False, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self._study = study
        # when modifying many lines at once, we need to ignore the name field
        if bulk:
            self.fields.pop("name", None)

    def clean(self):
        cleaned = super().clean()
        # if no explicit experimenter is set, make the study contact the experimenter
        if "experimenter" not in cleaned:
            cleaned["experimenter"] = self._study.contact
        return cleaned

    @classmethod
    def initial_from_lines(cls, lines):
        exclude = cls._meta.exclude
        fields = cls._meta.fields
        initial_sets = defaultdict(set)
        for line in lines:
            # get initial for a single line
            initial = forms.models.model_to_dict(line, fields, exclude)
            # add values to sets of values for every form field
            for name in cls.base_fields:
                value = initial.get(name, None)
                # lists are not hashable, so convert to tuples if exists
                if isinstance(value, list):
                    value = tuple(value)
                initial_sets[name].add(value)
        # only return values that are the same across all lines
        return {k: next(iter(v)) for k, v in initial_sets.items() if len(v) == 1}


class AddAssayForm(forms.ModelForm):
    """Form to create assays."""

    name = forms.CharField(
        help_text=_("If left blank, a name will be generated for you."),
        label=_("Assay Name"),
        required=False,
        widget=forms.widgets.TextInput(attrs={"class": "form-control"}),
    )
    protocol = forms.ModelChoiceField(
        empty_label=_("Choose a Protocol"),
        help_text="",
        label=_("Protocol"),
        queryset=models.Protocol.objects.order_by("name"),
        required=True,
        widget=autocomplete.ProtocolAutocomplete(),
    )
    experimenter = forms.ModelChoiceField(
        empty_label=None,
        help_text="",
        label=_("Experimenter"),
        queryset=User.objects.all(),
        required=False,
        widget=autocomplete.UserAutocomplete(),
    )

    error_css_class = "is-invalid"
    template_name = "main/forms/assay.html"

    class Meta:
        fields = (
            "name",
            "protocol",
            "experimenter",
        )
        model = models.Assay

    def __init__(self, line, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self._line = line

    def clean(self):
        cleaned = super().clean()
        # if no explicit experimenter is set, make the study contact the experimenter
        if "name" not in cleaned:
            protocol = cleaned["protocol"]
            cleaned["name"] = f"{self._line.name}-{protocol.name}"
        return cleaned


class MetadataSelectForm(forms.Form):
    """Form to select a MetadataType to an EDD record."""

    template_name = "main/forms/metadata_select.html"

    metatype = forms.ModelChoiceField(
        empty_label=None,
        label=_("Metadata Type"),
        queryset=models.MetadataType.objects.order_by("type_name"),
        required=False,
    )
    selected_meta = forms.ModelMultipleChoiceField(
        queryset=models.MetadataType.objects.all(),
        required=False,
        widget=forms.MultipleHiddenInput(),
    )

    def __init__(
        self,
        includeField=None,
        study=None,
        typeFilter=None,
        *args,
        **kwargs,
    ):
        super().__init__(*args, **kwargs)
        self.fields["metatype"].widget = autocomplete.MetadataAutocomplete(
            includeField=includeField,
            typeFilter=typeFilter,
        )
        # TODO: can use this to auto-select metadata based on what's in study
        self.study = study

    def clean(self):
        cleaned = super().clean()
        # create selection from chosen type and any previously chosen types
        if meta := cleaned.get("metatype", None):
            cleaned["selected_meta"] = [*cleaned.get("selected_meta", []), meta]
            del cleaned["metatype"]
        # update data to move metatype to selected_meta
        selected_meta = [t.pk for t in cleaned.get("selected_meta", [])]
        self.data = self.data.copy()
        self.data.pop("metatype", None)
        self.data.setlist("selected_meta", selected_meta)
        return cleaned

    @property
    def selection(self):
        return self.cleaned_data["selected_meta"]

    @property
    def updateUrl(self):
        return reverse("main:metadata_ajax")


class MetadataUpdateForm(MetadataSelectForm):
    """Form to change Metadata values on an EDD record."""

    def __init__(self, initial=None, types=None, *args, **kwargs):
        start = initial or {}
        # only replicate is currently a hidden metadata field
        visible = models.MetadataType.objects.exclude(input_type="replicate")
        visible = visible.filter(pk__in=start.keys())
        to_add = list(itertools.chain(visible, types or []))
        initial = {f"meta_{k}_set": v for k, v in start.items()}
        initial["selected_meta"] = [t.pk for t in to_add]
        super().__init__(initial=initial, *args, **kwargs)
        self._type_fields = [self._add_type_fields(t) for t in to_add]

    def _add_type_fields(self, t, initial=None):
        set_field = self._type_set_field(t)
        self.fields[set_field] = self._build_type_field(t, initial or {})
        remove_field = self._type_remove_field(t)
        self.fields[remove_field] = forms.BooleanField(
            help_text=_("Remove {name}").format(name=t.type_name),
            label=_("Remove"),
            required=False,
            widget=forms.widgets.CheckboxInput(attrs={"class": "form-check-input"}),
        )
        return (set_field, remove_field)

    def _build_type_field(self, t, initial=None):
        value = initial.get(t.pk, None)
        base_kwargs = dict(
            help_text=t.description,
            initial=value,
            label=t.type_name,
            required=False,
        )
        match t.input_type:
            case "strain":
                return forms.ModelMultipleChoiceField(
                    queryset=models.Strain.objects.all(),
                    to_field_name="registry_id",
                    validators=[RegistryValidator()],
                    widget=autocomplete.RegistryAutocomplete(),
                    **base_kwargs,
                )
            case "textarea":
                return forms.CharField(
                    widget=forms.widgets.Textarea(attrs={"class": "form-control"}),
                    **base_kwargs,
                )
            case "user":
                return forms.ModelChoiceField(
                    queryset=User.objects.all(),
                    widget=autocomplete.UserAutocomplete(),
                    **base_kwargs,
                )
        return forms.CharField(
            widget=forms.widgets.TextInput(attrs={"class": "form-control"}),
            **base_kwargs,
        )

    def apply_metadata(self, instance):
        print("applying metadata changes")
        for t in self.selection:
            print(f"working on {t}")
            if value := self.cleaned_data.get(self._type_set_field(t), None):
                print(f"setting {t} to {value}")
                instance.metadata_add(t, value, append=False)
            if self.cleaned_data.get(self._type_remove_field(t), False):
                print(f"removing {t}")
                instance.metadata_clear(t)

    @staticmethod
    def initial_from_items(items):
        initial_sets = defaultdict(set)
        all_keys = {key for item in items for key in item.metadata.keys()}
        for item in items:
            for k in all_keys:
                v = item.metadata.get(k, item.metadata.get(str(k), None))
                initial_sets[k].add(v)
        # only return values that are the same across all items
        return {k: next(iter(v)) for k, v in initial_sets.items() if len(v) == 1}

    @property
    def metadata(self):
        return {
            t.pk: self.cleaned_data.get(self._type_set_field(t), None)
            for t in self.selection
            if not self.cleaned_data.get(self._type_remove_field(t), False)
        }

    @property
    def type_fields(self):
        yield from (
            (self[set_field], self[remove_field])
            for set_field, remove_field in self._type_fields
        )

    @staticmethod
    def _type_remove_field(metatype):
        return f"meta_{metatype.pk}_remove"

    @staticmethod
    def _type_set_field(metatype):
        return f"meta_{metatype.pk}_set"


__all__ = (
    AddAssayForm,
    MetadataSelectForm,
    MetadataUpdateForm,
    ModifyLineForm,
)
