# -*- coding: utf-8 -*-
from __future__ import unicode_literals

from django.db import models, migrations
import django.contrib.postgres.fields.hstore


class Migration(migrations.Migration):

    dependencies = [
        ('main', '0003_auto_20150707_1759'),
    ]

    operations = [
        migrations.RemoveField(
            model_name='assay',
            name='active',
        ),
        migrations.RemoveField(
            model_name='carbonsource',
            name='active',
        ),
        migrations.RemoveField(
            model_name='line',
            name='active',
        ),
        migrations.RemoveField(
            model_name='protocol',
            name='active',
        ),
        migrations.RemoveField(
            model_name='strain',
            name='active',
        ),
        migrations.RemoveField(
            model_name='study',
            name='active',
        ),
        migrations.AddField(
            model_name='eddobject',
            name='active',
            field=models.BooleanField(default=True),
        ),
        migrations.AlterField(
            model_name='eddobject',
            name='meta_store',
            field=django.contrib.postgres.fields.hstore.HStoreField(default=dict, blank=True),
        ),
        migrations.AlterField(
            model_name='line',
            name='carbon_source',
            field=models.ManyToManyField(to='main.CarbonSource', db_table=b'line_carbon_source', blank=True),
        ),
        migrations.AlterField(
            model_name='line',
            name='strains',
            field=models.ManyToManyField(to='main.Strain', db_table=b'line_strain', blank=True),
        ),
    ]
