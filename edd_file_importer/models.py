# coding: utf-8

import os

import django.contrib.postgres.fields as postgres_fields
from django.db import models
from django.utils.translation import ugettext_lazy as _

from main import models as edd_models


class BaseImportModel(models.Model):
    """
    A first-class file importer object, with name, description, active status and update trail
    similar to EDDObject.  Note that metadata is dropped relative to EDDObject.
    """

    name = models.CharField(
        help_text=_('Name of this object.'),
        max_length=255,
        verbose_name=_('Name'),
    )

    description = models.TextField(
        blank=True,
        help_text=_('Description of this object.'),
        null=True,
        verbose_name=_('Description'),
    )

    active = models.BooleanField(
        default=True,
        help_text=_('Flag showing if this object is active and displayed.'),
        verbose_name=_('Active'),
    )

    updates = models.ManyToManyField(
        edd_models.Update,
        help_text=_('List of Update objects logging changes to this object.'),
        related_name='+',
        verbose_name=_('Updates'),
    )

    # these are used often enough we should save extra queries by including as fields
    created = models.ForeignKey(
        edd_models.Update,
        editable=False,
        help_text=_('Update used to create this object.'),
        on_delete=models.PROTECT,
        related_name='import_object_created',
        verbose_name=_('Created'),
    )

    updated = models.ForeignKey(
        edd_models.Update,
        editable=False,
        help_text=_('Update used to last modify this object.'),
        on_delete=models.PROTECT,
        related_name='import_object_updated',
        verbose_name=_('Last Modified'),
    )

    # linking together EDD instances will be easier later if we define UUIDs now
    uuid = models.UUIDField(
        editable=False,
        help_text=_('Unique identifier for this object.'),
        unique=True,
        verbose_name=_('UUID'),
    )

    @property
    def last_modified(self):
        return self.updated.format_timestamp()

    def was_modified(self):
        return self.updates.count() > 1

    @property
    def date_created(self):
        return self.created.format_timestamp()

    def __str__(self):
        return self.name


class ImportFormat(BaseImportModel):
    """
    Represents an input file format for EDD imports.  Having a DB model for this data allows
    different EDD deployments to add in custom parser formats and configure them via the admin app.
    """

    parser_class = models.CharField(
        help_text=_('Parser class'),
        max_length=255,
        verbose_name=_('Parser'),
    )

    object_ref = models.OneToOneField(
        BaseImportModel,
        on_delete=models.CASCADE,
        parent_link=True,
        related_name='+',
    )


class ImportCategory(BaseImportModel):
    class Meta:
        verbose_name_plural = 'Import categories'

    display_order = models.PositiveIntegerField(
        null=False,
        unique=True,
        help_text=_('Relative order this category is displayed in during import'),
        verbose_name=_('Display order'))

    protocols = models.ManyToManyField(
        edd_models.Protocol,
        help_text=_('Protocols that appear in this import category'),
        verbose_name=_('Protocols'),
        related_name='import_category',
    )

    default_mtype_group = models.CharField(
        default=edd_models.MeasurementType.Group.GENERIC,
        blank=False,
        help_text=_('The default class of measurement types implied by selection of this '
                    'category during import'),
        max_length=15,
        null=False,
        verbose_name=_('Default type group'),
    )

    file_formats = models.ManyToManyField(
        ImportFormat,
        through='CategoryFormat',
        help_text=_('Supported input formats for this import category'),
        verbose_name=_('File formats'),
        related_name='import_category')

    object_ref = models.OneToOneField(
        BaseImportModel,
        on_delete=models.CASCADE,
        parent_link=True,
        related_name='+',
    )


class CategoryFormat(models.Model):
    """
    Represents the relation between ImportCateories and ImportFormats, allowing users to specify
    the order in which formats are displayed.
    """
    class Meta:
        verbose_name_plural = 'Import Category Formats'
        unique_together = ('format', 'category', 'display_order')

    format = models.ForeignKey(
        ImportFormat,
        help_text=_('The format for imported data'),
        on_delete=models.CASCADE,
        verbose_name=_('Format'),
        null=False,
    )

    category = models.ForeignKey(
        ImportCategory,
        help_text=_('The category of imported data'),
        on_delete=models.CASCADE,
        verbose_name=_('Category'),
        null=False,
    )

    display_order = models.PositiveIntegerField(
        null=False,
        help_text=_('Relative order this format option is displayed in under this category'),
        verbose_name=_('Display order'))


