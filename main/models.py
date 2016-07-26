# coding: utf-8
from __future__ import unicode_literals

import arrow
import json
import logging
import os.path
import re
import warnings

from builtins import str
from collections import defaultdict
from django import forms
from django.conf import settings
from django.contrib.auth import get_user_model
from django.contrib.postgres.fields import ArrayField, HStoreField
from django.db import models
from django.db.models import F, Func, Q
from django.utils.encoding import python_2_unicode_compatible
from django.utils.translation import ugettext_lazy as _
from functools import reduce
from itertools import chain
from six import string_types
from threadlocals.threadlocals import get_current_request

from jbei.edd.rest.constants import (METADATA_CONTEXT_ASSAY, METADATA_CONTEXT_LINE,
                                     METADATA_CONTEXT_STUDY)
from .export import table


logger = logging.getLogger(__name__)


class VarCharField(models.TextField):
    """ Take advantage of postgres VARCHAR = TEXT, to have unlimited CharField, using TextInput
        widget. """
    def formfield(self, **kwargs):
        defaults = {'widget': forms.TextInput}
        defaults.update(kwargs)
        return super(VarCharField, self).formfield(**defaults)


class UpdateManager(models.Manager):
    def get_queryset(self):
        return super(UpdateManager, self).get_queryset().select_related('mod_by')


class EDDSerialize(object):
    """ Mixin class for EDD models supporting JSON serialization. """
    def get_attr_depth(self, attr_name, depth, default=None):
        # check for id attribute does not trigger database call
        id_attr = '%s_id' % attr_name
        if hasattr(self, id_attr) and getattr(self, id_attr):
            if depth > 0:
                return getattr(self, attr_name).to_json(depth=depth-1)
            return getattr(self, id_attr)
        return default

    def to_json(self, depth=0):
        """ Converts object to a dict appropriate for JSON serialization. If the depth argument
            is positive, the dict will expand links to other objects, rather than inserting a
            database identifier. """
        return {
            'id': self.pk,
        }


@python_2_unicode_compatible
class Update(models.Model, EDDSerialize):
    """ A user update; referenced from other models that track creation and/or modification.
        Views get an Update object by calling main.models.Update.load_request_update(request) to
        lazy-load a request-scoped Update object model. """
    class Meta:
        db_table = 'update_info'
    mod_time = models.DateTimeField(auto_now_add=True, editable=False)
    mod_by = models.ForeignKey(settings.AUTH_USER_MODEL, editable=False, null=True)
    path = models.TextField(blank=True, null=True)
    origin = models.TextField(blank=True, null=True)

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
        request = get_current_request()
        if request is None:
            update = cls(mod_time=arrow.utcnow(),
                         mod_by=user,
                         path=path,
                         origin='localhost')
            # TODO this save may be too early?
            update.save()
        else:
            update = cls.load_request_update(request)
        return update

    @classmethod
    def load_request_update(cls, request):
        rhost = '%s; %s' % (
            request.META.get('REMOTE_ADDR', None),
            request.META.get('REMOTE_HOST', ''))
        if not hasattr(request, 'update_obj'):
            update = cls(mod_time=arrow.utcnow(),
                         mod_by=request.user,
                         path=request.get_full_path(),
                         origin=rhost)
            # TODO this save may be too early?
            update.save()
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
    name = models.CharField(max_length=255)
    url = models.CharField(max_length=255, blank=True, default='')
    download_date = models.DateField(auto_now=True)
    created = models.ForeignKey(Update, related_name='datasource', editable=False)

    def __str__(self):
        return '%s <%s>' % (self.name, self.url)

    def save(self, *args, **kwargs):
        if self.created_id is None:
            update = kwargs.get('update', None)
            if update is None:
                update = Update.load_update()
            self.created = update
        super(Datasource, self).save(*args, **kwargs)


@python_2_unicode_compatible
class Comment(models.Model):
    """ Text blob attached to an EDDObject by a given user at a given time/Update. """
    class Meta:
        db_table = 'comment'
    object_ref = models.ForeignKey('EDDObject', related_name='comments')
    body = models.TextField()
    created = models.ForeignKey(Update)

    def __str__(self):
        return self.body

    def save(self, *args, **kwargs):
        if self.created_id is None:
            update = kwargs.get('update', None)
            if update is None:
                update = Update.load_update()
            self.created = update
        super(Comment, self).save(*args, **kwargs)


@python_2_unicode_compatible
class Attachment(models.Model):
    """ File uploads attached to an EDDObject; include MIME, file name, and description. """
    class Meta:
        db_table = 'attachment'
    object_ref = models.ForeignKey('EDDObject', related_name='files')
    file = models.FileField(max_length=255, upload_to='%Y/%m/%d')
    filename = models.CharField(max_length=255)
    created = models.ForeignKey(Update)
    description = models.TextField(blank=True, null=False)
    mime_type = models.CharField(max_length=255, blank=True, null=True)
    file_size = models.IntegerField(default=0)

    def __str__(self):
        return self.filename

    @property
    def user_initials(self):
        return self.created.initials

    @property
    def icon(self):
        from main.utilities import extensions_to_icons
        base, ext = os.path.splitext(self.filename)
        return extensions_to_icons.get(ext, "icon-generic.png")

    def user_can_delete(self, user):
        """ Verify that a user has the appropriate permissions to delete an attachment. """
        return self.object_ref.user_can_write(user)

    def user_can_read(self, user):
        """ Verify that a user has the appropriate permissions to see (that is, download) an
            attachment. """
        return self.object_ref.user_can_read(user)

    def save(self, *args, **kwargs):
        if self.created_id is None:
            update = kwargs.get('update', None)
            if update is None:
                update = Update.load_update()
            self.created = update
        self.filename = self.file.name
        self.file_size = self.file.size
        # self.file is the db field; self.file.file is the actual file
        self.mime_type = self.file.file.content_type
        super(Attachment, self).save(*args, **kwargs)


@python_2_unicode_compatible
class MetadataGroup(models.Model):
    """ Group together types of metadata with a label. """
    class Meta:
        db_table = 'metadata_group'
    group_name = models.CharField(max_length=255, unique=True)

    def __str__(self):
        return self.group_name


