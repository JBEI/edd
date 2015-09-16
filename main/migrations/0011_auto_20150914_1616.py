# -*- coding: utf-8 -*-
from __future__ import unicode_literals

from django.db import models, migrations


class Migration(migrations.Migration):

    dependencies = [
        ('main', '0010_auto_20150914_1555'),
    ]

    operations = [
        migrations.AlterField(
            model_name='phosphor',
            name='emission_wavelength',
            field=models.DecimalField(null=True, max_digits=16, decimal_places=5, blank=True),
        ),
        migrations.AlterField(
            model_name='phosphor',
            name='excitation_wavelength',
            field=models.DecimalField(null=True, max_digits=16, decimal_places=5, blank=True),
        ),
    ]
