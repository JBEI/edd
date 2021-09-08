import uuid

from django.conf import settings
from django.db import models
from django.utils.translation import gettext_lazy as _

from edd.fields import VarCharField
from edd.utilities import JSONDecoder, JSONEncoder
from main import models as edd_models


class StudyLog(models.Model):
    """Recorded entry for Study metrics captured by EDD."""

    class Event(models.TextChoices):
        CREATED = "STUDY_CREATED", _("Study Created")
        DESCRIBED = "STUDY_DESCRIBED", _("Study Described")
        EXPORTED = "STUDY_EXPORTED", _("Study Exported")
        IMPORTED = "STUDY_IMPORTED", _("Study Imported")
        PERMISSION = "STUDY_PERMISSION", _("Study Permission Changed")
        VIEWED = "STUDY_VIEWED", _("Study Viewed")
        WORKLIST = "STUDY_WORKLIST", _("Study Worklist")

    class Meta:
        verbose_name = _("Study Log")
        verbose_name_plural = _("Study Logs")

    # should never need to reference this, but need a primary key
    _id = models.UUIDField(
        default=uuid.uuid4, editable=False, name="id", primary_key=True, unique=True,
    )
    # store extra values that only exist on certain events here
    detail = models.JSONField(
        blank=True,
        decoder=JSONDecoder,
        editable=False,
        encoder=JSONEncoder,
        help_text=_("JSON structure with extra details specific to the event."),
        default=dict,
        verbose_name=_("Details"),
    )
    event = VarCharField(
        blank=False,
        choices=Event.choices,
        editable=False,
        help_text=_("Type of logged metric event."),
        verbose_name=_("Event"),
    )
    study = models.ForeignKey(
        edd_models.Study,
        blank=True,
        editable=False,
        help_text=_("The Study associated with the logged metric event."),
        on_delete=models.SET_NULL,
        null=True,
        related_name="metric_log",
        verbose_name=_("Study"),
    )
    timestamp = models.DateTimeField(
        auto_now_add=True,
        editable=False,
        help_text=_("Timestamp of the logged metric event."),
        verbose_name=_("Timestamp"),
    )
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        editable=False,
        help_text=_("The user triggering the logged metric event."),
        null=True,
        on_delete=models.SET_NULL,
        verbose_name=_("User"),
    )

    @classmethod
    def lookup_study(cls, study_id):
        try:
            return edd_models.Study.objects.get(id=study_id)
        except edd_models.Study.DoesNotExist:
            return None