@python_2_unicode_compatible
class MetadataType(models.Model, EDDSerialize):
    """ Type information for arbitrary key-value data stored on EDDObject instances. """

    # defining values to use in the for_context field
    STUDY = METADATA_CONTEXT_STUDY  # metadata stored in a Study
    LINE = METADATA_CONTEXT_LINE  # metadata stored in a Line
    ASSAY = METADATA_CONTEXT_ASSAY  # metadata stored in an Assay
    # TODO: support metadata on other EDDObject types (Protocol, Strain, Carbon Source, etc)
    CONTEXT_SET = (
        (STUDY, 'Study'),
        (LINE, 'Line'),
        (ASSAY, 'Assay'),
    )

    class Meta:
        db_table = 'metadata_type'
        unique_together = (('type_name', 'for_context', ), )
    # optionally link several metadata types into a common group
    group = models.ForeignKey(MetadataGroup, blank=True, null=True)
    # a default label for the type; should normally use i18n lookup for display
    type_name = models.CharField(max_length=255)
    # an i18n lookup for type label
    # NOTE: migration 0005_SYNBIO-1120_linked_metadata adds a partial unique index to this field
    # i.e. CREATE UNIQUE INDEX … ON metadata_type(type_i18n) WHERE type_i18n IS NOT NULL
    type_i18n = models.CharField(max_length=255, blank=True, null=True)
    # field to store metadata, or None if stored in meta_store
    type_field = models.CharField(max_length=255, blank=True, null=True, default=None)
    # size of input text field
    input_size = models.IntegerField(default=6)
    # type of the input; support checkboxes, autocompletes, etc
    input_type = models.CharField(max_length=255, blank=True, null=True)
    # a default value to use if the field is left blank
    default_value = models.CharField(max_length=255, blank=True)
    # label used to prefix values
    prefix = models.CharField(max_length=255, blank=True)
    # label used to postfix values (e.g. unit specifier)
    postfix = models.CharField(max_length=255, blank=True)
    # target object for metadata
    for_context = models.CharField(max_length=8, choices=CONTEXT_SET)
    # type of data saved, None defaults to a bare string
    type_class = models.CharField(max_length=255, blank=True, null=True)

    @classmethod
    def all_types_on_instances(cls, instances=[]):
        # grab all the keys on each instance meta_store
        all_ids = [set(o.meta_store.keys()) for o in instances if isinstance(o, EDDObject)]
        # reduce all into a set to get only unique ids
        ids = reduce(lambda a, b: a.union(b), all_ids, set())
        return MetadataType.objects.filter(
            pk__in=ids,
        ).order_by(
            Func(F('type_name'), function='LOWER'),
        )

    def load_type_class(self):
        if self.type_class is not None:
            try:
                # TODO support models outside of this module?
                mod = __import__('main.models', fromlist=[self.type_class, ])
                return getattr(mod, self.type_class)
            except AttributeError:
                warnings.warn('MetadataType %s has unknown type_class %s' %
                              (self, self.type_class, ))
        return None

    def decode_value(self, value):
        """ A postgres HStore column only supports string keys and string values. This method uses
            the definition of the MetadataType to convert a string from the database into an
            appropriate Python object. """
        try:
            if self.type_class is None:
                return value  # for compatibility, bare strings used on None types
            MetaModel = self.load_type_class()
            if MetaModel is None:
                return json.loads(value)
            return MetaModel.objects.get(pk=value)
        except Exception:
            logger.warning('Failed to decode metadata %s, returning raw value' % self)
        return value

    def encode_value(self, value):
        """ A postgres HStore column only supports string keys and string values. This method uses
            the definition of the MetadataType to convert a Python object into a string to be
            saved in the database. """
        try:
            if isinstance(value, string_types) and self.type_class is None:
                return value  # for compatibility, store strings bare
            MetaModel = self.load_type_class()
            if MetaModel is None:
                return json.dumps(value)
            elif isinstance(value, MetaModel):
                return '%s' % value.pk
        except Exception:
            logger.warning('Failed to encode metadata %s, storing string representation' % self)
        return '%s' % value

    def for_line(self):
        return (self.for_context == self.LINE)

    def for_assay(self):
        return (self.for_context == self.ASSAY)

    def for_study(self):
        return (self.for_context == self.STUDY)

    def __str__(self):
        return self.type_name

    def to_json(self, depth=0):
        # TODO: refactor to have sane names in EDDDataInterface.ts
        return {
            "id": self.pk,
            "gn": self.group.group_name if self.group else None,
            "gid": self.group.id if self.group else None,
            "name": self.type_name,
            "is": self.input_size,
            "pre": self.prefix,
            "postfix": self.postfix,
            "default": self.default_value,
            "ll": self.for_line(),
            "pl": self.for_assay(),
            "context": self.for_context,
        }

    @classmethod
    def all_with_groups(cls):
        return cls.objects.select_related("group").order_by(
            Func(F('type_name'), function='LOWER'),
        )

    def is_allowed_object(self, obj):
        """ Indicate whether this metadata type can be associated with the given object based on
            the for_context attribute. """
        if isinstance(obj, Study):
            return self.for_study()
        elif isinstance(obj, Line):
            return self.for_line()
        elif isinstance(obj, Assay):
            return self.for_assay()
        return False


class EDDMetadata(models.Model):
    """ Base class for EDD models supporting metadata. """
    class Meta:
        abstract = True

    # store arbitrary metadata as a dict with hstore extension
    meta_store = HStoreField(blank=True, default=dict)

    def get_metadata_json(self):
        return self.meta_store

    def get_metadata_types(self):
        return MetadataType.objects.filter(pk__in=self.meta_store.keys())

    def get_metadata_dict(self):
        """ Return a Python dictionary of metadata with the keys replaced by the
            string representations of the corresponding MetadataType records. """
        metadata_types = {'%s' % mt.id: mt for mt in self.get_metadata_types()}
        metadata = {}
        for pk, value in self.meta_store.iteritems():
            metadata_type = metadata_types[pk]
            if metadata_type.prefix:
                value = metadata_type.prefix + " " + value
            if metadata_type.postfix:
                value = value + " " + metadata_type.postfix
            metadata['%s' % metadata_types[pk]] = value
        return metadata

    def metadata_add(self, metatype, value, append=True):
        """ Adds metadata to the object; by default, if there is already metadata of the same type,
            the value is appended to a list with previous value(s). Set kwarg `append` to False to
            overwrite previous values. """
        if not metatype.is_allowed_object(self):
            raise ValueError("The metadata type '%s' does not apply to %s objects." % (
                metatype.type_name, type(self)))
        if metatype.type_field is None:
            if append:
                prev = self.metadata_get(metatype)
                if hasattr(prev, 'append'):
                    prev.append(value)
                    value = prev
                elif prev is not None:
                    value = [prev, value, ]
            self.meta_store['%s' % metatype.pk] = metatype.encode_value(value)
        else:
            temp = getattr(self, metatype.type_field)
            if hasattr(temp, 'add'):
                if append:
                    temp.add(value)
                else:
                    setattr(self, metatype.type_field, [value, ])
            else:
                setattr(self, metatype.type_field, value)

    def metadata_clear(self, metatype):
        """ Removes all metadata of the type from this object. """
        if metatype.type_field is None:
            del self.meta_store['%s' % metatype.pk]
        else:
            temp = getattr(self, metatype.type_field)
            if hasattr(temp, 'clear'):
                temp.clear()
            else:
                setattr(self, metatype.type_field, None)

    def metadata_get(self, metatype, default=None):
        """ Returns the metadata on this object matching the type. """
        if metatype.type_field is None:
            value = self.meta_store.get('%s' % metatype.pk, None)
            if value is None:
                return default
            return metatype.decode_value(value)
        return getattr(self, metatype.type_field)

    def metadata_remove(self, metatype, value):
        """ Removes metadata with a value matching the argument for the type. """
        prev = self.metadata_get(metatype)
        if prev:
            if value == prev:
                self.metadata_clear(metatype)
            else:
                try:
                    prev.remove(value)
                    self.meta_store['%s' % metatype.pk] = prev
                except ValueError:
                    pass


