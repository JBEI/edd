# coding: utf-8
from __future__ import absolute_import, unicode_literals

"""
The core models: Study, Line, Assay, Measurement, MeasurementValue.
"""

import arrow
import json
import os

from builtins import str
from collections import defaultdict
from django.conf import settings
from django.contrib.postgres.fields import ArrayField
from django.db import models
from django.db.models import Q
from django.template.defaultfilters import slugify
from django.utils.encoding import python_2_unicode_compatible
from django.utils.translation import ugettext_lazy as _
from itertools import chain
from six import string_types

from .common import EDDSerialize
from .measurement_type import MeasurementType, MeasurementUnit, Metabolite
from .metadata import EDDMetadata, MetadataType
from .update import Update
from main.export import table  # TODO remove


@python_2_unicode_compatible
class Comment(models.Model):
    """ Text blob attached to an EDDObject by a given user at a given time/Update. """
    class Meta:
        db_table = 'comment'
    object_ref = models.ForeignKey(
        'EDDObject',
        on_delete=models.CASCADE,
        related_name='comments',
    )
    body = models.TextField(
        help_text=_('Content of the comment.'),
        verbose_name=_('Comment'),
    )
    created = models.ForeignKey(
        Update,
        help_text=_('Update object logging the creation of this Comment.'),
        on_delete=models.PROTECT,
        verbose_name=_('Created'),
    )

    def __str__(self):
        return self.body


@python_2_unicode_compatible
class Attachment(models.Model):
    """ File uploads attached to an EDDObject; include MIME, file name, and description. """
    class Meta:
        db_table = 'attachment'
    object_ref = models.ForeignKey(
        'EDDObject',
        on_delete=models.CASCADE,
        related_name='files',
    )
    file = models.FileField(
        help_text=_('Path to file data.'),
        max_length=255,
        upload_to='%Y/%m/%d',
        verbose_name=_('File Path'),
    )
    filename = models.CharField(
        help_text=_('Name of attachment file.'),
        max_length=255,
        verbose_name=_('File Name'),
    )
    created = models.ForeignKey(
        Update,
        help_text=_('Update used to create the attachment.'),
        on_delete=models.PROTECT,
        verbose_name=_('Created'),
    )
    description = models.TextField(
        blank=True,
        help_text=_('Description of attachment file contents.'),
        null=False,
        verbose_name=_('Description'),
    )
    mime_type = models.CharField(
        blank=True,
        help_text=_('MIME ContentType of the attachment.'),
        max_length=255,
        null=True,
        verbose_name=_('MIME'),
    )
    file_size = models.IntegerField(
        default=0,
        help_text=_('Total byte size of the attachment.'),
        verbose_name=_('Size'),
    )

    extensions_to_icons = defaultdict(lambda: 'icon-generic.png', {
        '.zip':  'icon-zip.png',
        '.gzip': 'icon-zip.png',
        '.bzip': 'icon-zip.png',
        '.gz':   'icon-zip.png',
        '.dmg':  'icon-zip.png',
        '.rar':  'icon-zip.png',

        '.ico':  'icon-image.gif',
        '.gif':  'icon-image.gif',
        '.jpg':  'icon-image.gif',
        '.jpeg': 'icon-image.gif',
        '.png':  'icon-image.gif',
        '.tif':  'icon-image.gif',
        '.tiff': 'icon-image.gif',
        '.psd':  'icon-image.gif',
        '.svg':  'icon-image.gif',

        '.mov':  'icon-video.png',
        '.avi':  'icon-video.png',
        '.mkv':  'icon-video.png',

        '.txt':  'icon-text.png',
        '.rtf':  'icon-text.png',
        '.wri':  'icon-text.png',
        '.htm':  'icon-text.png',
        '.html': 'icon-text.png',

        '.pdf':  'icon-pdf.gif',
        '.ps':   'icon-pdf.gif',

        '.key':  'icon-keynote.gif',
        '.mdb':  'icon-mdb.png',
        '.doc':  'icon-word.png',
        '.ppt':  'icon-ppt.gif',
        '.xls':  'icon-excel.png',
        '.xlsx': 'icon-excel.png',
    })

    def __str__(self):
        return self.filename

    @property
    def user_initials(self):
        return self.created.initials

    @property
    def icon(self):
        base, ext = os.path.splitext(self.filename)
        return self.extensions_to_icons[ext]

    def user_can_delete(self, user):
        """ Verify that a user has the appropriate permissions to delete an attachment. """
        return self.object_ref.user_can_write(user)

    def user_can_read(self, user):
        """
        Verify that a user has the appropriate permissions to see (that is, download) an
        attachment.
        """
        return self.object_ref.user_can_read(user)


