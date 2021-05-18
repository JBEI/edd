import json
import os
from collections import defaultdict, namedtuple
from itertools import chain

import arrow
from django.conf import settings
from django.contrib.postgres.aggregates import ArrayAgg
from django.contrib.postgres.fields import ArrayField
from django.db import models
from django.db.models import Q
from django.template.defaultfilters import slugify
from django.utils.translation import gettext_lazy as _

from edd.fields import FileField, VarCharField

from .common import EDDSerialize, qfilter
from .measurement_type import MeasurementType, MeasurementUnit, Metabolite
from .metadata import EDDMetadata, MetadataType
from .permission import StudyPermission
from .update import Update

__doc__ = """
The core models: Study, Line, Assay, Measurement, MeasurementValue.
"""


class Comment(models.Model):
    """
    Text blob attached to an EDDObject by a given user at a given time/Update.
    """

    class Meta:
        db_table = "comment"

    object_ref = models.ForeignKey(
        "EDDObject", on_delete=models.CASCADE, related_name="comments"
    )
    body = models.TextField(
        help_text=_("Content of the comment."), verbose_name=_("Comment")
    )
    created = models.ForeignKey(
        Update,
        help_text=_("Update object logging the creation of this Comment."),
        on_delete=models.PROTECT,
        verbose_name=_("Created"),
    )

    def __str__(self):
        return self.body


class Attachment(models.Model):
    """
    File uploads attached to an EDDObject; include MIME, file name,
    and description.
    """

    class Meta:
        db_table = "attachment"

    object_ref = models.ForeignKey(
        "EDDObject", on_delete=models.CASCADE, related_name="files"
    )
    file = FileField(
        help_text=_("Path to file data."),
        max_length=None,
        upload_to="%Y/%m/%d",
        verbose_name=_("File Path"),
    )
    filename = VarCharField(
        help_text=_("Name of attachment file."), verbose_name=_("File Name")
    )
    created = models.ForeignKey(
        Update,
        help_text=_("Update used to create the attachment."),
        on_delete=models.PROTECT,
        verbose_name=_("Created"),
    )
    description = models.TextField(
        blank=True,
        help_text=_("Description of attachment file contents."),
        null=False,
        verbose_name=_("Description"),
    )
    mime_type = VarCharField(
        blank=True,
        help_text=_("MIME ContentType of the attachment."),
        null=True,
        verbose_name=_("MIME"),
    )
    file_size = models.IntegerField(
        default=0,
        help_text=_("Total byte size of the attachment."),
        verbose_name=_("Size"),
    )

    extensions_to_icons = defaultdict(
        lambda: "icon-generic.png",
        {
            ".zip": "icon-zip.png",
            ".gzip": "icon-zip.png",
            ".bzip": "icon-zip.png",
            ".gz": "icon-zip.png",
            ".dmg": "icon-zip.png",
            ".rar": "icon-zip.png",
            ".ico": "icon-image.gif",
            ".gif": "icon-image.gif",
            ".jpg": "icon-image.gif",
            ".jpeg": "icon-image.gif",
            ".png": "icon-image.gif",
            ".tif": "icon-image.gif",
            ".tiff": "icon-image.gif",
            ".psd": "icon-image.gif",
            ".svg": "icon-image.gif",
            ".mov": "icon-video.png",
            ".avi": "icon-video.png",
            ".mkv": "icon-video.png",
            ".txt": "icon-text.png",
            ".rtf": "icon-text.png",
            ".wri": "icon-text.png",
            ".htm": "icon-text.png",
            ".html": "icon-text.png",
            ".pdf": "icon-pdf.gif",
            ".ps": "icon-pdf.gif",
            ".key": "icon-keynote.gif",
            ".mdb": "icon-mdb.png",
            ".doc": "icon-word.png",
            ".ppt": "icon-ppt.gif",
            ".xls": "icon-excel.png",
            ".xlsx": "icon-excel.png",
        },
    )

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
        """
        Verify that a user has the appropriate permissions to delete
        an attachment.
        """
        return self.object_ref.user_can_write(user)

    def user_can_read(self, user):
        """
        Verify that a user has the appropriate permissions to see (that is,
        download) an attachment.
        """
        return self.object_ref.user_can_read(user)


class EDDObjectManager(models.Manager):
    def get_queryset(self):
        return super().get_queryset().select_related("created", "updated")


