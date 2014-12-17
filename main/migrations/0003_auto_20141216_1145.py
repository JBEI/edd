# -*- coding: utf-8 -*-
from __future__ import unicode_literals

from django.db import models, migrations


class Migration(migrations.Migration):

    dependencies = [
        ('main', '0002_auto_20141215_1834'),
    ]

    operations = [
        migrations.AlterModelTable(
            name='grouppermission',
            table='study_group_permission',
        ),
        migrations.AlterModelTable(
            name='userpermission',
            table='study_user_permission',
        ),
    ]
