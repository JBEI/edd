# -*- coding: utf-8 -*-
from __future__ import unicode_literals

from django.db import models, migrations
from django.conf import settings


class Migration(migrations.Migration):

    dependencies = [
        ('main', '0003_auto_20141216_1145'),
    ]

    operations = [
        migrations.RemoveField(
            model_name='study',
            name='permissions',
        ),
        migrations.AlterField(
            model_name='study',
            name='contact',
            field=models.ForeignKey(related_name='contact_study_set', blank=True, to=settings.AUTH_USER_MODEL, null=True),
            preserve_default=True,
        ),
        migrations.AlterField(
            model_name='study',
            name='created',
            field=models.ForeignKey(related_name='created_study_set', to='main.Update'),
            preserve_default=True,
        ),
    ]