class EDDObject(EDDMetadata, EDDSerialize):
    """A first-class EDD object, with update trail, comments, attachments."""

    class Meta:
        db_table = "edd_object"

    objects = EDDObjectManager()

    name = VarCharField(help_text=_("Name of this object."), verbose_name=_("Name"))
    description = models.TextField(
        blank=True,
        help_text=_("Description of this object."),
        null=True,
        verbose_name=_("Description"),
    )
    active = models.BooleanField(
        default=True,
        help_text=_("Flag showing if this object is active and displayed."),
        verbose_name=_("Active"),
    )
    updates = models.ManyToManyField(
        Update,
        db_table="edd_object_update",
        help_text=_("List of Update objects logging changes to this object."),
        related_name="+",
        verbose_name=_("Updates"),
    )
    # these are used often enough we should save extra queries by including as fields
    created = models.ForeignKey(
        Update,
        editable=False,
        help_text=_("Update used to create this object."),
        on_delete=models.PROTECT,
        related_name="object_created",
        verbose_name=_("Created"),
    )
    updated = models.ForeignKey(
        Update,
        editable=False,
        help_text=_("Update used to last modify this object."),
        on_delete=models.PROTECT,
        related_name="object_updated",
        verbose_name=_("Last Modified"),
    )
    # linking together EDD instances will be easier later if we define UUIDs now
    uuid = models.UUIDField(
        editable=False,
        help_text=_("Unique identifier for this object."),
        unique=True,
        verbose_name=_("UUID"),
    )

    @property
    def mod_epoch(self):
        return arrow.get(self.updated.mod_time).int_timestamp

    @property
    def last_modified(self):
        return self.updated.format_timestamp()

    def was_modified(self):
        return self.updates.count() > 1

    @property
    def date_created(self):
        return self.created.format_timestamp()

    def get_attachment_count(self):
        if hasattr(self, "_file_count"):
            return self._file_count
        return self.files.count()

    @property
    def attachments(self):
        return self.files.all()

    @property
    def comment_list(self):
        return self.comments.order_by("created__mod_time").all()

    def get_comment_count(self):
        if hasattr(self, "_comment_count"):
            return self._comment_count
        return self.comments.count()

    @classmethod
    def metadata_type_frequencies(cls):
        return dict(
            # TODO: do this with Django model APIs instead of raw SQL
            MetadataType.objects.extra(
                select={
                    "count": "SELECT COUNT(1) FROM edd_object o "
                    f"INNER JOIN {cls._meta.db_table} x ON o.id = x.object_ref_id "
                    "WHERE o.metadata ? metadata_type.id::varchar"
                }
            ).values_list("id", "count")
        )

    def __str__(self):
        return self.name

    @classmethod
    def export_columns(cls, table_generator, instances=None):
        # define column for object ID
        table_generator.define_field_column(
            cls._meta.get_field("id"), heading=f"{cls.__name__} ID"
        )
        # define column for object name
        table_generator.define_field_column(
            cls._meta.get_field("name"), heading=f"{cls.__name__} Name"
        )

    def to_json(self, depth=0):
        # these may not be included in .select_related()
        updated = getattr(self, "updated", None)
        created = getattr(self, "created", None)
        return {
            "id": self.pk,
            "name": self.name,
            "description": self.description,
            "active": self.active,
            "meta": self.metadata,
            # Always include expanded created/updated objects if present, instead of IDs
            "modified": updated.to_json(depth) if updated else None,
            "created": created.to_json(depth) if created else None,
        }

    def to_json_str(self, depth=0):
        """
        Used in overview.html. Serializing directly in the template creates
        strings like "u'description'" that Javascript can't parse.
        """
        json_dict = self.to_json(depth)
        return json.dumps(json_dict, ensure_ascii=False).encode("utf8")

    def user_can_read(self, user):
        return True

    def user_can_write(self, user):
        return user and user.is_superuser


class SlugMixin:
    """
    Mixin class for models with a slug field.

    Assumes base object has fields for: name, slug, uuid.
    """

    def _build_slug(self, name=None, uuid=None):
        """
        Builds a slug for this object; by default uses name field. If there is
        a collision, append truncated UUID; if there is still a collision, use
        full UUID.

        :param name: text to use as basis of slugified name; defaults to the
            object name
        :param uuid: text for UUID; defaults to the object UUID
        :returns: a slug without collisions
        """
        # sanity check parameters, default to object attribute values
        if not isinstance(name, str):
            name = self.name if self.name else ""
        if not isinstance(uuid, str):
            uuid = self.uuid.hex if self.uuid else ""
        # generate slug from only the name; keep base_slug in case truncation is required
        base_slug = self._slug_append(name)
        slug = base_slug
        # test uniqueness, add more stuff to end if not unique
        if self._slug_exists(slug):
            # try with last 4 of UUID appended, trimming off space if needed
            slug = self._slug_concat(base_slug, uuid, frag_length=4)
            if self._slug_exists(slug):
                # full length of uuid should be 32 characters
                slug = self._slug_concat(base_slug, uuid, frag_length=32)
        return slug

    def _slug_append(self, *items):
        max_length = self._meta.get_field("slug").max_length
        base = " ".join(str(i) for i in items)
        return slugify(base)[:max_length]

    def _slug_concat(self, name, uuid, frag_length=4):
        max_length = self._meta.get_field("slug").max_length
        # try with last `frag_length` of UUID appended, trimming off space if needed
        trunc = max_length - (frag_length + 1)
        return self._slug_append(name[:trunc], uuid[-frag_length:])

    def _slug_exists(self, slug):
        return type(self).objects.filter(slug=slug).exists()


