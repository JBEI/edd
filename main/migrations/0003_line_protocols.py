# -*- coding: utf-8 -*-
from __future__ import unicode_literals

from django.db import models, migrations


class Migration(migrations.Migration):

    dependencies = [
        ('main', '0002_line_description'),
    ]

    operations = [
        migrations.AddField(
            model_name='line',
            name='protocols',
            field=models.ManyToManyField(to='main.Protocol', through='main.Assay'),
            preserve_default=True,
        ),
    ]
