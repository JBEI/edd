# -*- coding: utf-8 -*-
from __future__ import unicode_literals

from django.db import models, migrations


class Migration(migrations.Migration):

    dependencies = [
        ('main', '0002_measurement_compartment'),
    ]

    operations = [
        migrations.CreateModel(
            name='MetabolicMap',
            fields=[
                ('id', models.AutoField(verbose_name='ID', serialize=False, auto_created=True, primary_key=True)),
                ('biomass_calculation', models.DecimalField(default=-1, max_digits=16, decimal_places=5)),
                ('biomass_calculation_info', models.TextField()),
                ('biomass_exchange_name', models.TextField()),
                ('attachment', models.ForeignKey(to='main.Attachment')),
            ],
            options={
                'db_table': 'metabolic_map',
            },
            bases=(models.Model,),
        ),
    ]