class Study(SlugMixin, EDDObject):
    """A collection of items to be studied."""

    class Meta:
        db_table = "study"
        verbose_name_plural = "Studies"

    object_ref = models.OneToOneField(
        EDDObject, on_delete=models.CASCADE, parent_link=True, related_name="+"
    )
    # contact info has two fields to support:
    # 1. linking to a specific user in EDD
    # 2. "This is data I got from 'Improving unobtanium production in
    #    Bio-Widget using foobar' published in Feb 2016 Bio-Widget Journal,
    #    paper has hpotter@hogwarts.edu as contact"
    contact = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        blank=True,
        help_text=_("EDD User to contact about this study."),
        null=True,
        on_delete=models.PROTECT,
        related_name="contact_study_set",
        verbose_name=_("Contact"),
    )
    contact_extra = models.TextField(
        help_text=_(
            "Additional field for contact information about this study "
            "(e.g. contact is not a User of EDD)."
        ),
        verbose_name=_("Contact (extra)"),
    )
    metabolic_map = models.ForeignKey(
        "SBMLTemplate",
        blank=True,
        help_text=_("Metabolic map used by default in this Study."),
        null=True,
        on_delete=models.SET_NULL,
        verbose_name=_("Metabolic Map"),
    )
    # NOTE: this is NOT a field for a definitive list of Protocols on a Study;
    #   it is for Protocols which may not have been paired with a Line in an
    #   Assay. e.g. when creating a blank Study pre-filled with the Protocols
    #   to be used. Get definitive list by doing union of this field and
    #   Protocols linked via Assay-Line-Study chain.
    protocols = models.ManyToManyField(
        "Protocol",
        blank=True,
        db_table="study_protocol",
        help_text=_("Protocols planned for use in this Study."),
        verbose_name=_("Protocols"),
    )
    # create a slug for a more human-readable URL
    slug = models.SlugField(
        help_text=_("Slug text used in links to this Study."),
        null=True,
        unique=True,
        verbose_name=_("Slug"),
    )

    @classmethod
    def export_columns(cls, table_generator, instances=None):
        super().export_columns(table_generator, instances=instances)
        # define column for study description
        table_generator.define_field_column(
            cls._meta.get_field("description"), heading=_("Study Description")
        )
        # define column for study contact
        table_generator.define_field_column(
            cls._meta.get_field("contact"),
            lookup=Study.get_contact,
            heading=_("Study Contact"),
        )

    def __str__(self):
        return self.name

    def to_solr_json(self):
        """Convert the Study model to a dict structure formatted for Solr JSON."""
        created = self.created
        updated = self.updated
        return {
            "id": self.pk,
            "uuid": self.uuid,
            "slug": self.slug,
            "name": self.name,
            "description": self.description,
            "creator": created.mod_by_id,
            "creator_email": created.email,
            "creator_name": created.full_name,
            "initials": created.initials,
            "contact": self.get_contact(),
            "active": self.active,
            "created": created.mod_time.strftime("%Y-%m-%dT%H:%M:%SZ"),
            "modified": updated.mod_time.strftime("%Y-%m-%dT%H:%M:%SZ"),
            "attachment_count": self.get_attachment_count(),
            "comment_count": self.get_comment_count(),
            "metabolite": [m.to_solr_value() for m in self.get_metabolite_types_used()],
            "protocol": [p.to_solr_value() for p in self.get_protocols_used()],
            "part": [s.to_solr_value() for s in self.get_strains_used()],
            "aclr": [str(p) for p in self.get_combined_permission() if p.is_read()],
            "aclw": [str(p) for p in self.get_combined_permission() if p.is_write()],
        }

    def allow_metadata(self, metatype):
        return metatype.for_context == MetadataType.STUDY

    @staticmethod
    def access_filter(user, access=StudyPermission.CAN_VIEW, via=None):
        """
        Creates a filter expression to limit queries to objects where a user
        has a given access level to the study containing the objects under
        query. Note that in nearly all cases, this call should be used in
        concert with a .distinct() on the queryset using the filter, as it uses
        a JOIN, and will return multiple copies of an object if the user in the
        argument has multiple permission routes to the parent Study.

        Examples:

            Study.objects.filter(Study.access_filter(user), slug='my-study').distinct()

            Line.objects.distinct().filter(
                Study.access_filter(user, via='study'),
                contact=user,
            )

            Measurement.objects.distinct().filter(
                Study.access_filter(user, via=('assay', 'line', 'study')),
                measurement_type__type_name='Bisabolene',
            )

        :param user: the user
        :param access: access level for permission; should be
            StudyPermission.CAN_VIEW or StudyPermission.CAN_EDIT; defaults to
            StudyPermission.CAN_VIEW
        :param via: an iterable of field names to traverse to get to the
            parent study
        """
        if user and getattr(user, "is_superuser", False):
            return Q()
        if isinstance(access, str):
            access = (access,)
        # enforce list type to via, and ensure that we work with a copy of argument
        if isinstance(via, str):
            via = [via]
        elif via:
            via = list(via)
        else:
            via = []

        def filter_key(*args):
            return "__".join(via + list(args))

        # set access filter for public/anonymous access
        access_filter = Q(
            **{filter_key("everyonepermission", "permission_type", "in"): access}
        )
        if user:
            access_filter |= (
                # set access for user
                Q(
                    **{
                        filter_key("userpermission", "user"): user,
                        filter_key("userpermission", "permission_type", "in"): access,
                    }
                )
                |
                # set access for user's groups
                Q(
                    **{
                        filter_key("grouppermission", "group", "user"): user,
                        filter_key("grouppermission", "permission_type", "in"): access,
                    }
                )
            )

        return access_filter

    @staticmethod
    def user_role_can_read(user):
        """
        Tests whether the user's role alone is sufficient to grant read access
        to this study.

        :param user: the user
        :return: True if the user role has read access, false otherwise
        """
        return user.is_superuser

    def user_can_read(self, user):
        """Utility method testing if a user has read access to a Study."""
        return user and (
            self.user_role_can_read(user)
            or any(
                p.is_read()
                for p in chain(
                    self.userpermission_set.filter(user=user),
                    self.grouppermission_set.filter(group__user=user),
                    self.everyonepermission_set.all(),
                )
            )
        )

    def user_can_write(self, user):
        """Utility method testing if a user has write access to a Study."""
        return super().user_can_write(user) or any(
            p.is_write()
            for p in chain(
                self.userpermission_set.filter(user=user),
                self.grouppermission_set.filter(group__user=user),
                self.everyonepermission_set.all(),
            )
        )

    @staticmethod
    def user_can_create(user):
        if hasattr(settings, "EDD_ONLY_SUPERUSER_CREATE"):
            if settings.EDD_ONLY_SUPERUSER_CREATE == "permission":
                return user.has_perm("main.add_study") and user.is_active
            elif settings.EDD_ONLY_SUPERUSER_CREATE:
                return user.is_superuser and user.is_active
        return True

    def get_combined_permission(self):
        """
        Returns a chained iterator over all user and group permissions on
        a Study.
        """
        return chain(
            self.userpermission_set.all(),
            self.grouppermission_set.all(),
            self.everyonepermission_set.all(),
        )

    def get_contact(self):
        """
        Returns the contact email, or supplementary contact information if no
        contact user is set.
        """
        if self.contact is None:
            return self.contact_extra
        return self.contact.email

    def get_metabolite_types_used(self):
        """Returns a QuerySet of all Metabolites used in the Study."""
        if self.pk:
            # only do search when Study is already saved
            return Metabolite.objects.filter(assay__study_id=self.pk).distinct()
        return Metabolite.objects.none()

    def get_protocols_used(self):
        """Returns a QuerySet of all Protocols used in the Study."""
        if self.pk:
            # only do search when Study is already saved
            return Protocol.objects.filter(assay__study_id=self.pk).distinct()
        return Protocol.objects.none()

    def get_strains_used(self, active=None):
        """Returns a QuerySet of all Strains used in the Study."""
        if self.pk:
            is_active = qfilter(fields=["line", "active"], value=active)
            return Strain.objects.filter(is_active, line__study_id=self.pk).distinct()
        return Strain.objects.none()

    def get_assays(self, active=None):
        """Returns a QuerySet of all Assays contained in the Study."""
        if self.pk:
            is_active = qfilter(fields=["active"], value=active)
            return Assay.objects.filter(is_active, line__study_id=self.pk)
        return Assay.objects.none()

    def to_json(self, depth=0):
        json_dict = super().to_json(depth=depth)
        contact = self.get_attr_depth("contact", depth, default={})
        if isinstance(contact, dict):
            contact["extra"] = self.contact_extra
        else:
            contact = {"id": contact, "extra": self.contact_extra}
        json_dict.update(
            contact=contact, metabolic_map=self.get_attr_depth("metabolic_map", depth)
        )
        return json_dict


