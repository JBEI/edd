# -*- coding: utf-8 -*-
from __future__ import unicode_literals

from django.db import models, migrations


class Migration(migrations.Migration):

    dependencies = [
        ('main', '0001_initial'),
    ]

    operations = [
        migrations.AddField(
            model_name='sbmltemplate',
            name='sbml_file',
            field=models.ForeignKey(to='main.Attachment', null=True),
            preserve_default=True,
        ),
        migrations.AlterField(
            model_name='measurement',
            name='measurement_format',
            field=models.CharField(default=b'0', max_length=2),
            preserve_default=True,
        ),
    ]
