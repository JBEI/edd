"""Models for handling metadata."""

import dataclasses
import logging

from django.db import models
from django.db.models import F, Func
from django.utils.translation import gettext_lazy as _

from edd.fields import VarCharField

from .common import EDDSerialize

logger = logging.getLogger(__name__)


def __getattr__(name):
    from warnings import warn

    if name == "SYSTEM_META_TYPES":
        warn(
            "SYSTEM_META_TYPES is deprecated; use MetadataType.system() instead.",
            DeprecationWarning,
        )
        return globals()["MetadataType"].SYSTEM
    raise AttributeError(f"module {__name__} has no attribute {name}")


class MetadataGroup(models.Model):
    """Group together types of metadata with a label."""

    class Meta:
        db_table = "metadata_group"

    group_name = VarCharField(
        help_text=_("Name of the group/class of metadata."),
        unique=True,
        verbose_name=_("Group Name"),
    )

    def __str__(self):
        return self.group_name


@dataclasses.dataclass
class Metadata:
    """Mirrors fields of MetadataType, to define built-in Metadata."""

    # required
    for_context: str
    type_name: str
    uuid: str
    # optional
    default_value: str = None
    input_type: str = None
    postfix: str = None
    prefix: str = None
    type_field: str = None
    type_i18n: str = None


