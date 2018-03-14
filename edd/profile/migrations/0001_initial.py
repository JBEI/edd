# -*- coding: utf-8 -*-
# flake8: noqa

from django.db import models, migrations
from django.conf import settings


class Migration(migrations.Migration):

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name='Institution',
            fields=[
                ('id', models.AutoField(verbose_name='ID', serialize=False, auto_created=True, primary_key=True)),
                ('institution_name', models.CharField(max_length=255)),
                ('description', models.TextField(null=True, blank=True)),
            ],
            options={
                'db_table': 'profile_institution',
            },
            bases=(models.Model,),
        ),
        migrations.CreateModel(
            name='InstitutionID',
            fields=[
                ('id', models.AutoField(verbose_name='ID', serialize=False, auto_created=True, primary_key=True)),
                ('identifier', models.CharField(max_length=255, null=True, blank=True)),
                ('institution', models.ForeignKey(to='profile.Institution')),
            ],
            options={
                'db_table': 'profile_institution_user',
            },
            bases=(models.Model,),
        ),
        migrations.CreateModel(
            name='UserPreference',
            fields=[
                ('id', models.AutoField(verbose_name='ID', serialize=False, auto_created=True, primary_key=True)),
                ('key', models.CharField(max_length=255)),
                ('value', models.CharField(max_length=255)),
            ],
            options={
                'db_table': 'profile_preference',
            },
            bases=(models.Model,),
        ),
        migrations.CreateModel(
            name='UserProfile',
            fields=[
                ('id', models.AutoField(verbose_name='ID', serialize=False, auto_created=True, primary_key=True)),
                ('initials', models.CharField(max_length=10, null=True, blank=True)),
                ('description', models.TextField(null=True, blank=True)),
                ('institutions', models.ManyToManyField(to='profile.Institution', through='profile.InstitutionID')),
                ('user', models.OneToOneField(to=settings.AUTH_USER_MODEL)),
            ],
            options={
                'db_table': 'profile_user',
            },
            bases=(models.Model,),
        ),
        migrations.AddField(
            model_name='userpreference',
            name='profile',
            field=models.ForeignKey(to='profile.UserProfile'),
            preserve_default=True,
        ),
        migrations.AddField(
            model_name='institutionid',
            name='profile',
            field=models.ForeignKey(to='profile.UserProfile'),
            preserve_default=True,
        ),
    ]
