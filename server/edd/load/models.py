import importlib

from django.db import models
from django.utils.translation import gettext_lazy as _

from edd.fields import VarCharField
from main import models as edd_models

from . import exceptions, reporting


class Layout(models.Model):
    """
    Represents an input file layout for EDD imports.

    Having a DB model for this data allows different EDD deployments to add in
    custom parsers and configure them via the admin app.
    """

    name = VarCharField(
        help_text=_("Name of this file layout."), verbose_name=_("Name")
    )
    description = models.TextField(
        blank=True,
        help_text=_("Description of this object."),
        null=True,
        verbose_name=_("Description"),
    )

    def __str__(self):
        return self.name


class ParserMapping(models.Model):
    """
    Maps incoming layout and MIME to the appropriate Parser class.

    Represents a mime type-specific parser for a given file layout, e.g. a
    different parser for each of Excel, CSV for a single file layout.
    """

    class Meta:
        verbose_name_plural = "Parsers"
        unique_together = ("layout", "mime_type")

    layout = models.ForeignKey(Layout, on_delete=models.CASCADE, related_name="parsers")
    mime_type = VarCharField(help_text=_("Mime type"), verbose_name=_("Mime type"))
    parser_class = VarCharField(help_text=_("Parser class"), verbose_name=_("Parser"))

    def create_parser(self, uuid):
        try:
            # split fully-qualified class name into module and class names
            module_name, class_name = self.parser_class.rsplit(sep=".", maxsplit=1)
            # instantiate the parser.
            module = importlib.import_module(module_name)
            parser_class = getattr(module, class_name)
            return parser_class(uuid)
        except Exception as e:
            reporting.raise_errors(
                uuid,
                exceptions.BadParserError(
                    details=_(
                        "Unable to instantiate parser class {parser_class}. "
                        "The problem was {problem}"
                    ).format(parser_class=self.parser_class, problem=str(e))
                ),
            )

    def __str__(self):
        return f"{self.mime_type}::{self.parser_class}"


class Category(models.Model):
    """
    Groupings of types of data to load into EDD.

    Splitting the various file layouts and protocols into higher level
    groupings allows better navigation for users to select the specific loading
    process they need.
    """

    class Meta:
        ordering = ("sort_key",)
        verbose_name_plural = "Categories"

    layouts = models.ManyToManyField(
        Layout,
        through="CategoryLayout",
        help_text=_("Supported input layouts for this load category."),
        verbose_name=_("File layouts"),
        related_name="load_category",
    )
    protocols = models.ManyToManyField(
        edd_models.Protocol,
        help_text=_("Protocols that appear in this load category."),
        verbose_name=_("Protocols"),
        related_name="load_category",
    )
    name = VarCharField(
        help_text=_("Name of this loading category."), verbose_name=_("Name")
    )
    type_group = VarCharField(
        blank=True,
        choices=edd_models.MeasurementType.Group.GROUP_CHOICE,
        default=None,
        help_text=_("Constrains measurement types searched during data loading."),
        null=True,
        verbose_name=_("Measurement type group"),
    )
    sort_key = models.PositiveIntegerField(
        null=False,
        unique=True,
        help_text=_("Relative order this category is displayed during load."),
        verbose_name=_("Display order"),
    )

    def __str__(self):
        return self.name


class CategoryLayout(models.Model):
    """
    Represents the relation between Cateories and Layouts.

    Information here allows administrators to specify the order in which
    Layouts are displayed in the interface.
    """

    class Meta:
        ordering = ("layout", "category", "sort_key")
        unique_together = ("layout", "category", "sort_key")
        verbose_name_plural = "Category Layouts"

    layout = models.ForeignKey(
        Layout,
        help_text=_("The layout for loaded data."),
        on_delete=models.CASCADE,
        verbose_name=_("Layout"),
        null=False,
    )
    category = models.ForeignKey(
        Category,
        help_text=_("The category for loaded data."),
        on_delete=models.CASCADE,
        verbose_name=_("Category"),
        null=False,
    )
    sort_key = models.PositiveIntegerField(
        null=False,
        help_text=_(
            "Relative order this layout option is displayed under this category."
        ),
        verbose_name=_("Display order"),
    )


class DefaultUnit(models.Model):
    class Meta:
        db_table = "default_unit"

    measurement_type = models.ForeignKey(
        edd_models.MeasurementType, on_delete=models.deletion.CASCADE
    )
    unit = models.ForeignKey(
        edd_models.MeasurementUnit, on_delete=models.deletion.CASCADE
    )
    protocol = models.ForeignKey(
        edd_models.Protocol, blank=True, null=True, on_delete=models.deletion.CASCADE
    )
    parser = VarCharField(blank=True, null=True)

    def to_json(self):
        return {
            "id": self.pk,
            "type_name": self.measurement_type.type_name,
            "unit_name": self.unit.unit_name,
        }


class MeasurementNameTransform(models.Model):
    class Meta:
        db_table = "measurement_name_transform"

    input_type_name = VarCharField(
        help_text=_("Name of this Measurement Type in input."),
        verbose_name=_("Input Measurement Type"),
    )

    edd_type_name = VarCharField(
        help_text=_("Name of this Measurement Type in EDD."),
        verbose_name=_("EDD Measurement Type"),
    )
    parser = VarCharField(blank=True, null=True)

    def to_json(self):
        return {
            "id": self.pk,
            "input_type_name": self.input_type_name,
            "edd_type_name": self.edd_type_name,
            "parser": self.parser,
        }
