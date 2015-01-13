from django.conf import settings
from django.contrib.auth.models import Group
from django.db import models
from django.utils import timezone
from itertools import chain
from main.solr import StudySearch


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
        return '%s by %s' % (self.mod_time, self.mod_by)

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
    
    
class Study(models.Model):
    """
    A collection of items to be studied.
    """
    class Meta:
        db_table = 'study'
    study_name = models.CharField(max_length=255)
    description = models.TextField()
    active = models.BooleanField(default=True)
    created = models.ForeignKey(Update, related_name='created_study_set')
    updated = models.ForeignKey(Update, related_name='+')
    contact = models.ForeignKey(settings.AUTH_USER_MODEL, blank=True, null=True,
                                related_name='contact_study_set')
    contact_extra = models.TextField()
    
    def to_solr_json(self):
        """
        Convert the Study model to a dict structure formatted for Solr JSON.
        """
        permissions = chain(self.userpermission_set.all(), self.grouppermission_set.all())
        if self.contact == None:
            contact = None
        else:
            contact = self.contact.pk
        # TODO: figure out how to efficiently load in the protocol, metabolite, and part listings
        return {
            'id': self.pk,
            'name': self.study_name,
            'description': self.description,
            'creator': self.created.mod_by.pk,
            'creator_email': self.created.mod_by.email,
            'creator_name': ' '.join([self.created.mod_by.first_name,
                                      self.created.mod_by.last_name]),
            'contact': contact,
            'active': self.active,
            'created': self.created.mod_time.strftime('%Y-%m-%dT%H:%M:%SZ'),
            'modified': self.updated.mod_time.strftime('%Y-%m-%dT%H:%M:%SZ'),
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


class Line(models.Model):
    """
    A single item to be studied (contents of well, tube, dish, etc).
    """
    class Meta:
        db_table = 'line'
    study = models.ForeignKey(Study)
    line_name = models.CharField(max_length=255)
    created = models.ForeignKey(Update, related_name='+')
    updated = models.ForeignKey(Update, related_name='+')
    contact = models.ForeignKey(settings.AUTH_USER_MODEL, blank=True, null=True, related_name='+')
    contact_extra = models.TextField()
    experimenter = models.ForeignKey(settings.AUTH_USER_MODEL, blank=True, null=True,
                                     related_name='+')
    active = models.BooleanField(default=True)

    def __str__(self):
        return self.line_name


class Protocol(models.Model):
    """
    A defined method of examining a Line.
    """
    class Meta:
        db_table = 'protocol'
    protocol_name = models.CharField(max_length=255)
    description = models.TextField()
    created = models.ForeignKey(Update, related_name='+')
    updated = models.ForeignKey(Update, related_name='+')
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


class Assay(models.Model):
    """
    An examination of a Line, containing the Protocol and set of Measurements.
    """
    class Meta:
        db_table = 'assay'
    line = models.ForeignKey(Line)
    assay_name = models.CharField(max_length=255)
    description = models.TextField()
    protocol = models.ForeignKey(Protocol)
    created = models.ForeignKey(Update, related_name='+')
    updated = models.ForeignKey(Update, related_name='+')
    experimenter = models.ForeignKey(settings.AUTH_USER_MODEL, blank=True, null=True,
                                     related_name='+')
    active = models.BooleanField(default=True)

    def __str__(self):
        return self.assay_name


class MeasurementType(models.Model):
    """
    Defines the type of measurement being made. A generic measurement only has name and short name;
    if the type is a metabolite, the metabolite attribute will contain additional metabolite info.
    """
    class Meta:
        db_table = 'measurement_type'
    GENERIC = '_'
    METABOLITE = 'm'
    GENEID = 'g'
    GROUP_CHOICE = (
        (GENERIC, 'Generic'),
        (METABOLITE, 'Metabolite'),
        (GENEID, 'Gene Identifier'),
    )
    type_name = models.CharField(max_length=255)
    short_name = models.CharField(max_length=255, blank=True, null=True)
    type_group = models.CharField(max_length=8, choices=GROUP_CHOICE, default=GENERIC)

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
    location_in_genome = models.TextField()
    positive_strand = models.BooleanField(default=True)
    location_start = models.IntegerField()
    location_end = models.IntegerField()
    gene_length = models.IntegerField()


class Measurement(models.Model):
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
    x_units = models.CharField(max_length=255)
    y_units = models.CharField(max_length=255)
    created = models.ForeignKey(Update, related_name='+')
    updated = models.ForeignKey(Update, related_name='+')
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
    x = models.DecimalField(max_digits=16, decimal_places=5)
    y = models.TextField()
    updated = models.ForeignKey(Update, related_name='+')

    def __str__(self):
        return '(%f,%f)' % (self.x, self.y)

