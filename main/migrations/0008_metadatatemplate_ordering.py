# -*- coding: utf-8 -*-
from __future__ import unicode_literals

from django.db import models, migrations


class Migration(migrations.Migration):

    dependencies = [
        ('main', '0007_protocol_template_and_category'),
    ]

    operations = [
        migrations.AddField(
            model_name='metadatatemplate',
            name='ordering',
            field=models.IntegerField(unique=True, null=True, blank=True),
        ),
    ]
