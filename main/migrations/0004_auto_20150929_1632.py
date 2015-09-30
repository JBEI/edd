# -*- coding: utf-8 -*-
from __future__ import unicode_literals

import arrow

from django.conf import settings
from django.contrib.auth import get_user_model
from django.db import migrations


def ensure_needed_infrastructure_available(apps, schema_editor):
    MetadataGroup = apps.get_model('main', 'MetadataGroup')
    is_needed = False
    try:
        group = MetadataGroup.objects.get(group_name='Enzyme Characterization')
    except MetadataGroup.DoesNotExist:
        is_needed = True
    if not is_needed:
        return

    # Want to work with real User model here; safe as migration does not change User schema
    User = get_user_model()
    # Create (or use existing) a system user without a login to be the owner
    try:
        admin_user = User.objects.get(username='system')
    except User.DoesNotExist:
        admin_user = User.objects.create_superuser('system', settings.ADMINS[0][1], None)
    # We are sure the admin user exists now, so get it with the migration version of model
    User = apps.get_model(settings.AUTH_USER_MODEL)
    admin_user = User.objects.get(username='system')

    group = MetadataGroup.objects.create(group_name='Enzyme Characterization')

    MeasurementType = apps.get_model('main', 'MeasurementType')
    MeasurementUnit = apps.get_model('main', 'MeasurementUnit')
    MetadataType = apps.get_model('main', 'MetadataType')
    Protocol = apps.get_model('main', 'Protocol')
    Update = apps.get_model('main', 'Update')

    MetadataType.objects.create(
        type_name='Well reaction temperature', input_size=5, postfix='°C', for_context='P',
        group=group, )
    MetadataType.objects.create(
        type_name='Machine internal temperature', input_size=5, postfix='°C', for_context='P',
        group=group,)
    MetadataType.objects.create(
        type_name='Device Name', input_size=120, for_context='P', group=group, )
    update = Update.objects.create(
        mod_by=admin_user,
        mod_time=arrow.utcnow(),
        origin='localhost',
        path='manage.py migrate',)
    Protocol.objects.create(
        name='Enzyme Characterization - Plate Reader',
        description='Using a plate reader to collect Enzyme Characterization data.',
        owned_by=admin_user,
        created=update,
        updated=update,)
    MeasurementUnit.objects.create(
        unit_name='relative', display=False, type_group='_', )
    # Also Measurement Types
    MeasurementType.objects.create(
        type_name='Fluorescence',  short_name='fluor', type_group='_', )
    MeasurementType.objects.create(
        type_name='Absorbance', short_name='absorb', type_group='m', )


class Migration(migrations.Migration):

    dependencies = [
        ('main', '0003_auto_20150921_1702'),
    ]

    operations = [
        migrations.RunPython(ensure_needed_infrastructure_available)
    ]
