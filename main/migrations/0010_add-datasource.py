# -*- coding: utf-8 -*-
from __future__ import unicode_literals

from django.db import migrations, models
from django.db.models import CASCADE


class Migration(migrations.Migration):

    dependencies = [
        ('main', '0009_auto_20160112_1229'),
    ]

    operations = [
        migrations.CreateModel(
            name='Datasource',
            fields=[
                ('id', models.AutoField(
                    auto_created=True,
                    primary_key=True,
                    serialize=False,
                    verbose_name='ID',
                )),
                ('name', models.CharField(max_length=255)),
                ('url', models.CharField(blank=True, default='', max_length=255)),
                ('download_date', models.DateField(auto_now=True)),
                ('created', models.ForeignKey(
                    editable=False,
                    on_delete=CASCADE,
                    related_name='datasource',
                    to='main.Update',
                )),
            ],
        ),
        migrations.AddField(
            model_name='metabolite',
            name='source',
            field=models.ForeignKey(blank=True, null=True, on_delete=CASCADE, to='main.Datasource'),
        ),
    ]
