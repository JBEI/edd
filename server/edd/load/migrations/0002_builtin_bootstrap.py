from django.db import migrations


def bootstrap(apps, schema_editor):
    # create bootstrap objects
    Layout = apps.get_model("load", "Layout")
    LAYOUT_GENERIC = Layout.objects.create(name="Generic", description="")
    LAYOUT_SKYLINE = Layout.objects.create(name="Skyline", description="")
    LAYOUT_AMBR = Layout.objects.create(name="Ambr", description="")
    ParserMapping = apps.get_model("load", "ParserMapping")
    XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    CSV = "text/csv"
    ParserMapping.objects.create(
        layout=LAYOUT_GENERIC,
        mime_type=XLSX,
        parser_class="edd.load.parsers.GenericExcelParser",
    )
    ParserMapping.objects.create(
        layout=LAYOUT_GENERIC,
        mime_type=CSV,
        parser_class="edd.load.parsers.GenericCsvParser",
    )
    ParserMapping.objects.create(
        layout=LAYOUT_SKYLINE,
        mime_type=XLSX,
        parser_class="edd.load.parsers.SkylineExcelParser",
    )
    ParserMapping.objects.create(
        layout=LAYOUT_SKYLINE,
        mime_type=CSV,
        parser_class="edd.load.parsers.SkylineCsvParser",
    )
    ParserMapping.objects.create(
        layout=LAYOUT_AMBR,
        mime_type=XLSX,
        parser_class="edd.load.parsers.AmbrExcelParser",
    )
    Category = apps.get_model("load", "Category")
    CATEGORY_PROTEOMICS = Category.objects.create(
        name="Proteomics", sort_key=1, type_group="p"
    )
    CATEGORY_METABOLOMICS = Category.objects.create(
        name="Metabolomics", sort_key=2, type_group="m"
    )
    CATEGORY_TRANSCRIPTOMCIS = Category.objects.create(
        name="Transcriptomics", sort_key=3, type_group="g",
    )
    CATEGORY_OTHER = Category.objects.create(name="Other", sort_key=4)
    CategoryLayout = apps.get_model("load", "CategoryLayout")
    CategoryLayout.objects.get_or_create(
        layout=LAYOUT_GENERIC, category=CATEGORY_PROTEOMICS, defaults={"sort_key": 2},
    )
    CategoryLayout.objects.get_or_create(
        layout=LAYOUT_GENERIC, category=CATEGORY_METABOLOMICS, defaults={"sort_key": 1},
    )
    CategoryLayout.objects.get_or_create(
        layout=LAYOUT_GENERIC,
        category=CATEGORY_TRANSCRIPTOMCIS,
        defaults={"sort_key": 3},
    )
    CategoryLayout.objects.get_or_create(
        layout=LAYOUT_GENERIC, category=CATEGORY_OTHER, defaults={"sort_key": 4}
    )
    CategoryLayout.objects.get_or_create(
        layout=LAYOUT_SKYLINE, category=CATEGORY_PROTEOMICS, defaults={"sort_key": 1},
    )


class Migration(migrations.Migration):

    dependencies = [
        ("load", "0001_initial"),
    ]

    operations = [
        migrations.RunPython(code=bootstrap, reverse_code=migrations.RunPython.noop)
    ]
