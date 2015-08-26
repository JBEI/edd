# -*- coding: utf-8 -*-
from __future__ import unicode_literals

from django.db import models, migrations


class Migration(migrations.Migration):

    dependencies = [
        ('main', '0007_auto_20150820_1813'),
    ]

    operations = [
        migrations.AlterField(
            model_name='measurement',
            name='compartment',
            field=models.CharField(default=0, max_length=1, choices=[(b'0', b'N/A'), (b'1', b'Intracellular/Cytosol (Cy)'), (b'2', b'Extracellular')]),
        ),
    ]