@python_2_unicode_compatible
class EDDObject(EDDMetadata, EDDSerialize):
    """ A first-class EDD object, with update trail, comments, attachments. """
    class Meta:
        db_table = 'edd_object'
    name = models.CharField(
        help_text=_('Name of this object.'),
        max_length=255,
        verbose_name=_('Name'),
    )
    description = models.TextField(
        blank=True,
        help_text=_('Description of this object.'),
        null=True,
        verbose_name=_('Description'),
    )
    active = models.BooleanField(
        default=True,
        help_text=_('Flag showing if this object is active and displayed.'),
        verbose_name=_('Active'),
    )
    updates = models.ManyToManyField(
        Update,
        db_table='edd_object_update',
        help_text=_('List of Update objects logging changes to this object.'),
        related_name='+',
        verbose_name=_('Updates'),
    )
    # these are used often enough we should save extra queries by including as fields
    created = models.ForeignKey(
        Update,
        editable=False,
        help_text=_('Update used to create this object.'),
        on_delete=models.PROTECT,
        related_name='object_created',
        verbose_name=_('Created'),
    )
    updated = models.ForeignKey(
        Update,
        editable=False,
        help_text=_('Update used to last modify this object.'),
        on_delete=models.PROTECT,
        related_name='object_updated',
        verbose_name=_('Last Modified'),
    )
    # linking together EDD instances will be easier later if we define UUIDs now
    uuid = models.UUIDField(
        editable=False,
        help_text=_('Unique identifier for this object.'),
        unique=True,
        verbose_name=_('UUID'),
    )

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
        if hasattr(self, '_file_count'):
            return self._file_count
        return self.files.count()

    @property
    def attachments(self):
        return self.files.all()

    @property
    def comment_list(self):
        return self.comments.order_by('created__mod_time').all()

    def get_comment_count(self):
        if hasattr(self, '_comment_count'):
            return self._comment_count
        return self.comments.count()

    @classmethod
    def metadata_type_frequencies(cls):
        return dict(
            # TODO: do this with Django model APIs instead of raw SQL
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
    def export_columns(cls, instances=[]):
        # TODO: flip this to instead pass arguments to a factory on table.ColumnChoice
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

    def to_json_str(self, depth=0):
        """
        Used in overview.html.  Serializing directly in the template creates strings like
        "u'description'" that Javascript can't parse.
        """
        json_dict = self.to_json(depth)
        return json.dumps(json_dict, ensure_ascii=False).encode("utf8")

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
    contact = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        blank=True,
        help_text=_('EDD User to contact about this study.'),
        null=True,
        on_delete=models.PROTECT,
        related_name='contact_study_set',
        verbose_name=_('Contact'),
    )
    contact_extra = models.TextField(
        help_text=_('Additional field for contact information about this study (e.g. contact is '
                    'not a User of EDD).'),
        verbose_name=_('Contact (extra)'),
    )
    metabolic_map = models.ForeignKey(
        'SBMLTemplate',
        blank=True,
        help_text=_('Metabolic map used by default in this Study.'),
        null=True,
        on_delete=models.SET_NULL,
        verbose_name=_('Metabolic Map'),
    )
    # NOTE: this is NOT a field for a definitive list of Protocols on a Study; it is for Protocols
    #   which may not have been paired with a Line in an Assay. e.g. when creating a blank Study
    #   pre-filled with the Protocols to be used. Get definitive list by doing union of this field
    #   and Protocols linked via Assay-Line-Study chain.
    protocols = models.ManyToManyField(
        'Protocol',
        blank=True,
        db_table='study_protocol',
        help_text=_('Protocols planned for use in this Study.'),
        verbose_name=_('Protocols'),
    )
    # create a slug for a more human-readable URL
    slug = models.SlugField(
        help_text=_('Slug text used in links to this Study.'),
        null=True,
        unique=True,
        verbose_name=_('Slug'),
    )

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
            'uuid': self.uuid,
            'slug': self.slug,
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

    def allow_metadata(self, metatype):
        return metatype.for_context == MetadataType.STUDY

    @staticmethod
    def user_permission_q(user, permission, keyword_prefix=''):
        """
        Constructs a django Q object for testing whether the specified user has the required
        permission for a study as part of a Study-related Django model query. It's important to
        note that the provided Q object will return one row for each user/group permission that
        gives the user access to the study, so clients that aren't already filtering by primary
        key will probably want to use distinct() to limit the returned results. Note that this
        only tests whether the user or group has specific
        permissions granted on the Study, not whether the user's role (e.g. 'staff', 'admin')
        gives him/her access to it. See:
            @ user_role_has_read_access(user)
            @ user_can_read(self, user)
        :param user: the user
        :param permission: the study permission type to test (e.g. StudyPermission.READ); can be
            any iterable of permissions or a single permission
        :param keyword_prefix: an optional keyword prefix to prepend to the query keyword
            arguments. For example when querying Study, the default value of '' should be used,
            or when querying for Lines, whose permissions depend on the related Study, use
            'study__' similar to other queryset keyword arguments.
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
        """
            Tests whether the user's role alone is sufficient to grant read access to this
            study.
            :param user: the user
            :return: True if the user role has read access, false otherwise
        """
        return user.is_superuser

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
        if hasattr(settings, 'EDD_ONLY_SUPERUSER_CREATE'):
            if settings.EDD_ONLY_SUPERUSER_CREATE == 'permission':
                return user.has_perm('main.add_study') and user.is_active
            elif settings.EDD_ONLY_SUPERUSER_CREATE:
                return user.is_superuser and user.is_active
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
        """ Returns a dict mapping Protocol ID to a list of Assays the in Study using that
        Protocol. """
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

    def _build_slug(self, name=None, uuid=None):
        """ Builds a slug for this Study; by default uses initials-study-name. If there is a
            collision, append truncated UUID; if there is still a collision, keep incrementing
            a counter and trying new slugs. """
        max_length = self._meta.get_field('slug').max_length
        frag_length = 4
        name = name if name is not None else self.name if self.name else ''
        base_slug = self._slug_append(self.name)
        slug = base_slug
        # test uniqueness, add more stuff to end if not unique
        if self._slug_exists(base_slug):
            # try with last 4 of UUID appended, trimming off space if needed
            uuid = uuid if uuid is not None else self.uuid.hex if self.uuid else ''
            base_slug = self._slug_append(
                base_slug[:max_length - (frag_length + 1)],
                uuid[-frag_length:],
            )
            slug = base_slug
            i = 1
            # keep incrementing number at end if even partial UUID causes collision
            while self._slug_exists(slug):
                slug = self._slug_append(
                    base_slug[:max_length - (len(str(i)) + 1)],
                    i,
                )
                i += 1
        return slug

    def _slug_append(self, *items):
        max_length = self._meta.get_field('slug').max_length
        base = ' '.join((str(i) for i in items))
        return slugify(base)[:max_length]

    def _slug_exists(self, slug):
        return Study.objects.filter(slug=slug).exists()


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
        (CATEGORY_NONE, _('None')),
        (CATEGORY_OD, _('Optical Density')),
        (CATEGORY_HPLC, _('HPLC')),
        (CATEGORY_LCMS, _('LCMS')),
        (CATEGORY_RAMOS, _('RAMOS')),
        (CATEGORY_TPOMICS, _('Transcriptomics / Proteomics')),
    )

    object_ref = models.OneToOneField(EDDObject, parent_link=True, related_name='+')
    owned_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        help_text=_('Owner / maintainer of this Protocol'),
        on_delete=models.PROTECT,
        related_name='protocol_set',
        verbose_name=_('Owner'),
    )
    variant_of = models.ForeignKey(
        'self',
        blank=True,
        help_text=_('Link to another original Protocol used as basis for this Protocol.'),
        null=True,
        on_delete=models.PROTECT,
        related_name='derived_set',
        verbose_name=_('Variant of Protocol'),
    )
    default_units = models.ForeignKey(
        'MeasurementUnit',
        blank=True,
        help_text=_('Default units for values measured with this Protocol.'),
        null=True,
        on_delete=models.SET_NULL,
        related_name="protocol_set",
        verbose_name=_('Default Units'),
    )
    categorization = models.CharField(
        choices=CATEGORY_CHOICE,
        default=CATEGORY_NONE,
        help_text=_('Category of this Protocol.'),
        verbose_name=_('Category'),
        max_length=8,
    )

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
    registry_id = models.UUIDField(
        blank=True,
        help_text=_('The unique ID of this strain in the ICE Registry.'),
        null=True,
        verbose_name=_('Registry UUID'),
    )
    registry_url = models.URLField(
        blank=True,
        help_text=_('The URL of this strain in the ICE Registry.'),
        max_length=255,
        null=True,
        verbose_name=_('Registry URL'),
    )

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
    labeling = models.TextField(
        help_text=_('Description of labeling isotopes in this Carbon Source.'),
        verbose_name=_('Labeling'),
    )
    volume = models.DecimalField(
        decimal_places=5,
        help_text=_('Volume of solution added as a Carbon Source.'),
        max_digits=16,
        verbose_name=_('Volume'),
    )

    def to_json(self, depth=0):
        json_dict = super(CarbonSource, self).to_json(depth)
        json_dict.update({
            'labeling': self.labeling,
            'volume': self.volume,
        })
        return json_dict

    def __str__(self):
        return "%s (%s)" % (self.name, self.labeling)


@python_2_unicode_compatible
class Line(EDDObject):
    """ A single item to be studied (contents of well, tube, dish, etc). """
    class Meta:
        db_table = 'line'
    study = models.ForeignKey(
        Study,
        help_text=_('The Study containing this Line.'),
        on_delete=models.CASCADE,
        verbose_name=_('Study'),
    )
    control = models.BooleanField(
        default=False,
        help_text=_('Flag indicating whether the sample for this Line is a control.'),
        verbose_name=_('Control'),
    )
    replicate = models.ForeignKey(
        'self',
        blank=True,
        help_text=_('Indicates that this Line is a (biological) replicate of another Line.'),
        null=True,
        on_delete=models.PROTECT,
        verbose_name=_('Replicate'),
    )

    object_ref = models.OneToOneField(EDDObject, parent_link=True, related_name='+')
    contact = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        blank=True,
        help_text=_('EDD User to contact about this Line.'),
        null=True,
        on_delete=models.PROTECT,
        related_name='line_contact_set',
        verbose_name=_('Contact'),
    )
    contact_extra = models.TextField(
        help_text=_('Additional field for contact information about this Line (e.g. contact is '
                    'not a User of EDD).'),
        verbose_name=_('Contact (extra)'),
    )
    experimenter = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        blank=True,
        help_text=_('EDD User that set up the experimental conditions of this Line.'),
        null=True,
        on_delete=models.PROTECT,
        related_name='line_experimenter_set',
        verbose_name=_('Experimenter'),
    )
    carbon_source = models.ManyToManyField(
        CarbonSource,
        blank=True,
        db_table='line_carbon_source',
        help_text=_('Carbon source(s) used in this Line.'),
        verbose_name=_('Carbon Source(s)'),
    )
    protocols = models.ManyToManyField(
        Protocol,
        help_text=_('Protocol(s) used to Assay this Line.'),
        through='Assay',
        verbose_name=_('Protocol(s)'),
    )
    strains = models.ManyToManyField(
        Strain,
        blank=True,
        db_table='line_strain',
        help_text=_('Strain(s) used in this Line.'),
        verbose_name=_('Strain(s)'),
    )

    def allow_metadata(self, metatype):
        return metatype.for_context == MetadataType.LINE

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

    def new_assay_number(self, protocol):
        """
        Given a Protocol name, fetch all matching child Assays, and return one greater than the
        count of existing assays.
        """
        if isinstance(protocol, string_types):  # assume Protocol.name
            protocol = Protocol.objects.get(name=protocol)
        assays = self.assay_set.filter(protocol=protocol)
        return assays.count() + 1

    def user_can_read(self, user):
        return self.study.user_can_read(user)

    def user_can_write(self, user):
        return self.study.user_can_write(user)


@python_2_unicode_compatible
class Assay(EDDObject):
    """ An examination of a Line, containing the Protocol and set of Measurements. """
    class Meta:
        db_table = 'assay'
    object_ref = models.OneToOneField(EDDObject, parent_link=True)
    line = models.ForeignKey(
        Line,
        help_text=_('The Line used for this Assay.'),
        on_delete=models.CASCADE,
        verbose_name=_('Line'),
    )
    protocol = models.ForeignKey(
        Protocol,
        help_text=_('The Protocol used to create this Assay.'),
        on_delete=models.PROTECT,
        verbose_name=_('Protocol'),
    )
    experimenter = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        blank=True,
        help_text=_('EDD User that set up the experimental conditions of this Assay.'),
        null=True,
        on_delete=models.PROTECT,
        related_name='assay_experimenter_set',
        verbose_name=_('Experimenter'),
    )
    measurement_types = models.ManyToManyField(
        MeasurementType,
        help_text=_('The Measurement Types contained in this Assay.'),
        through='Measurement',
        verbose_name=_('Measurement Types'),
    )

    def allow_metadata(self, metatype):
        return metatype.for_context == MetadataType.ASSAY

    def __str__(self):
        return self.name

    @classmethod
    def build_name(cls, line, protocol, index):
        return '%(line)s-%(protocol)s-%(index)s' % {
            'line': line.name,
            'protocol': protocol.name,
            'index': str(index),
        }

    def to_json(self, depth=0):
        json_dict = super(Assay, self).to_json(depth)
        json_dict.update({
            'lid': self.get_attr_depth('line', depth),
            'pid': self.get_attr_depth('protocol', depth),
            'experimenter': self.get_attr_depth('experimenter', depth),
        })
        return json_dict


@python_2_unicode_compatible
class Measurement(EDDMetadata, EDDSerialize):
    """ A plot of data points for an (assay, measurement type) pair. """
    class Meta:
        db_table = 'measurement'

    class Compartment(object):
        """ Enumeration of localized compartments applying to the measurement.
            UNKNOWN = default; no specific localization
            INTRACELLULAR = measurement inside of a cell, in cytosol
            EXTRACELLULAR = measurement outside of a cell
        """
        UNKNOWN, INTRACELLULAR, EXTRACELLULAR = map(str, range(3))
        short_names = ["", "IC", "EC"]
        names = [_("N/A"), _("Intracellular/Cytosol (Cy)"), _("Extracellular"), ]
        CHOICE = [(str(i), cn) for i, cn in enumerate(names)]

        @classmethod
        def to_json(cls):
            return {
                i: {
                    "name": str(cls.names[i]),
                    "code": cls.short_names[i],
                }
                for i in range(3)
            }

    class Format(object):
        """ Enumeration of formats measurement values can take.
            SCALAR = single timepoint X value, single measurement Y value (one item array)
            VECTOR = single timepoint X value, vector measurement Y value (mass-distribution, index
                by labeled carbon count; interpret each value as ratio with sum of all values)
            HISTOGRAM = single timepoint X value, vector measurement Y value (bins with counts of
                population measured within bin value, bin size/range set via y_units)
            SIGMA = single timepoint X value, 3-item-list Y value (average, variance, sample size)
        """
        SCALAR, VECTOR, HISTOGRAM, SIGMA = map(str, range(4))
        names = [_('scalar'), _('vector'), _('histogram'), _('sigma'), ]
        CHOICE = [(str(i), n) for i, n in enumerate(names)]

    assay = models.ForeignKey(
        Assay,
        help_text=_('The Assay creating this Measurement.'),
        on_delete=models.CASCADE,
        verbose_name=_('Assay'),
    )
    experimenter = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        blank=True,
        help_text=_('EDD User that set up the experimental conditions of this Measurement.'),
        null=True,
        on_delete=models.PROTECT,
        related_name='measurement_experimenter_set',
        verbose_name=_('Experimenter'),
    )
    measurement_type = models.ForeignKey(
        MeasurementType,
        help_text=_('The type of item measured for this Measurement.'),
        on_delete=models.PROTECT,
        verbose_name=_('Type'),
    )
    x_units = models.ForeignKey(
        MeasurementUnit,
        help_text=_('The units of the X-axis for this Measurement.'),
        on_delete=models.PROTECT,
        related_name='+',
        verbose_name=_('X Units'),
    )
    y_units = models.ForeignKey(
        MeasurementUnit,
        help_text=_('The units of the Y-axis for this Measurement.'),
        on_delete=models.PROTECT,
        related_name='+',
        verbose_name=_('Y Units'),
    )
    update_ref = models.ForeignKey(
        Update,
        help_text=_('The Update triggering the setting of this Measurement.'),
        on_delete=models.PROTECT,
        verbose_name=_('Updated'),
    )
    active = models.BooleanField(
        default=True,
        help_text=_('Flag indicating this Measurement is active and should be displayed.'),
        verbose_name=_('Active'),
    )
    compartment = models.CharField(
        choices=Compartment.CHOICE,
        default=Compartment.UNKNOWN,
        help_text=_('Compartment of the cell for this Measurement.'),
        max_length=1,
        verbose_name=_('Compartment'),
    )
    measurement_format = models.CharField(
        choices=Format.CHOICE,
        default=Format.SCALAR,
        help_text=_('Enumeration of value formats for this Measurement.'),
        max_length=2,
        verbose_name=_('Format'),
    )

    @classmethod
    def export_columns(cls):
        return [
            table.ColumnChoice(
                cls, 'type', _('Measurement Type'), lambda x: x.measurement_type.export_name()),
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
        return 'Measurement{%d}{%s}' % (self.assay_id, self.measurement_type)

    # may not be the best method name, if we ever want to support other
    # types of data as vectors in the future
    def is_carbon_ratio(self):
        return (self.measurement_format == Measurement.Format.VECTOR)

    def valid_data(self):
        """ Data for which the y-value is defined (non-NULL, non-blank). """
        mdata = list(self.data())
        return [md for md in mdata if md.is_defined()]

    def is_extracellular(self):
        return self.compartment == Measurement.Compartment.EXTRACELLULAR

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
        return Measurement.Compartment.short_names[int(self.compartment)]

    @property
    def full_name(self):
        """ measurement compartment plus measurement_type.type_name """
        lookup = dict(Measurement.Compartment.CHOICE)
        return (lookup.get(self.compartment) + " " + self.name).strip()

    # TODO also handle vectors
    def extract_data_xvalues(self, defined_only=False):
        qs = self.measurementvalue_set.all()
        if defined_only:
            qs = qs.exclude(Q(y=None) | Q(y__len=0))
        # first index unpacks single value from tuple; second index unpacks first value from X
        return map(lambda x: x[0][0], qs.values_list('x'))

    # this shouldn't need to handle vectors
    def interpolate_at(self, x):
        assert (self.measurement_format == Measurement.Format.SCALAR)
        from main.utilities import interpolate_at
        return interpolate_at(self.valid_data(), x)

    @property
    def y_axis_units_name(self):
        """ Human-readable units for Y-axis.  Not intended for repeated/bulk use, since it
            involves a foreign key lookup. """
        return self.y_units.unit_name

    def is_concentration_measurement(self):
        return (self.y_axis_units_name in ["mg/L", "g/L", "mol/L", "mM", "uM", "Cmol/L", ])


@python_2_unicode_compatible
class MeasurementValue(models.Model):
    """ Pairs of ((x0, x1, ... , xn), (y0, y1, ... , ym)) values as part of a measurement """
    class Meta:
        db_table = 'measurement_value'
    measurement = models.ForeignKey(
        Measurement,
        help_text=_('The Measurement containing this point of data.'),
        on_delete=models.CASCADE,
        verbose_name=_('Measurement'),
    )
    x = ArrayField(
        models.DecimalField(max_digits=16, decimal_places=5),
        help_text=_('X-axis value(s) for this point.'),
        verbose_name=_('X'),
    )
    y = ArrayField(
        models.DecimalField(max_digits=16, decimal_places=5),
        help_text=_('Y-axis value(s) for this point.'),
        verbose_name=_('Y'),
    )
    updated = models.ForeignKey(
        Update,
        help_text=_('The Update triggering the setting of this point.'),
        on_delete=models.PROTECT,
        verbose_name=_('Updated'),
    )

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
