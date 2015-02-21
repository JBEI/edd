# -*- coding: utf-8 -*-
from __future__ import unicode_literals

from django.db import models, migrations


class Migration(migrations.Migration):

    dependencies = [
        ('main', '0001_initial'),
    ]

    operations = [
        migrations.AddField(
            model_name='measurement',
            name='compartment',
            field=models.CharField(default=0, max_length=1, choices=[(b'0', b''), (b'1', b'Intracellular/Cytosol (Cy)'), (b'2', b'Extracellular')]),
            preserve_default=True,
        ),
    ]
