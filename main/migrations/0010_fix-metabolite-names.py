# -*- coding: utf-8 -*-
from __future__ import unicode_literals

import json
import logging
import os
import re

from django.db import connection, IntegrityError, migrations, transaction
from django.db.models import Q


logger = logging.getLogger(__name__)
carbon_pattern = re.compile(r'C(\d*)')


# key is existing type_name, value is tuple of (
#    type_name, short_name, charge, carbon_count, molar_mass, molecular_formula
# )
fix_data = {
    'Mevalonate-P': ('Mevalonate-P', 'Mev-P', 0, 6, 228.137, 'C6H13O7P'),
    'Isopentenol': ('Isopentenol', 'ipyl', 0, 5, 86.13, 'C5H10O'),
    'Limonene': ('Limonene', 'Limonene', 0, 10, 136.24, 'C10H16'),
    'Indole-3-pyruvate': ('Indole-3-pyruvate', 'Indole3pyruvate', 0, 11, 203.19, 'C11H9NO3'),
    'isopentenyl monophosphate': ('Isopentenyl Phosphate', 'ipmp', 0, 5, 166.11, 'C5H11O4P'),
    'Propionyl CoA': ('Propionyl CoA', 'pro-coa', 0, 24, 823.6, 'C24H40N7O17P3S'),
    'butyrolactam': ('2-Pyrrolidinone', '2-P', 0, 4, 85.1, 'C4H7NO'),
    'Isopentenyl-ATP': ('Isopentenyl-ATP', 'ISPATP', 0, 15, 575.3, 'C15H24N5O13P3'),
    'HMG-coA': ('Hydroxymethylglutaryl CoA', 'hmgcoa', 0, 27, 911.661, "C27H39N7O20P3S"),
    'L-Fucose 1-phosphate': ('L-Fucose 1-phosphate', 'fuc1p__L', 0, 6, 244.1364, "C6H11O8P"),
}
# key is existing type_name, value is type_name of canonical metabolite
merge_data = {
    'Mevalonate': 'R Mevalonate',
    'Argnine': 'L-Arginine',
    'Nicotinic Acid': 'Nicotinate',
    'LOrnithine': 'L Ornithine',
    'LCitrulline': 'L-Citrulline',
    'valine': 'L-Valine',
    'Cystine': 'L-Cysteine',
    'OsuccinylHomoserine': 'O-Succinyl-L-homoserine',
    '4-Aminobenzoic acid': '4-Aminobenzoate',
    'DGlucosamine': 'D-Glucosamine',
    'LCarnitine': 'L-Carnitine',
    'DXP': '1-deoxy-D-xylulose 5-phosphate',
    'MEP': 'R 5 Phosphomevalonate',
    '1,cis-2,3-Propenetricarboxylic acid': 'Cis-Aconitate',
    'Fructose 1,6-biphosphate': 'D-Fructose 1,6-bisphosphate',
    'meso-2,6-Diaminoheptanedioate': 'Meso-2,6-Diaminoheptanedioate',
    'trans-Aconitate': 'Trans-Aconitate',
    'beta-Alanine': 'Beta-Alanine',
    'CDPdiacylglycerol (E coli) **': 'CDPdiacylglycerol  E coli',
    'Mevalonate-PP': 'R 5 Diphosphomevalonate',
    'GGPP': 'Geranylgeranyl diphosphate',
}
# list of type_name values that should be deleted from metabolite, but remain generic measurement
delete_data = [
    'FAEE total',
    'Total Methyl ketones',
    'Free fatty acids (derivatized)',
    'Fatty Acid',
    'Soluble Sugars',
    'CO2/O2 ratio',
    'CO2 Production',
    'O2 Consumption',
]


