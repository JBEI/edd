# -*- coding: utf-8 -*-
from __future__ import unicode_literals

import hashlib
import re

from django.db import models, migrations
from django.utils.encoding import force_bytes


def migrate_metadata_context(apps, schema_editor):
    # get pre-migration models, to be safe
    Assay = apps.get_model('main', 'Assay')
    Line = apps.get_model('main', 'Line')
    MetadataType = apps.get_model('main', 'MetadataType')
    # filter on the types needing migration
    protocol_context = MetadataType.objects.filter(for_context='P')
    line_protocol_context = MetadataType.objects.filter(for_context='LP')
    all_context = MetadataType.objects.filter(for_context='LPS')
    # metadata for "protocol" are really for assays
    protocol_context.update(for_context='A')
    # metadata for "line or protocol" are really for "line or assay"; AND should be distinct types
    for mdt in line_protocol_context:
        prev = '%s' % mdt.pk
        mdt.pk = mdt.id = None
        mdt.for_context = 'L'
        mdt.save(force_insert=True)
        for l in Line.objects.filter(meta_store__has_key=prev):
            l.meta_store['%s' % mdt.pk] = l.meta_store[prev]
            del l.meta_store[prev]
            l.save(update_fields=['meta_store', ])
    # Update for_context fields of originals to point to Assay
    line_protocol_context.update(for_context='A')
    # metadata for "all" should be distinct types
    for mdt in all_context:
        prev = '%s' % mdt.pk
        mdt.pk = mdt.id = None
        mdt.for_context = 'L'
        mdt.save(force_insert=True)
        for l in Line.objects.filter(meta_store__has_key=prev):
            l.meta_store['%s' % mdt.pk] = l.meta_store[prev]
            del l.meta_store[prev]
            l.save(update_fields=['meta_store', ])
        mdt.pk = mdt.id = None
        mdt.for_context = 'A'
        mdt.save(force_insert=True)
        for a in Assay.objects.filter(meta_store__has_key=prev):
            a.meta_store['%s' % mdt.pk] = a.meta_store[prev]
            del a.meta_store[prev]
            a.save(update_fields=['meta_store', ])
    # Update for_context fields of originals to point to Study
    all_context.update(for_context='S')


def create_linked_metadata(apps, schema_editor):
    # using updated version of MetadataType
    from main.models import MetadataType
    meta_types = [
        # Study types
        {'type_name': 'Study Name', 'type_i18n': 'main.models.Study.name', 'type_field': 'name',
            'input_size': 30, 'for_context': MetadataType.STUDY, },
        {'type_name': 'Study Description', 'type_i18n': 'main.models.Study.description',
            'type_field': 'description', 'input_type': 'textarea',
            'for_context': MetadataType.STUDY, },
        {'type_name': 'Study Contact', 'type_i18n': 'main.models.Study.contact',
            'type_field': 'contact', 'input_size': 30, 'input_type': 'user',
            'for_context': MetadataType.STUDY, },
        {'type_name': 'Study Contact (external)', 'type_i18n': 'main.models.Study.contact_extra',
            'type_field': 'contact_extra', 'input_size': 30, 'for_context': MetadataType.STUDY, },
        # Line types
        {'type_name': 'Line Name', 'type_i18n': 'main.models.Line.name', 'type_field': 'name',
            'input_size': 30, 'for_context': MetadataType.LINE, },
        {'type_name': 'Line Description', 'type_i18n': 'main.models.Line.description',
            'type_field': 'description', 'input_type': 'textarea',
            'for_context': MetadataType.LINE, },
        {'type_name': 'Control', 'type_i18n': 'main.models.Line.control', 'type_field': 'control',
            'input_type': 'checkbox', 'for_context': MetadataType.LINE, },
        {'type_name': 'Line Contact', 'type_i18n': 'main.models.Line.contact',
            'type_field': 'contact', 'input_size': 30, 'input_type': 'user',
            'for_context': MetadataType.LINE, },
        {'type_name': 'Line Experimenter', 'type_i18n': 'main.models.Line.experimenter',
            'type_field': 'experimenter', 'input_size': 30, 'input_type': 'user',
            'for_context': MetadataType.LINE, },
        {'type_name': 'Carbon Source(s)', 'type_i18n': 'main.models.Line.carbon_source',
            'type_field': 'carbon_source', 'input_size': 30, 'input_type': 'carbon_source',
            'for_context': MetadataType.LINE, },
        {'type_name': 'Strain(s)', 'type_i18n': 'main.models.Line.strains',
            'type_field': 'strains', 'input_size': 30, 'input_type': 'strain',
            'for_context': MetadataType.LINE, },
        # Assay types
        {'type_name': 'Assay Name', 'type_i18n': 'main.models.Assay.name', 'type_field': 'name',
            'input_size': 30, 'for_context': MetadataType.ASSAY, },
        {'type_name': 'Assay Description', 'type_i18n': 'main.models.Assay.description',
            'type_field': 'description', 'input_type': 'textarea',
            'for_context': MetadataType.ASSAY, },
        {'type_name': 'Assay Experimenter', 'type_i18n': 'main.models.Assay.experimenter',
            'type_field': 'experimenter', 'input_size': 30, 'input_type': 'user',
            'for_context': MetadataType.ASSAY, },
        ]
    for md in meta_types:
        MetadataType.objects.create(**md)


