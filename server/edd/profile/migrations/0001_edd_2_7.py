from django.conf import settings
from django.contrib.postgres.fields import jsonb
from django.db import migrations, models

from edd.fields import VarCharField


class Migration(migrations.Migration):

    replaces = [
        ("profile", "0001_initial"),
        ("profile", "0002_auto_20150729_1523"),
        ("profile", "0003_usertask"),
        ("profile", "0004_userprofile_preferences"),
        ("profile", "0005_remove_hstore"),
        ("profile", "0006_remove_usertask"),
        ("profile", "0007_use_varchar"),
        ("profile", "0008_add_approval_flag"),
        ("profile", "0009_add_institution_order"),
    ]

    initial = True

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name="Institution",
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
                ("institution_name", VarCharField()),
                ("description", models.TextField(blank=True, null=True)),
            ],
            options={"db_table": "profile_institution"},
        ),
        migrations.CreateModel(
            name="InstitutionID",
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
                ("identifier", VarCharField(blank=True, null=True)),
                (
                    "sort_key",
                    models.PositiveIntegerField(
                        help_text="Relative order this Institution is displayed in a UserProfile.",
                        verbose_name="Display order",
                    ),
                ),
                (
                    "institution",
                    models.ForeignKey(
                        on_delete=models.deletion.CASCADE, to="profile.Institution",
                    ),
                ),
            ],
            options={"db_table": "profile_institution_user"},
        ),
        migrations.CreateModel(
            name="UserProfile",
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
                ("initials", VarCharField(blank=True, null=True)),
                ("description", models.TextField(blank=True, null=True)),
                ("preferences", jsonb.JSONField(blank=True, default=dict),),
                (
                    "approved",
                    models.BooleanField(
                        default=False,
                        help_text="Flag showing if this account has been approved for login.",
                        verbose_name="Approved",
                    ),
                ),
                (
                    "institutions",
                    models.ManyToManyField(
                        through="profile.InstitutionID", to="profile.Institution"
                    ),
                ),
                (
                    "user",
                    models.OneToOneField(
                        on_delete=models.deletion.CASCADE, to=settings.AUTH_USER_MODEL,
                    ),
                ),
            ],
            options={"db_table": "profile_user"},
        ),
        migrations.AddField(
            model_name="institutionid",
            name="profile",
            field=models.ForeignKey(
                on_delete=models.deletion.CASCADE, to="profile.UserProfile"
            ),
        ),
        migrations.AddConstraint(
            model_name="institutionid",
            constraint=models.UniqueConstraint(
                fields=("profile", "sort_key"), name="profile_institution_ordering_idx"
            ),
        ),
    ]
