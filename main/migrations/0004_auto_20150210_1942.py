# -*- coding: utf-8 -*-
from __future__ import unicode_literals

from django.db import models, migrations


class Migration(migrations.Migration):

    dependencies = [
        ('main', '0003_line_protocols'),
    ]

    operations = [
        migrations.AddField(
            model_name='assay',
            name='measurement_types',
            field=models.ManyToManyField(to='main.MeasurementType', through='main.Measurement'),
            preserve_default=True,
        ),
        migrations.AddField(
            model_name='line',
            name='strains',
            field=models.ManyToManyField(to='main.Strain', through='main.LineStrain'),
            preserve_default=True,
        ),
    ]
