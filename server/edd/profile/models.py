import base64
import os

import arrow
from cryptography.fernet import Fernet
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC
from django.conf import settings
from django.contrib.auth import models as auth_models
from django.core.validators import URLValidator
from django.db import models
from django.utils.translation import gettext_lazy as _

from edd.fields import VarCharField
from main.models import Update


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
    display_name = VarCharField(blank=True, null=True)
    initials = VarCharField(blank=True, null=True)
    description = models.TextField(blank=True, null=True)
    institutions = models.ManyToManyField(Institution, through="InstitutionID")
    preferences = models.JSONField(blank=True, default=dict)
    approved = models.BooleanField(
        default=False,
        help_text=_("Flag showing if this account has been approved for login."),
        verbose_name=_("Approved"),
    )

    @property
    def display(self):
        return self.display_name or self.user.username

    def __str__(self):
        return str(self.user)


class InstitutionID(models.Model):
    """
    A link to an Institution with an (optional) identifier; e.g. JBEI with LBL
    employee ID number.
    """

    class Meta:
        db_table = "profile_institution_user"
        order_with_respect_to = "profile"

    institution = models.ForeignKey(Institution, on_delete=models.CASCADE)
    profile = models.ForeignKey(UserProfile, on_delete=models.CASCADE)
    identifier = VarCharField(blank=True, null=True)


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
            return UserProfile.objects.create(
                user=self,
                display_name=self.get_full_name() or self.username,
                initials=f"{first}{last}",
            )

    def to_json(self, depth=0):
        return {
            "id": self.pk,
            "uid": self.username,
            "email": self.email,
            "initials": self.initials,
            "name": self.profile.display_name,
            "lastname": self.last_name,
            "firstname": self.first_name,
            "disabled": not self.is_active,
        }

    def to_solr_json(self):
        return {
            "id": self.pk,
            "username": self.username,
            "fullname": self.profile.display_name,
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


def build_key(salt: bytes, iterations: int) -> bytes:
    kdf = PBKDF2HMAC(
        algorithm=hashes.SHA256(),
        length=32,
        salt=salt,
        iterations=iterations,
    )
    return base64.urlsafe_b64encode(kdf.derive(settings.SECRET_KEY.encode("utf8")))


def build_secret(secret_clear: str, iterations: int = 480_000):
    salt = os.urandom(16)
    key = build_key(salt, iterations)
    fernet = Fernet(key)
    token = fernet.encrypt(secret_clear.encode("utf8"))
    enc_salt = base64.urlsafe_b64encode(salt).decode("utf8")
    enc_token = base64.urlsafe_b64encode(token).decode("utf8")
    return f"pbkdf2!{iterations}!{enc_salt}!{enc_token}"


class AppType(models.Model):
    """Contains information about a type of external application."""

    class Meta:
        db_table = "profile_apptype"

    display = VarCharField(verbose_name=_("Display"))
    driver = VarCharField(verbose_name=_("Driver"))

    def __repr__(self):
        return str(self)

    def __str__(self):
        return self.display


class AppLink(models.Model):
    """Contains information to link a profile to an external application."""

    class Meta:
        db_table = "profile_applink"
        order_with_respect_to = "profile"

    apptype = models.ForeignKey(
        AppType,
        on_delete=models.CASCADE,
        related_name="+",
        verbose_name=_("App Type"),
    )
    comment = VarCharField(blank=True, null=True, verbose_name=_("Comment"))
    created = models.ForeignKey(
        Update,
        editable=False,
        on_delete=models.PROTECT,
        related_name="applinks",
        verbose_name=_("Created"),
    )
    profile = models.ForeignKey(
        UserProfile,
        on_delete=models.CASCADE,
        related_name="applinks",
    )
    secret_id = VarCharField(blank=True, null=True, verbose_name=_("Secret ID"))
    secret = VarCharField(verbose_name=_("Secret"))
    url = VarCharField(validators=[URLValidator], verbose_name=_("URL"))

    @property
    def api_token(self):
        alg, enc_iterations, enc_salt, enc_token = self.secret.split("!")
        salt = base64.urlsafe_b64decode(enc_salt)
        iterations = int(enc_iterations)
        key = build_key(salt, iterations)
        token = base64.urlsafe_b64decode(enc_token)
        fernet = Fernet(key)
        return fernet.decrypt(token).decode("utf8")

    def save(self, *args, **kwargs):
        # when creating the applink, encrypt the API token
        if not bool(self.pk):
            self.secret = build_secret(self.secret)
        if getattr(self, "created_id", None) is None:
            self.created = Update.load_update()
        super().save(*args, **kwargs)

    def __str__(self):
        return f"AppLink<{self.apptype.display}: {self.secret_id}>({self.url})"