class Protocol(EDDObject):
    """A defined method of examining a Line."""

    class Meta:
        db_table = "protocol"

    CATEGORY_NONE = "NA"
    CATEGORY_OD = "OD"
    CATEGORY_HPLC = "HPLC"
    CATEGORY_LCMS = "LCMS"
    CATEGORY_RAMOS = "RAMOS"
    CATEGORY_TPOMICS = "TPOMICS"
    CATEGORY_CHOICE = (
        (CATEGORY_NONE, _("None")),
        (CATEGORY_OD, _("Optical Density")),
        (CATEGORY_HPLC, _("HPLC")),
        (CATEGORY_LCMS, _("LCMS")),
        (CATEGORY_RAMOS, _("RAMOS")),
        (CATEGORY_TPOMICS, _("Transcriptomics / Proteomics")),
    )

    object_ref = models.OneToOneField(
        EDDObject, on_delete=models.CASCADE, parent_link=True, related_name="+"
    )
    owned_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        help_text=_("Owner / maintainer of this Protocol"),
        on_delete=models.PROTECT,
        related_name="protocol_set",
        verbose_name=_("Owner"),
    )
    variant_of = models.ForeignKey(
        "self",
        blank=True,
        help_text=_(
            "Link to another original Protocol used as basis for this Protocol."
        ),
        null=True,
        on_delete=models.PROTECT,
        related_name="derived_set",
        verbose_name=_("Variant of Protocol"),
    )
    default_units = models.ForeignKey(
        "MeasurementUnit",
        blank=True,
        help_text=_("Default units for values measured with this Protocol."),
        null=True,
        on_delete=models.SET_NULL,
        related_name="protocol_set",
        verbose_name=_("Default Units"),
    )
    categorization = VarCharField(
        choices=CATEGORY_CHOICE,
        default=CATEGORY_NONE,
        help_text=_("SBML category for this Protocol."),
        verbose_name=_("SBML Category"),
    )

    def creator(self):
        return self.created.mod_by

    def owner(self):
        return self.owned_by

    def last_modified(self):
        return self.updated.mod_time

    def to_solr_value(self):
        return f"{self.pk}@{self.name}"

    def __str__(self):
        return self.name

    def save(self, *args, **kwargs):
        if self.name in ["", None]:
            raise ValueError("Protocol name required.")
        p = Protocol.objects.filter(name=self.name)
        if (self.id is not None and p.count() > 1) or (
            self.id is None and p.count() > 0
        ):
            raise ValueError(f"There is already a protocol named '{self.name}'.")
        return super().save(*args, **kwargs)