@python_2_unicode_compatible
class EDDObject(EDDMetadata, EDDSerialize):
    """ A first-class EDD object, with update trail, comments, attachments. """
    class Meta:
        db_table = 'edd_object'
    name = models.CharField(max_length=255)
    description = models.TextField(blank=True, null=True)
    active = models.BooleanField(default=True)
    updates = models.ManyToManyField(Update, db_table='edd_object_update', related_name='+')
    # these are used often enough we should save extra queries by including as fields
    created = models.ForeignKey(Update, related_name='object_created', editable=False)
    updated = models.ForeignKey(Update, related_name='object_updated', editable=False)

    @property
    def mod_epoch(self):
        return arrow.get(self.updated.mod_time).timestamp

    @property
    def last_modified(self):
        return self.updated.format_timestamp()

    def was_modified(self):
        return self.updates.count() > 1

    @property
    def date_created(self):
        return self.created.format_timestamp()

    def get_attachment_count(self):
        return self.files.count()

    @property
    def attachments(self):
        return self.files.all()

    @property
    def comment_list(self):
        return self.comments.order_by('created__mod_time').all()

    def get_comment_count(self):
        return self.comments.count()

    @classmethod
    def metadata_type_frequencies(cls):
        return dict(
            MetadataType.objects.extra(select={
                'count': 'SELECT COUNT(1) FROM edd_object o '
                         'INNER JOIN %s x ON o.id = x.object_ref_id '
                         'WHERE o.meta_store ? metadata_type.id::varchar'
                         % cls._meta.db_table
                }).values_list('id', 'count')
            )

    def __str__(self):
        return self.name

    @classmethod
    def all_sorted_by_name(cls):
        """ Returns a query set sorted by the name field in case-insensitive order. """
        return cls.objects.order_by(Func(F('name'), function='LOWER'))

    def update_name_from_form(self, form, key):
        """ Set the 'name' field from a posted form, with error checking. """
        name = form.get(key, "").strip()
        if name == "":
            raise ValueError("%s name must not be blank." % self.__class__.__name__)
        self.name = name

    def save(self, *args, **kwargs):
        update = kwargs.get('update', None)
        if update is None:
            update = Update.load_update()
        if self.created_id is None:
            self.created = update
        self.updated = update
        super(EDDObject, self).save(*args, **kwargs)
        # must ensure EDDObject is saved *before* attempting to add to updates
        self.updates.add(self.updated)

    @classmethod
    def export_columns(cls, instances=[]):
        # only do ID and Name here, allow overrides to include e.g. metadata
        return [
            table.ColumnChoice(
                cls, 'id', _('ID'), lambda x: x.id, heading=cls.__name__ + ' ID'),
            table.ColumnChoice(
                cls, 'name', _('Name'), lambda x: x.name, heading=cls.__name__ + ' Name'),
        ]

    def to_json(self, depth=0):
        return {
            'id': self.pk,
            'name': self.name,
            'description': self.description,
            'active': self.active,
            'meta': self.get_metadata_json(),
            # Always include expanded created/updated objects instead of IDs
            'modified': self.updated.to_json(depth) if self.updated else None,
            'created': self.created.to_json(depth) if self.created else None,
        }

    def user_can_read(self, user):
        return True

    def user_can_write(self, user):
        return user and user.is_superuser


@python_2_unicode_compatible
class Study(EDDObject):
    """ A collection of items to be studied. """
    class Meta:
        db_table = 'study'
        verbose_name_plural = 'Studies'
    object_ref = models.OneToOneField(EDDObject, parent_link=True, related_name='+')
    # contact info has two fields to support:
    # 1. linking to a specific user in EDD
    # 2. "This is data I got from 'Improving unobtanium production in Bio-Widget using foobar'
    #    published in Feb 2016 Bio-Widget Journal, paper has hpotter@hogwarts.edu as contact"
    contact = models.ForeignKey(settings.AUTH_USER_MODEL, blank=True, null=True,
                                related_name='contact_study_set')
    contact_extra = models.TextField()
    metabolic_map = models.ForeignKey('SBMLTemplate', blank=True, null=True)
    # NOTE: this is NOT a field for a definitive list of Protocols on a Study; it is for Protocols
    #   which may not have been paired with a Line in an Assay. e.g. when creating a blank Study
    #   pre-filled with the Protocols to be used. Get definitive list by doing union of this field
    #   and Protocols linked via Assay-Line-Study chain.
    protocols = models.ManyToManyField('Protocol', blank=True, db_table='study_protocol')

    @classmethod
    def export_columns(cls, instances=[]):
        return super(Study, cls).export_columns(instances) + [
            table.ColumnChoice(
                cls, 'contact', _('Contact'), lambda x: x.get_contact(), heading='Study Contact'),
        ]

    def __str__(self):
        return self.name

    def to_solr_json(self):
        """ Convert the Study model to a dict structure formatted for Solr JSON. """
        created = self.created
        updated = self.updated
        return {
            'id': self.pk,
            'name': self.name,
            'description': self.description,
            'creator': created.mod_by_id,
            'creator_email': created.email,
            'creator_name': created.full_name,
            'initials': created.initials,
            'contact': self.get_contact(),
            'active': self.active,
            'created': created.mod_time.strftime('%Y-%m-%dT%H:%M:%SZ'),
            'modified': updated.mod_time.strftime('%Y-%m-%dT%H:%M:%SZ'),
            'attachment_count': self.get_attachment_count(),
            'comment_count': self.get_comment_count(),
            'metabolite': [m.to_solr_value() for m in self.get_metabolite_types_used()],
            'protocol': [p.to_solr_value() for p in self.get_protocols_used()],
            'part': [s.to_solr_value() for s in self.get_strains_used()],
            'aclr': [p.__str__() for p in self.get_combined_permission() if p.is_read()],
            'aclw': [p.__str__() for p in self.get_combined_permission() if p.is_write()],
        }

    @staticmethod
    def user_permission_q(user, permission, keyword_prefix=''):
        """
        Constructs a django Q object for testing whether the specified user has the required
        permission for a study as part of a Study-related Django model query. It's important to
        note that the provided Q object will return one row for each user/group permission that
        gives the user access to the study, so clients will often want to use distinct() to limit
        the returned results. Note that this only tests whether the user or group has specific
        permissions granted on the Study, not whether the user's role (e.g. 'staff', 'admin')
        gives him/her access to it.  See user_role_has_read_access(user), user_can_read(self, user).
        :param user: the user
        :param permission: the study permission type to test (e.g. StudyPermission.READ); can be
            any iterable of permissions or a single permission
        :param keyword_prefix: an optional keyword prefix to prepend to the query keyword arguments.
        For example when querying Study, the default value of '' should be used, or when querying
        for Lines, whose permissions depend on the related Study, use 'study__' similar to other
        queryset keyword arguments.
        :return: true if the user has the specified permission to the study
        """
        prefix = keyword_prefix
        perm = permission
        if isinstance(permission, string_types):
            perm = (permission, )
        user_perm = '%suserpermission' % prefix
        group_perm = '%sgrouppermission' % prefix
        all_perm = '%severyonepermission' % prefix
        return (
            Q(**{
                '%s__user' % user_perm: user,
                '%s__permission_type__in' % user_perm: perm,
            }) |
            Q(**{
                '%s__group__user' % group_perm: user,
                '%s__permission_type__in' % group_perm: perm,
            }) |
            Q(**{
                '%s__permission_type__in' % all_perm: perm,
            })
        )

    @staticmethod
    def user_role_can_read(user):
        return user.is_superuser or user.is_staff

    def user_can_read(self, user):
        """ Utility method testing if a user has read access to a Study. """
        return user and (self.user_role_can_read(user) or any(p.is_read() for p in chain(
            self.userpermission_set.filter(user=user),
            self.grouppermission_set.filter(group__user=user),
            self.everyonepermission_set.all(),
        )))

    def user_can_write(self, user):
        """ Utility method testing if a user has write access to a Study. """
        return super(Study, self).user_can_write(user) or any(p.is_write() for p in chain(
            self.userpermission_set.filter(user=user),
            self.grouppermission_set.filter(group__user=user),
            self.everyonepermission_set.all(),
        ))

    @staticmethod
    def user_can_create(user):
        if hasattr(settings, 'EDD_ONLY_SUPERUSER_CREATE') and settings.EDD_ONLY_SUPERUSER_CREATE:
            return user.is_superuser
        return True

    def get_combined_permission(self):
        """ Returns a chained iterator over all user and group permissions on a Study. """
        return chain(
            self.userpermission_set.all(),
            self.grouppermission_set.all(),
            self.everyonepermission_set.all(),
        )

    def get_contact(self):
        """ Returns the contact email, or supplementary contact information if no contact user is
            set. """
        if self.contact is None:
            return self.contact_extra
        return self.contact.email

    def get_metabolite_types_used(self):
        """ Returns a QuerySet of all Metabolites used in the Study. """
        return Metabolite.objects.filter(assay__line__study=self).distinct()

    def get_protocols_used(self):
        """ Returns a QuerySet of all Protocols used in the Study. """
        return Protocol.objects.filter(
            Q(assay__line__study=self) | Q(study=self)
        ).distinct()

    def get_strains_used(self):
        """ Returns a QuerySet of all Strains used in the Study. """
        return Strain.objects.filter(line__study=self).distinct()

    def get_assays(self):
        """ Returns a QuerySet of all Assays contained in the Study. """
        return Assay.objects.filter(line__study=self)

    def get_assays_by_protocol(self):
        """ Returns a dict mapping Protocol ID to all Assays in Study using that Protocol. """
        assays_by_protocol = defaultdict(list)
        for assay in self.get_assays():
            assays_by_protocol[assay.protocol_id].append(assay.id)
        return assays_by_protocol

    def to_json(self, depth=0):
        json_dict = super(Study, self).to_json(depth=depth)
        contact = self.get_attr_depth('contact', depth, default={})
        if isinstance(contact, dict):
            contact['extra'] = self.contact_extra
        else:
            contact = {'id': contact, 'extra': self.contact_extra}
        json_dict.update({
            'contact': contact,
            'metabolic_map': self.get_attr_depth('metabolic_map', depth),
        })
        return json_dict


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
        (NONE, 'None'),
        (READ, 'Read'),
        (WRITE, 'Write'),
    )
    study = models.ForeignKey(Study)
    permission_type = models.CharField(max_length=8, choices=TYPE_CHOICE, default=NONE)

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
    user = models.ForeignKey(settings.AUTH_USER_MODEL, related_name='userpermission_set')

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
    group = models.ForeignKey('auth.Group', related_name='grouppermission_set')

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


