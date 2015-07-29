# -*- coding: utf-8 -*-
from __future__ import unicode_literals

from django.db import models, migrations


class Migration(migrations.Migration):

    dependencies = [
        ('main', '0004_auto_20150714_1553'),
    ]

    operations = [
        migrations.AlterField(
            model_name='attachment',
            name='created',
            field=models.ForeignKey(to='main.Update'),
        ),
        migrations.AlterField(
            model_name='comment',
            name='created',
            field=models.ForeignKey(to='main.Update'),
        ),
        migrations.AlterField(
            model_name='eddobject',
            name='created',
            field=models.ForeignKey(related_name='object_created', editable=False, to='main.Update'),
        ),
        migrations.AlterField(
            model_name='eddobject',
            name='updated',
            field=models.ForeignKey(related_name='object_updated', editable=False, to='main.Update'),
        ),
        migrations.AlterField(
            model_name='measurement',
            name='update_ref',
            field=models.ForeignKey(to='main.Update'),
        ),
        migrations.AlterField(
            model_name='measurementvalue',
            name='updated',
            field=models.ForeignKey(to='main.Update'),
        ),
    ]
