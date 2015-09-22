# -*- coding: utf-8 -*-
from __future__ import unicode_literals

import arrow

from django.conf import settings
from django.db import models, migrations


def initial_cytometry(apps, schema_editor):
    Phosphor = apps.get_model('main', 'Phosphor')
    Protocol = apps.get_model('main', 'Protocol')
    Update = apps.get_model('main', 'Update')
    User = apps.get_model(settings.AUTH_USER_MODEL)
    admin_user = User.objects.filter(is_superuser=True, is_active=True).order_by('pk')[0]
    update = Update.objects.create(
        mod_by=admin_user,
        mod_time=arrow.utcnow(),
        origin='localhost',
        path='manage.py migrate',)
    cytometry_protocol = Protocol.objects.create(
        name='Flow Cytometry Characterization',
        description='',
        owned_by=admin_user,
        created=update,
        updated=update,)
    # http://www.nature.com/nmeth/journal/v2/n12/pdf/nmeth819.pdf
    phosphors = [
        { 'type_name': 'Enhanced Green Fluorescent Protein', 'short_name': 'EGFP',
            'excitation_wavelength': 488, 'emission_wavelength': 507 },
        { 'type_name': 'Emerald Green Fluorescent Protein', 'short_name': 'emGFP',
            'excitation_wavelength': 488, 'emission_wavelength': 510 },
        { 'type_name': 'Superfolder Green Fluorescent Protein', 'short_name': 'sfGFP',
            'excitation_wavelength': 485, 'emission_wavelength': 507 },
        { 'type_name': 'GFPuv', 'short_name': 'GFPuv',
            'excitation_wavelength': 395, 'emission_wavelength': 509 },
        { 'type_name': 'dsRed', 'short_name': 'dsRed',
            'excitation_wavelength': 557, 'emission_wavelength': 585 },
        { 'type_name': 'mCherry', 'short_name': 'mCherry',
            'excitation_wavelength': 587, 'emission_wavelength': 610 },
        { 'type_name': 'Monomeric Red Fluorescent Protein', 'short_name': 'mRFP1',
            'excitation_wavelength': 585, 'emission_wavelength': 607 },
        { 'type_name': 'tdTomato', 'short_name': 'tdTomato',
            'excitation_wavelength': 554, 'emission_wavelength': 581 },
        { 'type_name': 'mStrawberry', 'short_name': 'mStrawberry',
            'excitation_wavelength': 574, 'emission_wavelength': 596 },
        { 'type_name': 'mOrange', 'short_name': 'mOrange',
            'excitation_wavelength': 548, 'emission_wavelength': 562 },
        { 'type_name': 'mKO', 'short_name': 'mKO',
            'excitation_wavelength': 548, 'emission_wavelength': 559 },
        { 'type_name': 'mCitrine', 'short_name': 'mCitrine',
            'excitation_wavelength': 516, 'emission_wavelength': 529 },
        { 'type_name': 'Venus', 'short_name': 'Venus',
            'excitation_wavelength': 515, 'emission_wavelength': 528 },
        { 'type_name': 'YPet', 'short_name': 'YPet',
            'excitation_wavelength': 517, 'emission_wavelength': 530 },
        { 'type_name': 'Enhanced Yellow Fluorescent Protein', 'short_name': 'EYFP',
            'excitation_wavelength': 514, 'emission_wavelength': 527 },
        { 'type_name': 'CyPet', 'short_name': 'CyPet',
            'excitation_wavelength': 435, 'emission_wavelength': 477 },
        { 'type_name': 'mCFPm', 'short_name': 'mCFPm',
            'excitation_wavelength': 433, 'emission_wavelength': 475 },
        { 'type_name': 'Cerulean', 'short_name': 'Cerulean',
            'excitation_wavelength': 433, 'emission_wavelength': 475 },
        { 'type_name': 'T-Sapphire', 'short_name': 'T-Sapphire',
            'excitation_wavelength': 399, 'emission_wavelength': 511 },
        { 'type_name': 'mPlum', 'short_name': 'mPlum',
            'excitation_wavelength': 590, 'emission_wavelength': 649 },
        ]
    for p in phosphors:
        Phosphor.objects.create(**p)

class Migration(migrations.Migration):

    dependencies = [
        ('main', '0002_auto_20150918_1626'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.RunPython(initial_cytometry)
    ]