class Strain(EDDObject):
    """A link to a strain/part in the JBEI ICE Registry."""

    class Meta:
        db_table = "strain"

    object_ref = models.OneToOneField(
        EDDObject, on_delete=models.CASCADE, parent_link=True, related_name="+"
    )
    registry_id = models.UUIDField(
        blank=True,
        help_text=_("The unique ID of this strain in the ICE Registry."),
        null=True,
        verbose_name=_("Registry UUID"),
    )
    registry_url = models.URLField(
        blank=True,
        help_text=_("The URL of this strain in the ICE Registry."),
        max_length=255,
        null=True,
        verbose_name=_("Registry URL"),
    )

    def __str__(self):
        return self.name

    def to_solr_value(self):
        return f"{self.registry_id}@{self.name}"

    def to_json(self, depth=0):
        # explicitly ignoring parent EDDObject.to_json
        return dict(
            id=self.pk,
            name=self.name,
            registry_id=self.registry_id,
            registry_url=self.registry_url,
        )

    @staticmethod
    def user_can_change(user):
        return user.has_perm("edd.change_strain")

    @staticmethod
    def user_can_create(user):
        return user.has_perm("edd.add_strain")

    @staticmethod
    def user_can_delete(user):
        return user.has_perm("edd.delete_strain")


class CarbonSource(EDDObject):
    """Information about carbon sources, isotope labeling."""

    class Meta:
        db_table = "carbon_source"

    object_ref = models.OneToOneField(
        EDDObject, on_delete=models.CASCADE, parent_link=True, related_name="+"
    )
    # Labeling is description of isotope labeling used in carbon source
    labeling = models.TextField(
        help_text=_("Description of labeling isotopes in this Carbon Source."),
        verbose_name=_("Labeling"),
    )
    volume = models.DecimalField(
        decimal_places=5,
        help_text=_("Volume of solution added as a Carbon Source."),
        max_digits=16,
        verbose_name=_("Volume"),
    )

    def to_json(self, depth=0):
        json_dict = super().to_json(depth)
        json_dict.update(labeling=self.labeling, volume=self.volume)
        return json_dict

    def __str__(self):
        return f"{self.name} ({self.labeling})"


class LineManager(EDDObjectManager):
    def get_queryset(self):
        return super().get_queryset().annotate(strain_ids=ArrayAgg("strains__id"))


class Line(EDDObject):
    """A single item to be studied (contents of well, tube, dish, etc)."""

    class Meta:
        db_table = "line"

    objects = LineManager()

    study = models.ForeignKey(
        Study,
        help_text=_("The Study containing this Line."),
        on_delete=models.CASCADE,
        verbose_name=_("Study"),
    )
    control = models.BooleanField(
        default=False,
        help_text=_("Flag indicating whether the sample for this Line is a control."),
        verbose_name=_("Control"),
    )

    object_ref = models.OneToOneField(
        EDDObject, on_delete=models.CASCADE, parent_link=True, related_name="+"
    )
    contact = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        blank=True,
        help_text=_("EDD User to contact about this Line."),
        null=True,
        on_delete=models.PROTECT,
        related_name="line_contact_set",
        verbose_name=_("Contact"),
    )
    contact_extra = models.TextField(
        help_text=_(
            "Additional field for contact information about this Line "
            "(e.g. contact is not a User of EDD)."
        ),
        verbose_name=_("Contact (extra)"),
    )
    experimenter = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        blank=True,
        help_text=_("EDD User that set up the experimental conditions of this Line."),
        null=True,
        on_delete=models.PROTECT,
        related_name="line_experimenter_set",
        verbose_name=_("Experimenter"),
    )
    carbon_source = models.ManyToManyField(
        CarbonSource,
        blank=True,
        db_table="line_carbon_source",
        help_text=_("Carbon source(s) used in this Line."),
        verbose_name=_("Carbon Source(s)"),
    )
    protocols = models.ManyToManyField(
        Protocol,
        help_text=_("Protocol(s) used to Assay this Line."),
        through="Assay",
        verbose_name=_("Protocol(s)"),
    )
    strains = models.ManyToManyField(
        Strain,
        blank=True,
        db_table="line_strain",
        help_text=_("Strain(s) used in this Line."),
        verbose_name=_("Strain(s)"),
    )

    def allow_metadata(self, metatype):
        return metatype.for_context == MetadataType.LINE

    @classmethod
    def export_columns(cls, table_generator, instances=None):
        super().export_columns(table_generator, instances=instances)
        instances = [] if instances is None else instances
        table_generator.define_field_column(
            cls._meta.get_field("description"), heading=_("Line Description")
        )
        table_generator.define_field_column(
            cls._meta.get_field("control"),
            lookup=lambda line: "T" if line.control else "F",
        )
        # TODO export should handle multi-valued fields better than this
        table_generator.define_field_column(
            cls._meta.get_field("strains"),
            lookup=lambda line: "|".join(filter(None, line.strain_names)),
        )
        # TODO export should handle multi-valued fields better than this
        table_generator.define_field_column(
            cls._meta.get_field("carbon_source"),
            lookup=lambda line: "|".join(filter(None, line.cs_names)),
        )
        table_generator.define_field_column(
            cls._meta.get_field("experimenter"),
            lookup=lambda line: line.experimenter.email if line.experimenter else "",
            heading=_("Line Experimenter"),
        )
        table_generator.define_field_column(
            cls._meta.get_field("contact"),
            lookup=lambda line: line.contact.email if line.contact else "",
            heading=_("Line Contact"),
        )
        for type_ in MetadataType.all_types_on_instances(instances):
            table_generator.define_meta_column(type_)

    def __str__(self):
        return self.name

    def to_json(self, depth=0):
        json_dict = super().to_json(depth)
        # for backward-compatibility, add the 'extra' item to contact dict
        contact = self.get_attr_depth("contact", depth, default={})
        if isinstance(contact, dict):
            contact["extra"] = self.contact_extra
        else:
            contact = {"user_id": contact, "extra": self.contact_extra}
        json_dict.update(
            control=self.control,
            contact=contact,
            experimenter=self.get_attr_depth("experimenter", depth),
            strain=self.strain_ids,
        )
        if depth > 0:
            json_dict.update(study=self.study_id)
        return json_dict

    def new_assay_number(self, protocol):
        """
        Given a Protocol name, fetch all matching child Assays, and return one
        greater than the count of existing assays.
        """
        if isinstance(protocol, str):
            # assume Protocol.name
            protocol = Protocol.objects.get(name=protocol)
        assays = self.assay_set.filter(protocol=protocol)
        return assays.count() + 1

    def user_can_read(self, user):
        return self.study.user_can_read(user)

    def user_can_write(self, user):
        return self.study.user_can_write(user)


