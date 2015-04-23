# -*- coding: utf-8 -*-
from __future__ import unicode_literals

from django.db import models, migrations
from django.conf import settings


class Migration(migrations.Migration):

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ('main', '0001_initial'),
    ]

    operations = [
        migrations.CreateModel(
            name='MetaboliteKeyword',
            fields=[
                ('id', models.AutoField(verbose_name='ID', serialize=False, auto_created=True, primary_key=True)),
                ('name', models.CharField(unique=True, max_length=255)),
                ('mod_by', models.ForeignKey(to=settings.AUTH_USER_MODEL)),
            ],
            options={
                'db_table': 'metabolite_keyword',
            },
            bases=(models.Model,),
        ),
        migrations.RenameModel(
            old_name='MetabolicMap',
            new_name='SBMLTemplate',
        ),
        migrations.RenameField(
            model_name='metaboliteexchange',
            old_name='metabolic_map',
            new_name='sbml_template',
        ),
        migrations.RenameField(
            model_name='metabolitespecies',
            old_name='metabolic_map',
            new_name='sbml_template',
        ),
        migrations.AddField(
            model_name='measurementunit',
            name='alternate_names',
            field=models.CharField(max_length=255, null=True, blank=True),
            preserve_default=True,
        ),
        migrations.AddField(
            model_name='metabolite',
            name='keywords',
            field=models.ManyToManyField(to='main.MetaboliteKeyword', db_table=b'metabolites_to_keywords'),
            preserve_default=True,
        ),
        migrations.AddField(
            model_name='protocol',
            name='default_units',
            field=models.ForeignKey(related_name='protocol_set', blank=True, to='main.MeasurementUnit', null=True),
            preserve_default=True,
        ),
        migrations.AlterField(
            model_name='measurementunit',
            name='unit_name',
            field=models.CharField(unique=True, max_length=255),
            preserve_default=True,
        ),
        migrations.AlterField(
            model_name='metadatatype',
            name='type_name',
            field=models.CharField(unique=True, max_length=255),
            preserve_default=True,
        ),
        migrations.AlterUniqueTogether(
            name='metaboliteexchange',
            unique_together=set([('sbml_template', 'measurement_type')]),
        ),
        migrations.AlterUniqueTogether(
            name='metabolitespecies',
            unique_together=set([('sbml_template', 'measurement_type')]),
        ),
        migrations.AlterModelTable(
            name='sbmltemplate',
            table='sbml_template',
        ),
    ]
