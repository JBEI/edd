import collections
import json
import logging
from copy import deepcopy
from functools import partial

from django import forms
from django.conf import settings
from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from django.core.exceptions import ValidationError
from django.db import transaction
from django.db.models import CharField as DbCharField
from django.db.models import F, Q
from django.db.models import Value as V
from django.db.models.base import Model
from django.db.models.functions import Concat
from django.db.models.manager import BaseManager
from django.utils.safestring import mark_safe
from django.utils.translation import gettext_lazy as _

from edd.search.registry import StrainRegistry

from . import models
from .models import (
    Assay,
    Attachment,
    CarbonSource,
    Comment,
    Line,
    Measurement,
    MeasurementType,
    MeasurementValue,
    MetaboliteExchange,
    MetaboliteSpecies,
    MetadataType,
    Protocol,
    Strain,
    Study,
    StudyPermission,
    Update,
)

User = get_user_model()
logger = logging.getLogger(__name__)


class HiddenJSONWidget(forms.widgets.HiddenInput):
    """
    A hidden JSON input that will default to an empty object instead of throwing exception.
    """

    def value_from_datadict(self, data, files, name):
        # default value of empty dict/object
        return data.get(name, "{}")


class AutocompleteWidget(forms.widgets.MultiWidget):
    """ Custom widget for a paired autocomplete and hidden ID field. """

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
        elif value:
            o = self.model.objects.get(pk=value)
            return [self.display_value(o), value]
        return ["", None]

    def display_value(self, value):
        return str(value)

    def value_from_datadict(self, data, files, name):
        widgets = enumerate(self.widgets)
        v = [w.value_from_datadict(data, files, name + "_%s" % i) for i, w in widgets]
        # v[0] is text of field, v[1] is hidden ID
        return v[1]


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
        if isinstance(value, BaseManager):
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
    """ Autocomplete widget for Users """

    def __init__(self, attrs=None, opt=None):
        opt = {} if opt is None else opt
        opt.update(
            {
                "text_attr": {
                    "class": "autocomp form-control",
                    "eddautocompletetype": "User",
                }
            }
        )
        super().__init__(attrs=attrs, model=User, opt=opt)


class GroupAutocompleteWidget(AutocompleteWidget):
    """ Autocomplete widget for Groups """

    def __init__(self, attrs=None, opt=None):
        opt = {} if opt is None else opt
        opt.update({"text_attr": {"class": "autocomp", "eddautocompletetype": "Group"}})
        super().__init__(attrs=attrs, model=Group, opt=opt)


class ProtocolAutocompleteWidget(AutocompleteWidget):
    """Autocomplete widget for Protocols"""

    def __init__(self, attrs=None, opt=None):
        opt = {} if opt is None else opt
        opt.update(
            {"text_attr": {"class": "autocomp", "eddautocompletetype": "Protocol"}}
        )
        super().__init__(attrs=attrs, model=Protocol, opt=opt)


