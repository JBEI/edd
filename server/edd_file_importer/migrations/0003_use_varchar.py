from django.db import migrations

import edd.fields


class Migration(migrations.Migration):

    dependencies = [("edd_file_importer", "0002_import_data_bootstrap")]

    operations = [
        migrations.AlterField(
            model_name="baseimportmodel",
            name="name",
            field=edd.fields.VarCharField(
                help_text="Name of this object.", verbose_name="Name"
            ),
        ),
        migrations.AlterField(
            model_name="import",
            name="compartment",
            field=edd.fields.VarCharField(
                choices=[
                    ("0", "N/A"),
                    ("1", "Intracellular/Cytosol (Cy)"),
                    ("2", "Extracellular"),
                ],
                default="0",
                help_text="Compartment of the cell for this Measurement.",
                verbose_name="Compartment",
            ),
        ),
        migrations.AlterField(
            model_name="import",
            name="status",
            field=edd.fields.VarCharField(default="Created"),
        ),
        migrations.AlterField(
            model_name="importcategory",
            name="default_mtype_group",
            field=edd.fields.VarCharField(
                default="_",
                help_text=(
                    "The default class of measurement types "
                    "implied by selection of this category during import"
                ),
                verbose_name="Default type group",
            ),
        ),
        migrations.AlterField(
            model_name="importfile",
            name="file",
            field=edd.fields.FileField(
                help_text="Path to file data.",
                upload_to="%Y/%m/%d",
                verbose_name="File Path",
            ),
        ),
        # NOTE: must manually change FileField columns
        # because Django auto-detector will not register max_length changes
        # see: https://code.djangoproject.com/ticket/25866
        migrations.RunSQL(
            sql=(
                "ALTER TABLE edd_file_importer_importfile "
                "ALTER COLUMN file TYPE text;"
            ),
            reverse_sql=(
                "ALTER TABLE edd_file_importer_importfile "
                "ALTER COLUMN file TYPE varchar(255);"
            ),
        ),
        migrations.AlterField(
            model_name="importfile",
            name="filename",
            field=edd.fields.VarCharField(
                editable=False, help_text="Name of the file.", verbose_name="File Name"
            ),
        ),
        migrations.AlterField(
            model_name="importfile",
            name="mime_type",
            field=edd.fields.VarCharField(
                blank=True,
                help_text="MIME ContentType of the file.",
                null=True,
                verbose_name="MIME",
            ),
        ),
        migrations.AlterField(
            model_name="importparser",
            name="mime_type",
            field=edd.fields.VarCharField(
                help_text="Mime type", verbose_name="Mime type"
            ),
        ),
        migrations.AlterField(
            model_name="importparser",
            name="parser_class",
            field=edd.fields.VarCharField(
                help_text="Parser class", verbose_name="Parser"
            ),
        ),
    ]