@python_2_unicode_compatible
class Protocol(EDDObject):
    """ A defined method of examining a Line. """
    class Meta:
        db_table = 'protocol'
    CATEGORY_NONE = 'NA'
    CATEGORY_OD = 'OD'
    CATEGORY_HPLC = 'HPLC'
    CATEGORY_LCMS = 'LCMS'
    CATEGORY_RAMOS = 'RAMOS'
    CATEGORY_TPOMICS = 'TPOMICS'
    CATEGORY_CHOICE = (
        (CATEGORY_NONE, 'None'),
        (CATEGORY_OD, 'Optical Density'),
        (CATEGORY_HPLC, 'HPLC'),
        (CATEGORY_LCMS, 'LCMS'),
        (CATEGORY_RAMOS, 'RAMOS'),
        (CATEGORY_TPOMICS, 'Transcriptomics / Proteomics'),
    )

    object_ref = models.OneToOneField(EDDObject, parent_link=True, related_name='+')
    owned_by = models.ForeignKey(settings.AUTH_USER_MODEL, related_name='protocol_set')
    variant_of = models.ForeignKey('self', blank=True, null=True, related_name='derived_set')
    default_units = models.ForeignKey(
        'MeasurementUnit', blank=True, null=True, related_name="protocol_set")
    categorization = models.CharField(
        max_length=8, choices=CATEGORY_CHOICE, default=CATEGORY_NONE)

    def creator(self):
        return self.created.mod_by

    def owner(self):
        return self.owned_by

    def last_modified(self):
        return self.updated.mod_time

    def to_solr_value(self):
        return '%(id)s@%(name)s' % {'id': self.pk, 'name': self.name}

    def __str__(self):
        return self.name

    def save(self, *args, **kwargs):
        if self.name in ['', None, ]:
            raise ValueError("Protocol name required.")
        p = Protocol.objects.filter(name=self.name)
        if ((self.id is not None and p.count() > 1) or
                (self.id is None and p.count() > 0)):
            raise ValueError("There is already a protocol named '%s'." % self.name)
        return super(Protocol, self).save(*args, **kwargs)


@python_2_unicode_compatible
class WorklistTemplate(EDDObject):
    """ Defines sets of metadata to use as a template on a Protocol. """
    class Meta:
        db_table = 'worklist_template'
    protocol = models.ForeignKey(Protocol)

    def __str__(self):
        return self.name


@python_2_unicode_compatible
class WorklistColumn(models.Model):
    """ Defines metadata defaults and layout. """
    class Meta:
        db_table = 'worklist_column'
    template = models.ForeignKey(WorklistTemplate)
    # if meta_type is None, treat default_value as format string
    meta_type = models.ForeignKey(MetadataType, blank=True, null=True)
    # if None, default to meta_type.type_name or ''
    heading = models.CharField(max_length=255, blank=True, null=True)
    # potentially override the default value in templates?
    default_value = models.CharField(max_length=255, blank=True, null=True)
    # text to display in UI explaining how to modify column
    help_text = models.TextField(blank=True, null=True)
    # allow ordering of metadata
    ordering = models.IntegerField(blank=True, null=True, unique=True)

    def get_column(self, **kwargs):
        type_context = None

        def lookup_format(instance, **kwargs):
            return self.get_default() % self.get_format_dict(instance, **kwargs)

        def lookup_meta(instance, **kwargs):
            default = self.get_default() % kwargs
            if instance:
                return instance.metadata_get(self.meta_type, default=default)
            return default

        if self.meta_type:
            type_context = self.meta_type.for_context
            lookup = lookup_meta
        else:
            type_context = None
            lookup = lookup_format
        model = {
            MetadataType.STUDY: Study,
            MetadataType.LINE: Line,
            MetadataType.ASSAY: Assay,
        }.get(type_context, None)
        return table.ColumnChoice(
            model, 'worklist_column_%s' % self.pk, str(self), lookup,
        )

    def get_default(self):
        if self.default_value:
            return self.default_value
        elif self.meta_type:
            return self.meta_type.default_value
        return ''

    def get_format_dict(self, instance, *args, **kwargs):
        """ Build dict used in format string for columns that use it. This implementation re-uses
            EDDObject.to_json(), in a flattened format. """
        # Must import inside method to avoid circular import
        from .utilities import flatten_json
        fmt_dict = flatten_json(instance.to_json(depth=1) if instance else {})
        # add in: date
        # TODO: pass in tz based on user profile?
        fmt_dict.update(today=arrow.now().format('YYYYMMDD'))
        fmt_dict.update(**kwargs)
        return fmt_dict

    def __str__(self):
        if self.heading:
            return self.heading
        return str(self.meta_type)


class LineProperty(object):
    """ Base class for EDDObject instances tied to a Line. """
    @property
    def n_lines(self):
        return self.line_set.count()

    @property
    def n_studies(self):
        lines = self.line_set.all()
        return len(set([l.study_id for l in lines]))


