# -*- coding: utf-8 -*-
from __future__ import unicode_literals

from django.db import models, migrations
import django_hstore.fields
from django.conf import settings
import django_extensions.db.fields


class Migration(migrations.Migration):

    dependencies = [
        ('auth', '0001_initial'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name='Attachment',
            fields=[
                ('id', models.AutoField(verbose_name='ID', serialize=False, auto_created=True, primary_key=True)),
                ('file', models.FileField(max_length=255, upload_to=b'')),
                ('filename', models.CharField(max_length=255)),
                ('description', models.TextField(blank=True)),
                ('mime_type', models.CharField(max_length=255, null=True)),
                ('file_size', models.IntegerField(default=0)),
            ],
            options={
                'db_table': 'attachment',
            },
            bases=(models.Model,),
        ),
        migrations.CreateModel(
            name='Comment',
            fields=[
                ('id', models.AutoField(verbose_name='ID', serialize=False, auto_created=True, primary_key=True)),
                ('body', models.TextField()),
            ],
            options={
                'db_table': 'comment',
            },
            bases=(models.Model,),
        ),
        migrations.CreateModel(
            name='EDDObject',
            fields=[
                ('id', models.AutoField(verbose_name='ID', serialize=False, auto_created=True, primary_key=True)),
                ('name', models.CharField(max_length=255)),
                ('description', models.TextField(null=True, blank=True)),
                ('meta_store', django_hstore.fields.DictionaryField(default=dict, blank=True)),
            ],
            options={
                'db_table': 'edd_object',
            },
            bases=(models.Model,),
        ),
        migrations.CreateModel(
            name='CarbonSource',
            fields=[
                ('object_ref', models.OneToOneField(parent_link=True, primary_key=True, serialize=False, to='main.EDDObject')),
                ('labeling', models.TextField()),
                ('volume', models.DecimalField(max_digits=16, decimal_places=5)),
                ('active', models.BooleanField(default=True)),
            ],
            options={
                'db_table': 'carbon_source',
            },
            bases=('main.eddobject',),
        ),
        migrations.CreateModel(
            name='Assay',
            fields=[
                ('object_ref', models.OneToOneField(parent_link=True, primary_key=True, serialize=False, to='main.EDDObject')),
                ('active', models.BooleanField(default=True)),
                ('experimenter', models.ForeignKey(related_name='+', blank=True, to=settings.AUTH_USER_MODEL, null=True)),
            ],
            options={
                'db_table': 'assay',
            },
            bases=('main.eddobject',),
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
                ('control', models.BooleanField(default=False)),
                ('object_ref', models.OneToOneField(parent_link=True, primary_key=True, serialize=False, to='main.EDDObject')),
                ('contact_extra', models.TextField()),
                ('active', models.BooleanField(default=True)),
                ('carbon_source', models.ManyToManyField(to='main.CarbonSource', db_table=b'line_carbon_source')),
                ('contact', models.ForeignKey(related_name='+', blank=True, to=settings.AUTH_USER_MODEL, null=True)),
                ('experimenter', models.ForeignKey(related_name='+', blank=True, to=settings.AUTH_USER_MODEL, null=True)),
            ],
            options={
                'db_table': 'line',
            },
            bases=('main.eddobject',),
        ),
        migrations.CreateModel(
            name='Measurement',
            fields=[
                ('id', models.AutoField(verbose_name='ID', serialize=False, auto_created=True, primary_key=True)),
                ('active', models.BooleanField(default=True)),
                ('compartment', models.CharField(default=0, max_length=1, choices=[(b'0', b''), (b'1', b'Intracellular/Cytosol (Cy)'), (b'2', b'Extracellular')])),
                ('measurement_format', models.IntegerField(default=0)),
                ('assay', models.ForeignKey(to='main.Assay')),
                ('experimenter', models.ForeignKey(related_name='+', blank=True, to=settings.AUTH_USER_MODEL, null=True)),
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
            name='MetabolicMap',
            fields=[
                ('object_ref', models.OneToOneField(parent_link=True, primary_key=True, serialize=False, to='main.EDDObject')),
                ('biomass_calculation', models.DecimalField(default=-1, max_digits=16, decimal_places=5)),
                ('biomass_calculation_info', models.TextField(default=b'')),
                ('biomass_exchange_name', models.TextField()),
            ],
            options={
                'db_table': 'metabolic_map',
            },
            bases=('main.eddobject',),
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
            name='MetadataGroup',
            fields=[
                ('id', models.AutoField(verbose_name='ID', serialize=False, auto_created=True, primary_key=True)),
                ('group_name', models.CharField(max_length=255)),
            ],
            options={
                'db_table': 'metadata_group',
            },
            bases=(models.Model,),
        ),
        migrations.CreateModel(
            name='MetadataType',
            fields=[
                ('id', models.AutoField(verbose_name='ID', serialize=False, auto_created=True, primary_key=True)),
                ('type_name', models.CharField(max_length=255)),
                ('type_i18n', models.CharField(max_length=255, null=True, blank=True)),
                ('input_size', models.IntegerField(default=6)),
                ('default_value', models.CharField(max_length=255, blank=True)),
                ('prefix', models.CharField(max_length=255, blank=True)),
                ('postfix', models.CharField(max_length=255, blank=True)),
                ('for_context', models.CharField(max_length=8, choices=[(b'S', b'Study'), (b'L', b'Line'), (b'P', b'Protocol'), (b'LP', b'Line or Protocol'), (b'LPS', b'All')])),
                ('type_class', models.CharField(max_length=255, null=True, blank=True)),
                ('group', models.ForeignKey(to='main.MetadataGroup')),
            ],
            options={
                'db_table': 'metadata_type',
            },
            bases=(models.Model,),
        ),
        migrations.CreateModel(
            name='Protocol',
            fields=[
                ('object_ref', models.OneToOneField(parent_link=True, primary_key=True, serialize=False, to='main.EDDObject')),
                ('active', models.BooleanField(default=True)),
                ('owned_by', models.ForeignKey(related_name='edd_protocol_set', to=settings.AUTH_USER_MODEL)),
                ('variant_of', models.ForeignKey(related_name='derived_set', blank=True, to='main.Protocol', null=True)),
            ],
            options={
                'db_table': 'protocol',
            },
            bases=('main.eddobject',),
        ),
        migrations.CreateModel(
            name='Strain',
            fields=[
                ('registry_id', django_extensions.db.fields.PostgreSQLUUIDField(null=True, editable=False, blank=True)),
                ('registry_url', models.URLField(max_length=255, null=True, blank=True)),
                ('object_ref', models.OneToOneField(parent_link=True, primary_key=True, serialize=False, to='main.EDDObject')),
            ],
            options={
                'db_table': 'strain',
            },
            bases=('main.eddobject',),
        ),
        migrations.CreateModel(
            name='Study',
            fields=[
                ('active', models.BooleanField(default=True)),
                ('object_ref', models.OneToOneField(parent_link=True, primary_key=True, serialize=False, to='main.EDDObject')),
                ('contact_extra', models.TextField()),
                ('contact', models.ForeignKey(related_name='contact_study_set', blank=True, to=settings.AUTH_USER_MODEL, null=True)),
            ],
            options={
                'db_table': 'study',
                'verbose_name_plural': 'Studies',
            },
            bases=('main.eddobject',),
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
            name='measurement_type',
            field=models.ForeignKey(to='main.MeasurementType'),
            preserve_default=True,
        ),
        migrations.AddField(
            model_name='measurement',
            name='update_ref',
            field=models.ForeignKey(related_name='+', to='main.Update'),
            preserve_default=True,
        ),
        migrations.AddField(
            model_name='line',
            name='protocols',
            field=models.ManyToManyField(to='main.Protocol', through='main.Assay'),
            preserve_default=True,
        ),
        migrations.AddField(
            model_name='line',
            name='replicate',
            field=models.ForeignKey(blank=True, to='main.Line', null=True),
            preserve_default=True,
        ),
        migrations.AddField(
            model_name='line',
            name='strains',
            field=models.ManyToManyField(to='main.Strain', db_table=b'line_strain'),
            preserve_default=True,
        ),
        migrations.AddField(
            model_name='line',
            name='study',
            field=models.ForeignKey(to='main.Study'),
            preserve_default=True,
        ),
        migrations.AddField(
            model_name='grouppermission',
            name='study',
            field=models.ForeignKey(to='main.Study'),
            preserve_default=True,
        ),
        migrations.AddField(
            model_name='eddobject',
            name='updates',
            field=models.ManyToManyField(related_name='+', db_table=b'edd_object_update', to='main.Update'),
            preserve_default=True,
        ),
        migrations.AddField(
            model_name='comment',
            name='created',
            field=models.ForeignKey(related_name='+', to='main.Update'),
            preserve_default=True,
        ),
        migrations.AddField(
            model_name='comment',
            name='object_ref',
            field=models.ForeignKey(related_name='comments', to='main.EDDObject'),
            preserve_default=True,
        ),
        migrations.AddField(
            model_name='attachment',
            name='created',
            field=models.ForeignKey(related_name='+', to='main.Update'),
            preserve_default=True,
        ),
        migrations.AddField(
            model_name='attachment',
            name='object_ref',
            field=models.ForeignKey(related_name='files', to='main.EDDObject'),
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
            name='measurement_types',
            field=models.ManyToManyField(to='main.MeasurementType', through='main.Measurement'),
            preserve_default=True,
        ),
        migrations.AddField(
            model_name='assay',
            name='protocol',
            field=models.ForeignKey(to='main.Protocol'),
            preserve_default=True,
        ),
    ]
