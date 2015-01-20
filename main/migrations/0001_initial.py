# -*- coding: utf-8 -*-
from __future__ import unicode_literals

from django.db import models, migrations
from django.conf import settings
import django_extensions.db.fields


class Migration(migrations.Migration):

    dependencies = [
        ('auth', '0001_initial'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name='Assay',
            fields=[
                ('id', models.AutoField(verbose_name='ID', serialize=False, auto_created=True, primary_key=True)),
                ('assay_name', models.CharField(max_length=255)),
                ('description', models.TextField()),
                ('active', models.BooleanField(default=True)),
            ],
            options={
                'db_table': 'assay',
            },
            bases=(models.Model,),
        ),
        migrations.CreateModel(
            name='GroupPermission',
            fields=[
                ('id', models.AutoField(verbose_name='ID', serialize=False, auto_created=True, primary_key=True)),
                ('permission_type', models.CharField(default=b'N', max_length=8, choices=[(b'N', b'None'), (b'R', b'Read'), (b'W', b'Write')])),
                ('group', models.ForeignKey(related_name='+', to='auth.Group')),
            ],
            options={
                'db_table': 'study_group_permission',
            },
            bases=(models.Model,),
        ),
        migrations.CreateModel(
            name='Line',
            fields=[
                ('id', models.AutoField(verbose_name='ID', serialize=False, auto_created=True, primary_key=True)),
                ('line_name', models.CharField(max_length=255)),
                ('contact_extra', models.TextField()),
                ('active', models.BooleanField(default=True)),
                ('contact', models.ForeignKey(related_name='+', blank=True, to=settings.AUTH_USER_MODEL, null=True)),
            ],
            options={
                'db_table': 'line',
            },
            bases=(models.Model,),
        ),
        migrations.CreateModel(
            name='Measurement',
            fields=[
                ('id', models.AutoField(verbose_name='ID', serialize=False, auto_created=True, primary_key=True)),
                ('active', models.BooleanField(default=True)),
                ('assay', models.ForeignKey(to='main.Assay')),
            ],
            options={
                'db_table': 'measurement',
            },
            bases=(models.Model,),
        ),
        migrations.CreateModel(
            name='MeasurementDatum',
            fields=[
                ('id', models.AutoField(verbose_name='ID', serialize=False, auto_created=True, primary_key=True)),
                ('x', models.DecimalField(max_digits=16, decimal_places=5)),
                ('y', models.DecimalField(null=True, max_digits=16, decimal_places=5, blank=True)),
                ('measurement', models.ForeignKey(to='main.Measurement')),
            ],
            options={
                'db_table': 'measurement_datum',
            },
            bases=(models.Model,),
        ),
        migrations.CreateModel(
            name='MeasurementType',
            fields=[
                ('id', models.AutoField(verbose_name='ID', serialize=False, auto_created=True, primary_key=True)),
                ('type_name', models.CharField(max_length=255)),
                ('short_name', models.CharField(max_length=255, null=True, blank=True)),
                ('type_group', models.CharField(default=b'_', max_length=8, choices=[(b'_', b'Generic'), (b'm', b'Metabolite'), (b'g', b'Gene Identifier'), (b'p', b'Protein Identifer')])),
            ],
            options={
                'db_table': 'measurement_type',
            },
            bases=(models.Model,),
        ),
        migrations.CreateModel(
            name='GeneIdentifier',
            fields=[
                ('measurementtype_ptr', models.OneToOneField(parent_link=True, auto_created=True, primary_key=True, serialize=False, to='main.MeasurementType')),
                ('location_in_genome', models.TextField(null=True, blank=True)),
                ('positive_strand', models.BooleanField(default=True)),
                ('location_start', models.IntegerField(null=True, blank=True)),
                ('location_end', models.IntegerField(null=True, blank=True)),
                ('gene_length', models.IntegerField(null=True, blank=True)),
            ],
            options={
                'db_table': 'gene_identifier',
            },
            bases=('main.measurementtype',),
        ),
        migrations.CreateModel(
            name='MeasurementUnit',
            fields=[
                ('id', models.AutoField(verbose_name='ID', serialize=False, auto_created=True, primary_key=True)),
                ('unit_name', models.CharField(max_length=255)),
                ('display', models.BooleanField(default=True)),
                ('type_group', models.CharField(default=b'_', max_length=8, choices=[(b'_', b'Generic'), (b'm', b'Metabolite'), (b'g', b'Gene Identifier'), (b'p', b'Protein Identifer')])),
            ],
            options={
                'db_table': 'measurement_unit',
            },
            bases=(models.Model,),
        ),
        migrations.CreateModel(
            name='MeasurementVector',
            fields=[
                ('id', models.AutoField(verbose_name='ID', serialize=False, auto_created=True, primary_key=True)),
                ('x', models.DecimalField(max_digits=16, decimal_places=5)),
                ('y', models.TextField()),
                ('measurement', models.ForeignKey(to='main.Measurement')),
            ],
            options={
                'db_table': 'measurement_vector',
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
            name='Protocol',
            fields=[
                ('id', models.AutoField(verbose_name='ID', serialize=False, auto_created=True, primary_key=True)),
                ('protocol_name', models.CharField(max_length=255)),
                ('description', models.TextField()),
                ('active', models.BooleanField(default=True)),
            ],
            options={
                'db_table': 'protocol',
            },
            bases=(models.Model,),
        ),
        migrations.CreateModel(
            name='Strain',
            fields=[
                ('id', models.AutoField(verbose_name='ID', serialize=False, auto_created=True, primary_key=True)),
                ('strain_name', models.CharField(max_length=255)),
                ('registry_id', django_extensions.db.fields.PostgreSQLUUIDField(null=True, editable=False, blank=True)),
                ('registry_url', models.URLField(max_length=255, null=True, blank=True)),
            ],
            options={
                'db_table': 'strain',
            },
            bases=(models.Model,),
        ),
        migrations.CreateModel(
            name='Study',
            fields=[
                ('id', models.AutoField(verbose_name='ID', serialize=False, auto_created=True, primary_key=True)),
                ('study_name', models.CharField(max_length=255)),
                ('description', models.TextField()),
                ('active', models.BooleanField(default=True)),
                ('contact_extra', models.TextField()),
                ('contact', models.ForeignKey(related_name='contact_study_set', blank=True, to=settings.AUTH_USER_MODEL, null=True)),
            ],
            options={
                'db_table': 'study',
            },
            bases=(models.Model,),
        ),
        migrations.CreateModel(
            name='Update',
            fields=[
                ('id', models.AutoField(verbose_name='ID', serialize=False, auto_created=True, primary_key=True)),
                ('mod_time', models.DateTimeField(auto_now_add=True)),
                ('path', models.TextField(null=True, blank=True)),
                ('origin', models.TextField(null=True, blank=True)),
                ('mod_by', models.ForeignKey(editable=False, to=settings.AUTH_USER_MODEL)),
            ],
            options={
                'db_table': 'update_info',
            },
            bases=(models.Model,),
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
                'db_table': 'study_user_permission',
            },
            bases=(models.Model,),
        ),
        migrations.AddField(
            model_name='study',
            name='created',
            field=models.ForeignKey(related_name='created_study_set', to='main.Update'),
            preserve_default=True,
        ),
        migrations.AddField(
            model_name='study',
            name='updated',
            field=models.ForeignKey(related_name='+', to='main.Update'),
            preserve_default=True,
        ),
        migrations.AddField(
            model_name='strain',
            name='created',
            field=models.ForeignKey(related_name='+', to='main.Update'),
            preserve_default=True,
        ),
        migrations.AddField(
            model_name='strain',
            name='updated',
            field=models.ForeignKey(related_name='+', to='main.Update'),
            preserve_default=True,
        ),
        migrations.AddField(
            model_name='protocol',
            name='created',
            field=models.ForeignKey(related_name='+', to='main.Update'),
            preserve_default=True,
        ),
        migrations.AddField(
            model_name='protocol',
            name='owned_by',
            field=models.ForeignKey(related_name='edd_protocol_set', to=settings.AUTH_USER_MODEL),
            preserve_default=True,
        ),
        migrations.AddField(
            model_name='protocol',
            name='updated',
            field=models.ForeignKey(related_name='+', to='main.Update'),
            preserve_default=True,
        ),
        migrations.AddField(
            model_name='protocol',
            name='variant_of',
            field=models.ForeignKey(related_name='derived_set', blank=True, to='main.Protocol', null=True),
            preserve_default=True,
        ),
        migrations.AddField(
            model_name='measurementvector',
            name='updated',
            field=models.ForeignKey(related_name='+', to='main.Update'),
            preserve_default=True,
        ),
        migrations.AddField(
            model_name='measurementvector',
            name='x_units',
            field=models.ForeignKey(related_name='+', to='main.MeasurementUnit'),
            preserve_default=True,
        ),
        migrations.AddField(
            model_name='measurementvector',
            name='y_units',
            field=models.ForeignKey(related_name='+', to='main.MeasurementUnit'),
            preserve_default=True,
        ),
        migrations.AddField(
            model_name='measurementdatum',
            name='updated',
            field=models.ForeignKey(related_name='+', to='main.Update'),
            preserve_default=True,
        ),
        migrations.AddField(
            model_name='measurementdatum',
            name='x_units',
            field=models.ForeignKey(related_name='+', to='main.MeasurementUnit'),
            preserve_default=True,
        ),
        migrations.AddField(
            model_name='measurementdatum',
            name='y_units',
            field=models.ForeignKey(related_name='+', to='main.MeasurementUnit'),
            preserve_default=True,
        ),
        migrations.AddField(
            model_name='measurement',
            name='created',
            field=models.ForeignKey(related_name='+', to='main.Update'),
            preserve_default=True,
        ),
        migrations.AddField(
            model_name='measurement',
            name='experimenter',
            field=models.ForeignKey(related_name='+', blank=True, to=settings.AUTH_USER_MODEL, null=True),
            preserve_default=True,
        ),
        migrations.AddField(
            model_name='measurement',
            name='measurement_type',
            field=models.ForeignKey(to='main.MeasurementType'),
            preserve_default=True,
        ),
        migrations.AddField(
            model_name='measurement',
            name='updated',
            field=models.ForeignKey(related_name='+', to='main.Update'),
            preserve_default=True,
        ),
        migrations.AddField(
            model_name='line',
            name='created',
            field=models.ForeignKey(related_name='+', to='main.Update'),
            preserve_default=True,
        ),
        migrations.AddField(
            model_name='line',
            name='experimenter',
            field=models.ForeignKey(related_name='+', blank=True, to=settings.AUTH_USER_MODEL, null=True),
            preserve_default=True,
        ),
        migrations.AddField(
            model_name='line',
            name='study',
            field=models.ForeignKey(to='main.Study'),
            preserve_default=True,
        ),
        migrations.AddField(
            model_name='line',
            name='updated',
            field=models.ForeignKey(related_name='+', to='main.Update'),
            preserve_default=True,
        ),
        migrations.AddField(
            model_name='grouppermission',
            name='study',
            field=models.ForeignKey(to='main.Study'),
            preserve_default=True,
        ),
        migrations.AddField(
            model_name='assay',
            name='created',
            field=models.ForeignKey(related_name='+', to='main.Update'),
            preserve_default=True,
        ),
        migrations.AddField(
            model_name='assay',
            name='experimenter',
            field=models.ForeignKey(related_name='+', blank=True, to=settings.AUTH_USER_MODEL, null=True),
            preserve_default=True,
        ),
        migrations.AddField(
            model_name='assay',
            name='line',
            field=models.ForeignKey(to='main.Line'),
            preserve_default=True,
        ),
        migrations.AddField(
            model_name='assay',
            name='protocol',
            field=models.ForeignKey(to='main.Protocol'),
            preserve_default=True,
        ),
        migrations.AddField(
            model_name='assay',
            name='updated',
            field=models.ForeignKey(related_name='+', to='main.Update'),
            preserve_default=True,
        ),
    ]
