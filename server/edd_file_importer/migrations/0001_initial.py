# Generated by Django 2.0.10 on 2019-01-22 00:20

import django.contrib.postgres.fields.jsonb
import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    initial = True

    dependencies = [("main", "0011_categorization_labeling")]

    operations = [
        migrations.CreateModel(
            name="BaseImportModel",
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
                    models.CharField(
                        help_text="Name of this object.",
                        max_length=255,
                        verbose_name="Name",
                    ),
                ),
                (
                    "description",
                    models.TextField(
                        blank=True,
                        help_text="Description of this object.",
                        null=True,
                        verbose_name="Description",
                    ),
                ),
                (
                    "active",
                    models.BooleanField(
                        default=True,
                        help_text="Flag showing if this object is active and displayed.",
                        verbose_name="Active",
                    ),
                ),
                (
                    "uuid",
                    models.UUIDField(
                        editable=False,
                        help_text="Unique identifier for this object.",
                        unique=True,
                        verbose_name="UUID",
                    ),
                ),
            ],
        ),
        migrations.CreateModel(
            name="CategoryFormat",
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
                    "display_order",
                    models.PositiveIntegerField(
                        help_text=(
                            "Relative order this format option is displayed in "
                            "under this category"
                        ),
                        verbose_name="Display order",
                    ),
                ),
            ],
            options={"verbose_name_plural": "Import Category Formats"},
        ),
        migrations.CreateModel(
            name="ImportFile",
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
                    "file",
                    models.FileField(
                        help_text="Path to file data.",
                        max_length=255,
                        upload_to="%Y/%m/%d",
                        verbose_name="File Path",
                    ),
                ),
                (
                    "filename",
                    models.CharField(
                        editable=False,
                        help_text="Name of the file.",
                        max_length=255,
                        verbose_name="File Name",
                    ),
                ),
                (
                    "description",
                    models.TextField(
                        blank=True,
                        help_text="Description of file contents.",
                        verbose_name="Description",
                    ),
                ),
                (
                    "mime_type",
                    models.CharField(
                        blank=True,
                        help_text="MIME ContentType of the file.",
                        max_length=255,
                        null=True,
                        verbose_name="MIME",
                    ),
                ),
                (
                    "file_size",
                    models.IntegerField(
                        default=0,
                        editable=False,
                        help_text="Total byte size of the file.",
                        verbose_name="Size",
                    ),
                ),
                (
                    "created",
                    models.ForeignKey(
                        editable=False,
                        help_text="Update used to create the file.",
                        on_delete=django.db.models.deletion.PROTECT,
                        to="main.Update",
                        verbose_name="Created",
                    ),
                ),
            ],
        ),
        migrations.CreateModel(
            name="Import",
            fields=[
                (
                    "meta_store",
                    django.contrib.postgres.fields.jsonb.JSONField(
                        blank=True,
                        default=dict,
                        help_text="Metadata dictionary.",
                        verbose_name="Metadata",
                    ),
                ),
                ("status", models.CharField(default="Created", max_length=10)),
                (
                    "compartment",
                    models.CharField(
                        choices=[
                            ("0", "N/A"),
                            ("1", "Intracellular/Cytosol (Cy)"),
                            ("2", "Extracellular"),
                        ],
                        default="0",
                        help_text="Compartment of the cell for this Measurement.",
                        max_length=1,
                        verbose_name="Compartment",
                    ),
                ),
                (
                    "object_ref",
                    models.OneToOneField(
                        on_delete=django.db.models.deletion.CASCADE,
                        parent_link=True,
                        primary_key=True,
                        related_name="+",
                        serialize=False,
                        to="edd_file_importer.BaseImportModel",
                    ),
                ),
            ],
            bases=("edd_file_importer.baseimportmodel",),
        ),
        migrations.CreateModel(
            name="ImportCategory",
            fields=[
                (
                    "display_order",
                    models.PositiveIntegerField(
                        help_text="Relative order this category is displayed in during import",
                        unique=True,
                        verbose_name="Display order",
                    ),
                ),
                (
                    "default_mtype_group",
                    models.CharField(
                        default="_",
                        help_text=(
                            "The default class of measurement types implied by selection "
                            "of this category during import"
                        ),
                        max_length=15,
                        verbose_name="Default type group",
                    ),
                ),
                (
                    "object_ref",
                    models.OneToOneField(
                        on_delete=django.db.models.deletion.CASCADE,
                        parent_link=True,
                        primary_key=True,
                        related_name="+",
                        serialize=False,
                        to="edd_file_importer.BaseImportModel",
                    ),
                ),
            ],
            options={"verbose_name_plural": "Import categories"},
            bases=("edd_file_importer.baseimportmodel",),
        ),
        migrations.CreateModel(
            name="ImportFormat",
            fields=[
                (
                    "parser_class",
                    models.CharField(
                        help_text="Parser class", max_length=255, verbose_name="Parser"
                    ),
                ),
                (
                    "object_ref",
                    models.OneToOneField(
                        on_delete=django.db.models.deletion.CASCADE,
                        parent_link=True,
                        primary_key=True,
                        related_name="+",
                        serialize=False,
                        to="edd_file_importer.BaseImportModel",
                    ),
                ),
            ],
            bases=("edd_file_importer.baseimportmodel",),
        ),
        migrations.AddField(
            model_name="baseimportmodel",
            name="created",
            field=models.ForeignKey(
                editable=False,
                help_text="Update used to create this object.",
                on_delete=django.db.models.deletion.PROTECT,
                related_name="import_object_created",
                to="main.Update",
                verbose_name="Created",
            ),
        ),
        migrations.AddField(
            model_name="baseimportmodel",
            name="updated",
            field=models.ForeignKey(
                editable=False,
                help_text="Update used to last modify this object.",
                on_delete=django.db.models.deletion.PROTECT,
                related_name="import_object_updated",
                to="main.Update",
                verbose_name="Last Modified",
            ),
        ),
        migrations.AddField(
            model_name="baseimportmodel",
            name="updates",
            field=models.ManyToManyField(
                help_text="List of Update objects logging changes to this object.",
                related_name="_baseimportmodel_updates_+",
                to="main.Update",
                verbose_name="Updates",
            ),
        ),
        migrations.AddField(
            model_name="importcategory",
            name="file_formats",
            field=models.ManyToManyField(
                help_text="Supported input formats for this import category",
                related_name="import_category",
                through="edd_file_importer.CategoryFormat",
                to="edd_file_importer.ImportFormat",
                verbose_name="File formats",
            ),
        ),
        migrations.AddField(
            model_name="importcategory",
            name="protocols",
            field=models.ManyToManyField(
                help_text="Protocols that appear in this import category",
                related_name="import_category",
                to="main.Protocol",
                verbose_name="Protocols",
            ),
        ),
        migrations.AddField(
            model_name="import",
            name="category",
            field=models.ForeignKey(
                help_text="The user-selected data category for this import",
                on_delete=django.db.models.deletion.PROTECT,
                related_name="+",
                to="edd_file_importer.ImportCategory",
                verbose_name="Category",
            ),
        ),
        migrations.AddField(
            model_name="import",
            name="file",
            field=models.ForeignKey(
                on_delete=django.db.models.deletion.CASCADE,
                related_name="import_ref",
                to="edd_file_importer.ImportFile",
            ),
        ),
        migrations.AddField(
            model_name="import",
            name="file_format",
            field=models.ForeignKey(
                help_text="The user-selected file format for this import",
                null=True,
                on_delete=django.db.models.deletion.PROTECT,
                related_name="imports",
                to="edd_file_importer.ImportFormat",
                verbose_name="Format",
            ),
        ),
        migrations.AddField(
            model_name="import",
            name="protocol",
            field=models.ForeignKey(
                help_text="The protocol for imported data",
                on_delete=django.db.models.deletion.PROTECT,
                to="main.Protocol",
                verbose_name="Protocol",
            ),
        ),
        migrations.AddField(
            model_name="import",
            name="study",
            field=models.ForeignKey(
                help_text="The Study containing this Import",
                on_delete=django.db.models.deletion.CASCADE,
                to="main.Study",
                verbose_name="Study",
            ),
        ),
        migrations.AddField(
            model_name="import",
            name="x_units",
            field=models.ForeignKey(
                null=True,
                on_delete=django.db.models.deletion.PROTECT,
                related_name="+",
                to="main.MeasurementUnit",
            ),
        ),
        migrations.AddField(
            model_name="import",
            name="y_units",
            field=models.ForeignKey(
                null=True,
                on_delete=django.db.models.deletion.PROTECT,
                related_name="+",
                to="main.MeasurementUnit",
            ),
        ),
        migrations.AddField(
            model_name="categoryformat",
            name="category",
            field=models.ForeignKey(
                help_text="The category of imported data",
                on_delete=django.db.models.deletion.CASCADE,
                to="edd_file_importer.ImportCategory",
                verbose_name="Category",
            ),
        ),
        migrations.AddField(
            model_name="categoryformat",
            name="format",
            field=models.ForeignKey(
                help_text="The format for imported data",
                on_delete=django.db.models.deletion.CASCADE,
                to="edd_file_importer.ImportFormat",
                verbose_name="Format",
            ),
        ),
        migrations.AlterUniqueTogether(
            name="categoryformat",
            unique_together={("format", "category", "display_order")},
        ),
    ]
