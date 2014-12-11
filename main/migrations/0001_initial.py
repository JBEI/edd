# -*- coding: utf-8 -*-
from __future__ import unicode_literals

from django.db import models, migrations
from django.conf import settings


class Migration(migrations.Migration):

    dependencies = [
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
                ('x_units', models.CharField(max_length=255)),
                ('y_units', models.CharField(max_length=255)),
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
                ('type_group', models.CharField(default=b'g', max_length=8, choices=[(b'g', b'Generic'), (b'm', b'Metabolite')])),
            ],
            options={
                'db_table': 'measurement_type',
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
            name='Study',
            fields=[
                ('id', models.AutoField(verbose_name='ID', serialize=False, auto_created=True, primary_key=True)),
                ('study_name', models.CharField(max_length=255)),
                ('description', models.TextField()),
                ('active', models.BooleanField(default=True)),
                ('contact_extra', models.TextField()),
                ('permissions', models.TextField()),
                ('contact', models.ForeignKey(related_name='+', blank=True, to=settings.AUTH_USER_MODEL, null=True)),
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
                ('mod_by', models.ForeignKey(editable=False, to=settings.AUTH_USER_MODEL)),
            ],
            options={
                'db_table': 'update_info',
            },
            bases=(models.Model,),
        ),
        migrations.AddField(
            model_name='study',
            name='created',
            field=models.ForeignKey(related_name='+', to='main.Update'),
            preserve_default=True,
        ),
        migrations.AddField(
            model_name='study',
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
            model_name='measurementdatum',
            name='updated',
            field=models.ForeignKey(related_name='+', to='main.Update'),
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
