# -*- coding: utf-8 -*-
from __future__ import unicode_literals

from django.db import models, migrations


class Migration(migrations.Migration):

    dependencies = [
        ('main', '0009_auto_20150910_1630'),
    ]

    operations = [
        migrations.CreateModel(
            name='Phosphor',
            fields=[
                ('measurementtype_ptr', models.OneToOneField(parent_link=True, auto_created=True, primary_key=True, serialize=False, to='main.MeasurementType')),
                ('excitation_wavelength', models.DecimalField(max_digits=16, decimal_places=5)),
                ('emission_wavelength', models.DecimalField(max_digits=16, decimal_places=5)),
            ],
            options={
                'db_table': 'phosphor_type',
            },
            bases=('main.measurementtype',),
        ),
        migrations.AlterField(
            model_name='measurementtype',
            name='type_group',
            field=models.CharField(default=b'h', max_length=8, choices=[(b'_', b'Generic'), (b'm', b'Metabolite'), (b'g', b'Gene Identifier'), (b'p', b'Protein Identifer'), (b'h', b'Phosphor')]),
        ),
        migrations.AlterField(
            model_name='measurementunit',
            name='type_group',
            field=models.CharField(default=b'_', max_length=8, choices=[(b'_', b'Generic'), (b'm', b'Metabolite'), (b'g', b'Gene Identifier'), (b'p', b'Protein Identifer'), (b'h', b'Phosphor')]),
        ),
        migrations.AddField(
            model_name='phosphor',
            name='reference_type',
            field=models.ForeignKey(related_name='phosphor_set', blank=True, to='main.MeasurementType', null=True),
        ),
    ]