class Import(BaseImportModel):
    """
    Represents user entries for a single data import into an EDD study
    """

    class Status:
        # implies there's an uploaded file, which may not be processed yet
        CREATED = 'Created'

        # file is parsed & content verified, but some required context is missing
        RESOLVED = 'Resolved'

        # file is parsed, content verified, and all required context is provided
        READY = 'Ready'

        # import is submitted, but processing may not yet have begun
        SUBMITTED = 'Submitted'

        # import is being processed
        PROCESSING = 'Processing'

        COMPLETED = 'Completed'

        # import is aborted at user request
        ABORTED = 'Aborted'

        FAILED = 'Failed'

    class Metadata:
        # custom file format for the import, if specified: JSON with row/col identifiers
        CUSTOM_FORMAT = 'format'

        # non-data rows, columns, and cells dropped during the import (e.g. user notes)
        DROPPED = 'dropped'

        # data rows, columns, and cells marked inactive during the import (e.g. outliers)
        DEACTIVATED = 'deactivated'

    meta_store = postgres_fields.JSONField(encoder=None,
                                           blank=True,
                                           help_text=_('Metadata dictionary.'),
                                           default=dict,
                                           verbose_name=_('Metadata'))

    study = models.ForeignKey(
        edd_models.Study,
        help_text=_('The Study containing this Import'),
        on_delete=models.CASCADE,
        verbose_name=_('Study'),
        null=False,
    )

    status = models.CharField(
        max_length=10,
        default=Status.CREATED,
        null=False,
    )

    category = models.ForeignKey(
        ImportCategory,
        help_text=_('The user-selected data category for this import'),
        on_delete=models.PROTECT,
        verbose_name=_('Category'),
        related_name='+',
        null=False,
    )

    file = models.ForeignKey(
        'ImportFile',
        on_delete=models.CASCADE,
        related_name='import_ref',
    )

    file_format = models.ForeignKey(
        ImportFormat,
        help_text=_('The user-selected file format for this import'),
        on_delete=models.PROTECT,
        verbose_name=_('Format'),
        related_name='imports',
        null=True,  # null ok for single-use + user-defined formats
    )

    protocol = models.ForeignKey(
        edd_models.Protocol,
        help_text=_('The protocol for imported data'),
        on_delete=models.PROTECT,
        verbose_name=_('Protocol'),
        null=False,
    )

    x_units = models.ForeignKey(
        edd_models.MeasurementUnit,
        on_delete=models.PROTECT,
        null=True,
        related_name='+',
    )

    y_units = models.ForeignKey(
        edd_models.MeasurementUnit,
        on_delete=models.PROTECT,
        null=True,
        related_name='+',
    )

    compartment = models.CharField(
        choices=edd_models.Measurement.Compartment.CHOICE,
        default=edd_models.Measurement.Compartment.UNKNOWN,
        help_text=_('Compartment of the cell for this Measurement.'),
        max_length=1,
        verbose_name=_('Compartment'),
    )

    object_ref = models.OneToOneField(
        BaseImportModel,
        on_delete=models.CASCADE,
        parent_link=True,
        related_name='+',
    )


class ImportFile(models.Model):
    """
    File uploaded for an import.  Near duplicate of EDD's Attachment, but with an
    Import reference instead of an EDDObject reference.
    """

    file = models.FileField(
        help_text=_('Path to file data.'),
        max_length=255,
        upload_to='%Y/%m/%d',
        verbose_name=_('File Path'),
    )
    filename = models.CharField(
        help_text=_('Name of the file.'),
        max_length=255,
        verbose_name=_('File Name'),
        editable=False
    )
    created = models.ForeignKey(
        edd_models.Update,
        help_text=_('Update used to create the file.'),
        on_delete=models.PROTECT,
        verbose_name=_('Created'),
        editable=False,
    )
    description = models.TextField(
        blank=True,
        help_text=_('Description of file contents.'),
        null=False,
        verbose_name=_('Description'),
    )
    mime_type = models.CharField(
        blank=True,
        help_text=_('MIME ContentType of the file.'),
        max_length=255,
        null=True,
        verbose_name=_('MIME'),
    )
    file_size = models.IntegerField(
        default=0,
        help_text=_('Total byte size of the file.'),
        verbose_name=_('Size'),
        editable=False
    )

    extensions_to_icons = edd_models.Attachment.extensions_to_icons

    def __str__(self):
        return self.filename

    @property
    def user_initials(self):
        return self.created.initials

    @property
    def icon(self):
        base, ext = os.path.splitext(self.filename)
        return self.extensions_to_icons[ext]