@python_2_unicode_compatible
class Strain(EDDObject, LineProperty):
    """ A link to a strain/part in the JBEI ICE Registry. """
    class Meta:
        db_table = 'strain'
    object_ref = models.OneToOneField(EDDObject, parent_link=True)
    registry_id = models.UUIDField(blank=True, null=True)
    registry_url = models.URLField(max_length=255, blank=True, null=True)

    def __str__(self):
        return self.name

    def to_solr_value(self):
        return '%(id)s@%(name)s' % {'id': self.registry_id, 'name': self.name}

    def to_json(self, depth=0):
        json_dict = super(Strain, self).to_json(depth)
        json_dict.update({
            'registry_id': self.registry_id,
            'registry_url': self.registry_url,
            })
        return json_dict

    @staticmethod
    def user_can_change(user):
        return user.has_perm('edd.change_strain')

    @staticmethod
    def user_can_create(user):
        return user.has_perm('edd.add_strain')

    @staticmethod
    def user_can_delete(user):
        return user.has_perm('edd.delete_strain')


@python_2_unicode_compatible
class CarbonSource(EDDObject, LineProperty):
    """ Information about carbon sources, isotope labeling. """
    class Meta:
        db_table = 'carbon_source'
    object_ref = models.OneToOneField(EDDObject, parent_link=True)
    # Labeling is description of isotope labeling used in carbon source
    labeling = models.TextField()
    volume = models.DecimalField(max_digits=16, decimal_places=5)

    def to_json(self, depth=0):
        json_dict = super(CarbonSource, self).to_json(depth)
        json_dict.update({
            'labeling': self.labeling,
            'volume': self.volume,
            'initials': self.created.initials,  # TODO: see if this is used, maybe replace
        })
        return json_dict

    def __str__(self):
        return "%s (%s)" % (self.name, self.labeling)


@python_2_unicode_compatible
class Line(EDDObject):
    """ A single item to be studied (contents of well, tube, dish, etc). """
    class Meta:
        db_table = 'line'
    study = models.ForeignKey(Study)
    control = models.BooleanField(default=False)
    replicate = models.ForeignKey('self', blank=True, null=True)

    object_ref = models.OneToOneField(EDDObject, parent_link=True, related_name='+')
    contact = models.ForeignKey(
        settings.AUTH_USER_MODEL, blank=True, null=True, related_name='line_contact_set')
    contact_extra = models.TextField()
    experimenter = models.ForeignKey(
        settings.AUTH_USER_MODEL, blank=True, null=True, related_name='line_experimenter_set')
    carbon_source = models.ManyToManyField(CarbonSource, blank=True, db_table='line_carbon_source')
    protocols = models.ManyToManyField(Protocol, through='Assay')
    strains = models.ManyToManyField(Strain, blank=True, db_table='line_strain')

    @classmethod
    def export_columns(cls, instances=[]):
        types = MetadataType.all_types_on_instances(instances)
        return super(Line, cls).export_columns(instances) + [
            table.ColumnChoice(
                cls, 'control', _('Control'), lambda x: 'T' if x.control else 'F'),
            table.ColumnChoice(
                # TODO export should handle multi-valued fields better than this
                cls, 'strain', _('Strain'),
                lambda x: '|'.join([s.name for s in x.strains.all()])),
            table.ColumnChoice(
                # TODO export should handle multi-valued fields better than this
                cls, 'csource_name', _('Carbon Source'),
                lambda x: '|'.join([c.name for c in x.carbon_source.all()])),
            table.ColumnChoice(
                # TODO export should handle multi-valued fields better than this
                cls, 'csource_label', _('Carbon Labeling'),
                lambda x: '|'.join([c.labeling for c in x.carbon_source.all()])),
            table.ColumnChoice(
                cls, 'experimenter', _('Experimenter'),
                lambda x: x.experimenter.email if x.experimenter else '',
                heading=_('Line Experimenter')),
            table.ColumnChoice(
                cls, 'contact', _('Contact'),
                lambda x: x.contact.email if x.contact else '',
                heading=_('Line Contact')),
        ] + [
            table.ColumnChoice(
                cls, 'meta.%s' % t.id, t.type_name,
                lambda x: x.meta_store.get('%s' % t.id, ''))
            for t in types
        ]

    def __str__(self):
        return self.name

    def to_json(self, depth=0):
        json_dict = super(Line, self).to_json(depth)
        # for backward-compatibility, add the 'extra' item to contact dict
        contact = self.get_attr_depth('contact', depth, default={})
        if isinstance(contact, dict):
            contact['extra'] = self.contact_extra
        else:
            contact = {'user_id': contact, 'extra': self.contact_extra}
        json_dict.update({
            'control': self.control,
            'replicate': self.replicate_id,
            'contact': contact,
            'experimenter': self.get_attr_depth('experimenter', depth),
            'strain': [s.pk for s in self.strains.all()],
            'carbon': [c.pk for c in self.carbon_source.all()],
        })
        if depth > 0:
            json_dict.update(study=self.study_id)
        return json_dict

    @property
    def primary_strain_name(self):
        strains = self.strains.all()
        return strains[0].name if len(strains) > 0 else None

    @property
    def strain_ids(self):
        """ String representation of associated strains; used in views. """
        return ",".join([s.name for s in self.strains.all()])

    @property
    def carbon_source_info(self):
        """ String representation of carbon source(s) with labeling included; used in views. """
        return ",".join(['%s' % cs for cs in self.carbon_source.all()])

    @property
    def carbon_source_name(self):
        """ String representation of carbon source(s); used in views. """
        return ",".join([cs.name for cs in self.carbon_source.all()])

    @property
    def carbon_source_labeling(self):
        """ String representation of labeling (if any); used in views. """
        return ",".join([cs.labeling for cs in self.carbon_source.all()])

    def new_assay_number(self, protocol):
        """ Given a Protocol name, fetch all matching child Assays, attempt to convert their names
            into integers, and return the next highest integer for creating a new assay.  (This
            will result in duplication of names for Assays of different protocols under the same
            Line, but the frontend displays Assay.long_name, which should be unique.) """
        if isinstance(protocol, str):  # assume Protocol.name
            protocol = Protocol.objects.get(name=protocol)
        assays = self.assay_set.filter(protocol=protocol)
        existing_assay_numbers = []
        for assay in assays:
            try:
                existing_assay_numbers.append(int(assay.name))
            except ValueError:
                pass
        assay_start_id = 1
        if len(existing_assay_numbers) > 0:
            assay_start_id = max(existing_assay_numbers) + 1
        return assay_start_id

    def user_can_read(self, user):
        return self.study.user_can_read(user)

    def user_can_write(self, user):
        return self.study.user_can_write(user)


class MeasurementGroup(object):
    """ Does not need its own table in database, but multiple models will reference measurements
        that are specific to a specific group category: metabolomics, proteomics, etc.
        Note that when a new group type is added here, code will need to be updated elsewhere,
        including the Javascript/Typescript front end.
        Look for the string 'MeasurementGroupCode' in comments."""
    GENERIC = '_'
    METABOLITE = 'm'
    GENEID = 'g'
    PROTEINID = 'p'
    PHOSPHOR = 'h'
    GROUP_CHOICE = (
        (GENERIC, 'Generic'),
        (METABOLITE, 'Metabolite'),
        (GENEID, 'Gene Identifier'),
        (PROTEINID, 'Protein Identifer'),
        (PHOSPHOR, 'Phosphor'),
    )


