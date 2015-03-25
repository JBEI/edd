from django.conf import settings
from django.contrib.auth.models import Group
from django.db import models
from django.utils import timezone
from django.utils.dateformat import format as format_date
from django_extensions.db.fields import PostgreSQLUUIDField
from django_hstore import hstore
from itertools import chain
import arrow
import re


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

    def to_json(self):
        return {
            "time": format_date(self.mod_time, 'U'),
            "user": self.mod_by.pk,
        }


class Comment(models.Model):
    """
    """
    class Meta:
        db_table = 'comment'
    object_ref = models.ForeignKey('EDDObject', related_name='comments')
    body = models.TextField()
    created = models.ForeignKey(Update, related_name='+')


class Attachment(models.Model):
    """
    """
    class Meta:
        db_table = 'attachment'
    object_ref = models.ForeignKey('EDDObject', related_name='files')
    file = models.FileField(max_length=255)
    filename = models.CharField(max_length=255)
    created = models.ForeignKey(Update, related_name='+')
    description = models.TextField(blank=True, null=False)
    mime_type = models.CharField(max_length=255, null=True)
    file_size = models.IntegerField(default=0)


class MetadataGroup(models.Model):
    """
    """
    class Meta:
        db_table = 'metadata_group'
    group_name = models.CharField(max_length=255)

    def __str__(self):
        return self.group_name


class MetadataType(models.Model):
    """
    """
    STUDY = 'S'
    LINE = 'L'
    PROTOCOL = 'P'
    LINE_OR_PROTOCOL = 'LP'
    ALL = 'LPS'
    CONTEXT_SET = (
        (STUDY, 'Study'),
        (LINE, 'Line'),
        (PROTOCOL, 'Protocol'),
        (LINE_OR_PROTOCOL, 'Line or Protocol'),
        (ALL, 'All'),
    )
    class Meta:
        db_table = 'metadata_type'
    group = models.ForeignKey(MetadataGroup)
    type_name = models.CharField(max_length=255)
    type_i18n = models.CharField(max_length=255, blank=True, null=True)
    input_size = models.IntegerField(default=6)
    default_value = models.CharField(max_length=255, blank=True)
    prefix = models.CharField(max_length=255, blank=True)
    postfix = models.CharField(max_length=255, blank=True)
    for_context = models.CharField(max_length=8, choices=CONTEXT_SET)
    # TODO: add a type_class field and utility method to take a Metadata.data_value and return
    #   a model instance; e.g. type_class = 'CarbonSource' would do a
    #   CarbonSource.objects.get(pk=value)
    type_class = models.CharField(max_length=255, blank=True, null=True)
    
    def for_line(self):
        return (self.for_context == self.LINE or
            self.for_context == self.LINE_OR_PROTOCOL or
            self.for_context == self.ALL)
    
    def for_protocol(self):
        return (self.for_context == self.PROTOCOL or
            self.for_context == self.LINE_OR_PROTOCOL or
            self.for_context == self.ALL)
    
    def for_study(self):
        return (self.for_context == self.STUDY or
            self.for_context == self.ALL)

    def __str__(self):
        return self.type_name

    def to_json (self) :
        return {
            "id" : self.pk,
            "gn" : self.group.group_name,
            "name" : self.type_name,
            "is" : self.input_size,
            "pre" : self.prefix,
            "postfix" : self.postfix,
            "default" : self.default_value,
            "ll" : self.for_line(),
            "pl" : self.for_protocol(),
        }


class EDDObject(models.Model):
    """
    A first-class EDD object, with update trail, comments, attachments.
    """
    class Meta:
        db_table = 'edd_object'
    name = models.CharField(max_length=255)
    description = models.TextField(blank=True, null=True)
    updates = models.ManyToManyField(Update, db_table='edd_object_update', related_name='+')
    meta_store = hstore.DictionaryField(blank=True, default=dict)

    # Use custom hstore manager to enable queries on hstore data
    objects = hstore.HStoreManager()
    
    def created(self):
        created = self.updates.order_by('mod_time')[:1] 
        return created[0] if created else None
    
    def updated(self):
        updated = self.updates.order_by('-mod_time')[:1]
        return updated[0] if updated else None

    def mod_epoch (self) :
        mod_date = self.updated()
        if (mod_date) :
          return format_date(mod_date.mod_time, 'U')
        return None

    @property
    def last_modified (self) :
        updated = self.updated()
        if (updated is None) :
            return "N/A"
        else : # FIXME these are UTC...
            return updated.mod_time.strftime("%b %d %Y, %I:%M%p")

    def get_attachment_count(self):
        return self.files.count()

    def get_comment_count(self):
        return self.comments.count()

    def get_metadata_json(self):
        return self.meta_store

    def get_metadata_types(self):
        return list(MetadataType.objects.filter(pk__in=self.meta_store.keys()))

    def __str__(self):
        return self.name