def set_default_i18n(apps, schema_editor):
    # using updated version of MetadataType
    from main.models import MetadataType
    pattern = re.compile(r'\W')
    for mdt in MetadataType.objects.filter(type_i18n=None, for_context=MetadataType.STUDY):
        mdt.type_i18n = 'main.models.Study.%s' % (pattern.sub('_', mdt.type_name), )
        mdt.save(update_fields=['type_i18n', ])
    for mdt in MetadataType.objects.filter(type_i18n=None, for_context=MetadataType.LINE):
        mdt.type_i18n = 'main.models.Line.%s' % (pattern.sub('_', mdt.type_name), )
        mdt.save(update_fields=['type_i18n', ])
    for mdt in MetadataType.objects.filter(type_i18n=None, for_context=MetadataType.ASSAY):
        mdt.type_i18n = 'main.models.Assay.%s' % (pattern.sub('_', mdt.type_name), )
        mdt.save(update_fields=['type_i18n', ])


def digest_names(*args):
    """ Generates a 32-bit digest of a set of arguments that can be used to shorten identifying
        names. Copied from django.db.backends.base.schema.py """
    h = hashlib.md5()
    for a in args:
        h.update(force_bytes(a))
    return h.hexdigest()[:8]


class Migration(migrations.Migration):

    dependencies = [
        ('main', '0005_auto_20151019_1428'),
    ]

    operations = [
        migrations.AlterField(
            model_name='metadatatype',
            name='for_context',
            field=models.CharField(
                max_length=8,
                choices=[
                    ('S', 'Study'), ('L', 'Line'), ('A', 'Assay')
                    ]),
        ),
        migrations.AlterField(
            model_name='metadatatype',
            name='group',
            field=models.ForeignKey(blank=True, to='main.MetadataGroup', null=True),
        ),
        migrations.AlterField(
            model_name='metadatatype',
            name='type_name',
            field=models.CharField(max_length=255),
        ),
        migrations.AlterUniqueTogether(
            name='metadatatype',
            unique_together=set([('type_name', 'for_context')]),
        ),
        migrations.AddField(
            model_name='metadatatype',
            name='input_type',
            field=models.CharField(max_length=255, null=True, blank=True),
        ),
        migrations.AddField(
            model_name='metadatatype',
            name='type_field',
            field=models.CharField(default=None, max_length=255, null=True, blank=True),
        ),
        migrations.RunSQL(
            sql='CREATE UNIQUE INDEX metadata_type_unique_%s '
                'ON metadata_type(type_i18n) '
                'WHERE type_i18n IS NOT NULL'
                % (digest_names('MetadataType', 'type_i18n', ), ),
            reverse_sql='DROP INDEX metadata_type_unique_%s'
                        % (digest_names('MetadataType', 'type_i18n', ), ),
        ),
        migrations.RunPython(migrate_metadata_context),
        migrations.RunPython(create_linked_metadata),
        migrations.RunPython(set_default_i18n),
    ]
