from django.conf import settings
from django.contrib.auth.models import Group
from django.db import models
from django.utils import timezone
from django_extensions.db.fields import PostgreSQLUUIDField
from itertools import chain
import arrow


class Update(models.Model):
    """
    A user update; referenced from other models that track creation and/or modification.

    Views get an Update object by calling main.models.Update.load_request_update(request) to
    lazy-load a request-scoped Update object model.
    """
    class Meta:
        db_table = 'update_info'
    mod_time = models.DateTimeField(auto_now_add=True, editable=False)
    mod_by = models.ForeignKey(settings.AUTH_USER_MODEL, editable=False)
    path = models.TextField(blank=True, null=True)
    origin = models.TextField(blank=True, null=True)

    def __str__(self):
        try:
            time = arrow.get(self.mod_time).humanize()
        except Exception as e:
            time = self.mod_time
        return '%s by %s' % (time, self.mod_by)

    @classmethod
    def load_request_update(cls, request):
        if not hasattr(request, 'update_key'):
            update = cls(mod_time=timezone.now(),
                         mod_by=request.user,
                         path=request.get_full_path(),
                         origin=request.META['REMOTE_HOST'])
            update.save()
            request.update_key = update.pk
        else:
            update = cls.objects.get(pk=request.update_key)
        return update


class Comment(models.Model):
    """
    """
    class Meta:
        db_table = 'comment'
    body = models.TextField()
    created = models.ForeignKey(Update, related_name='+')


class Attachment(models.Model):
    """
    """
    class Meta:
        db_table = 'attachment'
    file = models.FileField(max_length=255)
    filename = models.CharField(max_length=255)
    created = models.ForeignKey(Update, related_name='+')
    
    
class EDDObject(models.Model):
    """
    A first-class EDD object, with update trail, comments, attachments.
    """
    class Meta:
        db_table = 'edd_object'
    updates = models.ManyToManyField(Update, db_table='edd_object_update', related_name='+')
    comments = models.ManyToManyField(Comment, db_table='edd_object_comment', related_name='+')
    files = models.ManyToManyField(Attachment, db_table='edd_object_attachment', related_name='+')
    
    def created(self):
        created = self.updates.order_by('mod_time')[:1] 
        return created[0] if created else None
    
    def updated(self):
        updated = self.updates.order_by('-mod_time')[:1]
        return updated[0] if updated else None


class MetadataGroup(models.Model):
    """
    """
    class Meta:
        db_table = 'metadata_group'
    group_name = models.CharField(max_length=255)


class MetadataType(models.Model):
    """
    """
    STUDY = 'S'
    LINE = 'L'
    PROTOCOL = 'P'
    LINE_OR_PROTOCOL = 'LP'
    CONTEXT_SET = (
        (STUDY, 'Study'),
        (LINE, 'Line'),
        (PROTOCOL, 'Protocol'),
        (LINE_OR_PROTOCOL, 'Line or Protocol'),
    )
    class Meta:
        db_table = 'metadata_type'
    group = models.ForeignKey(MetadataGroup)
    type_name = models.CharField(max_length=255)
    input_size = models.IntegerField(default=6)
    default_value = models.CharField(max_length=255, blank=True)
    prefix = models.CharField(max_length=255, blank=True)
    postfix = models.CharField(max_length=255, blank=True)
    for_context = models.CharField(max_length=8, choices=CONTEXT_SET)
    
    def for_line(self):
        return self.for_context == self.LINE or self.for_context == self.LINE_OR_PROTOCOL
    
    def for_protocol(self):
        return self.for_context == self.PROTOCOL or self.for_context == self.LINE_OR_PROTOCOL
    
    def for_study(self):
        return self.for_context == self.STUDY


class Study(EDDObject):
    """
    A collection of items to be studied.
    """
    class Meta:
        db_table = 'study'
    study_name = models.CharField(max_length=255)
    description = models.TextField()
    active = models.BooleanField(default=True)
    object_ref = models.OneToOneField(EDDObject, parent_link=True)
    # contact info has two fields to support:
    # 1. linking to a specific user in EDD
    # 2. "This is data I got from 'Improving unobtanium production in Bio-Widget using foobar'
    #    published in Feb 2016 Bio-Widget Journal, paper has hpotter@hogwarts.edu as contact"
    contact = models.ForeignKey(settings.AUTH_USER_MODEL, blank=True, null=True,
                                related_name='contact_study_set')
    contact_extra = models.TextField()
    
    def to_solr_json(self):
        """
        Convert the Study model to a dict structure formatted for Solr JSON.
        """
        permissions = chain(self.userpermission_set.all(), self.grouppermission_set.all())
        created = self.created()[0]
        updated = self.updated()[0]
        if self.contact == None:
            contact = None
        else:
            contact = self.contact.pk
        # TODO: figure out how to efficiently load in the protocol, metabolite, and part listings
        return {
            'id': self.pk,
            'name': self.study_name,
            'description': self.description,
            'creator': created.mod_by.pk,
            'creator_email': created.mod_by.email,
            'creator_name': ' '.join([created.mod_by.first_name, created.mod_by.last_name]),
            'contact': contact,
            'active': self.active,
            'created': created.mod_time.strftime('%Y-%m-%dT%H:%M:%SZ'),
            'modified': updated.mod_time.strftime('%Y-%m-%dT%H:%M:%SZ'),
            'aclr': [p for p in permissions if p.is_read()],
            'aclw': [p for p in permissions if p.is_write()],
        }

    def user_can_read(self, user):
        return any(p.is_read() for p in chain(
                self.userpermission_set.filter(user=user),
                self.grouppermission_set.filter(group=user.groups.all())
        ))

    def user_can_write(self, user):
        return any(p.is_write() for p in chain(
                self.userpermission_set.filter(user=user),
                self.grouppermission_set.filter(group=user.groups.all())
        ))

    def __str__(self):
        return self.study_name


