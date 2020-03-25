from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("profile", "0007_use_varchar"),
    ]

    operations = [
        migrations.AddField(
            model_name="userprofile",
            name="approved",
            field=models.BooleanField(
                default=False,
                help_text="Flag showing if this account has been approved for login.",
                verbose_name="Approved",
            ),
        ),
    ]
