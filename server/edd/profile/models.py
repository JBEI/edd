import arrow
from django.conf import settings
from django.contrib.auth import models as auth_models
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
    preferences = models.JSONField(blank=True, default=dict)
    approved = models.BooleanField(
        default=False,
        help_text=_("Flag showing if this account has been approved for login."),
        verbose_name=_("Approved"),
    )

    def __str__(self):
        return str(self.user)


class InstitutionID(models.Model):
    """
    A link to an Institution with an (optional) identifier; e.g. JBEI with LBL
    employee ID number.
    """

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["profile", "sort_key"], name="profile_institution_ordering_idx"
            ),
        ]
        db_table = "profile_institution_user"

    institution = models.ForeignKey(Institution, on_delete=models.CASCADE)
    profile = models.ForeignKey(UserProfile, on_delete=models.CASCADE)
    identifier = VarCharField(blank=True, null=True)
    sort_key = models.PositiveIntegerField(
        null=False,
        help_text=_("Relative order this Institution is displayed in a UserProfile."),
        verbose_name=_("Display order"),
    )


class UserManager(auth_models.UserManager):
    def get_queryset(self):
        return super().get_queryset().select_related("userprofile")


class User(auth_models.AbstractUser):
    class Meta:
        db_table = "auth_user"

    profiles = UserManager()

    @classmethod
    def system_user(cls):
        return cls.objects.get(username="system")

    @property
    def initials(self):
        return self.profile.initials if self.profile else _("?")

    @property
    def institutions(self):
        return self.profile.institutions.all()

    @property
    def profile(self):
        try:
            return self.userprofile
        except UserProfile.DoesNotExist:
            first = (self.first_name or "")[:1]
            last = (self.last_name or "")[:1]
            return UserProfile.objects.create(user=self, initials=f"{first}{last}")

    def to_json(self, depth=0):
        return {
            "id": self.pk,
            "uid": self.username,
            "email": self.email,
            "initials": self.initials,
            "name": self.get_full_name(),
            "lastname": self.last_name,
            "firstname": self.first_name,
            "disabled": not self.is_active,
        }

    def to_solr_json(self):
        return {
            "id": self.pk,
            "username": self.username,
            # TODO add full name to profile, to override default first+[SPACE]+last
            "fullname": self.get_full_name(),
            "name": [self.first_name, self.last_name],
            "email": self.email,
            "initials": self.initials,
            "group": [f"{g.pk}@{g.name}" for g in self.groups.all()],
            "institution": [f"{i.pk}@{i.institution_name}" for i in self.institutions],
            "date_joined": format_solr_date(self.date_joined),
            "last_login": format_solr_date(self.last_login),
            "is_active": self.is_active,
            "is_staff": self.is_staff,
            "is_superuser": self.is_superuser,
        }


def format_solr_date(date):
    # arrow will give current time when argument is None
    if date:
        return arrow.get(date).to("utc").format("YYYY-MM-DDTHH:mm:ss.SSS") + "Z"
    return None