def fix_manual_metabolites(apps, schema_editor):
    # using updated version
    MeasurementType = apps.get_model('main', 'MeasurementType')
    Metabolite = apps.get_model('main', 'Metabolite')
    MetaboliteKeyword = apps.get_model('main', 'MetaboliteKeyword')
    # manual fixes to metabolite info
    for name, values in fix_data.items():
        try:
            with transaction.atomic():
                m = Metabolite.objects.get(type_name=name)
            m.type_name = values[0]
            m.short_name = values[1]
            m.charge = values[2]
            m.carbon_count = values[3]
            m.molar_mass = values[4]
            m.molecular_formula = values[5]
            m.save()
        except Metabolite.DoesNotExist:
            logger.warning("Nothing to fix: '%s'", name)
    # merging existing metabolites into new canonical types
    for old, canonical in merge_data.items():
        try:
            with transaction.atomic():
                m_old = Metabolite.objects.get(type_name=old)
                m_canonical = Metabolite.objects.get(type_name=canonical)
            merge_metabolites(apps, m_old, m_canonical)
        except Metabolite.DoesNotExist:
            logger.warning('Nothing to merge: "%s" and "%s"', old, canonical)
    # delete metabolite records, but KEEP measurement records for metabolites that are
    # not metabolites
    with connection.cursor() as cursor:
        for name in delete_data:
            try:
                with transaction.atomic():
                    m = Metabolite.objects.get(type_name=name)
                MetaboliteKeyword.objects.filter(metabolite=m).delete()
                cursor.execute('DELETE FROM %s WHERE %s = %s' % (
                    Metabolite._meta.db_table,
                    Metabolite._meta.pk.column,
                    m.pk
                ))
                MeasurementType.objects.filter(pk=m.pk).update(
                    type_group=MeasurementType.Group.GENERIC
                )
            except Metabolite.DoesNotExist:
                logger.warning('No metabolite to switch to generic measurement: "%s"', name)


def insert_bigg_metabolites(apps, schema_editor):
    from main.models import Update
    # using updated version
    Datasource = apps.get_model('main', 'Datasource')
    Metabolite = apps.get_model('main', 'Metabolite')
    MigrateUpdate = apps.get_model('main', 'Update')
    base_dir = os.path.dirname(__file__)
    data = {}
    try:
        with open(os.path.join(base_dir, 'bigg_import.json')) as bigg_json:
            data = json.load(bigg_json)
        app_update = Update.load_update(path=__name__)
        update = MigrateUpdate.objects.get(pk=app_update.pk)
        ds = Datasource(name='BIGG', url='https://github.com/SBRG/bigg_models', created=update)
        ds.save()
        for entry in data.get('entries', []):
            existing = Metabolite.objects.filter(Q(type_name=entry[1]) | Q(short_name=entry[0]))
            if existing:
                m = existing[0]
                m.short_name = entry[0]
                m.type_name = entry[1]
                m.molecular_formula = entry[2]
                m.carbon_count = extract_carbon_count(entry[2])
                m.charge = entry[3]
                m.source = ds
                m.save()
                # more than one, merge remaining into first
                for x in existing[1:]:
                    merge_metabolites(apps, x, m)
            else:
                m = Metabolite(
                    short_name=entry[0],
                    type_name=entry[1],
                    molar_mass=0,
                    molecular_formula=entry[2],
                    carbon_count=extract_carbon_count(entry[2]),
                    charge=entry[3],
                    source=ds,
                )
                m.save()
    except Exception:
        logger.exception('Failed importing BIGG metabolite selections')


def merge_metabolites(apps, m_old, m_canonical):
    Measurement = apps.get_model('main', 'Measurement')
    MetaboliteExchange = apps.get_model('main', 'MetaboliteExchange')
    MetaboliteSpecies = apps.get_model('main', 'MetaboliteSpecies')
    # point objects referencing the old to the canonical
    for x in [Measurement, MetaboliteExchange, MetaboliteSpecies]:
        queryset = x.objects.filter(measurement_type=m_old)
        try:
            with transaction.atomic():
                queryset.update(measurement_type=m_canonical)
        except IntegrityError:
            # at least one  item in queryset already has a link to canonical metabolite
            logger.warning('Model %s already has link with "%s", cannot merge "%s"',
                           x, m_canonical, m_old)
    # MetaboliteKeyword uses different names, cannot be updated, bleh
    m_canonical.keywords.add(*m_old.keywords.all())  # use * to dereference queryset into args list
    m_old.keywords.clear()
    # add molar mass from old record if canonical does not have it
    if not m_canonical.molar_mass and m_old.molar_mass:
        m_canonical.molar_mass = m_old.molar_mass
        m_canonical.save(update_fields=['molar_mass'])
    # remove old reference
    m_old.delete()


def extract_carbon_count(formula):
    count = 0
    for match in carbon_pattern.finditer(formula):
        c = match.group(1)
        count = count + (int(c) if c else 1)
    return count


class Migration(migrations.Migration):

    dependencies = [
        ('main', '0010_add-datasource'),
    ]

    operations = [
        migrations.RunPython(insert_bigg_metabolites),
        migrations.RunPython(fix_manual_metabolites),
    ]
