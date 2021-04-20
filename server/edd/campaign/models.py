import logging
from itertools import chain

from django.contrib.postgres.fields import ArrayField
from django.db import models
from django.db.models import Q
from django.utils.translation import gettext_lazy as _

from edd.fields import VarCharField
from main import models as edd_models

logger = logging.getLogger(__name__)

# assign names to base classes used in this module to avoid repeating namespaces
BasePermission = edd_models.permission.Permission
EveryoneMixin = edd_models.permission.EveryoneMixin
GroupMixin = edd_models.permission.GroupMixin
UserMixin = edd_models.permission.UserMixin


def is_real_user(user):
    # check that user is truthy and has a truthy id attribute
    return user and user.id


class CampaignPermission(BasePermission, models.Model):
    """Permissions specific to a Campaign."""

    ADD = "add"
    REMOVE = "remove"
    LEVEL_OVERRIDES = {
        BasePermission.NONE: (),
        BasePermission.READ: (BasePermission.NONE,),
        BasePermission.WRITE: (BasePermission.NONE, BasePermission.READ),
    }
    LINKS = set()

    class Meta:
        abstract = True

    campaign = models.ForeignKey(
        "Campaign",
        help_text=_("Campaign this permission applies to."),
        on_delete=models.CASCADE,
        verbose_name=_("Campaign"),
    )
    study_permission = VarCharField(
        choices=BasePermission.TYPE_CHOICE,
        default=BasePermission.NONE,
        help_text=_("Type of permission applied to Studies linked to Campaign."),
        verbose_name=_("Study Permission"),
    )
    campaign_permission = VarCharField(
        choices=BasePermission.TYPE_CHOICE,
        default=BasePermission.NONE,
        help_text=_("Permission for read/write on the Campaign itself."),
        verbose_name=_("Campaign Permission"),
    )
    link_permissions = ArrayField(
        models.TextField(),
        default=list,
        help_text=_("Additional permissions applying to this Campaign."),
        verbose_name=_("Additional Flags"),
    )

    @classmethod
    def convert_link_type(cls, link_type, operation):
        return f"{link_type.__module__}.{link_type.__qualname__}:{operation}"

    @classmethod
    def register_link(cls, link_type, operation):
        """
        Adds the ability to create permissions for arbitrary types and operations
        tied to a Campaign. e.g. if code elsewhere adds a Widget type linked to
        Campaigns, and would like to limit the users that may do the Florf
        operation on those Widgets:

            class Widget(models.Model):
                def user_can_florf(self, user):
                    return any(
                        p.is_allowed(Widget, "florf")
                        for p in self.campaign.get_permissions(user)
                    )

            CampaignPermission.register_link(Widget, "florf")
        """
        cls.LINKS.add(cls.convert_link_type(link_type, operation))

    @classmethod
    def unregister_link(cls, link_type, operation):
        """
        Removes a type and operation registration from those available to be
        managed via CampaignPermission restrictions.
        """
        cls.LINKS.remove(cls.convert_link_type(link_type, operation))

    def __getitem__(self, key):
        # only return boolean for valid keys in self.LINKS
        if key in self.LINKS:
            return key in self.link_permissions
        # templates do getitem lookups before attribute lookups, so fallback to attributes
        return getattr(self, key)

    def __setitem__(self, key, value):
        if key not in self.LINKS:
            raise ValueError(f"{key} is not registered as a Campaign permission")
        if value:
            # avoid adding duplicates
            if key not in self.link_permissions:
                self.link_permissions.append(key)
        else:
            # remove if present
            try:
                self.link_permissions.remove(key)
            except ValueError:
                logging.info(f"Removing permission {key} but it was not set")

    def get_permission_overrides(self):
        return self.LEVEL_OVERRIDES.get(self.study_permission, [])

    def get_type_label(self):
        return dict(self.TYPE_CHOICE).get(self.campaign_permission, "?")

    def is_allowed(self, link_type, operation):
        link = self.convert_link_type(link_type, operation)
        return link in self.link_permissions

    def is_read(self):
        """
        Test if the permission grants read privileges.

        :returns: True if permission grants read access
        """
        return self.campaign_permission in self.CAN_VIEW

    def is_write(self):
        """
        Test if the permission grants write privileges.

        :returns: True if permission grants write access
        """
        return self.campaign_permission in self.CAN_EDIT

    def set_allowed(self, link_type, operation, allow=True):
        """
        Change the state of this permission for adding linked objects.

        :param link_type: the class of object to modify adding link permissions
        :param allow: boolean state for permission; True allows adding link, False
            dis-allows adding link. (Default True)
        """
        link = self.convert_link_type(link_type, operation)
        self[link] = allow


# default to registering Study objects as able to add/remove from Campaign
CampaignPermission.register_link(edd_models.Study, CampaignPermission.ADD)
CampaignPermission.register_link(edd_models.Study, CampaignPermission.REMOVE)


