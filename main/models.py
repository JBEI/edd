from django.conf import settings
from django.db import models


class Update(models.Model):
    class Meta:
        db_table = 'update_info'
    mod_time = models.DateTimeField(auto_now_add=True, editable=False)
    mod_by = models.ForeignKey(settings.AUTH_USER_MODEL, editable=False)

class Study(models.Model):
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
        return 'Study{%d}{%s}' % (self.id, self.study_name)

class Line(models.Model):
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
        return 'Line{%d}{%s}' % (self.id, self.line_name)

class Protocol(models.Model):
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
        return 'Protocol{%d}{%s}' % (self.id, self.protocol_name)

class Assay(models.Model):
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
        return 'Assay{%d:%d}{%s}' % (self.line.id, self.id, self.assay_name)

class MeasurementType(models.Model):
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
        return 'MeasurementType{%d}{%s}' % (self.id, self.type_name)

class Measurement(models.Model):
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
    class Meta:
        db_table = 'measurement_datum'
    measurement = models.ForeignKey(Measurement)
    x = models.DecimalField(max_digits=16, decimal_places=5)
    y = models.DecimalField(max_digits=16, decimal_places=5, blank=True, null=True)
    updated = models.ForeignKey(Update, related_name='+')

    def __str__(self):
        return '(%f,%f)' % (self.x, self.y)

class MeasurementVector(models.Model):
    class Meta:
        db_table = 'measurement_vector'
    measurement = models.ForeignKey(Measurement)
    x = models.DecimalField(max_digits=16, decimal_places=5)
    y = models.TextField()
    updated = models.ForeignKey(Update, related_name='+')

    def __str__(self):
        return '(%f,%f)' % (self.x, self.y)

