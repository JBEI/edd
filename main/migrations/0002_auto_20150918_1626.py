# -*- coding: utf-8 -*-
from __future__ import unicode_literals

from django.db import models, migrations


class Migration(migrations.Migration):

    dependencies = [
        ('main', '0001_squashed_0011_auto_20150914_1616'),
    ]

    operations = [
        migrations.AlterField(
            model_name='measurement',
            name='measurement_format',
            field=models.CharField(default=0, max_length=2, choices=[(b'0', b'scalar'), (b'1', b'vector'), (b'2', b'grid'), (b'3', b'sigma'), (b'4', b'histogram')]),
        ),
    ]