class RegistryValidator:
    """
    Validator for Strain objects tied to ICE registry. If using outside the
    context of Form validation (e.g. in a Celery task), ensure that the Update
    object is created before the callable is called.

    See: https://docs.djangoproject.com/en/dev/ref/validators/
    """

    def __init__(self, existing_strain=None, existing_entry=None):
        """
        If an already-existing Strain object in the database is being updated,
        initialize RegistryValidator with existing_strain. If an entry has
        already been queried from ICE, initialize with existing_entry.
        """
        self.existing_strain = existing_strain
        self.existing_entry = existing_entry

    def load_part_from_ice(self, registry_id):
        if self.existing_entry is not None:
            return self.existing_entry
        # using the Update to get the correct user for the search
        update = Update.load_update()
        registry = StrainRegistry()
        user_email = update.mod_by.email
        try:
            with registry.login(update.mod_by):
                return registry.get_entry(registry_id)
        except Exception as e:
            raise ValidationError(
                _("Failed to load strain %(uuid)s from ICE for user %(user)s"),
                code="ice failure",
                params={"user": user_email, "uuid": registry_id},
            ) from e

    def save_strain(self, entry):
        try:
            if entry and self.existing_strain:
                self.existing_strain.name = entry.name
                self.existing_strain.registry_id = entry.registry_id
                self.existing_strain.registry_url = entry.registry_url
                self.existing_strain.save()
            elif entry:
                # not using get_or_create, so exception is raised if registry_id exists
                Strain.objects.create(
                    name=entry.name,
                    registry_id=entry.registry_id,
                    registry_url=entry.registry_url,
                )
        except Exception as e:
            raise ValidationError(
                _("Failed to save strain from %(entry)s"),
                code="db failure",
                params={"entry": entry},
            ) from e

    def validate(self, value):
        try:
            # handle multi-valued inputs by validating each value individually
            if isinstance(value, (list, tuple)):
                for v in value:
                    self.validate(v)
                return
            qs = Strain.objects.filter(registry_id=value)
            if self.existing_strain:
                qs = qs.exclude(pk__in=[self.existing_strain])
            count = qs.count()
            if count == 0:
                self.save_strain(self.load_part_from_ice(value))
            elif count > 1:
                raise ValidationError(
                    _(
                        "Selected ICE record is already linked to EDD strains: %(strains)s"
                    ),
                    code="existing records",
                    params={"strains": list(qs)},
                )
        except ValidationError:
            raise
        except Exception as e:
            raise ValidationError(
                _("Error querying for an EDD strain with registry_id %(uuid)s"),
                code="query failure",
                params={"uuid": value},
            ) from e

    def __call__(self, value):
        self.validate(value)


class RegistryAutocompleteWidget(AutocompleteWidget):
    """ Autocomplete widget for Registry strains """

    def __init__(self, attrs=None, opt=None):
        opt = {} if opt is None else opt
        opt.update(
            {
                "text_attr": {
                    "class": "autocomp form-control",
                    "eddautocompletetype": "Registry",
                }
            }
        )
        super().__init__(attrs=attrs, model=Strain, opt=opt)

    def decompress(self, value):
        """ Overriding since Strain uses registry_id for lookups. """
        if isinstance(value, Strain):
            return [self.display_value(value), value.registry_id]
        elif value:
            try:
                o = Strain.objects.get(registry_id=value)
                return [self.display_value(o), value]
            except Strain.DoesNotExist:
                pass
        return ["", None]


class MultiRegistryAutocompleteWidget(
    MultiAutocompleteWidget, RegistryAutocompleteWidget
):
    pass


class CarbonSourceAutocompleteWidget(AutocompleteWidget):
    """ Autocomplete widget for carbon sources """

    def __init__(self, attrs=None, opt=None):
        opt = {} if opt is None else opt
        opt.update(
            {
                "text_attr": {
                    "class": "autocomp form-control",
                    "eddautocompletetype": "CarbonSource",
                }
            }
        )
        super().__init__(attrs=attrs, model=CarbonSource, opt=opt)

    def display_value(self, value):
        return value.name


class MultiCarbonSourceAutocompleteWidget(
    MultiAutocompleteWidget, CarbonSourceAutocompleteWidget
):
    pass


class MetadataTypeAutocompleteWidget(AutocompleteWidget):
    """ Autocomplete widget for types of metadata """

    def __init__(self, attrs=None, opt=None):
        opt = {} if opt is None else opt
        opt.update(
            {"text_attr": {"class": "autocomp", "eddautocompletetype": "MetadataType"}}
        )
        super().__init__(attrs=attrs, model=MetadataType, opt=opt)


class MeasurementTypeAutocompleteWidget(AutocompleteWidget):
    """ Autocomplete widget for types of metadata """

    def __init__(self, attrs=None, opt=None):
        """ Set opt with {'text_attr': {'class': 'autocomp autocomp_XXX'}} to override. """
        opt = {} if opt is None else opt
        my_opt = {
            "text_attr": {
                "class": "autocomp form-control",
                "eddautocompletetype": "MeasurementType",
            }
        }
        my_opt.update(**opt)
        super().__init__(attrs=attrs, model=MeasurementType, opt=my_opt)


