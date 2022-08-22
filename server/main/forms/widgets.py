from django import forms
from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from django.db.models import Model, Q, manager

from .. import models as main_models

User = get_user_model()


class HiddenJSONWidget(forms.widgets.HiddenInput):
    """
    A hidden JSON input that will default to an empty object instead of throwing exception.
    """

    def value_from_datadict(self, data, files, name):
        # default value of empty dict/object
        return data.get(name, "{}")


class AutocompleteWidget(forms.widgets.MultiWidget):
    """Custom widget for a paired autocomplete and hidden ID field."""

    def __init__(self, attrs=None, model=User, opt=None):
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


class MultiAutocompleteWidget(AutocompleteWidget):
    """
    Extension to Autocomplete widget that handles multiple autocompleted values.

    All values must be lists; either a list of results from decompress, or a list of values
    to be passed to decompress.
    """

    def __init__(self, **kwargs):
        self._separator = kwargs.pop("separator", ",")
        super().__init__(**kwargs)

    def decompress(self, value):
        if isinstance(value, manager.BaseManager):
            # delegate decompress for individual items
            values = map(super().decompress, value.all())
            # zip together into array of two value-arrays
            values = list(zip(*values))
            if len(values):
                # join by the separator string
                return [
                    self._separator.join(map(str, values[0])),
                    self._separator.join(map(str, values[1])),
                ]
            else:
                # there are no values, return "empty" structure
                return ["", None]
        return super().decompress(value)

    def render(self, name, value, attrs=None, renderer=None):
        joined = []
        widget_count = len(self.widgets)
        for _index in range(widget_count):
            joined.append([])
        if value is None:
            value = []
        for item in value:
            if not isinstance(item, list):
                item = self.decompress(item)
            for index in range(widget_count):
                joined[index].append(item[index] if len(item) > index else "")
        for index in range(widget_count):
            joined[index] = self._separator.join(map(str, joined[index]))
        return super().render(name, joined, attrs)

    def value_from_datadict(self, data, files, name):
        # value from super will be joined by self._separator, so split it to get the true value
        joined = super().value_from_datadict(data, files, name)
        if joined:
            return joined.split(self._separator)
        return []


class UserAutocompleteWidget(AutocompleteWidget):
    """Autocomplete widget for Users"""

    def __init__(self, attrs=None, opt=None):
        opt = {} if opt is None else opt
        opt.update(
            {
                "text_attr": {
                    "class": "autocomp form-control",
                    "data-eddautocompletetype": "User",
                }
            }
        )
        super().__init__(attrs=attrs, model=User, opt=opt)


class GroupAutocompleteWidget(AutocompleteWidget):
    """Autocomplete widget for Groups"""

    def __init__(self, attrs=None, opt=None):
        opt = {} if opt is None else opt
        opt.update(
            {"text_attr": {"class": "autocomp", "data-eddautocompletetype": "Group"}}
        )
        super().__init__(attrs=attrs, model=Group, opt=opt)


class ProtocolAutocompleteWidget(AutocompleteWidget):
    """Autocomplete widget for Protocols"""

    def __init__(self, attrs=None, opt=None):
        opt = {} if opt is None else opt
        opt.update(
            {"text_attr": {"class": "autocomp", "data-eddautocompletetype": "Protocol"}}
        )
        super().__init__(attrs=attrs, model=main_models.Protocol, opt=opt)


class RegistryAutocompleteWidget(AutocompleteWidget):
    """Autocomplete widget for Registry strains"""

    def __init__(self, attrs=None, opt=None):
        opt = {} if opt is None else opt
        opt.update(
            {
                "text_attr": {
                    "class": "autocomp form-control",
                    "data-eddautocompletetype": "Registry",
                }
            }
        )
        super().__init__(attrs=attrs, model=main_models.Strain, opt=opt)

    def decompress(self, value):
        """Overriding since Strain uses registry_id for lookups."""
        if isinstance(value, main_models.Strain):
            return [self.display_value(value), value.registry_id]
        elif value:
            try:
                o = main_models.Strain.objects.get(registry_id=value)
                return [self.display_value(o), value]
            except main_models.Strain.DoesNotExist:
                pass
        return ["", None]


class MultiRegistryAutocompleteWidget(
    MultiAutocompleteWidget, RegistryAutocompleteWidget
):
    pass


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


class MeasurementTypeAutocompleteWidget(AutocompleteWidget):
    """Autocomplete widget for types of metadata"""

    def __init__(self, attrs=None, opt=None):
        """Set opt with {'text_attr': {'class': 'autocomp autocomp_XXX'}} to override."""
        opt = {} if opt is None else opt
        my_opt = {
            "text_attr": {
                "class": "autocomp form-control",
                "data-eddautocompletetype": "MeasurementType",
            }
        }
        my_opt.update(**opt)
        super().__init__(attrs=attrs, model=main_models.MeasurementType, opt=my_opt)


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
            return self.model.objects.get(
                self.decompress_q(value), sbml_template=self._template
            )
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
    AutocompleteWidget,
    GroupAutocompleteWidget,
    HiddenJSONWidget,
    MeasurementTypeAutocompleteWidget,
    MetadataTypeAutocompleteWidget,
    MultiAutocompleteWidget,
    MultiRegistryAutocompleteWidget,
    ProtocolAutocompleteWidget,
    RegistryAutocompleteWidget,
    SbmlExchangeAutocompleteWidget,
    SbmlInfoAutocompleteWidget,
    SbmlSpeciesAutocompleteWidget,
    UserAutocompleteWidget,
]
