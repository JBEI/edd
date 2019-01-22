# Generated by Django 2.0.8 on 2018-09-05 21:54

import django.contrib.postgres.fields.jsonb
from django.db import migrations
from itertools import chain


def transfer_metadata(apps, schema_editor):
    """
    Copies HStore-based metadata into new JSONB-based field.
    """
    EDDObject = apps.get_model("main", "EDDObject")
    Measurement = apps.get_model("main", "Measurement")
    to_update = [
        EDDObject.objects.exclude(meta_store={}),
        Measurement.objects.exclude(meta_store={}),
    ]
    for o in chain(*to_update):
        o.metadata = o.meta_store
        o.save()


class Migration(migrations.Migration):

    dependencies = [("main", "0011_categorization_labeling")]

    operations = [
        migrations.AddField(
            model_name="eddobject",
            name="metadata",
            field=django.contrib.postgres.fields.jsonb.JSONField(
                blank=True,
                default=dict,
                help_text="JSON-based metadata dictionary.",
                verbose_name="Metadata",
            ),
        ),
        migrations.AddField(
            model_name="measurement",
            name="metadata",
            field=django.contrib.postgres.fields.jsonb.JSONField(
                blank=True,
                default=dict,
                help_text="JSON-based metadata dictionary.",
                verbose_name="Metadata",
            ),
        ),
        migrations.RunPython(code=transfer_metadata, reverse_code=migrations.RunPython.noop),
    ]