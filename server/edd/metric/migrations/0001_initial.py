import uuid

from django.conf import settings
from django.db import migrations, models

from edd.fields import VarCharField
from edd.utilities import JSONDecoder, JSONEncoder


class Migration(migrations.Migration):

    initial = True

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ("main", "0001_edd_2_7"),
    ]

    operations = [
        migrations.CreateModel(
            name="StudyLog",
            fields=[
                (
                    "id",
                    models.UUIDField(
                        default=uuid.uuid4,
                        editable=False,
                        primary_key=True,
                        serialize=False,
                        unique=True,
                    ),
                ),
                (
                    "detail",
                    models.JSONField(
                        blank=True,
                        decoder=JSONDecoder,
                        default=dict,
                        encoder=JSONEncoder,
                        editable=False,
                        help_text="JSON structure with extra details specific to the event.",
                        verbose_name="Details",
                    ),
                ),
                (
                    "event",
                    VarCharField(
                        choices=[
                            ("STUDY_CREATED", "Study Created"),
                            ("STUDY_DESCRIBED", "Study Described"),
                            ("STUDY_EXPORTED", "Study Exported"),
                            ("STUDY_IMPORTED", "Study Imported"),
                            ("STUDY_PERMISSION", "Study Permission Changed"),
                            ("STUDY_VIEWED", "Study Viewed"),
                            ("STUDY_WORKLIST", "Study Worklist"),
                        ],
                        editable=False,
                        help_text="Type of logged metric event.",
                        verbose_name="Event",
                    ),
                ),
                (
                    "timestamp",
                    models.DateTimeField(
                        auto_now_add=True,
                        help_text="Timestamp of the logged metric event.",
                        verbose_name="Timestamp",
                    ),
                ),
                (
                    "study",
                    models.ForeignKey(
                        blank=True,
                        editable=False,
                        help_text="The Study associated with the logged metric event.",
                        null=True,
                        on_delete=models.deletion.SET_NULL,
                        related_name="metric_log",
                        to="main.study",
                        verbose_name="Study",
                    ),
                ),
                (
                    "user",
                    models.ForeignKey(
                        editable=False,
                        help_text="The user triggering the logged metric event.",
                        null=True,
                        on_delete=models.deletion.SET_NULL,
                        to=settings.AUTH_USER_MODEL,
                        verbose_name="User",
                    ),
                ),
            ],
            options={"verbose_name": "Study Log", "verbose_name_plural": "Study Logs"},
        ),
    ]
