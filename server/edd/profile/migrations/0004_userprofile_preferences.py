# Generated by Django 2.0.8 on 2018-10-08 18:32

from django.db import migrations, models

from edd.utilities import JSONDecoder


def transfer_preferences(apps, schema_editor):
    """
    Copies HStore-based metadata into new JSONB-based field.
    """
    UserProfile = apps.get_model("profile", "UserProfile")
    for p in UserProfile.objects.exclude(prefs={}):
        # copy over preferences
        p.preferences = p.prefs
        # loop over keys, and cast JSON-strings back to JSON-objects
        for key, value in p.preferences.items():
            p.preferences[key] = JSONDecoder.loads(value)
        p.save()


class Migration(migrations.Migration):

    dependencies = [("profile", "0003_usertask")]

    operations = [
        migrations.AddField(
            model_name="userprofile",
            name="preferences",
            field=models.JSONField(blank=True, default=dict),
        ),
        migrations.RunPython(
            code=transfer_preferences, reverse_code=migrations.RunPython.noop
        ),
    ]
