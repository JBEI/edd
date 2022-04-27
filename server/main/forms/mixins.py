import collections
import json

from django import forms
from django.utils.safestring import mark_safe


class BulkEditMixin:
    """Mixin class adds methods to inject bulk-edit checkboxes and filter out before saves."""

    @classmethod
    def initial_from_model(cls, instance, prefix=None):
        """Builds a dict of initial form values from a Line model"""
        initial = {}
        for fieldname in cls._meta.fields:
            widget = cls._meta.widgets.get(fieldname, None)
            value = getattr(instance, fieldname)
            fieldkey = f"{prefix}-{fieldname}" if prefix else fieldname
            # need to split MultiWidget values into each widget value
            if isinstance(widget, forms.widgets.MultiWidget):
                for i, part in enumerate(widget.decompress(value)):
                    initial[f"{fieldkey}_{i}"] = part
            # JSONField gives back a dict; must serialize to json
            elif isinstance(value, dict):
                initial[fieldkey] = json.dumps(value)
            # everything else shove value into fieldname
            else:
                initial[fieldkey] = str(value)
        return initial

    def check_bulk_edit(self):
        exclude = []
        # Look for "bulk-edit" checkboxes for each field
        for field in self.visible_fields():
            check = self.add_prefix(f"_bulk_{field.name}")
            if check not in self.data:
                exclude.append(field.name)
        # remove fields without a check from self, preventing processing
        for fieldname in exclude:
            # Removing excluded key from fields
            del self.fields[fieldname]

    def inject_bulk_checkboxes(self):
        # alter all fields to include a "bulk-edit" checkbox in label
        # initially hidden via "off" class
        for fieldname, field in self.fields.items():
            bulkname = self.add_prefix(f"_bulk_{fieldname}")
            field.label = mark_safe(
                f'<input type="checkbox" class="bulk" name="{bulkname}" '
                f'checked="checked" value=""/>{field.label}'
            )


class MetadataEditMixin:
    """Mixin class adds methods to handle processing values for MetadataType."""

    def clean_metadata(self):
        # go through and delete any keys with None values
        meta = self.cleaned_data.get("metadata", None)
        if meta is None:
            meta = {}
        updating, removing = self.process_metadata_inputs(meta)
        if self.is_editing():
            replacement = dict(self.instance.metadata)
            replacement.update(updating)
            # we don't care about list of removed values, so no assignment below
            collections.deque(
                map(lambda key: replacement.pop(key, None), removing), maxlen=0
            )
            return replacement
        # when not editing, just clean to the updating values
        return updating

    def is_editing(self):
        """Returns True when the Form is editing an instance object."""
        return self.instance and self.instance.pk is not None

    def process_metadata_inputs(self, meta):
        """
        Given input from the metadata form field, return a dict of updated keys/values
        and a set of keys to remove.

        :returns: a 2-tuple of a dict of updated metadata values and a set of
            removing metadata values.
        """
        updating = {}
        removing = set()
        for key, value in meta.items():
            # default processing:
            # - treat None/null/undefined as empty string
            # - remove values with a "delete" key in a dict
            # - pass everything else verbatim
            if value is None:
                updating[key] = ""
            elif isinstance(value, dict) and "delete" in value:
                removing.add(key)
            else:
                updating[key] = value
        return updating, removing


__all__ = [
    BulkEditMixin,
    MetadataEditMixin,
]
