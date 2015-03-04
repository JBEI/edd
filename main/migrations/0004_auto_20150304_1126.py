# -*- coding: utf-8 -*-
from __future__ import unicode_literals

from django.db import models, migrations


class Migration(migrations.Migration):

    dependencies = [
        ('main', '0003_metabolicmap'),
    ]

    operations = [
        migrations.AddField(
            model_name='measurement',
            name='measurement_format',
            field=models.IntegerField(default=0),
            preserve_default=True,
        ),
        migrations.AlterField(
            model_name='metabolicmap',
            name='biomass_calculation_info',
            field=models.TextField(default=b''),
            preserve_default=True,
        ),
    ]
