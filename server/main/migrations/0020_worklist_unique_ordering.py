# Generated by Django 2.2.3 on 2019-09-24 22:17

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [("main", "0019_remove_metadata_size_and_class")]

    operations = [
        migrations.AlterField(
            model_name="worklistcolumn",
            name="ordering",
            field=models.IntegerField(
                blank=True,
                help_text="Order this column will appear in worklist export.",
                null=True,
                verbose_name="Ordering",
            ),
        ),
        migrations.AddConstraint(
            model_name="worklistcolumn",
            constraint=models.UniqueConstraint(
                condition=models.Q(ordering__isnull=False),
                fields=("ordering", "template"),
                name="unique_column_ordering",
            ),
        ),
    ]
