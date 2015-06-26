# -*- coding: utf-8 -*-
from __future__ import unicode_literals

from django.db import models, migrations
import django.contrib.postgres.fields


class Migration(migrations.Migration):

    dependencies = [
        ('main', '0001_initial'),
    ]

    operations = [
        migrations.CreateModel(
            name='MeasurementValue',
            fields=[
                ('id', models.AutoField(verbose_name='ID', serialize=False, auto_created=True, primary_key=True)),
                ('x', django.contrib.postgres.fields.ArrayField(base_field=models.DecimalField(max_digits=16, decimal_places=5), size=None)),
                ('y', django.contrib.postgres.fields.ArrayField(base_field=models.DecimalField(max_digits=16, decimal_places=5), size=None)),
                ('measurement', models.ForeignKey(to='main.Measurement')),
                ('updated', models.ForeignKey(related_name='+', to='main.Update')),
            ],
            options={
                'db_table': 'measurement_value',
            },
        ),
    ]