class SbmlInfoAutocompleteWidget(AutocompleteWidget):
    """ Autocomplete widget for parts contained within SBMLTemplate """

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
    """ Autocomplete widget for Exchanges in an SBMLTemplate """

    def __init__(self, template, attrs=None, opt=None):
        opt = {} if opt is None else opt
        opt.update(
            text_attr={"class": "autocomp", "eddautocompletetype": "MetaboliteExchange"}
        )
        super().__init__(
            template=template, attrs=attrs, model=MetaboliteExchange, opt=opt
        )

    def decompress_q(self, value):
        parent = super().decompress_q(value)
        return parent | Q(exchange_name=value)


class SbmlSpeciesAutocompleteWidget(SbmlInfoAutocompleteWidget):
    """ Autocomplete widget for Species in an SBMLTemplate """

    def __init__(self, template, attrs=None, opt=None):
        opt = {} if opt is None else opt
        opt.update(
            text_attr={"class": "autocomp", "eddautocompletetype": "MetaboliteSpecies"}
        )
        super().__init__(
            template=template, attrs=attrs, model=MetaboliteSpecies, opt=opt
        )

    def decompress_q(self, value):
        parent = super().decompress_q(value)
        return parent | Q(species=value)


class CreateStudyForm(forms.ModelForm):
    """ Form to create a new study. """

    # include hidden field for copying multiple Line instances by ID
    lineId = forms.ModelMultipleChoiceField(
        queryset=Line.objects.none(), required=False, widget=forms.MultipleHiddenInput
    )

    class Meta:
        model = Study
        fields = ["name", "description", "contact"]
        labels = {
            "name": _("Study Name"),
            "description": _("Description"),
            "contact": _("Contact"),
        }
        widgets = {
            "name": forms.widgets.TextInput(
                attrs={"size": 50, "class": "form-control", "placeholder": "(required)"}
            ),
            "description": forms.widgets.Textarea(
                attrs={"cols": 49, "class": "form-control"}
            ),
            "contact": UserAutocompleteWidget(),
        }

        help_texts = {"name": _(""), "description": _("")}

    def __init__(self, *args, **kwargs):
        # removes default hard-coded suffix of colon character on all labels
        kwargs.setdefault("label_suffix", "")
        self._user = kwargs.pop("user", None)
        super().__init__(*args, **kwargs)
        # self.fields exists after super.__init__()
        if self._user:
            # make sure lines are in a readable study
            access = models.Study.access_filter(self._user, via="study")
            queryset = models.Line.objects.filter(access).distinct()
            self.fields["lineId"].queryset = queryset

    def clean(self):
        super().clean()
        # if no explicit contact is set, make the current user the contact
        # TODO: handle contact_extra too
        if not self.cleaned_data.get("contact", None):
            self.cleaned_data["contact"] = self._user

    def save(self, commit=True, *args, **kwargs):
        # perform updates atomically to the study and related user permissions
        with transaction.atomic():
            # save the study
            s = super().save(commit=commit, *args, **kwargs)
            # make sure the creator has write permission, and ESE has read
            s.userpermission_set.update_or_create(
                user=s.created.mod_by, permission_type=StudyPermission.WRITE
            )

            # if configured, apply default group read permissions to the new study
            _SETTING_NAME = "EDD_DEFAULT_STUDY_READ_GROUPS"
            default_group_names = getattr(settings, _SETTING_NAME, None)
            if default_group_names:
                default_groups = Group.objects.filter(name__in=default_group_names)
                default_groups = default_groups.values_list("pk", flat=True)
                requested_groups = len(default_group_names)
                found_groups = len(default_groups)
                if requested_groups != found_groups:
                    logger.error(
                        f"Setting only {found_groups} of {requested_groups} read permissions "
                        f"for study `{s.slug}`."
                    )
                    logger.error(
                        f"Check that all group names set in the `{_SETTING_NAME}` value in "
                        "Django settings is valid."
                    )
                for group in default_groups:
                    s.grouppermission_set.update_or_create(
                        group_id=group,
                        defaults={"permission_type": StudyPermission.READ},
                    )

            # create copies of passed in Line IDs
            self.save_lines(s)
        return s

    def save_lines(self, study):
        """ Saves copies of Line IDs passed to the form on the study. """
        to_add = []
        lines = self.cleaned_data.get("lineId", None)
        if lines is None:
            lines = []
        for line in lines:
            line.pk = line.id = None
            line.study = study
            line.study_id = study.id
            line.uuid = None
            to_add.append(line)
        study.line_set.add(*to_add, bulk=False)


