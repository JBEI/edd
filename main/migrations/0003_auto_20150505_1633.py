# -*- coding: utf-8 -*-
from __future__ import unicode_literals

from django.db import models, migrations


class Migration(migrations.Migration):

    dependencies = [
        ('main', '0002_auto_20150421_1715'),
    ]

    operations = [
        migrations.AlterField(
            model_name='metadatagroup',
            name='group_name',
            field=models.CharField(unique=True, max_length=255),
        ),
    ]
