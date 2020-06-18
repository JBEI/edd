# flake8: noqa

from django.conf import settings
from django.contrib.postgres.fields import JSONField
from django.db import models
from django.utils.translation import gettext_lazy as _

from edd.fields import VarCharField


class Institution(models.Model):
    """An institution to associate with EDD user profiles."""

    class Meta:
        db_table = "profile_institution"

    institution_name = VarCharField()
    description = models.TextField(blank=True, null=True)

    def __str__(self):
        return self.institution_name


class UserProfile(models.Model):
    """Additional profile information on a user."""

    class Meta:
        db_table = "profile_user"

    user = models.OneToOneField(settings.AUTH_USER_MODEL, on_delete=models.CASCADE)
    initials = VarCharField(blank=True, null=True)
    description = models.TextField(blank=True, null=True)
    institutions = models.ManyToManyField(Institution, through="InstitutionID")
    preferences = JSONField(blank=True, default=dict)
    approved = models.BooleanField(
        default=False,
        help_text=_("Flag showing if this account has been approved for login."),
        verbose_name=_("Approved"),
    )

    def __str__(self):
        return str(self.user)


class InstitutionID(models.Model):
    """
    A link to an Institution with an (optional) identifier; e.g. JBEI with LBL employee ID number.
    """

    class Meta:
        db_table = "profile_institution_user"

    institution = models.ForeignKey(Institution, on_delete=models.CASCADE)
    profile = models.ForeignKey(UserProfile, on_delete=models.CASCADE)
    identifier = VarCharField(blank=True, null=True)
