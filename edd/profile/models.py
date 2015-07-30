from django.conf import settings
from django.contrib.postgres.fields import HStoreField
from django.db import models


class Institution(models.Model):
    """
    An institution to associate with EDD user profiles.
    """
    class Meta:
        db_table = 'profile_institution'
    institution_name = models.CharField(max_length=255)
    description = models.TextField(blank=True, null=True)


class UserProfile(models.Model):
    """
    Additional profile information on a user.
    """
    class Meta:
        db_table = 'profile_user'
    user = models.OneToOneField(settings.AUTH_USER_MODEL)
    initials = models.CharField(max_length=10, blank=True, null=True)
    description = models.TextField(blank=True, null=True)
    institutions = models.ManyToManyField(Institution, through='InstitutionID')
    prefs = HStoreField(blank=True, default=dict)


class InstitutionID(models.Model):
    """
    A link to an Institution with an (optional) identifier; e.g. JBEI with LBL employee ID number.
    """
    class Meta:
        db_table = 'profile_institution_user'
    institution = models.ForeignKey(Institution)
    profile = models.ForeignKey(UserProfile)
    identifier = models.CharField(max_length=255, blank=True, null=True)