class MetadataType(models.Model, EDDSerialize):
    """Type information for arbitrary key-value data stored on EDDObject instances."""

    # defining values to use in the for_context field
    STUDY = "S"
    LINE = "L"
    ASSAY = "A"
    CONTEXT_SET = ((STUDY, _("Study")), (LINE, _("Line")), (ASSAY, _("Assay")))

    # pre-defined values that should always exist in the system
    _SYSTEM_TYPES = (
        # type_field metadata to map to Model object fields
        Metadata(
            for_context=ASSAY,
            input_type="textarea",
            type_field="description",
            type_i18n="main.models.Assay.description",
            type_name="Assay Description",
            uuid="4929a6ad-370c-48c6-941f-6cd154162315",
        ),
        Metadata(
            for_context=ASSAY,
            input_type="user",
            type_field="experimenter",
            type_i18n="main.models.Assay.experimenter",
            type_name="Assay Experimenter",
            uuid="15105bee-e9f1-4290-92b2-d7fdcb3ad68d",
        ),
        Metadata(
            for_context=ASSAY,
            input_type="string",
            type_field="name",
            type_i18n="main.models.Assay.name",
            type_name="Assay Name",
            uuid="33125862-66b2-4d22-8966-282eb7142a45",
        ),
        Metadata(
            for_context=LINE,
            input_type="carbon_source",
            type_field="carbon_source",
            type_i18n="main.models.Line.carbon_source",
            type_name="Carbon Source(s)",
            uuid="4ddaf92a-1623-4c30-aa61-4f7407acfacc",
        ),
        Metadata(
            for_context=LINE,
            input_type="checkbox",
            type_field="control",
            type_i18n="main.models.Line.control",
            type_name="Control",
            uuid="8aa26735-e184-4dcd-8dd1-830ec240f9e1",
        ),
        Metadata(
            for_context=LINE,
            input_type="user",
            type_field="contact",
            type_i18n="main.models.Line.contact",
            type_name="Line Contact",
            uuid="13672c8a-2a36-43ed-928f-7d63a1a4bd51",
        ),
        Metadata(
            for_context=LINE,
            input_type="textarea",
            type_field="description",
            type_i18n="main.models.Line.description",
            type_name="Line Description",
            uuid="5fe84549-9a97-47d2-a897-8c18dd8fd34a",
        ),
        Metadata(
            for_context=LINE,
            input_type="user",
            type_field="experimenter",
            type_i18n="main.models.Line.experimenter",
            type_name="Line Experimenter",
            uuid="974c3367-f0c5-461d-bd85-37c1a269d49e",
        ),
        Metadata(
            for_context=LINE,
            input_type="string",
            type_field="name",
            type_i18n="main.models.Line.name",
            type_name="Line Name",
            uuid="b388bcaa-d14b-4d7f-945e-a6fcb60142f2",
        ),
        Metadata(
            for_context=LINE,
            input_type="strain",
            type_field="strains",
            type_i18n="main.models.Line.strains",
            type_name="Strain(s)",
            uuid="292f1ca7-30de-4ba1-89cd-87d2f6291416",
        ),
        # "true" metadata, but directly referenced by code for specific purposes
        Metadata(
            default_value="--",
            for_context=LINE,
            input_type="media",
            type_i18n="main.models.Line.Media",
            type_name="Media",
            uuid="463546e4-a67e-4471-a278-9464e78dbc9d",
        ),
        Metadata(
            for_context=ASSAY,
            # TODO: consider making this: input_type="readonly"
            input_type="string",
            type_i18n="main.models.Assay.original",
            type_name="Original Name",
            uuid="5ef6500e-0f8b-4eef-a6bd-075bcb655caa",
        ),
        Metadata(
            for_context=LINE,
            input_type="replicate",
            type_i18n="main.models.Line.replicate",
            type_name="Replicate",
            uuid="71f5cd94-4dd4-45ca-a926-9f0717631799",
        ),
        Metadata(
            for_context=ASSAY,
            input_type="time",
            type_i18n="main.models.Assay.Time",
            type_name="Time",
            uuid="6629231d-4ef0-48e3-a21e-df8db6dfbb72",
        ),
    )
    _SYSTEM_DEF = {t.type_name: t for t in _SYSTEM_TYPES}
    SYSTEM = {t.type_name: t.uuid for t in _SYSTEM_TYPES}

    class Meta:
        db_table = "metadata_type"
        unique_together = (("type_name", "for_context"),)

    # optionally link several metadata types into a common group
    group = models.ForeignKey(
        MetadataGroup,
        blank=True,
        help_text=_("Group for this Metadata Type"),
        null=True,
        on_delete=models.PROTECT,
        verbose_name=_("Group"),
    )
    # a default label for the type; should normally use i18n lookup for display
    type_name = VarCharField(
        help_text=_("Name for Metadata Type"), verbose_name=_("Name")
    )
    # an i18n lookup for type label
    type_i18n = VarCharField(
        blank=True,
        help_text=_("i18n key used for naming this Metadata Type."),
        null=True,
        verbose_name=_("i18n Key"),
    )
    # field to store metadata, or None if stored in metadata
    type_field = VarCharField(
        blank=True,
        default=None,
        help_text=_(
            "Model field where metadata is stored; blank stores in metadata dictionary."
        ),
        null=True,
        verbose_name=_("Field Name"),
    )
    # type of the input on front-end; support checkboxes, autocompletes, etc
    # blank/null falls back to plain text input field
    input_type = VarCharField(
        blank=True,
        help_text=_("Type of input fields for values of this Metadata Type."),
        null=True,
        verbose_name=_("Input Type"),
    )
    # a default value to use if the field is left blank
    default_value = VarCharField(
        blank=True,
        help_text=_("Default value for this Metadata Type."),
        verbose_name=_("Default Value"),
    )
    # label used to prefix values
    prefix = VarCharField(
        blank=True,
        help_text=_("Prefix text appearing before values of this Metadata Type."),
        verbose_name=_("Prefix"),
    )
    # label used to postfix values (e.g. unit specifier)
    postfix = VarCharField(
        blank=True,
        help_text=_("Postfix text appearing after values of this Metadata Type."),
        verbose_name=_("Postfix"),
    )
    # target object for metadata
    for_context = VarCharField(
        choices=CONTEXT_SET,
        help_text=_("Type of EDD Object this Metadata Type may be added to."),
        verbose_name=_("Context"),
    )
    # linking together EDD instances will be easier later if we define UUIDs now
    uuid = models.UUIDField(
        editable=False,
        help_text=_("Unique identifier for this Metadata Type."),
        unique=True,
        verbose_name=_("UUID"),
    )

    @classmethod
    def all_types_on_instances(cls, instances):
        # grab all the keys on each instance metadata
        all_ids = [
            set(o.metadata.keys()) for o in instances if isinstance(o, EDDMetadata)
        ]
        # reduce all into a set to get only unique ids
        ids = set().union(*all_ids)
        return MetadataType.objects.filter(pk__in=ids).order_by(
            Func(F("type_name"), function="LOWER")
        )

    @classmethod
    def system(cls, name):
        """Load a pre-defined system-wide MetadataType."""
        typedef = cls._SYSTEM_DEF.get(name, None)
        if typedef is None:
            raise cls.DoesNotExist
        fields = {f.name for f in dataclasses.fields(Metadata)}
        defaults = {k: v for k, v in typedef.__dict__.items() if k in fields and v}
        meta, created = cls.objects.get_or_create(uuid=typedef.uuid, defaults=defaults)
        return meta

    def decode_value(self, value):
        """
        Default MetadataType class reflects back the passed value loaded from
        JSON. Subclasses may try to modify the value to convert to arbitrary
        Python values instead of a JSON-compatible dict.
        """
        return value

    def encode_value(self, value):
        """
        Default MetadataType class reflects back the passed value to send to
        JSON. Subclasses may try to modify the value to serialize arbitrary
        Python values to a JSON-compatible value.
        """
        return value

    def for_line(self):
        return self.for_context == self.LINE

    def for_assay(self):
        return self.for_context == self.ASSAY

    def for_study(self):
        return self.for_context == self.STUDY

    def __str__(self):
        return self.type_name

    def to_json(self, depth=0):
        return {
            "id": self.pk,
            "name": self.type_name,
            "i18n": self.type_i18n,
            "input_type": self.input_type,
            "prefix": self.prefix,
            "postfix": self.postfix,
            "default": self.default_value,
            "context": self.for_context,
        }