@python_2_unicode_compatible
class MeasurementType(models.Model, EDDSerialize):
    """ Defines the type of measurement being made. A generic measurement only has name and short
        name; if the type is a metabolite, the metabolite attribute will contain additional
        metabolite info. """
    class Meta:
        db_table = 'measurement_type'
    type_name = models.CharField(max_length=255)
    short_name = models.CharField(max_length=255, blank=True, null=True)
    type_group = models.CharField(max_length=8,
                                  choices=MeasurementGroup.GROUP_CHOICE,
                                  default=MeasurementGroup.GENERIC)

    def to_solr_value(self):
        return '%(id)s@%(name)s' % {'id': self.pk, 'name': self.type_name}

    def to_json(self, depth=0):
        return {
            "id": self.pk,
            "name": self.type_name,
            "sn": self.short_name,
            "family": self.type_group,
        }

    def __str__(self):
        return self.type_name

    def is_metabolite(self):
        return self.type_group == MeasurementGroup.METABOLITE

    def is_protein(self):
        return self.type_group == MeasurementGroup.PROTEINID

    def is_gene(self):
        return self.type_group == MeasurementGroup.GENEID

    def is_phosphor(self):
        return self.type_group == MeasurementGroup.PHOSPHOR

    @classmethod
    def proteins(cls):
        """ Return all instances of protein measurements. """
        return cls.objects.filter(type_group=MeasurementGroup.PROTEINID)

    @classmethod
    def proteins_by_name(cls):
        """ Generate a dictionary of proteins keyed by name. """
        return {p.type_name: p for p in cls.proteins().order_by("type_name")}

    @classmethod
    def create_protein(cls, type_name, short_name=None):
        return cls.objects.create(
            type_name=type_name,
            short_name=short_name,
            type_group=MeasurementGroup.PROTEINID)


@python_2_unicode_compatible
class Metabolite(MeasurementType):
    """ Defines additional metadata on a metabolite measurement type; charge, carbon count, molar
        mass, and molecular formula.
        TODO: aliases for metabolite type_name/short_name
        TODO: datasource; BiGG vs JBEI-created records
        TODO: links to kegg files? """
    class Meta:
        db_table = 'metabolite'
    charge = models.IntegerField()
    carbon_count = models.IntegerField()
    molar_mass = models.DecimalField(max_digits=16, decimal_places=5)
    molecular_formula = models.TextField()
    tags = ArrayField(VarCharField(), default=[])
    source = models.ForeignKey(Datasource, blank=True, null=True)

    carbon_pattern = re.compile(r'C(\d*)')

    def __str__(self):
        return self.type_name

    def is_metabolite(self):
        return True

    def to_json(self, depth=0):
        """ Export a serializable dictionary. """
        return dict(super(Metabolite, self).to_json(), **{
            # FIXME the alternate names pointed to by the 'ans' key are
            # supposed to come from the 'alternate_metabolite_type_names'
            # table in the old EDD, but this is actually empty.  Do we need it?
            "ans": "",
            "f": self.molecular_formula,
            "mm": float(self.molar_mass),
            "cc": self.carbon_count,
            "chg": self.charge,
            "chgn": self.charge,  # TODO find anywhere in typescript using this and fix it
            "kstr": ",".join(self.tags),  # TODO find anywhere in typescript using this and fix
            "tags": self.tags,
        })

    def save(self, *args, **kwargs):
        if self.carbon_count is None:
            self.carbon_count = self.extract_carbon_count()
        # force METABOLITE group
        self.type_group = MeasurementGroup.METABOLITE
        super(Metabolite, self).save(*args, **kwargs)

    def extract_carbon_count(self):
        count = 0
        for match in self.carbon_pattern.finditer(self.molecular_formula):
            c = match.group(1)
            count = count + (int(c) if c else 1)
        return count

# override the default type_group for metabolites
Metabolite._meta.get_field('type_group').default = MeasurementGroup.METABOLITE


@python_2_unicode_compatible
class GeneIdentifier(MeasurementType):
    """ Defines additional metadata on gene identifier transcription measurement type. """
    class Meta:
        db_table = 'gene_identifier'
    location_in_genome = models.TextField(blank=True, null=True)
    positive_strand = models.BooleanField(default=True)
    location_start = models.IntegerField(blank=True, null=True)
    location_end = models.IntegerField(blank=True, null=True)
    gene_length = models.IntegerField(blank=True, null=True)

    @classmethod
    def by_name(cls):
        """ Generate a dictionary of genes keyed by name. """
        return {g.type_name: g for g in cls.objects.order_by("type_name")}

    def __str__(self):
        return self.type_name

    def save(self, *args, **kwargs):
        # force GENEID group
        self.type_group = MeasurementGroup.GENEID
        super(GeneIdentifier, self).save(*args, **kwargs)

GeneIdentifier._meta.get_field('type_group').default = MeasurementGroup.GENEID


@python_2_unicode_compatible
class ProteinIdentifier(MeasurementType):
    """ Defines additional metadata on gene identifier transcription measurement type. """
    class Meta:
        db_table = 'protein_identifier'
    length = models.IntegerField(
        blank=True, null=True,
        verbose_name=_('Length'), help_text=_('sequence length')
    )
    mass = models.DecimalField(
        blank=True, null=True, max_digits=16, decimal_places=5,
        verbose_name=_('Mass'), help_text=_('of unprocessed protein, in Daltons'),
    )
    source = models.ForeignKey(
        Datasource, blank=True, null=True,
    )
    accession_pattern = re.compile(
        r'(?:[a-z]{2}\|)?'  # optional identifier for SwissProt or TrEMBL
        r'([OPQ][0-9][A-Z0-9]{3}[0-9]|[A-NR-Z][0-9](?:[A-Z][A-Z0-9]{2}[0-9]){1,2})'  # the ID
        r'(?:\|(\w+))?'  # optional name
    )

    @classmethod
    def match_accession_id(cls, text):
        match = cls.accession_pattern.match(text)
        if match:
            return match.group(1)
        return text

    def __str__(self):
        return self.type_name

    def save(self, *args, **kwargs):
        # force PROTEINID group
        self.type_group = MeasurementGroup.PROTEINID
        super(ProteinIdentifier, self).save(*args, **kwargs)

ProteinIdentifier._meta.get_field('type_group').default = MeasurementGroup.PROTEINID


@python_2_unicode_compatible
class Phosphor(MeasurementType):
    """ Defines metadata for phosphorescent measurements """
    class Meta:
        db_table = 'phosphor_type'
    excitation_wavelength = models.DecimalField(
        max_digits=16, decimal_places=5, blank=True, null=True)
    emission_wavelength = models.DecimalField(
        max_digits=16, decimal_places=5, blank=True, null=True)
    reference_type = models.ForeignKey(
        MeasurementType, blank=True, null=True, related_name='phosphor_set')

    def __str__(self):
        return self.type_name

    def save(self, *args, **kwargs):
        # force PHOSPHOR group
        self.type_group = MeasurementGroup.PHOSPHOR
        super(Phosphor, self).save(*args, **kwargs)

Phosphor._meta.get_field('type_group').default = MeasurementGroup.PHOSPHOR