class Assay(EDDObject):
    """
    An examination of a Line, containing the Protocol and set of Measurements.
    """

    class Meta:
        db_table = "assay"

    object_ref = models.OneToOneField(
        EDDObject, on_delete=models.CASCADE, parent_link=True, related_name="+"
    )
    study = models.ForeignKey(
        Study,
        help_text=_("The Study containing this Assay."),
        on_delete=models.CASCADE,
        verbose_name=_("Study"),
    )
    line = models.ForeignKey(
        Line,
        help_text=_("The Line used for this Assay."),
        on_delete=models.CASCADE,
        verbose_name=_("Line"),
    )
    protocol = models.ForeignKey(
        Protocol,
        help_text=_("The Protocol used to create this Assay."),
        on_delete=models.PROTECT,
        verbose_name=_("Protocol"),
    )
    experimenter = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        blank=True,
        help_text=_("EDD User that set up the experimental conditions of this Assay."),
        null=True,
        on_delete=models.PROTECT,
        related_name="assay_experimenter_set",
        verbose_name=_("Experimenter"),
    )
    measurement_types = models.ManyToManyField(
        MeasurementType,
        help_text=_("The Measurement Types contained in this Assay."),
        through="Measurement",
        verbose_name=_("Measurement Types"),
    )

    def allow_metadata(self, metatype):
        return metatype.for_context == MetadataType.ASSAY

    def __str__(self):
        return self.name

    @classmethod
    def build_name(cls, line, protocol, index):
        return f"{line.name}-{protocol.name}-{index}"

    def to_json(self, depth=0):
        json_dict = super().to_json(depth)
        json_dict.update(
            experimenter=self.get_attr_depth("experimenter", depth),
            lid=self.get_attr_depth("line", depth),
            pid=self.get_attr_depth("protocol", depth),
            study=self.get_attr_depth("study", depth),
        )
        return json_dict


