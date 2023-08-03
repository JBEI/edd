import django.db.models.deletion
from django.db import migrations, models

import edd.fields


class Migration(migrations.Migration):
    initial = True

    dependencies = [
        ("main", "0001_edd_2_7"),
    ]

    operations = [
        migrations.CreateModel(
            name="Category",
            fields=[
                (
                    "id",
                    models.AutoField(
                        auto_created=True,
                        primary_key=True,
                        serialize=False,
                        verbose_name="ID",
                    ),
                ),
                (
                    "name",
                    edd.fields.VarCharField(
                        help_text="Name of this loading category.", verbose_name="Name"
                    ),
                ),
                (
                    "type_group",
                    edd.fields.VarCharField(
                        blank=True,
                        choices=[
                            ("_", "Generic"),
                            ("m", "Metabolite"),
                            ("g", "Gene Identifier"),
                            ("p", "Protein Identifier"),
                            ("h", "Phosphor"),
                        ],
                        default=None,
                        help_text="Constrains measurement types searched during data loading.",
                        null=True,
                        verbose_name="Measurement type group",
                    ),
                ),
                (
                    "sort_key",
                    models.PositiveIntegerField(
                        help_text="Relative order this category is displayed during load.",
                        unique=True,
                        verbose_name="Display order",
                    ),
                ),
            ],
            options={"ordering": ("sort_key",), "verbose_name_plural": "Categories"},
        ),
        migrations.CreateModel(
            name="Layout",
            fields=[
                (
                    "id",
                    models.AutoField(
                        auto_created=True,
                        primary_key=True,
                        serialize=False,
                        verbose_name="ID",
                    ),
                ),
                (
                    "name",
                    edd.fields.VarCharField(
                        help_text="Name of this file layout.", verbose_name="Name"
                    ),
                ),
                (
                    "description",
                    models.TextField(
                        blank=True,
                        help_text="Description of the file layout.",
                        null=True,
                        verbose_name="Description",
                    ),
                ),
            ],
        ),
        migrations.CreateModel(
            name="CategoryLayout",
            fields=[
                (
                    "id",
                    models.AutoField(
                        auto_created=True,
                        primary_key=True,
                        serialize=False,
                        verbose_name="ID",
                    ),
                ),
                (
                    "sort_key",
                    models.PositiveIntegerField(
                        help_text="Relative order this layout option is displayed "
                        "under this category.",
                        verbose_name="Display order",
                    ),
                ),
                (
                    "category",
                    models.ForeignKey(
                        help_text="The category for loaded data.",
                        on_delete=django.db.models.deletion.CASCADE,
                        to="load.Category",
                        verbose_name="Category",
                    ),
                ),
                (
                    "layout",
                    models.ForeignKey(
                        help_text="The layout for loaded data.",
                        on_delete=django.db.models.deletion.CASCADE,
                        to="load.Layout",
                        verbose_name="Layout",
                    ),
                ),
            ],
            options={
                "ordering": ("layout", "category", "sort_key"),
                "unique_together": {("layout", "category", "sort_key")},
                "verbose_name_plural": "Category Layouts",
            },
        ),
        migrations.AddField(
            model_name="category",
            name="layouts",
            field=models.ManyToManyField(
                help_text="Supported input layouts for this load category.",
                related_name="load_category",
                through="load.CategoryLayout",
                to="load.Layout",
                verbose_name="File layouts",
            ),
        ),
        migrations.AddField(
            model_name="category",
            name="protocols",
            field=models.ManyToManyField(
                help_text="Protocols that appear in this load category.",
                related_name="load_category",
                to="main.Protocol",
                verbose_name="Protocols",
            ),
        ),
        migrations.CreateModel(
            name="ParserMapping",
            fields=[
                (
                    "id",
                    models.AutoField(
                        auto_created=True,
                        primary_key=True,
                        serialize=False,
                        verbose_name="ID",
                    ),
                ),
                (
                    "mime_type",
                    edd.fields.VarCharField(
                        help_text="Mime type", verbose_name="Mime type"
                    ),
                ),
                (
                    "parser_class",
                    edd.fields.VarCharField(
                        help_text="Parser class", verbose_name="Parser"
                    ),
                ),
                (
                    "layout",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="parsers",
                        to="load.Layout",
                    ),
                ),
            ],
            options={
                "verbose_name_plural": "Parsers",
                "unique_together": {("layout", "mime_type")},
            },
        ),
    ]
