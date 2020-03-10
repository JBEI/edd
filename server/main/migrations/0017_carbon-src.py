import logging

from django.db import migrations

logger = logging.getLogger(__name__)


def migrate_carbon_src(apps, schema_editor):
    """
    Add a new MetadataType to capture carbon source data used as a workaround for the broken
    CarbonSource data model
    """
    #
    MetadataType = apps.get_model("main", "MetadataType")
    Line = apps.get_model("main", "Line")

    carbon_source_defaults = dict(
        for_context="L",
        type_i18n="main.models.Line.carbon_src_workaround",
        type_name="Carbon Sources (Workaround)",
    )
    workaround_mtype, _created = MetadataType.objects.get_or_create(
        uuid="814ab824-3cda-49cb-b838-904236720041", defaults=carbon_source_defaults
    )

    # get the existing MetadataType that's been used as a workaround
    field_ref_type = MetadataType.objects.get(
        type_name="Carbon Source(s)", for_context="L"
    )
    field_ref_key = str(field_ref_type.pk)
    new_key = str(workaround_mtype.pk)

    # migrate arbitrary strings stored using the model-referencing MetadataType to use the new
    # type.  This enables us to hide the variant that references the model field.
    lines = Line.objects.filter(metadata__has_key=str(field_ref_type.pk))
    for line in lines:

        # directly edit metadata dict to avoid use of multiple layers of methods from
        # EDDMetadata that aren't returned by apps.get_model()
        line.metadata[new_key] = line.metadata[field_ref_key]
        del line.metadata[field_ref_key]
        line.save(update_fields=["metadata"])


class Migration(migrations.Migration):

    dependencies = [("main", "0016_permission-refactor")]

    operations = [
        migrations.RunPython(
            code=migrate_carbon_src, reverse_code=migrations.RunPython.noop
        )
    ]
