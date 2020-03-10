from django.db import migrations


def bootstrap(apps, schema_editor):
    # load the Update model, create update for all the following items
    Update = apps.get_model("main", "Update")
    now = Update.objects.create(mod_by_id=1, path=f"!{__name__}", origin="localhost")
    # create bootstrap objects
    Format = apps.get_model("edd_file_importer", "ImportFormat")
    FORMAT_GENERIC = 5
    FORMAT_SKYLINE = 6
    Format.objects.get_or_create(
        pk=FORMAT_GENERIC,
        defaults={
            "name": "Generic",
            "description": "",
            "active": True,
            "created_id": now.pk,
            "updated_id": now.pk,
            "uuid": "0306a2f5-2a25-4546-8fc9-37019c895d39",
        },
    )
    Format.objects.get_or_create(
        pk=FORMAT_SKYLINE,
        defaults={
            "name": "Skyline",
            "description": "",
            "active": True,
            "created_id": now.pk,
            "updated_id": now.pk,
            "uuid": "cf31be5e-456c-43b2-819e-99b68611d7eb",
        },
    )
    Parser = apps.get_model("edd_file_importer", "ImportParser")
    PARSER_GENERIC_EXCEL = 1
    PARSER_GENERIC_CSV = 2
    PARSER_SKYLINE_EXCEL = 3
    PARSER_SKYLINE_CSV = 4
    XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    CSV = "text/csv"
    Parser.objects.get_or_create(
        pk=PARSER_GENERIC_EXCEL,
        defaults={
            "format_id": FORMAT_GENERIC,
            "parser_class": "edd_file_importer.parsers.GenericExcelParser",
            "mime_type": XLSX,
        },
    )
    Parser.objects.get_or_create(
        pk=PARSER_GENERIC_CSV,
        defaults={
            "format_id": FORMAT_GENERIC,
            "parser_class": "edd_file_importer.parsers.GenericCsvParser",
            "mime_type": CSV,
        },
    )
    Parser.objects.get_or_create(
        pk=PARSER_SKYLINE_EXCEL,
        defaults={
            "format_id": FORMAT_SKYLINE,
            "parser_class": "edd_file_importer.parsers.SkylineExcelParser",
            "mime_type": XLSX,
        },
    )
    Parser.objects.get_or_create(
        pk=PARSER_SKYLINE_CSV,
        defaults={
            "format_id": FORMAT_SKYLINE,
            "parser_class": "edd_file_importer.parsers.SkylineCsvParser",
            "mime_type": CSV,
        },
    )
    Category = apps.get_model("edd_file_importer", "ImportCategory")
    CATEGORY_PROTEOMICS = 1
    CATEGORY_METABOLOMICS = 2
    CATEGORY_TRANSCRIPTOMCIS = 3
    CATEGORY_OD = 4
    Category.objects.get_or_create(
        pk=CATEGORY_PROTEOMICS,
        defaults={
            "name": "Proteomics",
            "description": "",
            "active": True,
            "created_id": now.pk,
            "updated_id": now.pk,
            "uuid": "d281089f-9949-4da8-bffd-b3dfa4f16ac1",
            "default_mtype_group": "p",
            "display_order": 1,
        },
    )
    Category.objects.get_or_create(
        pk=CATEGORY_METABOLOMICS,
        defaults={
            "name": "Metabolomics",
            "description": "",
            "active": True,
            "created_id": now.pk,
            "updated_id": now.pk,
            "uuid": "8f550f5c-e8d0-48a6-a433-95ded52189d5",
            "default_mtype_group": "m",
            "display_order": 2,
        },
    )
    Category.objects.get_or_create(
        pk=CATEGORY_TRANSCRIPTOMCIS,
        defaults={
            "name": "Transcriptomics",
            "description": "",
            "active": True,
            "created_id": now.pk,
            "updated_id": now.pk,
            "uuid": "559f7d6e-3c49-4c7d-918d-85b56c0c8402",
            "default_mtype_group": "g",
            "display_order": 3,
        },
    )
    Category.objects.get_or_create(
        pk=CATEGORY_OD,
        defaults={
            "name": "OD",
            "description": "",
            "active": True,
            "created_id": now.pk,
            "updated_id": now.pk,
            "uuid": "d23ec26a-e068-43a3-958d-59e7f1b6a780",
            "default_mtype_group": "_",
            "display_order": 4,
        },
    )
    CategoryFormat = apps.get_model("edd_file_importer", "CategoryFormat")
    CategoryFormat.objects.get_or_create(
        format_id=FORMAT_GENERIC,
        category_id=CATEGORY_PROTEOMICS,
        defaults={"display_order": 2},
    )
    CategoryFormat.objects.get_or_create(
        format_id=FORMAT_GENERIC,
        category_id=CATEGORY_METABOLOMICS,
        defaults={"display_order": 1},
    )
    CategoryFormat.objects.get_or_create(
        format_id=FORMAT_GENERIC,
        category_id=CATEGORY_TRANSCRIPTOMCIS,
        defaults={"display_order": 3},
    )
    CategoryFormat.objects.get_or_create(
        format_id=FORMAT_GENERIC, category_id=CATEGORY_OD, defaults={"display_order": 4}
    )
    CategoryFormat.objects.get_or_create(
        format_id=FORMAT_SKYLINE,
        category_id=CATEGORY_PROTEOMICS,
        defaults={"display_order": 1},
    )


class Migration(migrations.Migration):

    dependencies = [
        ("main", "0002_edd-data-bootstrap"),
        ("edd_file_importer", "0001_initial"),
    ]

    operations = [
        migrations.RunPython(code=bootstrap, reverse_code=migrations.RunPython.noop)
    ]
