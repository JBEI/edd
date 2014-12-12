from django.conf import settings
from django.db import models
from django.utils import timezone


class Update(models.Model):
    """
    A user update; referenced from other models that track creation and/or modification.

    Views get an Update object by calling main.models.Update.load_request_update(request) to lazy-load a request-scoped Update object model.
    """
    class Meta:
        db_table = 'update_info'
    mod_time = models.DateTimeField(auto_now_add=True, editable=False)
    mod_by = models.ForeignKey(settings.AUTH_USER_MODEL, editable=False)

    def __str__(self):
        return '%s by %s' % (mod_time, mod_by)

    @classmethod
    def load_request_update(cls, request):
        if not hasattr(request, 'update_key'):
            update = Update(mod_time=timezone.now(), mod_by=request.user)
            update.save()
            request.update_key = update.pk
        else:
            update = Update.objects.get(pk=request.update_key)
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
    created = models.ForeignKey(Update, related_name='+')
    updated = models.ForeignKey(Update, related_name='+')
    contact = models.ForeignKey(settings.AUTH_USER_MODEL, blank=True, null=True, related_name='+')
    contact_extra = models.TextField()
    permissions = models.TextField()

    def __str__(self):
        return self.study_name

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
    experimenter = models.ForeignKey(settings.AUTH_USER_MODEL, blank=True, null=True, related_name='+')
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
    experimenter = models.ForeignKey(settings.AUTH_USER_MODEL, blank=True, null=True, related_name='+')
    active = models.BooleanField(default=True)

    def __str__(self):
        return self.assay_name

class MeasurementType(models.Model):
    """
    Defines the type of measurement being made. This needs to expand with further data models to match what
    perl EDD does, i.e. metabolite measurement types should have charge, molecular formula, molar mass,
    carbon count. For now, just a name and a flag indicating future data to load.
    """
    class Meta:
        db_table = 'measurement_type'
    GENERIC = 'g'
    METABOLITE = 'm'
    GROUP_CHOICE = (
        (GENERIC, 'Generic'),
        (METABOLITE, 'Metabolite'),
    )
    type_name = models.CharField(max_length=255)
    short_name = models.CharField(max_length=255, blank=True, null=True)
    type_group = models.CharField(max_length=8, choices=GROUP_CHOICE, default=GENERIC)

    def __str__(self):
        return self.type_name

class Measurement(models.Model):
    """
    A plot of data points for an (assay, measurement type) pair. Points can either be single (x,y) or an
    (x, (y0, y1, ... , yn)) scalar and vector.
    """
    class Meta:
        db_table = 'measurement'
    assay = models.ForeignKey(Assay)
    experimenter = models.ForeignKey(settings.AUTH_USER_MODEL, blank=True, null=True, related_name='+')
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