class EDDMetadata(models.Model):
    """Base class for EDD models supporting metadata."""

    class Meta:
        abstract = True

    metadata = models.JSONField(
        blank=True,
        help_text=_("JSON-based metadata dictionary."),
        default=dict,
        verbose_name=_("Metadata"),
    )

    def allow_metadata(self, metatype):
        return False

    def metadata_add(self, metatype, value, append=True):
        """
        Adds metadata to the object.

        By default, if there is already metadata of the same type, the value is
        appended to a list with previous value(s). Set kwarg `append` to False
        to overwrite previous values.
        """
        if not self.allow_metadata(metatype):
            raise ValueError(
                f"The metadata type '{metatype.type_name}' does not apply "
                f"to {type(self)} objects."
            )
        if metatype.type_field is None:
            if append:
                prev = self.metadata_get(metatype)
                if hasattr(prev, "append"):
                    prev.append(value)
                    value = prev
                elif prev is not None:
                    value = [prev, value]
            self.metadata[metatype.pk] = metatype.encode_value(value)
        else:
            temp = getattr(self, metatype.type_field)
            if hasattr(temp, "add"):
                if append:
                    temp.add(value)
                else:
                    setattr(self, metatype.type_field, [value])
            else:
                setattr(self, metatype.type_field, value)

    def metadata_clear(self, metatype):
        """Removes all metadata of the type from this object."""
        if metatype.type_field is None:
            self.metadata.pop(metatype.pk, None)
            # for backward-compatibility, also check string version
            self.metadata.pop(f"{metatype.pk}", None)
        else:
            temp = getattr(self, metatype.type_field)
            if hasattr(temp, "clear"):
                temp.clear()
            else:
                setattr(self, metatype.type_field, None)

    def metadata_get(self, metatype, default=None):
        """Returns the metadata on this object matching the type."""
        if metatype.type_field is None:
            # for backward-compatibility, also check string version
            value = self.metadata.get(
                metatype.pk, self.metadata.get(f"{metatype.pk}", None)
            )
            if value is None:
                return default
            return metatype.decode_value(value)
        return getattr(self, metatype.type_field)

    def metadata_remove(self, metatype, value):
        """Removes metadata with a value matching the argument for the type."""
        sentinel = object()
        prev = self.metadata_get(metatype, default=sentinel)
        # only act when metatype already existed
        if prev is not sentinel:
            if value == prev:
                # clear for single values
                self.metadata_clear(metatype)
            elif hasattr(prev, "remove"):
                # for lists, call remove
                try:
                    prev.remove(value)
                    self.metadata_add(metatype, prev, append=False)
                except ValueError:
                    # don't care if the value didn't exist
                    pass
