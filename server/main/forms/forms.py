"""Forms used in previous generation Bootstrap 3 pages. Deprecated."""

import logging
from copy import deepcopy
from functools import partial

from django import forms
from django.contrib.auth import get_user_model
from django.db import transaction
from django.db.models import CharField, F, Value
from django.db.models.functions import Concat
from django.utils.translation import gettext_lazy as _

from edd.search.registry import RegistryValidator

from .. import models
from . import mixins, widgets

logger = logging.getLogger(__name__)
User = get_user_model()


# DEPRECATED
class LineForm(mixins.BulkEditMixin, mixins.MetadataEditMixin, forms.ModelForm):
    """Form to create/edit a line."""

    class Meta:
        model = models.Line
        fields = (
            "name",
            "description",
            "control",
            "contact",
            "experimenter",
            "strains",
            "metadata",
        )
        labels = {
            "name": _("Line Name"),
            "description": _("Description"),
            "control": _("Is Control?"),
            "contact": _("Contact"),
            "experimenter": _("Experimenter"),
            "strains": _("Strains"),
        }
        widgets = {
            "name": forms.TextInput(
                attrs={"class": "form-control", "placeholder": "(required)"}
            ),
            "description": forms.Textarea(attrs={"rows": 2, "class": "form-control "}),
            "control": forms.widgets.CheckboxInput(attrs={"class": "form-control"}),
            "contact": widgets.UserAutocompleteWidget(),
            "experimenter": widgets.UserAutocompleteWidget(),
            "strains": widgets.MultiRegistryAutocompleteWidget(),
            "metadata": widgets.HiddenJSONWidget(),
        }
        help_texts = {
            "name": _(""),
            "description": _(""),
            "control": _(""),
            "contact": _(""),
            "experimenter": _(""),
            "strains": _(""),
        }

    def __init__(self, *args, **kwargs):
        # removes default hard-coded suffix of colon character on all labels
        kwargs.setdefault("label_suffix", "")
        # store the parent Study
        self._study = kwargs.pop("study", None)
        super().__init__(*args, **kwargs)
        # alter all fields to include a "bulk-edit" checkbox in label
        self.inject_bulk_checkboxes()
        # make sure strain is keyed by registry_id instead of pk, and validates uuid
        self._tweak_strains_field()

    def _tweak_strains_field(self):
        # make sure strain is keyed by registry_id instead of pk, and validates uuid
        def __clean(self, value):
            # validator creates Strain record if missing, now can check value
            for v in value:
                self.run_validators(v)
            return self.__clean(value)

        strains_field = self.fields["strains"]
        strains_field.__clean = strains_field.clean
        strains_field.clean = partial(__clean, strains_field)
        strains_field.to_field_name = "registry_id"
        strains_field.validators = [RegistryValidator().validate]

    def clean(self):
        super().clean()
        # if no explicit experimenter is set, make the study contact the experimenter
        if not self.cleaned_data.get("experimenter", None):
            if self._study.contact:
                self.cleaned_data["experimenter"] = self._study.contact

    def save(self, commit=True, *args, **kwargs):
        line = super().save(commit=False, *args, **kwargs)
        line.study_id = self._study.pk
        if commit:
            line.save()
            # since we forced commit=False in the first save, need to explicitly call save_m2m
            self.save_m2m()
        return line


