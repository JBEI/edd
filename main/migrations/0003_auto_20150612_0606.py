# -*- coding: utf-8 -*-
from __future__ import unicode_literals

from django.db import models, migrations


class Migration(migrations.Migration):

    dependencies = [
        ('main', '0002_auto_20150602_1656'),
    ]

    operations = [
        migrations.CreateModel(
            name='ProteinIdentifier',
            fields=[
                ('measurementtype_ptr', models.OneToOneField(parent_link=True, auto_created=True, primary_key=True, serialize=False, to='main.MeasurementType')),
            ],
            options={
            },
            bases=('main.measurementtype',),
        ),
        migrations.AlterField(
            model_name='attachment',
            name='mime_type',
            field=models.CharField(max_length=255, null=True, blank=True),
            preserve_default=True,
        ),
        migrations.AlterField(
            model_name='sbmltemplate',
            name='sbml_file',
            field=models.ForeignKey(blank=True, to='main.Attachment', null=True),
            preserve_default=True,
        ),
    ]
