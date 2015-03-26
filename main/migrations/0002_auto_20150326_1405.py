# -*- coding: utf-8 -*-
from __future__ import unicode_literals

from django.db import models, migrations


class Migration(migrations.Migration):

    dependencies = [
        ('main', '0001_initial'),
    ]

    operations = [
        migrations.CreateModel(
            name='MetaboliteExchange',
            fields=[
                ('id', models.AutoField(verbose_name='ID', serialize=False, auto_created=True, primary_key=True)),
                ('reactant_name', models.CharField(max_length=255)),
                ('exchange_name', models.CharField(max_length=255)),
                ('measurement_type', models.ForeignKey(to='main.MeasurementType')),
                ('metabolic_map', models.ForeignKey(to='main.MetabolicMap')),
            ],
            options={
                'db_table': 'measurement_type_to_exchange',
            },
            bases=(models.Model,),
        ),
        migrations.CreateModel(
            name='MetaboliteSpecies',
            fields=[
                ('id', models.AutoField(verbose_name='ID', serialize=False, auto_created=True, primary_key=True)),
                ('species', models.TextField()),
                ('measurement_type', models.ForeignKey(to='main.MeasurementType')),
                ('metabolic_map', models.ForeignKey(to='main.MetabolicMap')),
            ],
            options={
                'db_table': 'measurement_type_to_species',
            },
            bases=(models.Model,),
        ),
        migrations.AlterUniqueTogether(
            name='metabolitespecies',
            unique_together=set([('metabolic_map', 'measurement_type')]),
        ),
        migrations.AlterUniqueTogether(
            name='metaboliteexchange',
            unique_together=set([('metabolic_map', 'measurement_type')]),
        ),
    ]
