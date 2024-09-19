import django.core.validators
import django.db.models.deletion
from django.db import migrations, models

import edd.fields


def bootstrap_type(apps, schema_editor):
    AppType = apps.get_model("profile", "AppType")
    AppType.objects.create(display="ICE", driver="edd.search.registry.StrainRegistry")


def copy_institutionid_ordering(apps, schema_editor):
    InstitutionID = apps.get_model("profile", "InstitutionID")
    UserProfile = apps.get_model("profile", "UserProfile")
    for p in UserProfile.objects.all():
        iids_qs = InstitutionID.objects.filter(profile=p).order_by("sort_key")
        keys = iids_qs.values_list("pk", flat=True)
        p.set_institutionid_order(keys)


class Migration(migrations.Migration):
    dependencies = [
        ("main", "0007_drop_phosphor"),
        ("profile", "0002_userprofile_display_name"),
    ]

    operations = [
        migrations.CreateModel(
            name="AppLink",
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
                    "comment",
                    edd.fields.VarCharField(blank=True, null=True, verbose_name="Comment"),
                ),
                (
                    "secret_id",
                    edd.fields.VarCharField(blank=True, null=True, verbose_name="Secret ID"),
                ),
                ("secret", edd.fields.VarCharField(verbose_name="Secret")),
                (
                    "url",
                    edd.fields.VarCharField(
                        validators=[django.core.validators.URLValidator],
                        verbose_name="URL",
                    ),
                ),
            ],
            options={
                "db_table": "profile_applink",
            },
        ),
        migrations.CreateModel(
            name="AppType",
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
                ("display", edd.fields.VarCharField(verbose_name="Display")),
                ("driver", edd.fields.VarCharField(verbose_name="Driver")),
            ],
            options={
                "db_table": "profile_apptype",
            },
        ),
        migrations.RemoveConstraint(
            model_name="institutionid",
            name="profile_institution_ordering_idx",
        ),
        migrations.AlterOrderWithRespectTo(
            name="institutionid",
            order_with_respect_to="profile",
        ),
        migrations.RunPython(
            code=copy_institutionid_ordering,
            reverse_code=migrations.RunPython.noop,
        ),
        migrations.AddField(
            model_name="applink",
            name="created",
            field=models.ForeignKey(
                editable=False,
                on_delete=django.db.models.deletion.PROTECT,
                related_name="applinks",
                to="main.update",
                verbose_name="Created",
            ),
        ),
        migrations.AddField(
            model_name="applink",
            name="profile",
            field=models.ForeignKey(
                on_delete=django.db.models.deletion.CASCADE,
                related_name="applinks",
                to="profile.userprofile",
            ),
        ),
        migrations.AddField(
            model_name="applink",
            name="apptype",
            field=models.ForeignKey(
                on_delete=django.db.models.deletion.CASCADE,
                related_name="+",
                to="profile.apptype",
                verbose_name="App Type",
            ),
        ),
        migrations.RemoveField(
            model_name="institutionid",
            name="sort_key",
        ),
        migrations.AlterOrderWithRespectTo(
            name="applink",
            order_with_respect_to="profile",
        ),
        migrations.RunPython(
            code=bootstrap_type,
            reverse_code=migrations.RunPython.noop,
        ),
    ]
