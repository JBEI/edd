# -*- coding: utf-8 -*-
from __future__ import unicode_literals

from django.db import models, migrations


class Migration(migrations.Migration):

    dependencies = [
        ('main', '0005_SYNBIO-1120_linked_metadata'),
    ]

    operations = [
        migrations.CreateModel(
            name='MetadataTemplate',
            fields=[
                ('id', models.AutoField(verbose_name='ID', serialize=False, auto_created=True, primary_key=True)),
                ('default_value', models.CharField(max_length=255, blank=True)),
                ('meta_type', models.ForeignKey(to='main.MetadataType')),
                ('protocol', models.ForeignKey(to='main.Protocol')),
            ],
            options={
                'db_table': 'metadata_template',
            },
        ),
        migrations.AddField(
            model_name='study',
            name='protocols',
            field=models.ManyToManyField(to='main.Protocol', db_table='study_protocol', blank=True),
        ),
        migrations.AddField(
            model_name='protocol',
            name='metadata_template',
            field=models.ManyToManyField(to='main.MetadataType', through='main.MetadataTemplate'),
        ),
    ]
