# -*- coding: utf-8 -*-
from __future__ import unicode_literals

from django.db import migrations
from socket import getfqdn


def configure_site_name(apps, schema_editor):
    # We can't import the Site model directly, since it may be a newer
    # version than this migration expects. We use the historical version.
    Site = apps.get_model('sites', 'Site')
    try:
        current_site = Site.objects.get_current()
    except Site.DoesNotExist:
        # if there is no default current site, create one
        current_site = Site()

    current_site.domain = getfqdn()
    current_site.name = 'Experiment Data Depot'
    current_site.save()


class Migration(migrations.Migration):

    dependencies = [
        ('main', '0004_auto_20150929_1632'),
        ('sites', '0001_initial'),
    ]

    operations = [
        migrations.RunPython(configure_site_name),
    ]
