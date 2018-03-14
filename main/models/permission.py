# coding: utf-8
"""
Models related to setting permissions to view/edit objects in EDD.
"""

from django.conf import settings
from django.db import models
from django.utils.encoding import python_2_unicode_compatible
from django.utils.translation import ugettext_lazy as _


@python_2_unicode_compatible
class StudyPermission(models.Model):
    """ Access given for a *specific* study instance, rather than for object types provided by
        Django. """
    class Meta:
        abstract = True
    NONE = 'N'
    READ = 'R'
    WRITE = 'W'
    TYPE_CHOICE = (
        (NONE, _('None')),
        (READ, _('Read')),
        (WRITE, _('Write')),
    )
    CAN_VIEW = (READ, WRITE)
    CAN_EDIT = (WRITE, )
    study = models.ForeignKey(
        'main.Study',
        help_text=_('Study this permission applies to.'),
        on_delete=models.CASCADE,
        verbose_name=_('Study'),
    )
    permission_type = models.CharField(
        choices=TYPE_CHOICE,
        default=NONE,
        help_text=_('Type of permission.'),
        max_length=8,
        verbose_name=_('Permission'),
    )

    def applies_to_user(self, user):
        """ Test if permission applies to given user.
            Base class will always return False, override in child classes.
            Arguments:
                user: to be tested, model from django.contrib.auth.models.User
            Returns:
                True if StudyPermission applies to the User """
        return False

    def get_type_label(self):
        return dict(self.TYPE_CHOICE).get(self.permission_type, '?')

    def get_who_label(self):
        return '?'

    def is_read(self):
        """ Test if the permission grants read privileges.
            Returns:
                True if permission grants read """
        return self.permission_type == self.READ or self.permission_type == self.WRITE

    def is_write(self):
        """ Test if the permission grants write privileges.
            Returns:
                True if permission grants write """
        return self.permission_type == self.WRITE

    def __str__(self):
        return self.get_who_label()


@python_2_unicode_compatible
class UserPermission(StudyPermission):
    class Meta:
        db_table = 'study_user_permission'
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        help_text=_('User this permission applies to.'),
        on_delete=models.CASCADE,
        related_name='userpermission_set',
        verbose_name=_('User'),
    )

    def applies_to_user(self, user):
        return self.user == user

    def get_who_label(self):
        return self.user.get_full_name()

    def to_json(self):
        return {
            'user': {
                'id': self.user.pk,
                'name': self.user.username,
            },
            'type': self.permission_type
        }

    def __str__(self):
        return 'u:%(user)s' % {'user': self.user.username}


@python_2_unicode_compatible
class GroupPermission(StudyPermission):
    class Meta:
        db_table = 'study_group_permission'
    group = models.ForeignKey(
        'auth.Group',
        help_text=_('Group this permission applies to.'),
        on_delete=models.CASCADE,
        related_name='grouppermission_set',
        verbose_name=_('Group'),
    )

    def applies_to_user(self, user):
        return user.groups.contains(self.group)

    def get_who_label(self):
        return self.group.name

    def to_json(self):
        return {
            'group': {
                'id': self.group.pk,
                'name': self.group.name,
            },
            'type': self.permission_type
        }

    def __str__(self):
        return 'g:%(group)s' % {'group': self.group.name}


@python_2_unicode_compatible
class EveryonePermission(StudyPermission):
    class Meta:
        db_table = 'study_public_permission'

    def applies_to_user(self, user):
        return True

    def get_who_label(self):
        return _('Everyone')

    def to_json(self):
        return {
            'type': self.permission_type
        }

    def __str__(self):
        return 'g:__Everyone__'
