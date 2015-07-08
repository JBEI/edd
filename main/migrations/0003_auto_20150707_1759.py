# -*- coding: utf-8 -*-
from __future__ import unicode_literals

from django.db import models, migrations


class Migration(migrations.Migration):

    dependencies = [
        ('main', '0002_measurementvalue'),
    ]

    operations = [
        migrations.RemoveField(
            model_name='measurementdatum',
            name='measurement',
        ),
        migrations.RemoveField(
            model_name='measurementdatum',
            name='updated',
        ),
        migrations.RemoveField(
            model_name='measurementvector',
            name='measurement',
        ),
        migrations.RemoveField(
            model_name='measurementvector',
            name='updated',
        ),
        migrations.DeleteModel(
            name='MeasurementDatum',
        ),
        migrations.DeleteModel(
            name='MeasurementVector',
        ),
    ]
