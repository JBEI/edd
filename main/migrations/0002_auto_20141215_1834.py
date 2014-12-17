# -*- coding: utf-8 -*-
from __future__ import unicode_literals

from django.db import models, migrations
from django.conf import settings


class Migration(migrations.Migration):

    dependencies = [
        ('auth', '0001_initial'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ('main', '0001_initial'),
    ]

    operations = [
        migrations.CreateModel(
            name='GeneIdentifier',
            fields=[
                ('measurementtype_ptr', models.OneToOneField(parent_link=True, auto_created=True, primary_key=True, serialize=False, to='main.MeasurementType')),
                ('location_in_genome', models.TextField()),
                ('positive_strand', models.BooleanField(default=True)),
                ('location_start', models.IntegerField()),
                ('location_end', models.IntegerField()),
                ('gene_length', models.IntegerField()),
            ],
            options={
                'db_table': 'gene_identifier',
            },
            bases=('main.measurementtype',),
        ),
        migrations.CreateModel(
            name='GroupPermission',
            fields=[
                ('id', models.AutoField(verbose_name='ID', serialize=False, auto_created=True, primary_key=True)),
                ('permission_type', models.CharField(default=b'N', max_length=8, choices=[(b'N', b'None'), (b'R', b'Read'), (b'W', b'Write')])),
                ('group', models.ForeignKey(related_name='+', to='auth.Group')),
                ('study', models.ForeignKey(to='main.Study')),
            ],
            options={
                'abstract': False,
            },
            bases=(models.Model,),
        ),
        migrations.CreateModel(
            name='Metabolite',
            fields=[
                ('measurementtype_ptr', models.OneToOneField(parent_link=True, auto_created=True, primary_key=True, serialize=False, to='main.MeasurementType')),
                ('charge', models.IntegerField()),
                ('carbon_count', models.IntegerField()),
                ('molar_mass', models.DecimalField(max_digits=16, decimal_places=5)),
                ('molecular_formula', models.TextField()),
            ],
            options={
                'db_table': 'metabolite',
            },
            bases=('main.measurementtype',),
        ),
        migrations.CreateModel(
            name='UserPermission',
            fields=[
                ('id', models.AutoField(verbose_name='ID', serialize=False, auto_created=True, primary_key=True)),
                ('permission_type', models.CharField(default=b'N', max_length=8, choices=[(b'N', b'None'), (b'R', b'Read'), (b'W', b'Write')])),
                ('study', models.ForeignKey(to='main.Study')),
                ('user', models.ForeignKey(related_name='+', to=settings.AUTH_USER_MODEL)),
            ],
            options={
                'abstract': False,
            },
            bases=(models.Model,),
        ),
        migrations.AlterField(
            model_name='measurementtype',
            name='type_group',
            field=models.CharField(default=b'_', max_length=8, choices=[(b'_', b'Generic'), (b'm', b'Metabolite'), (b'g', b'Gene Identifier')]),
            preserve_default=True,
        ),
    ]
