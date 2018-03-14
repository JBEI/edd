# coding: utf-8
"""
Models and related classes for dealing with Update objects.
"""

import arrow

from django.conf import settings
from django.contrib.auth import get_user_model
from django.db import models
from django.utils.encoding import python_2_unicode_compatible
from django.utils.translation import ugettext_lazy as _
from threadlocals.threadlocals import get_current_request

from .common import EDDSerialize


class UpdateManager(models.Manager):
    def get_queryset(self):
        return super(UpdateManager, self).get_queryset().select_related('mod_by')


@python_2_unicode_compatible
class Update(models.Model, EDDSerialize):
    """ A user update; referenced from other models that track creation and/or modification.
        Views get an Update object by calling main.models.Update.load_request_update(request) to
        lazy-load a request-scoped Update object model. """
    class Meta:
        db_table = 'update_info'
    mod_time = models.DateTimeField(
        auto_now_add=True,
        editable=False,
        help_text=_('Timestamp of the update.'),
        verbose_name=_('Modified'),
    )
    mod_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        editable=False,
        help_text=_('The user performing the update.'),
        null=True,
        on_delete=models.PROTECT,
        verbose_name=_('User'),
    )
    path = models.TextField(
        blank=True,
        help_text=_('URL path used to trigger this update.'),
        null=True,
        verbose_name=_('URL Path'),
    )
    origin = models.TextField(
        blank=True,
        help_text=_('Host origin of the request triggering this update.'),
        null=True,
        verbose_name=_('Origin Host'),
    )

    # references to self.mod_by potentially creates LOTS of queries
    # custom manager will always select_related('mod_by')
    objects = UpdateManager()

    def __str__(self):
        try:
            time = arrow.get(self.mod_time).humanize()
        except Exception:
            time = self.mod_time
        return '%s by %s' % (time, self.mod_by)

    @classmethod
    def load_update(cls, user=None, path=None):
        """
        Sometimes there will be actions happening outside the context of a request; use this
        factory to create an Update object in those cases.
        :param user: the user responsible for the update; None will be replaced with the
            system user.
        :param path: the path added to the update; it would be a good idea to put e.g. the
            script name and arguments here.
        :return: an Update instance persisted to the database
        """
        User = get_user_model()
        request = get_current_request()
        if request is None:
            mod_by = user
            if mod_by is None:
                mod_by = User.system_user()
            update = cls.objects.create(
                mod_time=arrow.utcnow(),
                mod_by=mod_by,
                path=path,
                origin='localhost',
            )
        else:
            update = cls.load_request_update(request)
        return update

    @classmethod
    def load_request_update(cls, request):
        """ Load an existing Update object associated with a request, or create a new one. """
        rhost = '%s; %s' % (
            request.META.get('REMOTE_ADDR', None),
            request.META.get('REMOTE_HOST', '')
        )
        if not hasattr(request, 'update_obj'):
            update = cls.objects.create(
                mod_time=arrow.utcnow(),
                mod_by=request.user,
                path=request.get_full_path(),
                origin=rhost,
            )
            request.update_obj = update
        else:
            update = request.update_obj
        return update

    @property
    def initials(self):
        if self.mod_by_id is None:
            return None
        return self.mod_by.initials

    @property
    def full_name(self):
        if self.mod_by_id is None:
            return None
        return ' '.join([self.mod_by.first_name, self.mod_by.last_name, ])

    @property
    def email(self):
        if self.mod_by_id is None:
            return None
        return self.mod_by.email

    def to_json(self, depth=0):
        """ Converts object to a dict appropriate for JSON serialization. If the depth argument
            is positive, the dict will expand links to other objects, rather than inserting a
            database identifier. """
        return {
            "time": arrow.get(self.mod_time).timestamp,
            "user": self.get_attr_depth('mod_by', depth),
        }

    def format_timestamp(self, format_string="%Y-%m-%d %I:%M%p"):
        """ Convert the datetime (mod_time) to a human-readable string, including conversion from
            UTC to local time zone. """
        return arrow.get(self.mod_time).to('local').strftime(format_string)


@python_2_unicode_compatible
class Datasource(models.Model):
    """ Defines an outside source for bits of data in the system. Initially developed to track
        where basic metabolite information originated (e.g. BIGG, KEGG, manual input). """
    name = models.CharField(
        help_text=_('The source used for information on a measurement type.'),
        max_length=255,
        verbose_name=_('Datasource'),
    )
    url = models.CharField(
        blank=True,
        default='',
        help_text=_('URL of the source.'),
        max_length=255,
        verbose_name=_('URL'),
    )
    download_date = models.DateField(
        auto_now=True,
        help_text=_('Date when information was accessed and copied.'),
        verbose_name=_('Download Date'),
    )
    created = models.ForeignKey(
        Update,
        editable=False,
        help_text=_('Update object logging the creation of this Datasource.'),
        on_delete=models.PROTECT,
        related_name='datasource',
        verbose_name=_('Created'),
    )

    def __str__(self):
        return '%s <%s>' % (self.name, self.url)

    def save(self, *args, **kwargs):
        if self.created_id is None:
            update = kwargs.get('update', None)
            if update is None:
                update = Update.load_update()
            self.created = update
        super(Datasource, self).save(*args, **kwargs)
