from django.db import migrations

import edd.fields


class Migration(migrations.Migration):

    dependencies = [("branding", "0004_add_login_welcome")]

    operations = [
        migrations.AlterField(
            model_name="branding",
            name="style_sheet",
            field=edd.fields.FileField(
                blank=True,
                help_text="Custom CSS rules to include for site branding",
                null=True,
                upload_to="",
            ),
        ),
        # NOTE: must manually change FileField columns
        # because Django auto-detector will not register max_length changes
        # see: https://code.djangoproject.com/ticket/25866
        migrations.RunSQL(
            sql="ALTER TABLE branding_branding ALTER COLUMN style_sheet TYPE text;",
            reverse_sql=(
                "ALTER TABLE branding_branding "
                "ALTER COLUMN style_sheet TYPE varchar(255);"
            ),
        ),
    ]
