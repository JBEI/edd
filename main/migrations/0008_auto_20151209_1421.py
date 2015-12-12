# -*- coding: utf-8 -*-
from __future__ import unicode_literals

from django.db import models, migrations


class Migration(migrations.Migration):

    dependencies = [
        ('main', '0007_protocol_template_and_category'),
    ]

    operations = [
        migrations.CreateModel(
            name='WorklistColumn',
            fields=[
                ('id', models.AutoField(verbose_name='ID', serialize=False, auto_created=True, primary_key=True)),
                ('heading', models.CharField(max_length=255, null=True, blank=True)),
                ('default_value', models.CharField(max_length=255, null=True, blank=True)),
                ('help_text', models.TextField(null=True, blank=True)),
                ('ordering', models.IntegerField(unique=True, null=True, blank=True)),
                ('meta_type', models.ForeignKey(blank=True, to='main.MetadataType', null=True)),
            ],
            options={
                'db_table': 'worklist_column',
            },
        ),
        migrations.CreateModel(
            name='WorklistTemplate',
            fields=[
                ('eddobject_ptr', models.OneToOneField(parent_link=True, auto_created=True, primary_key=True, serialize=False, to='main.EDDObject')),
            ],
            options={
                'db_table': 'worklist_template',
            },
            bases=('main.eddobject',),
        ),
        migrations.RemoveField(
            model_name='metadatatemplate',
            name='meta_type',
        ),
        migrations.RemoveField(
            model_name='metadatatemplate',
            name='protocol',
        ),
        migrations.RemoveField(
            model_name='protocol',
            name='metadata_template',
        ),
        migrations.DeleteModel(
            name='MetadataTemplate',
        ),
        migrations.AddField(
            model_name='worklisttemplate',
            name='protocol',
            field=models.ForeignKey(to='main.Protocol'),
        ),
        migrations.AddField(
            model_name='worklistcolumn',
            name='template',
            field=models.ForeignKey(to='main.WorklistTemplate'),
        ),
    ]
