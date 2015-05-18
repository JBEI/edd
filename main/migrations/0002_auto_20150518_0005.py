# -*- coding: utf-8 -*-
from __future__ import unicode_literals

from django.db import models, migrations
from django.conf import settings


class Migration(migrations.Migration):

    dependencies = [
        ('main', '0001_initial'),
    ]

    operations = [
        migrations.AlterField(
            model_name='eddobject',
            name='created',
            field=models.ForeignKey(related_name='+', editable=False, to='main.Update'),
            preserve_default=True,
        ),
        migrations.AlterField(
            model_name='eddobject',
            name='updated',
            field=models.ForeignKey(related_name='+', editable=False, to='main.Update'),
            preserve_default=True,
        ),
        migrations.AlterField(
            model_name='update',
            name='mod_by',
            field=models.ForeignKey(editable=False, to=settings.AUTH_USER_MODEL, null=True),
            preserve_default=True,
        ),
    ]