class Measurement(EDDMetadata, EDDSerialize):
    """A plot of data points for an (assay, measurement type) pair."""

    class Meta:
        db_table = "measurement"

    class Compartment:
        """
        Enumeration of localized compartments applying to the measurement.

        UNKNOWN = default; no specific localization
        INTRACELLULAR = measurement inside of a cell, in cytosol
        EXTRACELLULAR = measurement outside of a cell
        """

        UNKNOWN = "0"
        INTRACELLULAR = "1"
        EXTRACELLULAR = "2"
        namecode = namedtuple("namecode", ("name", "code"))
        names = {
            UNKNOWN: namecode(_("N/A"), _("")),
            INTRACELLULAR: namecode(_("Intracellular/Cytosol (Cy)"), _("IC")),
            EXTRACELLULAR: namecode(_("Extracellular"), _("EC")),
        }
        CHOICE = tuple((k, v.name) for k, v in names.items())

        @classmethod
        def to_json(cls):
            return {k: {"id": k, **v._asdict()} for k, v in cls.names.items()}

    class Format:
        """
        Enumeration of formats measurement values can take.

        SCALAR = single timepoint X value, single measurement Y value
            (one item array)
        VECTOR = single timepoint X value, vector measurement Y value
            (mass-distribution, index by labeled carbon count; interpret each
            value as ratio with sum of all values)
        HISTOGRAM_NAIVE = single timepoint X value, vector measurement Y value
            (bins with counts of population measured within bin value, bin
            size/range set via y_units)
        SIGMA = single timepoint X value, 3-item-list Y value (average,
            variance, sample size)
        RANGE = single timepoint X value, 3-item-list Y value (best, hi, lo)
        VECTOR_RANGE = single timepoint X value, 3n vector Y value
            (mass-distribution, n best values first, n hi values, n lo values,
            index by xn + labeled carbon count)
        PACKED = series of scalar values packed into a single pair of
            value vectors
        HISTOGRAM = timepoint plus n+1 X values, vector of n Y values per bin
        HISTOGRAM_STEP = timepoint, start, step X values, vector Y values
            per bin
        """

        SCALAR = "0"
        VECTOR = "1"
        HISTOGRAM_NAIVE = "2"
        SIGMA = "3"
        RANGE = "4"
        VECTOR_RANGE = "5"
        PACKED = "6"
        HISTOGRAM = "7"
        HISTOGRAM_STEP = "8"
        names = {
            SCALAR: _("scalar"),
            VECTOR: _("vector"),
            HISTOGRAM_NAIVE: _("histogram (deprecated)"),
            SIGMA: _("sigma"),
            RANGE: _("range"),
            VECTOR_RANGE: _("vector range"),
            PACKED: _("packed"),
            HISTOGRAM: _("histogram"),
            HISTOGRAM_STEP: _("stepped histogram"),
        }
        CHOICE = tuple(names.items())

    study = models.ForeignKey(
        Study,
        help_text=_("The Study containing this Measurement."),
        on_delete=models.CASCADE,
        verbose_name=_("Study"),
    )
    assay = models.ForeignKey(
        Assay,
        help_text=_("The Assay creating this Measurement."),
        on_delete=models.CASCADE,
        verbose_name=_("Assay"),
    )
    experimenter = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        blank=True,
        help_text=_(
            "EDD User that set up the experimental conditions of this Measurement."
        ),
        null=True,
        on_delete=models.PROTECT,
        related_name="measurement_experimenter_set",
        verbose_name=_("Experimenter"),
    )
    measurement_type = models.ForeignKey(
        MeasurementType,
        help_text=_("The type of item measured for this Measurement."),
        on_delete=models.PROTECT,
        verbose_name=_("Type"),
    )
    x_units = models.ForeignKey(
        MeasurementUnit,
        help_text=_("The units of the X-axis for this Measurement."),
        on_delete=models.PROTECT,
        related_name="+",
        verbose_name=_("X Units"),
    )
    y_units = models.ForeignKey(
        MeasurementUnit,
        help_text=_("The units of the Y-axis for this Measurement."),
        on_delete=models.PROTECT,
        related_name="+",
        verbose_name=_("Y Units"),
    )
    update_ref = models.ForeignKey(
        Update,
        help_text=_("The Update triggering the setting of this Measurement."),
        on_delete=models.PROTECT,
        verbose_name=_("Updated"),
    )
    active = models.BooleanField(
        default=True,
        help_text=_(
            "Flag indicating this Measurement is active and should be displayed."
        ),
        verbose_name=_("Active"),
    )
    compartment = VarCharField(
        choices=Compartment.CHOICE,
        default=Compartment.UNKNOWN,
        help_text=_("Compartment of the cell for this Measurement."),
        verbose_name=_("Compartment"),
    )
    measurement_format = VarCharField(
        choices=Format.CHOICE,
        default=Format.SCALAR,
        help_text=_("Enumeration of value formats for this Measurement."),
        verbose_name=_("Format"),
    )

    @classmethod
    def export_columns(cls, table_generator, instances=None):
        table_generator.define_field_column(
            cls._meta.get_field("measurement_type"),
            lookup=lambda measure: measure.measurement_type.export_name(),
        )
        table_generator.define_field_column(
            cls._meta.get_field("measurement_type"),
            heading=_("Formal Type ID"),
            key="formal_id",
            lookup=measurement_formal_id,
        )
        table_generator.define_field_column(
            cls._meta.get_field("update_ref"),
            heading=_("Measurement Updated"),
            lookup=lambda measure: measure.update_ref.mod_time,
        )
        table_generator.define_field_column(
            cls._meta.get_field("x_units"), lookup=measurement_x_unit,
        )
        table_generator.define_field_column(
            cls._meta.get_field("y_units"), lookup=measurement_y_unit,
        )

    def to_json(self, depth=0):
        return {
            "id": self.pk,
            "assay": self.get_attr_depth("assay", depth),
            "type": self.get_attr_depth("measurement_type", depth),
            "comp": self.compartment,
            "format": self.measurement_format,
            # including points here is extremely inefficient
            # better to directly filter MeasurementValue and map to parent IDs later
            # "values": map(lambda p: p.to_json(), self.measurementvalue_set.all()),
            "x_units": self.x_units_id,
            "y_units": self.y_units_id,
            "meta": self.metadata,
        }

    def __str__(self):
        return f"Measurement[{self.assay_id}][{self.measurement_type}]"

    # may not be the best method name, if we ever want to support other
    # types of data as vectors in the future
    def is_carbon_ratio(self):
        return self.measurement_format == Measurement.Format.VECTOR

    def valid_data(self):
        """Data for which the y-value is defined (non-NULL, non-blank)."""
        mdata = list(self.data())
        return [md for md in mdata if md.is_defined()]

    def is_extracellular(self):
        return self.compartment == Measurement.Compartment.EXTRACELLULAR

    def data(self):
        """Return the data associated with this measurement."""
        return self.measurementvalue_set.all()

    @property
    def name(self):
        """alias for self.measurement_type.type_name"""
        return self.measurement_type.type_name

    @property
    def compartment_symbol(self):
        return Measurement.Compartment.short_names[int(self.compartment)]

    @property
    def full_name(self):
        """measurement compartment plus measurement_type.type_name"""
        lookup = dict(Measurement.Compartment.CHOICE)
        return (lookup.get(self.compartment) + " " + self.name).strip()

    # TODO also handle vectors
    def extract_data_xvalues(self, defined_only=False):
        qs = self.measurementvalue_set.order_by("x")
        if defined_only:
            qs = qs.exclude(Q(y=None) | Q(y__len=0))
        # first index unpacks single value from tuple
        # second index unpacks first value from X
        return [x[0][0] for x in qs.values_list("x")]

    # this shouldn't need to handle vectors
    def interpolate_at(self, x):
        if self.measurement_format != Measurement.Format.SCALAR:
            raise ValueError("Can only interpolate scalar values")
        from main.utilities import interpolate_at

        return interpolate_at(self.valid_data(), x)

    @property
    def y_axis_units_name(self):
        """
        Human-readable units for Y-axis. Not intended for repeated/bulk use,
        since it involves a foreign key lookup.
        """
        return self.y_units.unit_name

    def is_concentration_measurement(self):
        return self.y_axis_units_name in ["mg/L", "g/L", "mol/L", "mM", "uM", "Cmol/L"]

    @classmethod
    def active_in(cls, *, study_id, protocol_id, assay_id=None):
        """
        Queries all active/enabled measurements matching criteria.
        """
        assay_filter = Q() if assay_id is None else Q(assay_id=assay_id)
        active = cls.objects.filter(
            assay_filter,
            active=True,
            assay__active=True,
            assay__line__active=True,
            assay__line__study_id=study_id,
            assay__protocol_id=protocol_id,
        )
        return active