@python_2_unicode_compatible
class MeasurementUnit(models.Model):
    """ Defines a unit type and metadata on measurement values. """
    class Meta:
        db_table = 'measurement_unit'
    unit_name = models.CharField(max_length=255, unique=True)
    display = models.BooleanField(default=True)
    alternate_names = models.CharField(max_length=255, blank=True, null=True)
    type_group = models.CharField(max_length=8,
                                  choices=MeasurementGroup.GROUP_CHOICE,
                                  default=MeasurementGroup.GENERIC)

    # TODO: this should be somehow rolled up into the unit definition
    conversion_dict = {
        'g/L': lambda y, metabolite: 1000 * y / metabolite.molar_mass,
        'mg/L': lambda y, metabolite: y / metabolite.molar_mass,
        'µg/L': lambda y, metabolite: y / 1000 / metabolite.molar_mass,
        'Cmol/L': lambda y, metabolite: 1000 * y / metabolite.carbon_count,
        'mol/L': lambda y, metabolite: 1000 * y,
        'uM': lambda y, metabolite: y / 1000,
        'mol/L/hr': lambda y, metabolite: 1000 * y,
        'mM': lambda y, metabolite: y,
        'mol/L/hr': lambda y, metabolite: 1000 * y,
    }

    def to_json(self):
        return {"id": self.pk, "name": self.unit_name, }

    @property
    def group_name(self):
        return dict(MeasurementGroup.GROUP_CHOICE)[self.type_group]

    @classmethod
    def all_sorted(cls):
        return cls.objects.filter(display=True).order_by(Func(F('unit_name'), function='LOWER'))

    def __str__(self):
        return self.unit_name


@python_2_unicode_compatible
class Assay(EDDObject):
    """ An examination of a Line, containing the Protocol and set of Measurements. """
    class Meta:
        db_table = 'assay'
    line = models.ForeignKey(Line)
    protocol = models.ForeignKey(Protocol)
    object_ref = models.OneToOneField(EDDObject, parent_link=True)
    experimenter = models.ForeignKey(
        settings.AUTH_USER_MODEL, blank=True, null=True, related_name='assay_experimenter_set')
    measurement_types = models.ManyToManyField(MeasurementType, through='Measurement')

    def __str__(self):
        return self.name

    def get_metabolite_measurements(self):
        return self.measurement_set.filter(
            measurement_type__type_group=MeasurementGroup.METABOLITE)

    def get_protein_measurements(self):
        return self.measurement_set.filter(
            measurement_type__type_group=MeasurementGroup.PROTEINID)

    def get_gene_measurements(self):
        return self.measurement_set.filter(
            measurement_type__type_group=MeasurementGroup.GENEID)

    @property
    def long_name(self):
        return "%s-%s-%s" % (self.line.name, self.protocol.name, self.name)

    def to_json(self, depth=0):
        json_dict = super(Assay, self).to_json(depth)
        json_dict.update({
            'lid': self.get_attr_depth('line', depth),
            'pid': self.get_attr_depth('protocol', depth),
            'experimenter': self.get_attr_depth('experimenter', depth),
        })
        return json_dict


class MeasurementCompartment(object):
    UNKNOWN, INTRACELLULAR, EXTRACELLULAR = range(3)
    short_names = ["", "IC", "EC"]
    names = ["N/A", "Intracellular/Cytosol (Cy)", "Extracellular"]
    GROUP_CHOICE = [('%s' % i, cn) for i, cn in enumerate(names)]


class MeasurementFormat(object):
    SCALAR, VECTOR, GRID, SIGMA, HISTOGRAM = range(5)
    names = ['scalar', 'vector', 'grid', 'sigma', 'histogram', ]
    FORMAT_CHOICE = [('%s' % i, n) for i, n in enumerate(names)]


@python_2_unicode_compatible
class Measurement(EDDMetadata, EDDSerialize):
    """ A plot of data points for an (assay, measurement type) pair. """
    class Meta:
        db_table = 'measurement'
    assay = models.ForeignKey(Assay)
    experimenter = models.ForeignKey(
        settings.AUTH_USER_MODEL, blank=True, null=True,
        related_name='measurement_experimenter_set')
    measurement_type = models.ForeignKey(MeasurementType)
    x_units = models.ForeignKey(MeasurementUnit, related_name='+')
    y_units = models.ForeignKey(MeasurementUnit, related_name='+')
    update_ref = models.ForeignKey(Update)
    active = models.BooleanField(default=True)
    compartment = models.CharField(
        max_length=1, choices=MeasurementCompartment.GROUP_CHOICE,
        default=MeasurementCompartment.UNKNOWN)
    measurement_format = models.CharField(
        max_length=2, choices=MeasurementFormat.FORMAT_CHOICE,
        default=MeasurementFormat.SCALAR)

    @classmethod
    def export_columns(cls):
        return [
            table.ColumnChoice(
                cls, 'type', _('Measurement Type'), lambda x: x.name),
            table.ColumnChoice(
                cls, 'comp', _('Compartment'), lambda x: x.compartment_symbol),
            table.ColumnChoice(
                cls, 'mod', _('Measurement Updated'), lambda x: x.update_ref.mod_time),
            table.ColumnChoice(
                cls, 'x_units', _('X Units'),
                lambda x: x.x_units.unit_name if x.x_units.display else ''),
            table.ColumnChoice(
                cls, 'y_units', _('Y Units'),
                lambda x: x.y_units.unit_name if x.y_units.display else ''),
        ]

    def to_json(self, depth=0):
        return {
            "id": self.pk,
            "assay": self.get_attr_depth('assay', depth),
            "type": self.get_attr_depth('measurement_type', depth),
            "comp": self.compartment,
            "format": self.measurement_format,
            # including points here is extremely inefficient
            # better to directly filter MeasurementValue and map to parent IDs later
            # "values": map(lambda p: p.to_json(), self.measurementvalue_set.all()),
            "x_units": self.x_units_id,
            "y_units": self.y_units_id,
            "meta": self.get_metadata_json(),
        }

    def __str__(self):
        return 'Measurement{%d}{%s}' % (self.assay.id, self.measurement_type)

    # may not be the best method name, if we ever want to support other
    # types of data as vectors in the future
    def is_carbon_ratio(self):
        return (int(self.measurement_format) == MeasurementFormat.VECTOR)

    def valid_data(self):
        """ Data for which the y-value is defined (non-NULL, non-blank). """
        mdata = list(self.data())
        return [md for md in mdata if md.is_defined()]

    def is_extracellular(self):
        return self.compartment == '%s' % MeasurementCompartment.EXTRACELLULAR

    def data(self):
        """ Return the data associated with this measurement. """
        return self.measurementvalue_set.all()

    @property
    def name(self):
        """ alias for self.measurement_type.type_name """
        return self.measurement_type.type_name

    @property
    def short_name(self):
        """ alias for self.measurement_type.short_name """
        return self.measurement_type.short_name

    @property
    def compartment_symbol(self):
        return MeasurementCompartment.short_names[int(self.compartment)]

    @property
    def full_name(self):
        """ measurement compartment plus measurement_type.type_name """
        return ({"0": "", "1": "IC", "2": "EC"}.get(self.compartment) + " " + self.name).strip()

    # TODO also handle vectors
    def extract_data_xvalues(self, defined_only=False):
        qs = self.measurementvalue_set.all()
        if defined_only:
            qs = qs.exclude(y=None, y__len=0)
        # first index unpacks single value from tuple; second index unpacks first value from X
        return map(lambda x: x[0][0], qs.values_list('x'))

    # this shouldn't need to handle vectors
    def interpolate_at(self, x):
        assert (int(self.measurement_format) == MeasurementFormat.SCALAR)
        from main.utilities import interpolate_at
        return interpolate_at(self.valid_data(), x)

    @property
    def y_axis_units_name(self):
        """ Human-readable units for Y-axis.  Not intended for repeated/bulk use, since it
            involves a foreign key lookup. """
        return self.y_units.unit_name

    def is_concentration_measurement(self):
        return (self.y_axis_units_name in ["mg/L", "g/L", "mol/L", "mM", "uM", "Cmol/L", ])

    def save(self, *args, **kwargs):
        update = kwargs.get('update', None)
        # only call Update.load_update() if an update was *not* explicitly passed in
        if update is None:
            update = Update.load_update()
        self.update_ref = update
        super(Measurement, self).save(*args, **kwargs)


