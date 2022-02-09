from django.db import migrations


def extract_metadata(obj, metatype):
    # see similar implementation in main/models/metadata.py#EDDMetadata.metadata_get()
    # some older/HSTORE metadata added with string-cast ID instead of numeric
    value = obj.metadata.get(f"{metatype.pk}", "")
    return obj.metadata.get(metatype.pk, value)


def set_metadata(obj, metatype, value):
    # remove any existing value
    obj.metadata.pop(f"{metatype.pk}", None)
    obj.metadata.pop(metatype.pk, None)
    # set new value
    obj.metadata[metatype.pk] = value


def stringify_carbon_source(cs):
    cs_elements = [cs.name, cs.description]
    if cs.labeling:
        cs_elements.append(f"Labeling: {cs.labeling}")
    # newline separate any text that exists
    return "\n".join(filter(bool, cs_elements))


def merge_to_media(apps, schema_editor):
    """
    Migration step that will merge the CarbonSource table and the
    "Carbon Source (workaround)" metadata, into the "Media" metadata.
    The values merge with newlines between any existing values, and
    renders the CarbonSource table as a line each for name, description,
    and labeling fields.
    """
    Line = apps.get_model("main", "Line")
    MetadataType = apps.get_model("main", "MetadataType")
    media = MetadataType.objects.get(uuid="463546e4-a67e-4471-a278-9464e78dbc9d")
    # first move the table data
    qs = Line.objects.filter(carbon_source__isnull=False)
    qs = qs.prefetch_related("carbon_source")
    for line in qs:
        media_def = [stringify_carbon_source(cs) for cs in line.carbon_source.all()]
        media_def.insert(0, extract_metadata(line, media))
        set_metadata(line, media, "\n".join(filter(bool, media_def)))
        line.carbon_source.clear()
        line.save()
    # next move workaround data
    try:
        workaround = MetadataType.objects.get(
            uuid="814ab824-3cda-49cb-b838-904236720041"
        )
        qs = Line.objects.filter(metadata__has_key=f"{workaround.pk}")
        for line in qs:
            media_def = [
                extract_metadata(line, media),
                extract_metadata(line, workaround),
            ]
            set_metadata(line, media, "\n".join(filter(bool, media_def)))
            line.save()
        workaround.delete()
    except MetadataType.DoesNotExist:
        # don't care about merging if the type does not exist anyway
        pass
    # delete the built-in metadata
    MetadataType.objects.filter(uuid="4ddaf92a-1623-4c30-aa61-4f7407acfacc").delete()


class Migration(migrations.Migration):

    dependencies = [
        ("main", "0002_metadatatype_description"),
    ]

    operations = [
        migrations.RunPython(
            code=merge_to_media, reverse_code=migrations.RunPython.noop
        ),
        migrations.RemoveField(model_name="line", name="carbon_source",),
        migrations.DeleteModel(name="CarbonSource",),
    ]
