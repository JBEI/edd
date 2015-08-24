# -*- coding: utf-8 -*-
from __future__ import unicode_literals

from django.db import models, migrations


class Migration(migrations.Migration):

    dependencies = [
        ('main', '0005_auto_20150728_1817'),
    ]

    operations = [
        migrations.AddField(
            model_name='study',
            name='metabolic_map',
            field=models.ForeignKey(blank=True, to='main.SBMLTemplate', null=True),
        ),
    ]
