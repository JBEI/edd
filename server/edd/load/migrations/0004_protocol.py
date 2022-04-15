from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ("main", "0004_protocol"),
        ("load", "0003_defaultunit"),
    ]

    operations = [
        migrations.RemoveField(model_name="category", name="protocols"),
    ]
