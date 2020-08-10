import arrow
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
    A link to an Institution with an (optional) identifier; e.g. JBEI with LBL
    employee ID number.
    """

    class Meta:
        db_table = "profile_institution_user"

    institution = models.ForeignKey(Institution, on_delete=models.CASCADE)
    profile = models.ForeignKey(UserProfile, on_delete=models.CASCADE)
    identifier = VarCharField(blank=True, null=True)


class UserManager(models.Manager):
    def get_queryset(self):
        return super().get_queryset().select_related("userprofile")


def User_profile(self):
    try:
        return self.userprofile
    except UserProfile.DoesNotExist:
        first = (self.first_name or "")[:1]
        last = (self.last_name or "")[:1]
        return UserProfile.objects.create(user=self, initials=f"{first}{last}")


def User_initials(self):
    return self.profile.initials if self.profile else _("?")


def User_institutions(self):
    return self.profile.institutions.all()


def User_to_json(self, depth=0):
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


def User_system_user(cls):
    return cls.objects.get(username="system")


def User_to_solr_json(self):
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
    return arrow.get(date).isoformat() if date else None


def patch_user_model(User):
    User.add_to_class("profile", property(User_profile))
    User.add_to_class("profiles", UserManager())
    User.add_to_class("to_json", User_to_json)
    User.add_to_class("to_solr_json", User_to_solr_json)
    User.add_to_class("initials", property(User_initials))
    User.add_to_class("institutions", property(User_institutions))
    User.system_user = classmethod(User_system_user)