# DEPRECATED
class AssayForm(mixins.BulkEditMixin, mixins.MetadataEditMixin, forms.ModelForm):
    """Form to create/edit an assay."""

    # allow auto-generation of name by override auto-created name field required kwarg
    name = forms.CharField(
        help_text=_(
            "If left blank, a name in form [Line]-[Protocol]-[#] will be generated."
        ),
        label=_("Name"),
        max_length=255,
        required=False,
        widget=forms.TextInput(attrs={"class": "form-control"}),
    )
    # order the options in the default SELECT widget; remove when using AutocompleteWidget
    protocol = forms.ModelChoiceField(
        label=_("Protocol"),
        queryset=models.Protocol.objects.order_by("name"),
        required=True,
        # TODO add a ProtocolAutocompleteWidget instead of building a SELECT
        widget=forms.Select(attrs={"class": "form-control"}),
    )

    class Meta:
        model = models.Assay
        fields = ("name", "description", "protocol", "experimenter", "metadata")
        labels = {"description": _("Description"), "experimenter": _("Experimenter")}
        help_texts = {"description": _(""), "experimenter": _("")}
        widgets = {
            "description": forms.Textarea(attrs={"rows": 2, "class": "form-control"}),
            "experimenter": widgets.UserAutocompleteWidget(),
            "metadata": widgets.HiddenJSONWidget(),
        }

    def __init__(self, *args, **kwargs):
        # removes default hard-coded suffix of colon character on all labels
        kwargs.setdefault("label_suffix", "")
        # store the parent Lines
        self._lines = kwargs.pop("lines", models.Line.objects.none())
        # store the parent Study
        self._study = kwargs.pop("study", None)
        super().__init__(*args, **kwargs)
        # alter all fields to include a "bulk-edit" checkbox in label
        self.inject_bulk_checkboxes()

    def save(self, commit=True, *args, **kwargs):
        assay = super().save(commit=False, *args, **kwargs)
        assay.study_id = self._study.pk
        if commit:
            if not self._lines.exists():
                # when self._lines is empty, proceed normally for single ID
                assay.save()
                self.save_m2m()
            else:
                # when self._lines is set, Assay objects get created for each item

                def link_to_line(line_id):
                    clone = deepcopy(assay)
                    clone.line_id = line_id
                    return clone

                def save_linked(enum):
                    # caller passes linked iterator through enumerate, unpack the tuple
                    index = enum[0]
                    assay = enum[1]
                    assay.save()
                    if not assay.name:
                        # once saved, can update with linked parts in name
                        parts = [
                            F("line__name"),
                            Value("-"),
                            F("protocol__name"),
                            Value(f"-{index}"),
                        ]
                        new_name = models.Assay.objects.values_list(
                            Concat(*parts, output_field=CharField()), flat=True
                        ).get(pk=assay)
                        # required to query then update; Django does not support joins in update
                        models.Assay.objects.filter(pk=assay).update(name=new_name)
                    return assay

                # clone assay info and link each clone to a line
                linked = map(link_to_line, self._lines.values_list("pk", flat=True))
                # save the linked clones to the database
                with transaction.atomic():
                    # wrap map in list to force iterating over the entire map, executing save
                    saved = list(map(save_linked, enumerate(linked, 1)))
                # returning only the first created assay
                return saved[0]
        return assay


class MeasurementForm(forms.ModelForm):
    """Form to create/edit a measurement."""

    class Meta:
        model = models.Measurement
        fields = ("measurement_type", "y_units", "compartment")
        help_texts = {
            "measurement_type": _(""),
            "y_units": _("(optional) Select the units used for these measurements"),
            "compartment": _(
                "Select if the measurement is inside or outside" " the organism"
            ),
        }
        labels = {
            "measurement_type": _("Type"),
            "y_units": _("Units"),
            "compartment": _("Compartment"),
        }
        widgets = {
            "measurement_type": widgets.MeasurementTypeAutocompleteWidget(),
            "y_units": forms.Select(attrs={"class": "form-control"}),
            "compartment": forms.Select(attrs={"class": "form-control"}),
        }

    def __init__(self, *args, **kwargs):
        # removes default hard-coded suffix of colon character on all labels
        kwargs.setdefault("label_suffix", "")
        # store the parent Assays
        self._assays = kwargs.pop("assays", models.Assay.objects.none())
        # store the parent Study
        self._study = kwargs.pop("study", None)
        # end up looking for hours repeatedly, just load once at init
        self._hours = models.MeasurementUnit.objects.get(unit_name="hours")
        super().__init__(*args, **kwargs)

    def save(self, commit=True, *args, **kwargs):
        measure = super().save(commit=False, *args, **kwargs)
        # TODO: hard-coding x_units for now; extend to take input for x-units?
        measure.x_units = self._hours
        measure.study_id = self._study.pk
        if commit:

            def link_to_assay(assay_id):
                clone = deepcopy(measure)
                clone.assay_id = assay_id
                return clone

            linked = map(link_to_assay, self._assays.values_list("pk", flat=True))
            with transaction.atomic():
                saved = list(map(lambda m: m.save(), linked))
            return saved[0]
        return measure


class MeasurementValueForm(forms.ModelForm):
    """Form for an individual measurement value."""

    class Meta:
        fields = ("x", "y")
        model = models.MeasurementValue


MeasurementValueFormSet = forms.models.inlineformset_factory(
    models.Measurement,
    models.MeasurementValue,
    can_delete=False,
    extra=0,
    form=MeasurementValueForm,
)


__all__ = (
    AssayForm,
    LineForm,
    MeasurementForm,
    MeasurementValueForm,
    MeasurementValueFormSet,
)
