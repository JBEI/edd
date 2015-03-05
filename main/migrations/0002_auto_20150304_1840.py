# -*- coding: utf-8 -*-
from __future__ import unicode_literals

from django.db import models, migrations


class Migration(migrations.Migration):

    dependencies = [
        ('main', '0001_initial'),
    ]

    operations = [
        migrations.AlterField(
            model_name='metadatatype',
            name='for_context',
            field=models.CharField(max_length=8, choices=[(b'S', b'Study'), (b'L', b'Line'), (b'P', b'Protocol'), (b'LP', b'Line or Protocol'), (b'LPS', b'All')]),
            preserve_default=True,
        ),
    ]