class MetabolicMap (EDDObject) :
    """
    Container for information used in SBML export.
    """
    class Meta:
        db_table = "metabolic_map"
    object_ref = models.OneToOneField(EDDObject, parent_link=True)
    biomass_calculation = models.DecimalField(default=-1, decimal_places=5,
        max_digits=16) # XXX check that these parameters make sense!
    biomass_calculation_info = models.TextField(default='')
    biomass_exchange_name = models.TextField()

    @property
    def xml_file (self) :
        files = self.files.all()
        if (len(files) == 0) :
            raise RuntimeError("No attachments found for metabolic map %s!" %
                self.name)
        elif (len(files) > 1) :
            raise RuntimeError("Multiple attachments found for metabolic map "+
              "%s!" % self.name)
        return files[0]


class Study(EDDObject):
    """
    A collection of items to be studied.
    """
    class Meta:
        db_table = 'study'
        verbose_name_plural = 'Studies'
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
        created = self.created()
        updated = self.updated()
        owner = created.mod_by.userprofile if hasattr(created.mod_by, 'userprofile') else None
        return {
            'id': self.pk,
            'name': self.name,
            'description': self.description,
            'creator': created.mod_by.pk,
            'creator_email': created.mod_by.email,
            'creator_name': ' '.join([created.mod_by.first_name, created.mod_by.last_name]),
            'initials': owner.initials if owner != None else None,
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

    def get_combined_permission(self):
        return chain(self.userpermission_set.all(), self.grouppermission_set.all())

    def get_contact(self):
        if self.contact is None:
            return self.contact_extra
        return self.contact.email

    def get_line_metadata_types(self):
        # TODO: add in strain, carbon source here? IFF exists a line with at least one
        # TODO: cannot go through non-existant Metadata object mapping now
        return list()

    def get_metabolite_types_used(self):
        return list(Metabolite.objects.filter(measurement__assay__line__study=self).distinct())

    def get_protocols_used(self):
        return list(Protocol.objects.filter(assay__line__study=self).distinct())

    def get_strains_used(self):
        return list(Strain.objects.filter(line__study=self).distinct())

    def get_assays (self) :
        return list(Assay.objects.filter(line__study=self))

    def get_assays_by_protocol (self) :
        protocols = Protocol.objects.all()
        assays_by_protocol = { p.id : [] for p in protocols }
        for assay in self.get_assays() :
            assays_by_protocol[assay.protocol.id].append(assay.id)
        return assays_by_protocol


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


class Protocol(EDDObject):
    """
    A defined method of examining a Line.
    """
    class Meta:
        db_table = 'protocol'
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

    def to_solr_value(self):
        return '%(id)s@%(name)s' % {'id':self.pk, 'name':self.name}

    def __str__(self):
        return self.name

    def to_json (self) :
        return {
            "name" : self.name,
            "disabled" : not self.active,
        }

    @property
    def categorization (self) :
        """
        The 'categorization' determines what broad category the Protocol falls
        into with respect to how its Metabolite data should be processed
        internally.  The categorizations used so far are the strings
        'OD', 'HPLC', 'LCMS', and 'RAMOS', and the catch-all 'Unknown'.
        """
        # FIXME This is not the best way of doing it, depending as it does
        # on the arbitrary naming conventions used by scientists creating new
        # Protocols, so it will probably need replacing later on.
        c = "Unknown"
        name = self.name.upper()
        if (name == "OD600") :
            return "OD"
        elif ("HPLC" in name) :
            return "HPLC"
        elif (re.match("^LC[\-\/]?", name) or  re.match("^GC[\-\/]?", name)) :
            return "LCMS"
        elif re.match("O2\W+CO2", name) :
            return "RAMOS"
        elif ("TRANSCRIPTOMICS" in name) or ("PROTEOMICS" in name) :
            return "TPOMICS"
        else :
            return "Unknown"


class Strain(EDDObject):
    """
    A link to a strain/part in the JBEI ICE Registry.
    """
    class Meta:
        db_table = 'strain'
    registry_id = PostgreSQLUUIDField(blank=True, null=True)
    registry_url = models.URLField(max_length=255, blank=True, null=True)
    object_ref = models.OneToOneField(EDDObject, parent_link=True)

    def to_solr_value(self):
        return '%(id)s@%(name)s' % {'id':self.registry_id, 'name':self.name}

    def __str__(self):
        return self.name

    def to_json (self) :
        return {
            "name" : self.name,
            "desc" : self.description,
            "registry_url" : self.registry_url,
        }


class CarbonSource(EDDObject):
    """
    Information about carbon sources, isotope labeling.
    """
    class Meta:
        db_table = 'carbon_source'
    object_ref = models.OneToOneField(EDDObject, parent_link=True)
    # Labeling is description of isotope labeling used in carbon source
    labeling = models.TextField()
    volume = models.DecimalField(max_digits=16, decimal_places=5)
    active = models.BooleanField(default=True)

    def to_json (self) :
        return {
            "carbon" : self.name,
            "labeling" : self.labeling,
            "initials" : None, # TODO
            "vol" : self.volume,
            "mod" : self.mod_epoch(),
            "modstr" : str(self.updated()),
            "ainfo" : None, # TODO
            "userid" : None, # TODO
            "disabled" : not self.active,
        }


class Line(EDDObject):
    """
    A single item to be studied (contents of well, tube, dish, etc).
    """
    class Meta:
        db_table = 'line'
    study = models.ForeignKey(Study)
    control = models.BooleanField(default=False)
    replicate = models.ForeignKey('self', blank=True, null=True)
    object_ref = models.OneToOneField(EDDObject, parent_link=True)
    contact = models.ForeignKey(settings.AUTH_USER_MODEL, blank=True, null=True, related_name='+')
    contact_extra = models.TextField()
    experimenter = models.ForeignKey(settings.AUTH_USER_MODEL, blank=True, null=True,
                                     related_name='+')
    active = models.BooleanField(default=True)
    carbon_source = models.ManyToManyField(CarbonSource, db_table='line_carbon_source')
    protocols = models.ManyToManyField(Protocol, through='Assay')
    strains = models.ManyToManyField(Strain, db_table='line_strain')

    def to_json(self):
        return {
            'id': self.pk,
            'name': self.name,
            'description': self.description,
            'active': self.active,
            'control': self.control,
            'replicate': self.replicate.pk if self.replicate else None,
            'contact': { 'user_id': self.contact.pk, 'text': self.contact_extra },
            'experimenter': self.experimenter.pk,
            'meta': self.get_metadata_json(),
            'strain': [s.pk for s in self.strains.all()],
            'carbon': [c.pk for c in self.carbon_source.all()],
            'modified': self.updated().to_json(),
            'created': self.created().to_json(),
        }

    # FIXME broken right now because line_strain table is empty
    @property
    def strain_ids (self) :
        """
        String representation of associated strains; used in views.
        """
        return ",".join([ s.registry_id for s in self.strains.all() ])

    @property
    def carbon_source_info (self) :
        """
        String representation of carbon source(s) with labeling included;
        used in views.
        """
        return ",".join([ "%s (%s)" % (cs.name, cs.labeling)
                          for cs in self.carbon_source.all() ])

    @property
    def carbon_source_name (self) :
        """
        String representation of carbon source(s); used in views.
        """
        return ",".join([ cs.name for cs in self.carbon_source.all() ])

    @property
    def carbon_source_labeling (self) :
        """
        String representation of labeling (if any); used in views.
        """
        return ",".join([str(cs.labeling) for cs in self.carbon_source.all()])

    @property
    def media (self) :
        return self.get_metadata_dict().get("Media", None)

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

    def to_solr_value(self):
        return '%(id)s@%(name)s' % {'id':self.pk, 'name':self.type_name}

    def to_json(self):
        return {
            "id": self.pk,
            "name": self.type_name,
            "sn": self.short_name,
            "family": self.type_group,
        }

    def __str__(self):
        return self.type_name

    def is_metabolite (self) :
        return self.type_group == MeasurementGroup.METABOLITE

    def is_protein (self) :
        return self.type_group == MeasurementGroup.PROTEINID

    def is_gene (self) :
        return self.type_group == MeasurementGroup.GENEID

    @classmethod
    def proteins (cls) :
        """
        Return all instances of protein measurements.
        """
        return cls.objects.filter(type_group=MeasurementGroup.PROTEINID)

    @classmethod
    def proteins_by_name (cls) :
        """
        Generate a dictionary of proteins keyed by name.
        """
        return {p.type_name : p for p in cls.proteins().order_by("type_name")}

    @classmethod
    def create_protein (cls, type_name, short_name=None) :
        return cls.objects.create(
            type_name=type_name,
            short_name=short_name,
            type_group=MeasurementGroup.PROTEINID)


class Metabolite(MeasurementType):
    """
    Defines additional metadata on a metabolite measurement type; charge, carbon count, molar mass,
    and molecular formula.
    TODO: aliases for metabolite type_name/short_name
    TODO: datasource; BiGG vs JBEI-created records
    TODO: links to kegg files?
    """
    class Meta:
        db_table = 'metabolite'
    charge = models.IntegerField()
    carbon_count = models.IntegerField()
    molar_mass = models.DecimalField(max_digits=16, decimal_places=5)
    molecular_formula = models.TextField()

    def is_metabolite (self) :
        return True

    def to_json(self):
        return dict(super(Metabolite, self).to_json(), **{
            "ans" : "", # TODO alternate_names
            "f" : self.molecular_formula,
            "mm" : float(self.molar_mass),
            "cc" : self.carbon_count,
            "chg" : self.charge,
            "chgn" : self.charge, # TODO find anywhere in typescript using this and fix it
        })


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

    @classmethod
    def by_name (cls) :
        """
        Generate a dictionary of genes keyed by name.
        """
        genes = cls.objects.all().order_by("type_name")
        return { g.type_name : g for g in genes }


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
    # TODO alternate_unit_names ???
    unit_name = models.CharField(max_length=255)
    display = models.BooleanField(default=True)
    type_group = models.CharField(max_length=8,
                                  choices=MeasurementGroup.GROUP_CHOICE,
                                  default=MeasurementGroup.GENERIC)

    def to_json (self) :
        return { "name" : self.unit_name }


class Assay(EDDObject):
    """
    An examination of a Line, containing the Protocol and set of Measurements.
    """
    class Meta:
        db_table = 'assay'
    line = models.ForeignKey(Line)
    protocol = models.ForeignKey(Protocol)
    object_ref = models.OneToOneField(EDDObject, parent_link=True)
    experimenter = models.ForeignKey(settings.AUTH_USER_MODEL, blank=True, null=True,
                                     related_name='+')
    active = models.BooleanField(default=True)
    measurement_types = models.ManyToManyField(MeasurementType, through='Measurement')

    def get_metabolite_measurements (self) :
        return self.measurement_set.filter(
            measurement_type__type_group=MeasurementGroup.METABOLITE)

    def get_protein_measurements (self) :
        return self.measurement_set.filter(
            measurement_type__type_group=MeasurementGroup.PROTEINID)

    def get_gene_measurements (self) :
        return self.measurement_set.filter(
            measurement_type__type_group=MeasurementGroup.GENEID)

    def to_json (self) :
        return {
            "id": self.pk,
            "fn" : self.name,
            "ln" : self.line.name,
            "an" : self.name,
            "des" : self.description,
            "dis" : not self.active,
            "lid" : self.line.pk,
            "pid" : self.protocol.pk,
            'meta': self.get_metadata_json(),
            "mea_c" : len(self.measurement_set.all()),
            "met_c" : len(self.get_metabolite_measurements()),
            "tra_c" : len(self.get_protein_measurements()),
            "pro_c" : len(self.get_gene_measurements()),
            "mod" : str(self.updated()),
            "exp" : self.experimenter.id,
        }


class MeasurementCompartment (object) :
    UNKNOWN, INTRACELLULAR, EXTRACELLULAR = range(3)
    short_names = ["", "IC", "EC"]
    names = ["", "Intracellular/Cytosol (Cy)", "Extracellular"]
    GROUP_CHOICE = ( (str(i), cn) for (i,cn) in enumerate(names) )


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
    update_ref = models.ForeignKey(Update, related_name='+')
    active = models.BooleanField(default=True)
    compartment = models.CharField(max_length=1,
                                   choices=MeasurementCompartment.GROUP_CHOICE,
                                   default=MeasurementCompartment.UNKNOWN)
    measurement_format = models.IntegerField(default=0)

    def to_json(self):
        points = chain(self.measurementdatum_set.all(), self.measurementvector_set.all())
        return {
            "id": self.pk,
            "assay": self.assay.pk,
            "type": self.measurement_type.pk,
            "values": map(lambda p: p.to_json(), points),
        }

    def __str__(self):
        return 'Measurement{%d}{%s}' % (self.assay.id, self.measurement_type)

    def is_gene_measurement (self) :
        return self.measurement_type.type_group == MeasurementGroup.GENEID

    def is_protein_measurement (self) :
        return self.measurement_type.type_group == MeasurementGroup.PROTEINID

    def is_carbon_ratio (self) :
        return (self.measurement_format == 1)

    def valid_data (self) :
        return self.measurementdatum_set.filter(y__isnull=False)

    @property
    def name (self) :
        """alias for self.measurement_type.type_name"""
        return self.measurement_type.type_name

    @property
    def short_name (self) :
        """alias for self.measurement_type.short_name"""
        return self.measurement_type.short_name

    @property
    def full_name (self) :
        """measurement compartment plus measurement_type.type_name"""
        return ({"0":"","1":"IC","2":"EC"}.get(self.compartment) +
                " " + self.name).strip()

    # TODO also handle vectors
    def extract_data_xvalues (self, defined_only=False) :
        if defined_only :
            return [ m.fx for m in self.measurementdatum_set.filter(
                y__isnull=False) ]
        else :
            return [ m.fx for m in self.measurementdatum_set.all() ]

    # XXX this shouldn't need to handle vectors (?)
    def interpolate_at (self, x) :
        """
        Given an X-value without a measurement, use linear interpolation to
        compute an approximate Y-value based on adjacent measurements (if any).
        """
        import numpy
        data = sorted(list(self.measurementdatum_set.filter(y__isnull=False)),
            lambda a,b: cmp(a.x, b.x))
        if (len(data) == 0) :
            raise ValueError("Can't interpolate because no valid "+
              "measurement data are present.")
        xp = numpy.array([ d.fx for d in data ])
        if (not (xp[0] <= x <= xp[-1])) :
            return None
        fp = numpy.array([ d.fy for d in data ])
        return numpy.interp(float(x), xp, fp)

    @property
    def y_axis_units_name (self) :
        """
        Retrieve the label for units on the Y-axis across all data.  If the
        y_units field is not consistent, an error will be raised.
        """
        names = set()
        for md in self.measurementdatum_set.all() :
            names.add(md.y_units.unit_name)
        names = list(names)
        if (len(names) == 1) :
            return names[0]
        elif (len(names) == 0) :
            return None
        else :
            raise RuntimeError("Multiple measurement units for ID %d: %s " %
                (self.id, "; ".join(names)))

    def is_concentration_measurement (self) :
        return (self.y_axis_units_name in
                ["mg/L", "g/L", "mol/L", "mM", "uM", "Cmol/L"])


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

    def to_json(self):
        return {
            "id": self.pk,
            "x": self.x,
            "x_units": self.x_units.pk,
            "y": self.y,
            "y_units": self.y_units.pk,
        }

    def __str__(self):
        return '(%f,%f)' % (self.x, self.y)

    @property
    def fx (self) :
        """Returns self.x as a Python float"""
        return float(self.x)

    @property
    def fy (self) :
        """Returns self.y as a Python float OR None if undefined"""
        if (self.y is not None) :
            return float(self.y)
        return None


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

    def to_json(self):
        return {
            "id": self.pk,
            "x": self.x,
            "x_units": self.x_units.pk,
            "y": self.y,
            "y_units": self.y_units.pk,
        }

    def __str__(self):
        return '(%f,%f)' % (self.x, self.y)

