from django import forms
from django.urls import reverse

from edd.utilities import JSONEncoder

from . import registry


class Select2Mixin:
    """
    Widget class to handle the attributes of INPUT elements used with the
    Select2 library for autocompletion.

    See the `select2` module for the framework for individual searchers, and
    the `Select2` decorator that matches widgets to search functions via the
    `kind` attribute of each subclass.
    """

    default_attrs = {}
    default_classes = ["autocomp2", "form-select"]
    kind = None

    def get_autourl(self):
        if self.kind:
            url = reverse("search:acmodel", kwargs={"model": self.kind})
            return {
                "data-eddautocompletetype": self.kind,
                "data-eddautocompleteurl": url,
            }
        return {}

    def get_context(self, name, value, attrs):
        # merge passed attrs with the defaults
        combined = {**self.default_attrs, **(attrs or {}), **self.get_autourl()}
        # update any class attribute with the default classes
        all_classes = filter(None, (combined.get("class", None), *self.default_classes))
        combined.update({"class": " ".join(all_classes)})
        # continue with default parent behavior with modified attrs
        return super().get_context(name, value, combined)

    def optgroups(self, name, value, attrs=None):
        # don't try to display all options, only those currently selected
        selected = [str(v) for v in value if v]
        # filter queryset if present; Compartment does not do querysets
        if hasattr(self.choices, "queryset"):
            self.choices.queryset = self.choices.queryset.filter(pk__in=selected)
        return super().optgroups(name, value, attrs)


class Select2Widget(Select2Mixin, forms.widgets.Select):
    pass


class AssayAutocomplete(Select2Widget):
    kind = "Assay"

    def __init__(self, *, study_id, attrs=None):
        self.default_attrs = {"data-eddauto-study": study_id}
        super().__init__(attrs)


class AssayLineAutocomplete(Select2Widget):
    kind = "AssayLine"

    def __init__(self, *, study_id, attrs=None):
        self.default_attrs = {"data-eddauto-study": study_id}
        super().__init__(attrs)


class CategoryAutocomplete(Select2Widget):
    kind = "Category"


class CompartmentAutocomplete(Select2Widget):
    kind = "Compartment"


class GeneAutocomplete(Select2Widget):
    kind = "Gene"


class GroupAutocomplete(Select2Widget):
    kind = "Group"


class LineAutocomplete(Select2Widget):
    kind = "Line"

    def __init__(self, *, study_id, attrs=None):
        self.default_attrs = {"data-eddauto-study": study_id}
        super().__init__(attrs)


class MeasurementAutocomplete(Select2Widget):
    kind = "GenericOrMetabolite"


class MetaboliteAutocomplete(Select2Widget):
    kind = "Metabolite"


class MetadataAutocomplete(Select2Widget):
    """
    Autocomplete for metadata types.

    :param attrs: same as Select widget attrs, see Django documentation.
    :param includeField: set whether builtin fields should be included in
        metadata search; default None will include all metadata, set to
        True to search *only* builtin fields, or False to exclude builtins.
    :param typeFilter: set to one of the context values on the MetadataType
        model, or a sequence type of these values, to include only those
        context types in results.
    """

    kind = "MetadataType"

    def __init__(self, *, attrs=None, includeField=None, typeFilter=None):
        self.default_attrs = {}
        if includeField is not None:
            value = "true" if includeField else "false"
            self.default_attrs["data-eddauto-field-types"] = value
        if typeFilter is not None:
            # dump to JSON to handle multiple values; frontend will deserialize
            value = JSONEncoder.dumps(typeFilter)
            self.default_attrs["data-eddauto-type-filter"] = value
        super().__init__(attrs)


class PermissionAutocomplete(Select2Widget):
    kind = "Permission"


class ProteinAutocomplete(Select2Widget):
    kind = "Protein"


class ProtocolAutocomplete(Select2Widget):
    kind = "Protocol"


class RegistryAutocomplete(Select2Mixin, forms.widgets.SelectMultiple):
    kind = "Registry"

    def optgroups(self, name, value, attrs=None):
        # don't try to display all options, only those currently selected
        selected = [str(v) for v in value if v]
        # filter queryset
        self.choices.queryset = self.choices.queryset.filter(registry_id__in=selected)
        # skipping over default implementation that assumes `id` field
        return super(Select2Mixin, self).optgroups(name, value, attrs)


class RegistryField(forms.ModelMultipleChoiceField):
    """
    Strain lookups happen outside of EDD, with local models linking to the true
    source of the strain information. We would like it to act as a regular
    lookup of a model, but the instance may not exist at the time. This variant
    of a ModelMultipleChoiceField ensures that the RegistryValidator creates a
    Strain model before any further operations.
    """

    def clean(self, value):
        # validator creates Strain objects if not already in database
        validator = registry.RegistryValidator()
        for item in value:
            validator.validate(item)
        return super().clean(value)


class SbmlExchange(Select2Widget):
    kind = "SbmlExchange"

    def __init__(self, template_id, *, attrs=None):
        self.default_attrs = {"data-eddauto-template": template_id}
        super().__init__(attrs)


class SbmlSpecies(Select2Widget):
    kind = "SbmlSpecies"

    def __init__(self, template_id, *, attrs=None):
        self.default_attrs = {"data-eddauto-template": template_id}
        super().__init__(attrs)


class UnitAutocomplete(Select2Widget):
    kind = "Unit"

    def __init__(self, *, allow_create=False, attrs=None):
        self.default_attrs = {"data-eddauto-create": allow_create}
        super().__init__(attrs)


class UserAutocomplete(Select2Widget):
    default_classes = ["autocomp2", "autocomp2-user", "form-select"]
    kind = "User"
