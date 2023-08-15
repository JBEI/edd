"""
Models related to setting permissions to view/edit objects in EDD.
"""
import json

from django.conf import settings
from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from django.db import models
from django.template.loader import get_template
from django.utils.translation import gettext_lazy as _

from edd.fields import VarCharField
from edd.search.select2 import Select2


class Permission:
    """Mixin class of constants used for permissions."""

    NONE = "N"
    READ = "R"
    WRITE = "W"
    TYPE_CHOICE = ((NONE, _("None")), (READ, _("Read")), (WRITE, _("Write")))
    CAN_VIEW = (READ, WRITE)
    CAN_EDIT = (WRITE,)

    def applies_to_user(self, user):
        """
        Test if permission applies to given user.

        Base class will always return False, override in child classes.

        :param user: to be tested, model from django.contrib.auth.models.User
        :returns: True if StudyPermission applies to the User
        """
        return False

    def get_selector(self):
        """
        Returns a string selector defining how permission should apply. Should
        *not* reference any foreign keys.
        """
        return "?"

    def get_target_id(self):
        return None

    def get_target_type(self):
        return None

    def get_who_label(self):
        return "?"

    def __str__(self):
        return self.get_who_label()


class StudyPermission(Permission, models.Model):
    """
    Access given for a *specific* study instance, rather than for object types provided
    by Django.
    """

    class Meta:
        abstract = True

    study = models.ForeignKey(
        "main.Study",
        help_text=_("Study this permission applies to."),
        on_delete=models.CASCADE,
        verbose_name=_("Study"),
    )
    permission_type = VarCharField(
        choices=Permission.TYPE_CHOICE,
        default=Permission.NONE,
        help_text=_("Type of permission."),
        verbose_name=_("Permission"),
    )

    def get_type_label(self):
        return dict(self.TYPE_CHOICE).get(self.permission_type, "?")

    def is_read(self):
        """
        Test if the permission grants read privileges.

        :returns: True if permission grants read access
        """
        return self.permission_type in self.CAN_VIEW

    def is_write(self):
        """
        Test if the permission grants write privileges.

        :returns: True if permission grants write access
        """
        return self.permission_type in self.CAN_EDIT


class UserMixin(models.Model):
    """Mixin class for permissions linking to a specific user."""

    class Meta:
        abstract = True

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        help_text=_("User this permission applies to."),
        on_delete=models.CASCADE,
        related_name="+",
        verbose_name=_("User"),
    )

    def applies_to_user(self, user):
        return self.user == user

    def get_selector(self):
        return f"u:{self.user_id}"

    def get_target_id(self):
        return self.user.pk

    def get_target_type(self):
        return "user"

    def get_who_label(self):
        return self.user.profile.display_name

    def to_json(self):
        return {
            "user": {"id": self.user.pk, "name": self.user.username},
            "type": self.permission_type,
        }

    def __str__(self):
        return f"u:{self.user.username}"


class UserPermission(UserMixin, StudyPermission):
    class Meta:
        db_table = "study_user_permission"


class GroupMixin(models.Model):
    """Mixin class for permissions linking to a specific group."""

    class Meta:
        abstract = True

    group = models.ForeignKey(
        "auth.Group",
        help_text=_("Group this permission applies to."),
        on_delete=models.CASCADE,
        related_name="+",
        verbose_name=_("Group"),
    )

    def applies_to_user(self, user):
        return user.groups.contains(self.group)

    def get_selector(self):
        return f"g:{self.group_id}"

    def get_target_id(self):
        return self.group.pk

    def get_target_type(self):
        return "group"

    def get_who_label(self):
        return self.group.name

    def to_json(self):
        return {
            "group": {"id": self.group.pk, "name": self.group.name},
            "type": self.permission_type,
        }

    def __str__(self):
        return f"g:{self.group.name}"


class GroupPermission(GroupMixin, StudyPermission):
    class Meta:
        db_table = "study_group_permission"


class EveryoneMixin:
    """Mixin class for permissions applying to all logged-in users."""

    def applies_to_user(self, user):
        return True

    def get_selector(self):
        return "*"

    def get_target_id(self):
        return ""

    def get_target_type(self):
        return "everyone"

    def get_who_label(self):
        return _("Everyone")

    def to_json(self):
        return {"type": self.permission_type}

    def __str__(self):
        return "g:__Everyone__"


class EveryonePermission(EveryoneMixin, StudyPermission):
    class Meta:
        db_table = "study_public_permission"

    @staticmethod
    def can_make_public(user):
        """Test if a given user can make public permissions"""
        return user.is_superuser or user.has_perm("main.add_everyonepermission")


@Select2("Group")
def group_autocomplete(request):
    start, end = request.range
    found = Group.objects.filter(name__iregex=request.term)
    found = request.optional_sort(found.order_by("name"))
    found = found.annotate(text=models.F("name"))
    count = found.count()
    values = found.values("id", "name", "text")
    return values[start:end], count > end


@Select2("Permission")
def permission_autocomplete(request):
    term = request.term
    start, end = request.range
    # unified fields so both User and Group can be queried together
    value_fields = ("id", "text", "type", "backup")
    groups = Group.objects.filter(name__iregex=term)
    # display the name always, use name as sort key "backup"
    groups = groups.annotate(
        text=models.F("name"),
        type=models.Value("group"),
        backup=models.F("name"),
    )
    groups = groups.values(*value_fields)
    q = (
        models.Q(username__iregex=term)
        | models.Q(first_name__iregex=term)
        | models.Q(last_name__iregex=term)
        | models.Q(emailaddress__email__iregex=term)
        | models.Q(userprofile__initials__iregex=term)
    )
    User = get_user_model()
    users = User.profiles.filter(q).distinct()
    # display display_name preferentially, fallback to username as "backup"
    users = users.annotate(
        text=models.F("userprofile__display_name"),
        type=models.Value("user"),
        backup=models.F("username"),
    )
    users = users.values(*value_fields)
    union = groups.union(users).order_by("backup")
    count = union.count()
    template = get_template("edd/profile/permission_autocomplete_item.html")
    items = [
        {
            "html": template.render({"item": item}),
            "id": json.dumps(item),
            "text": item.get("text", _("Unknown Record")),
        }
        for item in union[start:end]
    ]
    if start == 0:
        everyone = {"type": "everyone"}
        # add an entry for "everyone" permission at top of the list
        items = [
            {
                "html": template.render({"item": everyone}),
                "id": json.dumps(everyone),
                "text": _("Any User"),
            },
            *items,
        ]
    return items, count > end


@Select2("User")
def user_autocomplete(request):
    term = request.term
    start, end = request.range
    User = get_user_model()
    q = (
        models.Q(username__iregex=term)
        | models.Q(first_name__iregex=term)
        | models.Q(last_name__iregex=term)
        | models.Q(emailaddress__email__iregex=term)
        | models.Q(userprofile__initials__iregex=term)
    )
    found = User.profiles.filter(q).distinct()
    found = request.optional_sort(found.order_by("username"))
    count = found.count()
    template = get_template("edd/profile/user_autocomplete_item.html")
    values = [
        {
            "html": template.render({"user": user}),
            "id": user.id,
            "initials": user.initials,
            "text": user.profile.display,
            "username": user.username,
        }
        for user in found[start:end]
    ]
    return values, count > end
