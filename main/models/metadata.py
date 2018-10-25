# coding: utf-8
"""
Models for handling metadata.
"""

import json
import logging

from django.contrib.postgres.fields import JSONField
from django.db import models
from django.db.models import F, Func
from django.utils.encoding import python_2_unicode_compatible
from django.utils.translation import ugettext_lazy as _
from functools import reduce
from importlib import import_module
from six import string_types
from uuid import uuid4

from .common import EDDSerialize


logger = logging.getLogger(__name__)


@python_2_unicode_compatible
class MetadataGroup(models.Model):
    """ Group together types of metadata with a label. """

    class Meta:
        db_table = "metadata_group"

    group_name = models.CharField(
        help_text=_("Name of the group/class of metadata."),
        max_length=255,
        unique=True,
        verbose_name=_("Group Name"),
    )

    def __str__(self):
        return self.group_name


@python_2_unicode_compatible
class MetadataType(models.Model, EDDSerialize):
    """ Type information for arbitrary key-value data stored on EDDObject instances. """

    # defining values to use in the for_context field
    STUDY = "S"  # metadata stored in a Study
    LINE = "L"  # metadata stored in a Line
    ASSAY = "A"  # metadata stored in an Assay
    # TODO: support metadata on other EDDObject types (Protocol, Strain, Carbon Source, etc)
    CONTEXT_SET = ((STUDY, _("Study")), (LINE, _("Line")), (ASSAY, _("Assay")))

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
    type_name = models.CharField(
        help_text=_("Name for Metadata Type"), max_length=255, verbose_name=_("Name")
    )
    # an i18n lookup for type label
    # NOTE: migration 0005_SYNBIO-1120_linked_metadata adds a partial unique index to this field
    # i.e. CREATE UNIQUE INDEX … ON metadata_type(type_i18n) WHERE type_i18n IS NOT NULL
    type_i18n = models.CharField(
        blank=True,
        help_text=_("i18n key used for naming this Metadata Type."),
        max_length=255,
        null=True,
        verbose_name=_("i18n Key"),
    )
    # field to store metadata, or None if stored in metadata
    type_field = models.CharField(
        blank=True,
        default=None,
        help_text=_(
            "Model field where metadata is stored; blank stores in metadata dictionary."
        ),
        max_length=255,
        null=True,
        verbose_name=_("Field Name"),
    )
    # size of input text field
    input_size = models.IntegerField(
        default=6,
        help_text=_("Size of input fields for values of this Metadata Type."),
        verbose_name=_("Input Size"),
    )
    # type of the input; support checkboxes, autocompletes, etc
    input_type = models.CharField(
        blank=True,
        help_text=_("Type of input fields for values of this Metadata Type."),
        max_length=255,
        null=True,
        verbose_name=_("Input Type"),
    )
    # a default value to use if the field is left blank
    default_value = models.CharField(
        blank=True,
        help_text=_("Default value for this Metadata Type."),
        max_length=255,
        verbose_name=_("Default Value"),
    )
    # lael used to prefix values
    prefix = models.CharField(
        blank=True,
        help_text=_("Prefix text appearing before values of this Metadata Type."),
        max_length=255,
        verbose_name=_("Prefix"),
    )
    # label used to postfix values (e.g. unit specifier)
    postfix = models.CharField(
        blank=True,
        help_text=_("Postfix text appearing after values of this Metadata Type."),
        max_length=255,
        verbose_name=_("Postfix"),
    )
    # target object for metadata
    for_context = models.CharField(
        choices=CONTEXT_SET,
        help_text=_("Type of EDD Object this Metadata Type may be added to."),
        max_length=8,
        verbose_name=_("Context"),
    )
    # type of data saved, None defaults to a bare string
    type_class = models.CharField(
        blank=True,
        help_text=_(
            "Type of data saved for this Metadata Type; blank saves a string type."
        ),
        max_length=255,
        null=True,
        verbose_name=_("Type Class"),
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
        ids = reduce(lambda a, b: a.union(b), all_ids, set())
        return MetadataType.objects.filter(pk__in=ids).order_by(
            Func(F("type_name"), function="LOWER")
        )

    def load_type_class(self):
        if self.type_class is not None:
            try:
                module_name, class_name = self.type_class.rsplit(".", 1)
                module = import_module(module_name)
                return getattr(module, class_name, None)
            except ValueError:
                logger.warning(f"Invalid metadata type_class '{self.type_class}'.")
            except ModuleNotFoundError:
                logger.warning(
                    f"Cannot find module for type_class '{self.type_class}'."
                )
        return None

    def decode_value(self, value):
        """
        A postgres HStore column only supports string keys and string values. This method uses
        the definition of the MetadataType to convert a string from the database into an
        appropriate Python object.
        """
        try:
            if self.type_class is None:
                return value  # for compatibility, bare strings used on None types
            MetaModel = self.load_type_class()
            if MetaModel is None:
                return json.loads(value)
            return MetaModel.objects.get(pk=value)
        except Exception:
            logger.warning(f"Failed to decode metadata {self}, returning raw value")
        return value

    def encode_value(self, value):
        """
        A postgres HStore column only supports string keys and string values. This method uses
        the definition of the MetadataType to convert a Python object into a string to be
        saved in the database.
        """
        try:
            if isinstance(value, string_types) and self.type_class is None:
                return value  # for compatibility, store strings bare
            MetaModel = self.load_type_class()
            if MetaModel is None:
                return json.dumps(value)
            elif isinstance(value, MetaModel):
                return str(value.pk)
        except Exception:
            logger.warning(
                f"Failed to encode metadata {self}, storing string representation"
            )
        return str(value)

    def for_line(self):
        return self.for_context == self.LINE

    def for_assay(self):
        return self.for_context == self.ASSAY

    def for_study(self):
        return self.for_context == self.STUDY

    def __str__(self):
        return self.type_name

    def save(self, *args, **kwargs):
        if self.uuid is None:
            self.uuid = uuid4()
        super(MetadataType, self).save(*args, **kwargs)

    def to_json(self, depth=0):
        return {
            "id": self.pk,
            "name": self.type_name,
            "i18n": self.type_i18n,
            "input_type": self.input_type,
            "input_size": self.input_size,
            "prefix": self.prefix,
            "postfix": self.postfix,
            "default": self.default_value,
            "context": self.for_context,
        }

    @classmethod
    def all_with_groups(cls):
        return cls.objects.select_related("group").order_by(
            Func(F("type_name"), function="LOWER")
        )


class EDDMetadata(models.Model):
    """ Base class for EDD models supporting metadata. """

    class Meta:
        abstract = True

    # migrate to using JSONB storage for metadata
    metadata = JSONField(
        blank=True,
        help_text=_("JSON-based metadata dictionary."),
        default=dict,
        verbose_name=_("Metadata"),
    )

    def allow_metadata(self, metatype):
        return False

    def metadata_add(self, metatype, value, append=True):
        """
        Adds metadata to the object; by default, if there is already metadata of the same type,
        the value is appended to a list with previous value(s). Set kwarg `append` to False to
        overwrite previous values.
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
            self.metadata[str(metatype.pk)] = metatype.encode_value(value)
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
        """ Removes all metadata of the type from this object. """
        if metatype.type_field is None:
            del self.metadata[str(metatype.pk)]
        else:
            temp = getattr(self, metatype.type_field)
            if hasattr(temp, "clear"):
                temp.clear()
            else:
                setattr(self, metatype.type_field, None)

    def metadata_get(self, metatype, default=None):
        """ Returns the metadata on this object matching the type. """
        if metatype.type_field is None:
            value = self.metadata.get(str(metatype.pk), None)
            if value is None:
                return default
            return metatype.decode_value(value)
        return getattr(self, metatype.type_field)

    def metadata_remove(self, metatype, value):
        """ Removes metadata with a value matching the argument for the type. """
        prev = self.metadata_get(metatype)
        if prev:
            if value == prev:
                self.metadata_clear(metatype)
            else:
                try:
                    prev.remove(value)
                    self.metadata[str(metatype.pk)] = prev
                except ValueError:
                    pass
