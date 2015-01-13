# -*- coding: utf-8 -*-
from __future__ import unicode_literals

from django.db import models, migrations
import django_extensions.db.fields


class Migration(migrations.Migration):

    dependencies = [
        ('main', '0005_auto_20150112_1929'),
    ]

    operations = [
        migrations.CreateModel(
            name='Strain',
            fields=[
                ('id', models.AutoField(verbose_name='ID', serialize=False, auto_created=True, primary_key=True)),
                ('strain_name', models.CharField(max_length=255)),
                ('registry_id', django_extensions.db.fields.PostgreSQLUUIDField(null=True, editable=False, blank=True)),
                ('registry_url', models.URLField(max_length=255, null=True, blank=True)),
                ('created', models.ForeignKey(related_name='+', to='main.Update')),
                ('updated', models.ForeignKey(related_name='+', to='main.Update')),
            ],
            options={
                'db_table': 'strain',
            },
            bases=(models.Model,),
        ),
    ]
