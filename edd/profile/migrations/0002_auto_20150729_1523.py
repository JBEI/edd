# -*- coding: utf-8 -*-
# flake8: noqa

from django.db import migrations
import django.contrib.postgres.fields.hstore


class Migration(migrations.Migration):

    dependencies = [
        ('profile', '0001_initial'),
    ]

    operations = [
        migrations.RemoveField(
            model_name='userpreference',
            name='profile',
        ),
        migrations.AddField(
            model_name='userprofile',
            name='prefs',
            field=django.contrib.postgres.fields.hstore.HStoreField(default=dict, blank=True),
        ),
        migrations.DeleteModel(
            name='UserPreference',
        ),
    ]