@python_2_unicode_compatible
class MeasurementValue(models.Model):
    """ Pairs of ((x0, x1, ... , xn), (y0, y1, ... , ym)) values as part of a measurement """
    class Meta:
        db_table = 'measurement_value'
    measurement = models.ForeignKey(Measurement)
    x = ArrayField(models.DecimalField(max_digits=16, decimal_places=5))
    y = ArrayField(models.DecimalField(max_digits=16, decimal_places=5))
    updated = models.ForeignKey(Update)

    def __str__(self):
        return '(%s, %s)' % (self.x, self.y)

    @property
    def fx(self):
        return float(self.x[0]) if self.x else None

    @property
    def fy(self):
        return float(self.y[0]) if self.y else None

    def to_json(self):
        return {
            "id": self.pk,
            "x": self.x,
            "y": self.y,
        }

    def is_defined(self):
        return (self.y is not None and len(self.y) > 0)

    def save(self, *args, **kwargs):
        update = kwargs.get('update', None)
        # only call Update.load_update() if an update was *not* explicitly passed in
        if update is None:
            update = Update.load_update()
        self.updated = update
        super(MeasurementValue, self).save(*args, **kwargs)


@python_2_unicode_compatible
class SBMLTemplate(EDDObject):
    """ Container for information used in SBML export. """
    class Meta:
        db_table = "sbml_template"
    object_ref = models.OneToOneField(EDDObject, parent_link=True)
    biomass_calculation = models.DecimalField(default=-1, decimal_places=5, max_digits=16)
    biomass_calculation_info = models.TextField(default='')
    biomass_exchange_name = models.TextField()
    # FIXME would like to limit this to attachments only on parent EDDObject, and remove null=True
    sbml_file = models.ForeignKey(Attachment, blank=True, null=True)

    def __str__(self):
        return self.name

    @property
    def xml_file(self):
        return self.sbml_file

    def load_reactions(self):
        read_sbml = self.parseSBML()
        if read_sbml.getNumErrors() > 0:
            log = read_sbml.getErrorLog()
            for i in range(read_sbml.getNumErrors()):
                logger.error("--- SBML ERROR --- %s" % log.getError(i).getMessage())
            raise Exception("Could not load SBML")
        model = read_sbml.getModel()
        rlist = model.getListOfReactions()
        return rlist

    def parseSBML(self):
        if not hasattr(self, '_sbml_document'):
            # self.sbml_file = ForeignKey
            # self.sbml_file.file = FileField on Attachment
            # self.sbml_file.file.file = File object on FileField
            contents = self.sbml_file.file.file.read()
            import libsbml
            self._sbml_document = libsbml.readSBMLFromString(contents)
        return self._sbml_document

    def save(self, *args, **kwargs):
        # may need to do a post-save signal; get sbml attachment and save in sbml_file
        super(SBMLTemplate, self).save(*args, **kwargs)

    def to_json(self, depth=0):
        return {
            "id": self.pk,
            "name": self.name,
            "biomassCalculation": self.biomass_calculation,
        }


@python_2_unicode_compatible
class MetaboliteExchange(models.Model):
    """ Mapping for a metabolite to an exchange defined by a SBML template. """
    class Meta:
        db_table = "measurement_type_to_exchange"
        index_together = (
            ("sbml_template", "reactant_name"),  # reactants not unique, but should be searchable
            ("sbml_template", "exchange_name"),  # index implied by unique, making explicit
        )
        unique_together = (
            ("sbml_template", "exchange_name"),
            ("sbml_template", "measurement_type"),
        )
    sbml_template = models.ForeignKey(SBMLTemplate)
    measurement_type = models.ForeignKey(MeasurementType, blank=True, null=True)
    reactant_name = VarCharField()
    exchange_name = VarCharField()

    def __str__(self):
        return self.exchange_name


@python_2_unicode_compatible
class MetaboliteSpecies(models.Model):
    """ Mapping for a metabolite to an species defined by a SBML template. """
    class Meta:
        db_table = "measurement_type_to_species"
        index_together = (
            ("sbml_template", "species"),  # index implied by unique, making explicit
        )
        unique_together = (
            ("sbml_template", "species"),
            ("sbml_template", "measurement_type"),
        )
    sbml_template = models.ForeignKey(SBMLTemplate)
    measurement_type = models.ForeignKey(MeasurementType, blank=True, null=True)
    species = VarCharField()

    def __str__(self):
        return self.species


# XXX MONKEY PATCHING
def guess_initials(user):
    return (user.first_name or '')[:1] + (user.last_name or '')[:1]


def User_profile(self):
    try:
        from edd.profile.models import UserProfile
        try:
            return self.userprofile
        except UserProfile.DoesNotExist:
            return UserProfile.objects.create(user=self, initials=guess_initials(self))
    except:
        logger.exception('Failed to load a profile object for %s', self)
        return None


def User_initials(self):
    return self.profile.initials if self.profile else _('?')


def User_institution(self):
    if self.profile and self.profile.institutions.count():
        return self.profile.institutions.all()[:1][0].institution_name
    return None


def User_institutions(self):
    if self.profile:
        return self.profile.institutions.all()
    return []


def User_to_json(self, depth=0):
    # FIXME this may be excessive - how much does the frontend actually need?
    return {
        "id": self.pk,
        "uid": self.username,
        "email": self.email,
        "initials": self.initials,
        "name": self.get_full_name(),
        "institution": self.institution,
        "description": "",
        "lastname": self.last_name,
        "groups": None,
        "firstname": self.first_name,
        "disabled": not self.is_active
    }


def User_to_solr_json(self):
    format_string = '%Y-%m-%dT%H:%M:%SZ'
    return {
        'id': self.pk,
        'username': self.username,
        # TODO add full name to profile, to override default first+[SPACE]+last
        'fullname': self.get_full_name(),
        'name': [self.first_name, self.last_name, ],
        'email': self.email,
        'initials': self.initials,
        'group': ['@'.join(('%s' % g.pk, g.name)) for g in self.groups.all()],
        'institution': ['@'.join(('%s' % i.pk, i.institution_name)) for i in self.institutions],
        'date_joined': self.date_joined.strftime(format_string),
        'last_login': None if self.last_login is None else self.last_login.strftime(format_string),
        'is_active': self.is_active,
        'is_staff': self.is_staff,
        'is_superuser': self.is_superuser,
    }

# this will get replaced by the actual model as soon as the app is initialized
User = None


def patch_user_model():
    global User
    User = get_user_model()
    User.add_to_class("profile", property(User_profile))
    User.add_to_class("to_json", User_to_json)
    User.add_to_class("to_solr_json", User_to_solr_json)
    User.add_to_class("initials", property(User_initials))
    User.add_to_class("institution", property(User_institution))
    User.add_to_class("institutions", property(User_institutions))
