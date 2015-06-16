# -*- coding: utf-8 -*-
from __future__ import unicode_literals

from django.db import models, migrations


class Migration(migrations.Migration):

    dependencies = [
        ('main', '0003_auto_20150612_0606'),
    ]

    operations = [
        migrations.AlterModelTable(
            name='proteinidentifier',
            table='protein_identifier',
        ),
    ]