class StudyPermission(models.Model):
    """
    Access given for a *specific* study instance, rather than for object types provided by Django.
    """
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
        """
        Test if permission applies to given user.
        
        Base class will always return False, override in child classes.
        Arguments:
            user: to be tested, model from django.contrib.auth.models.User
        Returns:
            True if StudyPermission applies to the User
        """
        return False;

    def is_read(self):
        """
        Test if the permission grants read privileges.
        
        Returns:
            True if permission grants read
        """
        return self.permission_type == self.READ or self.permission_type == self.WRITE

    def is_write(self):
        """
        Test if the permission grants write privileges.
        
        Returns:
            True if permission grants write
        """
        return self.permission_type == self.WRITE


class UserPermission(StudyPermission):
    class Meta:
        db_table = 'study_user_permission'
    user = models.ForeignKey(settings.AUTH_USER_MODEL, related_name='+')
    
    def applies_to_user(self, user):
        return self.user == user

    def __str__(self):
        return 'u:%(user)s' % {'user':self.user.username}


class GroupPermission(StudyPermission):
    class Meta:
        db_table = 'study_group_permission'
    group = models.ForeignKey('auth.Group', related_name='+')
    
    def applies_to_user(self, user):
        return user.groups.contains(user)

    def __str__(self):
        return 'g:%(group)s' % {'group':self.group.name}


class Strain(EDDObject):
    """
    A link to a strain/part in the JBEI ICE Registry.
    """
    class Meta:
        db_table = 'strain'
    strain_name = models.CharField(max_length=255)
    registry_id = PostgreSQLUUIDField(blank=True, null=True)
    registry_url = models.URLField(max_length=255, blank=True, null=True)
    object_ref = models.OneToOneField(EDDObject, parent_link=True)


class Line(EDDObject):
    """
    A single item to be studied (contents of well, tube, dish, etc).
    """
    class Meta:
        db_table = 'line'
    study = models.ForeignKey(Study)
    line_name = models.CharField(max_length=255)
    control = models.BooleanField(default=False)
    replicate = models.ForeignKey('self', blank=True, null=True)
    object_ref = models.OneToOneField(EDDObject, parent_link=True)
    contact = models.ForeignKey(settings.AUTH_USER_MODEL, blank=True, null=True, related_name='+')
    contact_extra = models.TextField()
    experimenter = models.ForeignKey(settings.AUTH_USER_MODEL, blank=True, null=True,
                                     related_name='+')
    active = models.BooleanField(default=True)

    def __str__(self):
        return self.line_name


class LineMetadata(models.Model):
    """
    Base form for line metadata tracks which line is referred to, type, and who/when.
    """
    class Meta:
        db_table = 'line_metadata'
    line = models.ForeignKey(Line)
    data_type = models.ForeignKey(MetadataType, related_name='+')
    data_value = models.TextField()
    updated = models.ForeignKey(Update, related_name='+')


class LineStrain(models.Model):
    """
    A metadata value linking to an ICE/Registry strain.
    """
    class Meta:
        db_table = 'line_strain'
    line = models.ForeignKey(Line)
    strain = models.ForeignKey(Strain)
    updated = models.ForeignKey(Update, related_name='+')


class Protocol(EDDObject):
    """
    A defined method of examining a Line.
    """
    class Meta:
        db_table = 'protocol'
    protocol_name = models.CharField(max_length=255)
    description = models.TextField()
    object_ref = models.OneToOneField(EDDObject, parent_link=True)
    owned_by = models.ForeignKey(settings.AUTH_USER_MODEL, related_name='edd_protocol_set')
    active = models.BooleanField(default=True)
    variant_of = models.ForeignKey('self', blank=True, null=True, related_name='derived_set')
    
    def creator(self):
        return self.created.mod_by
    
    def owner(self):
        return self.owned_by
    
    def last_modified(self):
        return self.updated.mod_time

    def __str__(self):
        return self.protocol_name


