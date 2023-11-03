from django.db import models
from django.utils.translation import gettext_lazy as _

from edd.fields import VarCharField
from main import models as edd_models


class DefaultUnit(models.Model):
    class Meta:
        db_table = "default_unit"

    measurement_type = models.ForeignKey(
        edd_models.MeasurementType,
        on_delete=models.deletion.CASCADE,
        verbose_name=_("Measurement Type"),
    )
    unit = models.ForeignKey(
        edd_models.MeasurementUnit,
        on_delete=models.deletion.CASCADE,
    )
    protocol = models.ForeignKey(
        edd_models.Protocol,
        blank=True,
        null=True,
        on_delete=models.deletion.CASCADE,
    )
    # this should be named "layout_key", but renaming is more trouble than it's worth
    parser = VarCharField(blank=True, null=True)


class MeasurementNameTransform(models.Model):
    class Meta:
        db_table = "measurement_name_transform"

    input_type_name = VarCharField(
        help_text=_("Name of this Measurement Type in input."),
        verbose_name=_("Input Measurement Type"),
    )

    edd_type_name = models.ForeignKey(
        edd_models.MeasurementType,
        on_delete=models.deletion.CASCADE,
        verbose_name=_("EDD Type Name"),
    )
    # this should be named "layout_key", but renaming is more trouble than it's worth
    parser = VarCharField(blank=True, null=True)