def measurement_formal_id(measurement):
    mt = measurement.measurement_type
    if mt.is_metabolite() and mt.metabolite.pubchem_cid:
        return f"CID:{mt.metabolite.pubchem_cid}"
    if mt.is_protein() and mt.proteinidentifier.accession_id:
        return mt.proteinidentifier.accession_id
    return ""


def measurement_x_unit(measurement):
    if measurement.x_units and measurement.x_units.display:
        return measurement.x_units.unit_name
    return ""


def measurement_y_unit(measurement):
    if measurement.y_units and measurement.y_units.display:
        return measurement.y_units.unit_name
    return ""


class MeasurementValue(models.Model):
    """
    Pairs of ((x0, x1, ... , xn), (y0, y1, ... , ym)) values as part of
    a measurement.
    """

    class Meta:
        db_table = "measurement_value"

    study = models.ForeignKey(
        Study,
        help_text=_("The Study containing this Value."),
        on_delete=models.CASCADE,
        verbose_name=_("Study"),
    )
    measurement = models.ForeignKey(
        Measurement,
        help_text=_("The Measurement containing this point of data."),
        on_delete=models.CASCADE,
        verbose_name=_("Measurement"),
    )
    x = ArrayField(
        models.DecimalField(max_digits=16, decimal_places=5),
        help_text=_("X-axis value(s) for this point."),
        verbose_name=_("X"),
    )
    y = ArrayField(
        models.DecimalField(max_digits=16, decimal_places=5),
        help_text=_("Y-axis value(s) for this point."),
        verbose_name=_("Y"),
    )
    updated = models.ForeignKey(
        Update,
        help_text=_("The Update triggering the setting of this point."),
        on_delete=models.PROTECT,
        verbose_name=_("Updated"),
    )

    def __str__(self):
        return f"({self.x}, {self.y})"

    @property
    def fx(self):
        return float(self.x[0]) if self.x else None

    @property
    def fy(self):
        return float(self.y[0]) if self.y else None

    def to_json(self):
        return {"id": self.pk, "x": self.x, "y": self.y}

    def is_defined(self):
        return self.y is not None and len(self.y) > 0

    @classmethod
    def active_in(cls, *, study_id, protocol_id, assay_id=None, id_range=None):
        """
        Queries all active/enabled values matching criteria.
        """
        assay_filter = Q() if assay_id is None else Q(measurement__assay_id=assay_id)
        range_filter = Q() if id_range is None else Q(measurement__pk__range=id_range)
        active = cls.objects.filter(
            assay_filter,
            range_filter,
            measurement__active=True,
            measurement__assay__active=True,
            measurement__assay__line__active=True,
            measurement__assay__line__study_id=study_id,
            measurement__assay__protocol_id=protocol_id,
        )
        return active


class DefaultUnit(models.Model):
    measurement_type = models.ForeignKey(
        MeasurementType, on_delete=models.deletion.CASCADE
    )
    unit = models.ForeignKey(MeasurementUnit, on_delete=models.deletion.CASCADE)
    protocol = models.ForeignKey(
        Protocol, blank=True, null=True, on_delete=models.deletion.CASCADE
    )
    parser = VarCharField(blank=True, null=True)