class CreateAttachmentForm(forms.ModelForm):
    """ Form to create a new attachment. """

    class Meta:
        model = Attachment
        fields = ("file", "description")
        labels = {"file": _(""), "description": _("Description")}
        help_texts = {"description": _(""), "file": _("")}
        widgets = {"description": forms.widgets.TextInput()}

    def __init__(self, *args, **kwargs):
        # removes default hard-coded suffix of colon character on all labels
        kwargs.setdefault("label_suffix", "")
        # store the parent EDDObject
        self._parent = kwargs.pop("edd_object", None)
        super().__init__(*args, **kwargs)

    def save(self, commit=True, *args, **kwargs):
        a = super().save(commit=False, *args, **kwargs)
        a.object_ref = self._parent
        if commit:
            a.save()
        return a


class CreateCommentForm(forms.ModelForm):
    """ Form to create a new comment. """

    class Meta:
        model = Comment
        fields = ("body",)
        labels = {"body": _("")}
        help_texts = {"body": _("")}

    def __init__(self, *args, **kwargs):
        # removes default hard-coded suffix of colon character on all labels
        kwargs.setdefault("label_suffix", "")
        # store the parent EDDObject
        self._parent = kwargs.pop("edd_object", None)
        super().__init__(*args, **kwargs)

    def save(self, commit=True, *args, **kwargs):
        c = super().save(commit=False, *args, **kwargs)
        c.object_ref = self._parent
        if commit:
            c.save()
        return c


class BulkEditMixin:
    """Mixin class adds methods to inject bulk-edit checkboxes and filter out before saves."""

    @classmethod
    def initial_from_model(cls, instance, prefix=None):
        """ Builds a dict of initial form values from a Line model """
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


class LineForm(BulkEditMixin, MetadataEditMixin, forms.ModelForm):
    """ Form to create/edit a line. """

    class Meta:
        model = Line
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
            "contact": UserAutocompleteWidget(),
            "experimenter": UserAutocompleteWidget(),
            "strains": MultiRegistryAutocompleteWidget(),
            "metadata": HiddenJSONWidget(),
        }
        help_texts = {
            "name": _(""),
            "description": _(""),
            "control": _(""),
            "contact": _(""),
            "experimenter": _(""),
            "carbon_source": _(""),
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


class AssayForm(BulkEditMixin, MetadataEditMixin, forms.ModelForm):
    """ Form to create/edit an assay. """

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
        queryset=Protocol.objects.order_by("name"),
        required=True,
        # TODO add a ProtocolAutocompleteWidget instead of building a SELECT
        widget=forms.Select(attrs={"class": "form-control"}),
    )

    class Meta:
        model = Assay
        fields = ("name", "description", "protocol", "experimenter", "metadata")
        labels = {"description": _("Description"), "experimenter": _("Experimenter")}
        help_texts = {"description": _(""), "experimenter": _("")}
        widgets = {
            "description": forms.Textarea(attrs={"rows": 2, "class": "form-control"}),
            "experimenter": UserAutocompleteWidget(),
            "metadata": HiddenJSONWidget(),
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
                            V("-"),
                            F("protocol__name"),
                            V(f"-{index}"),
                        ]
                        new_name = models.Assay.objects.values_list(
                            Concat(*parts, output_field=DbCharField()), flat=True
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
    """ Form to create/edit a measurement. """

    class Meta:
        model = Measurement
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
            "measurement_type": MeasurementTypeAutocompleteWidget(),
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
    """ Form for an individual measurement value. """

    class Meta:
        fields = ("x", "y")
        model = MeasurementValue


MeasurementValueFormSet = forms.models.inlineformset_factory(
    Measurement, MeasurementValue, can_delete=False, extra=0, form=MeasurementValueForm
)
