# -*- coding: utf-8 -*-
from __future__ import unicode_literals

import re

from django.db import models, migrations


def set_categorization(apps, schema_editor):
    Protocol = apps.get_model('main', 'Protocol')
    for p in Protocol.objects.all():
        name = p.name.upper()
        if name == "OD600":
            p.categorization = Protocol.CATEGORY_OD
        elif "HPLC" in name:
            p.categorization = Protocol.CATEGORY_HPLC
        elif re.match("^LC[\-\/]?", name) or re.match("^GC[\-\/]?", name):
            p.categorization = Protocol.CATEGORY_LCMS
        elif re.match("O2\W+CO2", name):
            p.categorization = Protocol.CATEGORY_RAMOS
        elif ("TRANSCRIPTOMICS" in name) or ("PROTEOMICS" in name):
            p.categorization = Protocol.CATEGORY_TPOMICS
        else:
            continue
        p.save(update_fields=['categorization', ])


class Migration(migrations.Migration):

    dependencies = [
        ('main', '0006_protocol_metadata_template'),
    ]

    operations = [
        migrations.AddField(
            model_name='protocol',
            name='categorization',
            field=models.CharField(
                default='NA', max_length=8, choices=[
                    ('NA', 'None'),
                    ('OD', 'Optical Density'),
                    ('HPLC', 'HPLC'),
                    ('LCMS', 'LCMS'),
                    ('RAMOS', 'RAMOS'),
                    ('TPOMICS', 'Transcriptomics / Proteomics')
                ]),
        ),
        migrations.AlterField(
            model_name='metadatatemplate',
            name='default_value',
            field=models.CharField(max_length=255, null=True, blank=True),
        ),
        migrations.RunPython(set_categorization),
    ]
