# Generated by Django 2.0.13 on 2019-03-12 22:12

import django.contrib.postgres.fields
import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models

import edd.fields
import main.models.core
import main.models.permission


class Migration(migrations.Migration):

    initial = True

    dependencies = [
        ("main", "0001_edd_2_7"),
        ("auth", "0009_alter_user_last_name_max_length"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name="Campaign",
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
                    "uuid",
                    models.UUIDField(
                        editable=False,
                        help_text="Unique identifier for this Campaign.",
                        unique=True,
                        verbose_name="UUID",
                    ),
                ),
                (
                    "name",
                    edd.fields.VarCharField(
                        help_text="Name of this Campaign.",
                        max_length=255,
                        verbose_name="Name",
                    ),
                ),
                (
                    "description",
                    models.TextField(
                        blank=True,
                        help_text="Description of this Campaign.",
                        null=True,
                        verbose_name="Description",
                    ),
                ),
                (
                    "slug",
                    models.SlugField(
                        help_text="Slug text used in links to this Campaign.",
                        null=True,
                        unique=True,
                        verbose_name="Slug",
                    ),
                ),
                (
                    "created",
                    models.ForeignKey(
                        editable=False,
                        help_text="Update used to create this Campaign.",
                        on_delete=django.db.models.deletion.PROTECT,
                        related_name="+",
                        to="main.Update",
                        verbose_name="Created",
                    ),
                ),
            ],
            bases=(main.models.core.SlugMixin, models.Model),
        ),
        migrations.CreateModel(
            name="CampaignMembership",
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
                    "status",
                    models.CharField(
                        choices=[
                            ("a", "Active"),
                            ("c", "Complete"),
                            ("z", "Abandoned"),
                        ],
                        default="a",
                        help_text="Status of a Study in the linked Campaign.",
                        max_length=8,
                    ),
                ),
                (
                    "campaign",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        to="campaign.Campaign",
                    ),
                ),
                (
                    "study",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE, to="main.Study"
                    ),
                ),
            ],
        ),
        migrations.CreateModel(
            name="EveryonePermission",
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
                    "study_permission",
                    models.CharField(
                        choices=[("N", "None"), ("R", "Read"), ("W", "Write")],
                        default="N",
                        help_text="Type of permission applied to Studies linked to Campaign.",
                        max_length=8,
                        verbose_name="Study Permission",
                    ),
                ),
                (
                    "campaign_permission",
                    models.CharField(
                        choices=[("N", "None"), ("R", "Read"), ("W", "Write")],
                        default="N",
                        help_text="Permission for read/write on the Campaign itself.",
                        max_length=8,
                        verbose_name="Campaign Permission",
                    ),
                ),
                (
                    "link_permissions",
                    django.contrib.postgres.fields.ArrayField(
                        base_field=models.TextField(),
                        default=list,
                        help_text="Additional permissions applying to this Campaign.",
                        size=None,
                        verbose_name="Additional Flags",
                    ),
                ),
                (
                    "campaign",
                    models.ForeignKey(
                        help_text="Campaign this permission applies to.",
                        on_delete=django.db.models.deletion.CASCADE,
                        to="campaign.Campaign",
                        verbose_name="Campaign",
                    ),
                ),
            ],
            options={"abstract": False},
            bases=(
                main.models.permission.EveryoneMixin,
                main.models.permission.Permission,
                models.Model,
            ),
        ),
        migrations.CreateModel(
            name="GroupPermission",
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
                    "study_permission",
                    models.CharField(
                        choices=[("N", "None"), ("R", "Read"), ("W", "Write")],
                        default="N",
                        help_text="Type of permission applied to Studies linked to Campaign.",
                        max_length=8,
                        verbose_name="Study Permission",
                    ),
                ),
                (
                    "campaign_permission",
                    models.CharField(
                        choices=[("N", "None"), ("R", "Read"), ("W", "Write")],
                        default="N",
                        help_text="Permission for read/write on the Campaign itself.",
                        max_length=8,
                        verbose_name="Campaign Permission",
                    ),
                ),
                (
                    "link_permissions",
                    django.contrib.postgres.fields.ArrayField(
                        base_field=models.TextField(),
                        default=list,
                        help_text="Additional permissions applying to this Campaign.",
                        size=None,
                        verbose_name="Additional Flags",
                    ),
                ),
                (
                    "campaign",
                    models.ForeignKey(
                        help_text="Campaign this permission applies to.",
                        on_delete=django.db.models.deletion.CASCADE,
                        to="campaign.Campaign",
                        verbose_name="Campaign",
                    ),
                ),
                (
                    "group",
                    models.ForeignKey(
                        help_text="Group this permission applies to.",
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="+",
                        to="auth.Group",
                        verbose_name="Group",
                    ),
                ),
            ],
            options={"abstract": False},
            bases=(main.models.permission.Permission, models.Model),
        ),
        migrations.CreateModel(
            name="UserPermission",
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
                    "study_permission",
                    models.CharField(
                        choices=[("N", "None"), ("R", "Read"), ("W", "Write")],
                        default="N",
                        help_text="Type of permission applied to Studies linked to Campaign.",
                        max_length=8,
                        verbose_name="Study Permission",
                    ),
                ),
                (
                    "campaign_permission",
                    models.CharField(
                        choices=[("N", "None"), ("R", "Read"), ("W", "Write")],
                        default="N",
                        help_text="Permission for read/write on the Campaign itself.",
                        max_length=8,
                        verbose_name="Campaign Permission",
                    ),
                ),
                (
                    "link_permissions",
                    django.contrib.postgres.fields.ArrayField(
                        base_field=models.TextField(),
                        default=list,
                        help_text="Additional permissions applying to this Campaign.",
                        size=None,
                        verbose_name="Additional Flags",
                    ),
                ),
                (
                    "campaign",
                    models.ForeignKey(
                        help_text="Campaign this permission applies to.",
                        on_delete=django.db.models.deletion.CASCADE,
                        to="campaign.Campaign",
                        verbose_name="Campaign",
                    ),
                ),
                (
                    "user",
                    models.ForeignKey(
                        help_text="User this permission applies to.",
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="+",
                        to=settings.AUTH_USER_MODEL,
                        verbose_name="User",
                    ),
                ),
            ],
            options={"abstract": False},
            bases=(main.models.permission.Permission, models.Model),
        ),
        migrations.AddField(
            model_name="campaign",
            name="studies",
            field=models.ManyToManyField(
                blank=True,
                help_text="Studies that are part of this Campaign.",
                through="campaign.CampaignMembership",
                to="main.Study",
                verbose_name="Studies",
            ),
        ),
        migrations.AddField(
            model_name="campaign",
            name="updated",
            field=models.ForeignKey(
                editable=False,
                help_text="Update used to last modify this Campaign.",
                on_delete=django.db.models.deletion.PROTECT,
                related_name="+",
                to="main.Update",
                verbose_name="Last Modified",
            ),
        ),
        migrations.AddField(
            model_name="campaign",
            name="updates",
            field=models.ManyToManyField(
                help_text="List of Update objects logging changes to this Campaign.",
                related_name="+",
                to="main.Update",
                verbose_name="Updates",
            ),
        ),
    ]
