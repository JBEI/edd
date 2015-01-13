# -*- coding: utf-8 -*-
from __future__ import unicode_literals

from django.db import models, migrations


class Migration(migrations.Migration):

    dependencies = [
        ('main', '0004_auto_20141216_1233'),
    ]

    operations = [
        migrations.AddField(
            model_name='update',
            name='origin',
            field=models.TextField(null=True, blank=True),
            preserve_default=True,
        ),
        migrations.AddField(
            model_name='update',
            name='path',
            field=models.TextField(null=True, blank=True),
            preserve_default=True,
        ),
    ]