class Campaign(edd_models.core.SlugMixin, models.Model):
    """A grouping of studies, with a broad goal; multiple cycles of DBTL."""

    # linking together EDD instances will be easier later if we define UUIDs now
    uuid = models.UUIDField(
        editable=False,
        help_text=_("Unique identifier for this Campaign."),
        unique=True,
        verbose_name=_("UUID"),
    )
    name = VarCharField(help_text=_("Name of this Campaign."), verbose_name=_("Name"))
    description = models.TextField(
        blank=True,
        help_text=_("Description of this Campaign."),
        null=True,
        verbose_name=_("Description"),
    )
    # create a slug for a more human-readable URL
    slug = models.SlugField(
        help_text=_("Slug text used in links to this Campaign."),
        null=True,
        unique=True,
        verbose_name=_("Slug"),
    )
    updates = models.ManyToManyField(
        edd_models.Update,
        help_text=_("List of Update objects logging changes to this Campaign."),
        related_name="+",
        verbose_name=_("Updates"),
    )
    # these are used often enough we should save extra queries by including as fields
    created = models.ForeignKey(
        edd_models.Update,
        editable=False,
        help_text=_("Update used to create this Campaign."),
        on_delete=models.PROTECT,
        related_name="+",
        verbose_name=_("Created"),
    )
    updated = models.ForeignKey(
        edd_models.Update,
        editable=False,
        help_text=_("Update used to last modify this Campaign."),
        on_delete=models.PROTECT,
        related_name="+",
        verbose_name=_("Last Modified"),
    )
    studies = models.ManyToManyField(
        edd_models.Study,
        blank=True,
        help_text=_("Studies that are part of this Campaign."),
        through="CampaignMembership",
        verbose_name=_("Studies"),
    )

    @staticmethod
    def filter_for(user, access=CampaignPermission.CAN_VIEW):
        """
        Similar to main.models.Study.access_filter(); however, this will only build
        a filter for Campaign objects. These permissions should not be relied upon
        to cascade to Study objects and children linked by Campaign objects. This
        call should be used in a queryset .filter() used with a .distinct();
        otherwise, if a user has multiple permission paths to a Campaign, multiple
        results may be returned.
        """
        if isinstance(access, str):
            access = (access,)
        q = Q(everyonepermission__campaign_permission__in=access)
        if is_real_user(user):
            q |= Q(
                userpermission__user=user,
                userpermission__campaign_permission__in=access,
            ) | Q(
                grouppermission__group__user=user,
                grouppermission__campaign_permission__in=access,
            )
        return q

    def check_permissions(self, link_type, operation, user):
        return (is_real_user(user) and user.is_superuser) or any(
            p.is_allowed(link_type, operation) for p in self.get_permissions(user)
        )

    def get_all_permissions(self):
        return chain(
            self.userpermission_set.all(),
            self.grouppermission_set.all(),
            self.everyonepermission_set.all(),
        )

    def get_permissions(self, user):
        if is_real_user(user):
            return chain(
                self.userpermission_set.filter(user=user),
                self.grouppermission_set.filter(group__user=user),
                self.everyonepermission_set.all(),
            )
        return self.everyonepermission_set.all()

    def user_can_read(self, user):
        is_super = is_real_user(user) and user.is_superuser
        has_permission = any(p.is_read() for p in self.get_permissions(user))
        return is_super or has_permission

    def user_can_write(self, user):
        is_super = is_real_user(user) and user.is_superuser
        has_permission = any(p.is_write() for p in self.get_permissions(user))
        return is_super or has_permission


class CampaignMembership(models.Model):
    """A link between a Campaign and Study."""

    class Status:
        ACTIVE = "a"
        COMPLETE = "c"
        ABANDONED = "z"
        CHOICE = (
            (ACTIVE, _("Active")),
            (COMPLETE, _("Complete")),
            (ABANDONED, _("Abandoned")),
        )

    campaign = models.ForeignKey(Campaign, on_delete=models.CASCADE)
    study = models.ForeignKey(edd_models.Study, on_delete=models.CASCADE)
    status = VarCharField(
        choices=Status.CHOICE,
        default=Status.ACTIVE,
        help_text=_("Status of a Study in the linked Campaign."),
    )


class UserPermission(UserMixin, CampaignPermission):
    """Campaign permissions applying to a specific user."""

    def apply_to_study(self, study):
        """Apply this permission to the equivalent StudyPermission."""
        study.userpermission_set.update_or_create(
            defaults={"permission_type": self.study_permission},
            user=self.user,
            permission_type__in=self.get_permission_overrides(),
        )


class GroupPermission(GroupMixin, CampaignPermission):
    """Campaign permissions applying to a group."""

    def apply_to_study(self, study):
        """Apply this permission to the equivalent StudyPermission."""
        study.grouppermission_set.update_or_create(
            defaults={"permission_type": self.study_permission},
            group=self.group,
            permission_type__in=self.get_permission_overrides(),
        )


class EveryonePermission(EveryoneMixin, CampaignPermission):
    """Campaign permissions applying to all users."""

    def apply_to_study(self, study):
        """Apply this permission to the equivalent StudyPermission."""
        study.everyonepermission_set.update_or_create(
            defaults={"permission_type": self.study_permission},
            permission_type__in=self.get_permission_overrides(),
        )
