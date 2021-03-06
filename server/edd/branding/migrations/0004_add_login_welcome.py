# Generated by Django 2.0.13 on 2019-07-08 18:50

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [("branding", "0003_fix-branding-defaults")]

    operations = [
        migrations.AddField(
            model_name="branding",
            name="login_welcome",
            field=models.TextField(
                blank=True,
                help_text="Login welcome message HTML displayed with the login page",
                null=True,
            ),
        ),
        migrations.AlterField(
            model_name="branding",
            name="favicon_file",
            field=models.ImageField(
                help_text="Image file returned for site favicon",
                null=True,
                upload_to="",
            ),
        ),
        migrations.AlterField(
            model_name="branding",
            name="logo_file",
            field=models.ImageField(
                help_text="Image file for institution logo shown next to EDD logo in navbar",
                null=True,
                upload_to="",
            ),
        ),
        migrations.AlterField(
            model_name="branding",
            name="logo_name",
            field=models.TextField(
                default="EDD",
                help_text="Alt text for the institution logo displayed in navbar",
            ),
        ),
        migrations.AlterField(
            model_name="branding",
            name="style_sheet",
            field=models.FileField(
                blank=True,
                help_text="Custom CSS rules to include for site branding",
                null=True,
                upload_to="",
            ),
        ),
    ]
