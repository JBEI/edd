# coding: utf-8
"""
Models defining worklist templates.
"""

import arrow

from django.db import models
from django.utils.encoding import python_2_unicode_compatible
from django.utils.translation import ugettext_lazy as _

from .core import Assay, EDDObject, Line, Protocol, Study
from .metadata import MetadataType
from main.export import table  # TODO remove


@python_2_unicode_compatible
class WorklistTemplate(EDDObject):
    """ Defines sets of metadata to use as a template on a Protocol. """
    class Meta:
        db_table = 'worklist_template'
    protocol = models.ForeignKey(
        Protocol,
        help_text=_('Default protocol for this Template.'),
        on_delete=models.PROTECT,
        verbose_name=_('Protocol'),
    )

    def __str__(self):
        return self.name


@python_2_unicode_compatible
class WorklistColumn(models.Model):
    """ Defines metadata defaults and layout. """
    class Meta:
        db_table = 'worklist_column'
    template = models.ForeignKey(
        WorklistTemplate,
        help_text=_('Parent Worklist Template for this column.'),
        on_delete=models.CASCADE,
        verbose_name=_('Template'),
    )
    # if meta_type is None, treat default_value as format string
    meta_type = models.ForeignKey(
        MetadataType,
        blank=True,
        help_text=_('Type of Metadata in this column.'),
        null=True,
        on_delete=models.PROTECT,
        verbose_name=_('Metadata Type'),
    )
    # if None, default to meta_type.type_name or ''
    heading = models.CharField(
        max_length=255,
        blank=True,
        help_text=_('Column header text.'),
        null=True,
        verbose_name=_('Heading'),
    )
    # potentially override the default value in templates?
    default_value = models.CharField(
        max_length=255,
        blank=True,
        help_text=_('Default value for this column.'),
        null=True,
        verbose_name=_('Default Value'),
    )
    # text to display in UI explaining how to modify column
    help_text = models.TextField(
        blank=True,
        help_text=_('UI text to display explaining how to modify this column.'),
        null=True,
        verbose_name=_('Help Text'),
    )
    # allow ordering of metadata
    ordering = models.IntegerField(
        blank=True,
        help_text=_('Order this column will appear in worklist export.'),
        null=True,
        unique=True,
        verbose_name=_('Ordering'),
    )

    def get_column(self, **kwargs):
        type_context = None

        def lookup_format(instance, **kwargs):
            return self.get_default() % self.get_format_dict(instance, **kwargs)

        def lookup_meta(instance, **kwargs):
            default = self.get_default() % kwargs
            if instance:
                return instance.metadata_get(self.meta_type, default=default)
            return default

        if self.meta_type:
            type_context = self.meta_type.for_context
            lookup = lookup_meta
        else:
            type_context = None
            lookup = lookup_format
        model = {
            MetadataType.STUDY: Study,
            MetadataType.LINE: Line,
            MetadataType.ASSAY: Assay,
        }.get(type_context, None)
        return table.ColumnChoice(
            model, 'worklist_column_%s' % self.pk, str(self), lookup,
        )

    def get_default(self):
        if self.default_value:
            return self.default_value
        elif self.meta_type:
            return self.meta_type.default_value
        return ''

    def get_format_dict(self, instance, *args, **kwargs):
        """
        Build dict used in format string for columns that use it. This implementation re-uses
        EDDObject.to_json(), in a flattened format.
        """
        # Must import inside method to avoid circular import
        from main.utilities import flatten_json
        fmt_dict = flatten_json(instance.to_json(depth=1) if instance else {})
        # add in: date
        # TODO: pass in tz based on user profile?
        fmt_dict.update(today=arrow.now().format('YYYYMMDD'))
        fmt_dict.update(**kwargs)
        return fmt_dict

    def __str__(self):
        if self.heading:
            return self.heading
        return str(self.meta_type)
