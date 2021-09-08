from django.conf import settings
from django.contrib.auth.models import UserManager
from django.contrib.auth.validators import UnicodeUsernameValidator
from django.db import migrations, models
from django.utils import timezone

from edd.fields import VarCharField

from ..models import UserManager as ProfileUserManager


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
        ("auth", "0011_update_proxy_permissions"),
    ]

    operations = [
        migrations.CreateModel(
            name="User",
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
                ("password", models.CharField(max_length=128, verbose_name="password")),
                (
                    "last_login",
                    models.DateTimeField(
                        blank=True, null=True, verbose_name="last login"
                    ),
                ),
                (
                    "is_superuser",
                    models.BooleanField(
                        default=False,
                        help_text="Designates that this user has all permissions "
                        "without explicitly assigning them.",
                        verbose_name="superuser status",
                    ),
                ),
                (
                    "username",
                    models.CharField(
                        error_messages={
                            "unique": "A user with that username already exists."
                        },
                        help_text="Required. 150 characters or fewer. "
                        "Letters, digits and @/./+/-/_ only.",
                        max_length=150,
                        unique=True,
                        validators=[UnicodeUsernameValidator()],
                        verbose_name="username",
                    ),
                ),
                (
                    "first_name",
                    models.CharField(
                        blank=True, max_length=150, verbose_name="first name"
                    ),
                ),
                (
                    "last_name",
                    models.CharField(
                        blank=True, max_length=150, verbose_name="last name"
                    ),
                ),
                (
                    "email",
                    models.EmailField(
                        blank=True, max_length=254, verbose_name="email address"
                    ),
                ),
                (
                    "is_staff",
                    models.BooleanField(
                        default=False,
                        help_text="Designates whether the user can log into this admin site.",
                        verbose_name="staff status",
                    ),
                ),
                (
                    "is_active",
                    models.BooleanField(
                        default=True,
                        help_text="Designates whether this user should be treated as active. "
                        "Unselect this instead of deleting accounts.",
                        verbose_name="active",
                    ),
                ),
                (
                    "date_joined",
                    models.DateTimeField(
                        default=timezone.now, verbose_name="date joined"
                    ),
                ),
                (
                    "groups",
                    models.ManyToManyField(
                        blank=True,
                        help_text="The groups this user belongs to. "
                        "A user will get all permissions granted to each of their groups.",
                        related_name="user_set",
                        related_query_name="user",
                        to="auth.Group",
                        verbose_name="groups",
                    ),
                ),
                (
                    "user_permissions",
                    models.ManyToManyField(
                        blank=True,
                        help_text="Specific permissions for this user.",
                        related_name="user_set",
                        related_query_name="user",
                        to="auth.Permission",
                        verbose_name="user permissions",
                    ),
                ),
            ],
            options={"db_table": "auth_user"},
            managers=[("profiles", ProfileUserManager()), ("objects", UserManager())],
        ),
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
                ("preferences", models.JSONField(blank=True, default=dict),),
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