class Assay(EDDObject):
    """
    An examination of a Line, containing the Protocol and set of Measurements.
    """
    class Meta:
        db_table = 'assay'
    line = models.ForeignKey(Line)
    assay_name = models.CharField(max_length=255)
    description = models.TextField()
    protocol = models.ForeignKey(Protocol)
    object_ref = models.OneToOneField(EDDObject, parent_link=True)
    experimenter = models.ForeignKey(settings.AUTH_USER_MODEL, blank=True, null=True,
                                     related_name='+')
    active = models.BooleanField(default=True)

    def __str__(self):
        return self.assay_name


class MeasurementGroup(object):
    """
    Does not need its own table in database, but multiple models will reference measurements that
    are specific to a specific group category: metabolomics, proteomics, etc.
    """
    GENERIC = '_'
    METABOLITE = 'm'
    GENEID = 'g'
    PROTEINID = 'p' 
    GROUP_CHOICE = (
        (GENERIC, 'Generic'),
        (METABOLITE, 'Metabolite'),
        (GENEID, 'Gene Identifier'),
        (PROTEINID, 'Protein Identifer'),
    )


class MeasurementType(models.Model):
    """
    Defines the type of measurement being made. A generic measurement only has name and short name;
    if the type is a metabolite, the metabolite attribute will contain additional metabolite info.
    """
    class Meta:
        db_table = 'measurement_type'
    type_name = models.CharField(max_length=255)
    short_name = models.CharField(max_length=255, blank=True, null=True)
    type_group = models.CharField(max_length=8,
                                  choices=MeasurementGroup.GROUP_CHOICE,
                                  default=MeasurementGroup.GENERIC)

    def __str__(self):
        return self.type_name


class Metabolite(MeasurementType):
    """
    Defines additional metadata on a metabolite measurement type; charge, carbon count, molar mass,
    and molecular formula.
    """
    class Meta:
        db_table = 'metabolite'
    charge = models.IntegerField()
    carbon_count = models.IntegerField()
    molar_mass = models.DecimalField(max_digits=16, decimal_places=5)
    molecular_formula = models.TextField()


class GeneIdentifier(MeasurementType):
    """
    Defines additional metadata on gene identifier transcription measurement type.
    """
    class Meta:
        db_table = 'gene_identifier'
    location_in_genome = models.TextField(blank=True, null=True)
    positive_strand = models.BooleanField(default=True)
    location_start = models.IntegerField(blank=True, null=True)
    location_end = models.IntegerField(blank=True, null=True)
    gene_length = models.IntegerField(blank=True, null=True)


# Commented out until there is more to ProteinIdentifier than what already is in MeasurementType
# class ProteinIdentifier(MeasurementType):
#     """
#     Defines additional metadata on gene identifier transcription measurement type.
#     """
#     class Meta:
#         db_table = 'protein_identifier'


class MeasurementUnit(models.Model):
    """
    Defines a unit type and metadata on measurement values.
    """
    class Meta:
        db_table = 'measurement_unit'
    unit_name = models.CharField(max_length=255)
    display = models.BooleanField(default=True)
    type_group = models.CharField(max_length=8,
                                  choices=MeasurementGroup.GROUP_CHOICE,
                                  default=MeasurementGroup.GENERIC)


class Measurement(EDDObject):
    """
    A plot of data points for an (assay, measurement type) pair. Points can either be single (x,y)
    or an (x, (y0, y1, ... , yn)) scalar and vector.
    """
    class Meta:
        db_table = 'measurement'
    assay = models.ForeignKey(Assay)
    experimenter = models.ForeignKey(settings.AUTH_USER_MODEL, blank=True, null=True,
                                     related_name='+')
    measurement_type = models.ForeignKey(MeasurementType)
    object_ref = models.OneToOneField(EDDObject, parent_link=True)
    active = models.BooleanField(default=True)

    def __str__(self):
        return 'Measurement{%d}{%s}' % (self.assay.id, self.measurement_type)


class MeasurementDatum(models.Model):
    """
    A pair of scalars (x,y) as part of a Measurement.
    """
    class Meta:
        db_table = 'measurement_datum'
    measurement = models.ForeignKey(Measurement)
    x_units = models.ForeignKey(MeasurementUnit, related_name='+')
    y_units = models.ForeignKey(MeasurementUnit, related_name='+')
    x = models.DecimalField(max_digits=16, decimal_places=5)
    y = models.DecimalField(max_digits=16, decimal_places=5, blank=True, null=True)
    updated = models.ForeignKey(Update, related_name='+')

    def __str__(self):
        return '(%f,%f)' % (self.x, self.y)


class MeasurementVector(models.Model):
    """
    A scalar-vector pair (x, (y0, y1, ... , yn)) as part of a Measurement.
    """
    class Meta:
        db_table = 'measurement_vector'
    measurement = models.ForeignKey(Measurement)
    x_units = models.ForeignKey(MeasurementUnit, related_name='+')
    y_units = models.ForeignKey(MeasurementUnit, related_name='+')
    x = models.DecimalField(max_digits=16, decimal_places=5)
    y = models.TextField()
    updated = models.ForeignKey(Update, related_name='+')

    def __str__(self):
        return '(%f,%f)' % (self.x, self.y)

