# Generated by Django 2.2.3 on 2019-09-24 22:21

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [("main", "0020_worklist_unique_ordering")]

    operations = [
        migrations.AlterField(
            model_name="measurement",
            name="measurement_format",
            field=models.CharField(
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
                max_length=2,
                verbose_name="Format",
            ),
        )
    ]
