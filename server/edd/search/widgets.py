from django import forms
from django.urls import reverse


class Select2Widget(forms.widgets.Select):
    default_attrs = {}
    default_classes = ["autocomp2", "form-select"]
    kind = None

    def get_autourl(self):
        if self.kind is None:
            return reverse("search:autocomplete")
        return reverse("search:acmodel", kwargs={"model": self.kind})

    def get_context(self, name, value, attrs):
        # merge passed attrs with the defaults
        with_defaults = self.build_attrs(self.default_attrs, attrs)
        # force our autocomplete data attributes
        combined = self.build_attrs(
            with_defaults,
            {
                "data-eddautocompletetype": self.kind,
                "data-eddautocompleteurl": self.get_autourl(),
            },
        )
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


class CompartmentAutocomplete(Select2Widget):
    kind = "Compartment"


class GeneAutocomplete(Select2Widget):
    kind = "Gene"


class GroupAutocomplete(Select2Widget):
    kind = "Group"


class MeasurementAutocomplete(Select2Widget):
    kind = "GenericOrMetabolite"


class MetaboliteAutocomplete(Select2Widget):
    kind = "Metabolite"


class MetadataAutocomplete(Select2Widget):
    kind = "MetadataType"


class PermissionAutocomplete(Select2Widget):
    kind = "Permission"


class ProteinAutocomplete(Select2Widget):
    kind = "Protein"


class ProtocolAutocomplete(Select2Widget):
    kind = "Protocol"


class RegistryAutocomplete(Select2Widget):
    default_attrs = {"multiple": "multiple"}
    kind = "Registry"


class SbmlExchange(Select2Widget):
    kind = "SbmlExchange"

    def __init__(self, template_id, *, attrs=None):
        self.default_attrs = {"data-eddauto-template": template_id}
        super().__init__(self, attrs)


class SbmlSpecies(Select2Widget):
    kind = "SbmlSpecies"

    def __init__(self, template_id, *, attrs=None):
        self.default_attrs = {"data-eddauto-template": template_id}
        super().__init__(self, attrs)


class UnitAutocomplete(Select2Widget):
    kind = "Unit"


class UserAutocomplete(Select2Widget):
    default_classes = ["autocomp2", "autocomp2-user", "form-select"]
    kind = "User"
