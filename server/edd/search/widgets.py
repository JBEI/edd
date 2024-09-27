from django import forms
from django.urls import reverse
from django.utils.safestring import mark_safe
from django.utils.translation import gettext_lazy as _

from edd.utilities import JSONEncoder


class Select2Mixin:
    """
    Widget class to handle the attributes of INPUT elements used with the
    Select2 library for autocompletion.

    See the `select2` module for the framework for individual searchers, and
    the `Select2` decorator that matches widgets to search functions via the
    `kind` attribute of each subclass.
    """

    default_attrs: dict[str, str] = {}
    default_classes: list[str] = ["autocomp2", "form-select"]
    kind: str | None = None

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


class Select2CreateWidget(Select2Widget):
    """
    An input that includes an `allow_create` flag, which can be checked by the
    request on a searcher decorated by the `Select2` class; if the flag is set,
    the searcher may return a special item entry to indicate that a new record
    should be created by EDD.
    """

    def __init__(self, *, allow_create=False, attrs=None):
        self.default_attrs.update({"data-eddauto-create": allow_create})
        super().__init__(attrs=attrs)


class AssayAutocomplete(Select2Widget):
    kind = "Assay"

    def __init__(self, *, study_id, protocol_id, attrs=None):
        default = {
            "data-eddauto-study": study_id,
            "data-eddauto-protocol": protocol_id,
        }
        self.default_attrs.update(default)
        super().__init__(attrs=attrs)


class AssayLineAutocomplete(Select2CreateWidget):
    kind = "AssayLine"

    def __init__(self, *, study_id, protocol_id, attrs=None, **kwargs):
        default = {
            "data-eddauto-study": study_id,
            "data-eddauto-protocol": protocol_id,
        }
        self.default_attrs.update(default)
        super().__init__(attrs=attrs, **kwargs)


class CategoryAutocomplete(Select2Widget):
    kind = "Category"


class CompartmentAutocomplete(Select2Widget):
    kind = "Compartment"


class GeneAutocomplete(Select2CreateWidget):
    kind = "Gene"


class GroupAutocomplete(Select2Widget):
    kind = "Group"


class LineAutocomplete(Select2CreateWidget):
    kind = "Line"

    def __init__(self, *, study_id, attrs=None, **kwargs):
        self.default_attrs.update({"data-eddauto-study": study_id})
        super().__init__(attrs=attrs, **kwargs)


class MeasurementAutocomplete(Select2CreateWidget):
    kind = "GenericOrMetabolite"


class MetaboliteAutocomplete(Select2CreateWidget):
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
        if includeField is not None:
            value = "true" if includeField else "false"
            self.default_attrs["data-eddauto-field-types"] = value
        if typeFilter is not None:
            # dump to JSON to handle multiple values; frontend will deserialize
            value = JSONEncoder.dumps(typeFilter)
            self.default_attrs["data-eddauto-type-filter"] = value
        super().__init__(attrs=attrs)


class PermissionAutocomplete(Select2Widget):
    kind = "Permission"


class ProteinAutocomplete(Select2CreateWidget):
    kind = "Protein"


class ProtocolAutocomplete(Select2Widget):
    kind = "Protocol"


class RegistryAutocomplete(Select2Mixin, forms.widgets.SelectMultiple):
    kind = "Registry"

    @staticmethod
    def help_text():
        text = _(
            """
            Setup an ICE API key <a href="{link}" target="_new">in your profile</a>
            to search for strains.
            """
        ).format(link=reverse("profile:index"))
        # must use mark_safe to allow link to render
        return mark_safe(text)


class UnitAutocomplete(Select2CreateWidget):
    kind = "Unit"


class UserAutocomplete(Select2Widget):
    default_classes = ["autocomp2", "autocomp2-user", "form-select"]
    kind = "User"
