# Generated by Django 4.0.7 on 2022-10-11 04:03

import django.db.models.deletion
from django.db import migrations, models

import edd.fields


class Migration(migrations.Migration):

    dependencies = [
        ("main", "0004_protocol"),
        ("load", "0004_protocol"),
    ]

    operations = [
        migrations.AlterModelOptions(
            name="categorylayout",
            options={
                "ordering": ("sort_key",),
                "verbose_name_plural": "Category Layouts",
            },
        ),
        migrations.AlterUniqueTogether(
            name="categorylayout",
            unique_together={("category", "sort_key")},
        ),
        migrations.CreateModel(
            name="CategoryProtocol",
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
                        help_text=(
                            "Relative order this protocol option is displayed "
                            "under this category."
                        ),
                        verbose_name="Display order",
                    ),
                ),
                (
                    "category",
                    models.ForeignKey(
                        help_text="The category for loaded data.",
                        on_delete=django.db.models.deletion.CASCADE,
                        to="load.category",
                        verbose_name="Category",
                    ),
                ),
                (
                    "protocol",
                    models.OneToOneField(
                        help_text="Non-specific protocol for default display",
                        on_delete=django.db.models.deletion.CASCADE,
                        to="main.protocol",
                        verbose_name="Protocol",
                    ),
                ),
            ],
            options={
                "verbose_name_plural": "Category Protocols",
                "ordering": ("sort_key",),
                "unique_together": {("category", "sort_key")},
            },
        ),
        migrations.AddField(
            model_name="category",
            name="protocols",
            field=models.ManyToManyField(
                help_text="Supported non-specific protocols for this category.",
                related_name="load_category",
                through="load.CategoryProtocol",
                to="main.protocol",
                verbose_name="Protocols",
            ),
        ),
        migrations.AlterField(
            model_name="category",
            name="type_group",
            field=edd.fields.VarCharField(
                blank=True,
                choices=[
                    ("broad", "Broad"),
                    ("omics", "Omics"),
                    ("pubchem", "PubChem"),
                ],
                default=None,
                help_text="Constrains measurement types searched during data loading.",
                null=True,
                verbose_name="Measurement type group",
            ),
        ),
    ]
