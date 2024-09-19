from django import forms
from django.db.models import Model, Q

from .. import models as main_models


class AutocompleteWidget(forms.widgets.MultiWidget):
    """Custom widget for a paired autocomplete and hidden ID field."""

    def __init__(self, attrs=None, model=main_models.MetadataType, opt=None):
        opt = {} if opt is None else opt
        _widgets = (
            forms.widgets.TextInput(attrs=opt.get("text_attr", {})),
            forms.HiddenInput(),
        )
        self.model = model
        super().__init__(_widgets, attrs)

    def decompress(self, value):
        # if the value is the actual model instance, don't try to look up model
        if isinstance(value, Model):
            return [self.display_value(value), value.pk]
        elif not value:
            pass
        elif o := self._find_instance(value):
            return [self.display_value(o), o.pk]
        return ["", None]

    def display_value(self, value):
        return str(value)

    def value_from_datadict(self, data, files, name):
        widgets = enumerate(self.widgets)
        v = [w.value_from_datadict(data, files, f"{name}_{i}") for i, w in widgets]
        # v[0] is text of field, v[1] is hidden ID
        return v[1]

    def _find_instance(self, value):
        try:
            return self.model.objects.get(pk=value)
        except Exception:
            return None


class MetadataTypeAutocompleteWidget(AutocompleteWidget):
    """Autocomplete widget for types of metadata"""

    def __init__(self, attrs=None, opt=None):
        opt = {} if opt is None else opt
        opt.update(
            {
                "text_attr": {
                    "class": "autocomp",
                    "data-eddautocompletetype": "MetadataType",
                }
            }
        )
        super().__init__(attrs=attrs, model=main_models.MetadataType, opt=opt)


class SbmlInfoAutocompleteWidget(AutocompleteWidget):
    """Autocomplete widget for parts contained within SBMLTemplate"""

    def __init__(self, template, model, attrs=None, opt=None):
        self._template = template
        opt = {} if opt is None else opt
        opt.get("text_attr", {}).update({"data-template": template.pk})
        super().__init__(attrs=attrs, model=model, opt=opt)

    def decompress(self, value):
        # if the value is the actual model instance, don't try to look up model
        if isinstance(value, self.model):
            return [self.display_value(value), value.pk]
        elif value:
            o = self.lookup(value)
            return [self.display_value(o), o.pk]
        return ["", None]

    def decompress_q(self, value):
        return Q(pk=self._int(value))

    def lookup(self, value):
        try:
            return self.model.objects.get(self.decompress_q(value), sbml_template=self._template)
        except self.model.DoesNotExist:
            pass
        return None

    def value_from_datadict(self, data, files, name):
        widgets = enumerate(self.widgets)
        v = [w.value_from_datadict(data, files, name + "_%s" % i) for i, w in widgets]
        # v[0] is text of field, v[1] is hidden ID
        return self.lookup(v[1])

    def _int(self, value):
        "Try casting a value to int, return None if fails"
        try:
            return int(value)
        except ValueError:
            return None


class SbmlExchangeAutocompleteWidget(SbmlInfoAutocompleteWidget):
    """Autocomplete widget for Exchanges in an SBMLTemplate"""

    def __init__(self, template, attrs=None, opt=None):
        opt = {} if opt is None else opt
        opt.update(
            text_attr={
                "class": "autocomp",
                "data-eddautocompletetype": "MetaboliteExchange",
            }
        )
        super().__init__(
            template=template,
            attrs=attrs,
            model=main_models.MetaboliteExchange,
            opt=opt,
        )

    def decompress_q(self, value):
        parent = super().decompress_q(value)
        return parent | Q(exchange_name=value)


class SbmlSpeciesAutocompleteWidget(SbmlInfoAutocompleteWidget):
    """Autocomplete widget for Species in an SBMLTemplate"""

    def __init__(self, template, attrs=None, opt=None):
        opt = {} if opt is None else opt
        opt.update(
            text_attr={
                "class": "autocomp",
                "data-eddautocompletetype": "MetaboliteSpecies",
            }
        )
        super().__init__(
            template=template, attrs=attrs, model=main_models.MetaboliteSpecies, opt=opt
        )

    def decompress_q(self, value):
        parent = super().decompress_q(value)
        return parent | Q(species=value)


__all__ = [
    MetadataTypeAutocompleteWidget,
    SbmlExchangeAutocompleteWidget,
    SbmlSpeciesAutocompleteWidget,
]
