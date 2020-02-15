from django.db import migrations

import edd.fields


class Migration(migrations.Migration):

    dependencies = [("main", "0021_measurement_format_values")]

    operations = [
        migrations.AlterField(
            model_name="attachment",
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
            sql="ALTER TABLE attachment ALTER COLUMN file TYPE text;",
            reverse_sql="ALTER TABLE attachment ALTER COLUMN file TYPE varchar(255);",
        ),
        migrations.AlterField(
            model_name="attachment",
            name="filename",
            field=edd.fields.VarCharField(
                help_text="Name of attachment file.", verbose_name="File Name"
            ),
        ),
        migrations.AlterField(
            model_name="attachment",
            name="mime_type",
            field=edd.fields.VarCharField(
                blank=True,
                help_text="MIME ContentType of the attachment.",
                null=True,
                verbose_name="MIME",
            ),
        ),
        migrations.AlterField(
            model_name="datasource",
            name="name",
            field=edd.fields.VarCharField(
                help_text="The source used for information on a measurement type.",
                verbose_name="Datasource",
            ),
        ),
        migrations.AlterField(
            model_name="datasource",
            name="url",
            field=edd.fields.VarCharField(
                blank=True,
                default="",
                help_text="URL of the source.",
                verbose_name="URL",
            ),
        ),
        migrations.AlterField(
            model_name="eddobject",
            name="name",
            field=edd.fields.VarCharField(
                help_text="Name of this object.", verbose_name="Name"
            ),
        ),
        migrations.AlterField(
            model_name="everyonepermission",
            name="permission_type",
            field=edd.fields.VarCharField(
                choices=[("N", "None"), ("R", "Read"), ("W", "Write")],
                default="N",
                help_text="Type of permission.",
                verbose_name="Permission",
            ),
        ),
        migrations.AlterField(
            model_name="grouppermission",
            name="permission_type",
            field=edd.fields.VarCharField(
                choices=[("N", "None"), ("R", "Read"), ("W", "Write")],
                default="N",
                help_text="Type of permission.",
                verbose_name="Permission",
            ),
        ),
        migrations.AlterField(
            model_name="measurement",
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
            model_name="measurement",
            name="measurement_format",
            field=edd.fields.VarCharField(
                choices=[
                    ("0", "scalar"),
                    ("1", "vector"),
                    ("2", "histogram (deprecated)"),
                    ("3", "sigma"),
                    ("4", "range"),
                    ("5", "vector range"),
                    ("6", "packed"),
                    ("7", "histogram"),
                    ("8", "stepped histogram"),
                ],
                default="0",
                help_text="Enumeration of value formats for this Measurement.",
                verbose_name="Format",
            ),
        ),
        migrations.AlterField(
            model_name="measurementtype",
            name="short_name",
            field=edd.fields.VarCharField(
                blank=True,
                help_text="(DEPRECATED) Short name used in SBML output.",
                null=True,
                verbose_name="Short Name",
            ),
        ),
        migrations.AlterField(
            model_name="measurementtype",
            name="type_group",
            field=edd.fields.VarCharField(
                choices=[
                    ("_", "Generic"),
                    ("m", "Metabolite"),
                    ("g", "Gene Identifier"),
                    ("p", "Protein Identifier"),
                    ("h", "Phosphor"),
                ],
                default="_",
                help_text="Class of data for this Measurement Type.",
                verbose_name="Type Group",
            ),
        ),
        migrations.AlterField(
            model_name="measurementtype",
            name="type_name",
            field=edd.fields.VarCharField(
                help_text="Name of this Measurement Type.",
                verbose_name="Measurement Type",
            ),
        ),
        migrations.AlterField(
            model_name="measurementunit",
            name="alternate_names",
            field=edd.fields.VarCharField(
                blank=True,
                help_text="Alternative names for the unit.",
                null=True,
                verbose_name="Alternate Names",
            ),
        ),
        migrations.AlterField(
            model_name="measurementunit",
            name="type_group",
            field=edd.fields.VarCharField(
                choices=[
                    ("_", "Generic"),
                    ("m", "Metabolite"),
                    ("g", "Gene Identifier"),
                    ("p", "Protein Identifier"),
                    ("h", "Phosphor"),
                ],
                default="_",
                help_text="Type of measurement for which this unit is used.",
                verbose_name="Group",
            ),
        ),
        migrations.AlterField(
            model_name="measurementunit",
            name="unit_name",
            field=edd.fields.VarCharField(
                help_text="Name for unit of measurement.",
                unique=True,
                verbose_name="Name",
            ),
        ),
        migrations.AlterField(
            model_name="metabolitespecies",
            name="short_code",
            field=edd.fields.VarCharField(
                blank=True,
                default="",
                help_text="Short code used for a species in the model.",
                null=True,
                verbose_name="Short Code",
            ),
        ),
        migrations.AlterField(
            model_name="metadatagroup",
            name="group_name",
            field=edd.fields.VarCharField(
                help_text="Name of the group/class of metadata.",
                unique=True,
                verbose_name="Group Name",
            ),
        ),
        migrations.AlterField(
            model_name="metadatatype",
            name="default_value",
            field=edd.fields.VarCharField(
                blank=True,
                help_text="Default value for this Metadata Type.",
                verbose_name="Default Value",
            ),
        ),
        migrations.AlterField(
            model_name="metadatatype",
            name="for_context",
            field=edd.fields.VarCharField(
                choices=[("S", "Study"), ("L", "Line"), ("A", "Assay")],
                help_text="Type of EDD Object this Metadata Type may be added to.",
                verbose_name="Context",
            ),
        ),
        migrations.AlterField(
            model_name="metadatatype",
            name="input_type",
            field=edd.fields.VarCharField(
                blank=True,
                help_text="Type of input fields for values of this Metadata Type.",
                null=True,
                verbose_name="Input Type",
            ),
        ),
        migrations.AlterField(
            model_name="metadatatype",
            name="postfix",
            field=edd.fields.VarCharField(
                blank=True,
                help_text="Postfix text appearing after values of this Metadata Type.",
                verbose_name="Postfix",
            ),
        ),
        migrations.AlterField(
            model_name="metadatatype",
            name="prefix",
            field=edd.fields.VarCharField(
                blank=True,
                help_text="Prefix text appearing before values of this Metadata Type.",
                verbose_name="Prefix",
            ),
        ),
        migrations.AlterField(
            model_name="metadatatype",
            name="type_field",
            field=edd.fields.VarCharField(
                blank=True,
                default=None,
                help_text=(
                    "Model field where metadata is stored; "
                    "blank stores in metadata dictionary."
                ),
                null=True,
                verbose_name="Field Name",
            ),
        ),
        migrations.AlterField(
            model_name="metadatatype",
            name="type_i18n",
            field=edd.fields.VarCharField(
                blank=True,
                help_text="i18n key used for naming this Metadata Type.",
                null=True,
                verbose_name="i18n Key",
            ),
        ),
        migrations.AlterField(
            model_name="metadatatype",
            name="type_name",
            field=edd.fields.VarCharField(
                help_text="Name for Metadata Type", verbose_name="Name"
            ),
        ),
        migrations.AlterField(
            model_name="protocol",
            name="categorization",
            field=edd.fields.VarCharField(
                choices=[
                    ("NA", "None"),
                    ("OD", "Optical Density"),
                    ("HPLC", "HPLC"),
                    ("LCMS", "LCMS"),
                    ("RAMOS", "RAMOS"),
                    ("TPOMICS", "Transcriptomics / Proteomics"),
                ],
                default="NA",
                help_text="SBML category for this Protocol.",
                verbose_name="SBML Category",
            ),
        ),
        migrations.AlterField(
            model_name="userpermission",
            name="permission_type",
            field=edd.fields.VarCharField(
                choices=[("N", "None"), ("R", "Read"), ("W", "Write")],
                default="N",
                help_text="Type of permission.",
                verbose_name="Permission",
            ),
        ),
        migrations.AlterField(
            model_name="worklistcolumn",
            name="default_value",
            field=edd.fields.VarCharField(
                blank=True,
                help_text="Default value for this column.",
                null=True,
                verbose_name="Default Value",
            ),
        ),
        migrations.AlterField(
            model_name="worklistcolumn",
            name="heading",
            field=edd.fields.VarCharField(
                blank=True,
                help_text="Column header text.",
                null=True,
                verbose_name="Heading",
            ),
        ),
    ]
