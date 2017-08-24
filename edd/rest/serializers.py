"""
Defines serializers for EDD's nascent REST API, as supported by the Django Rest Framework
(http://www.django-rest-framework.org/)
"""

from django.contrib.auth import get_user_model
from rest_framework import serializers

from main import models


###################################################################################################
# unused
###################################################################################################
class UpdateSerializer(serializers.ModelSerializer):
    class Meta:
        model = models.Update
        fields = ('mod_time', 'mod_by', 'path', 'origin')
        depth = 0
###################################################################################################


_MEASUREMENT_TYPE_FIELDS = ('pk', 'uuid', 'type_name', 'type_group', 'type_source', 'alt_names')


class AssaySerializer(serializers.ModelSerializer):
    class Meta:
        model = models.Assay
        fields = ('pk', 'line', 'name', 'protocol', 'experimenter', 'description', 'uuid',
                  'created', 'updated', 'meta_store', 'active')


class MeasurementSerializer(serializers.ModelSerializer):
    class Meta:
        model = models.Measurement
        fields = ('pk', 'assay', 'experimenter', 'measurement_type', 'x_units',
                  'y_units', 'compartment', 'active', 'update_ref', 'measurement_format')


class MeasurementValueSerializer(serializers.ModelSerializer):
    class Meta:
        model = models.MeasurementValue
        fields = ('pk', 'measurement', 'x', 'y', 'updated')


class StudySerializer(serializers.ModelSerializer):
    class Meta:
        model = models.Study
        fields = ('pk', 'name', 'description', 'uuid', 'slug',  'created', 'updated', 'contact',
                  'contact_extra', 'metabolic_map', 'meta_store', 'active')

        # disable editable DB fields where write access shoulde be hidden for unprivileged users
        read_only_fields = ('slug', 'meta_store')
        depth = 0
        lookup_field = 'study'


class LineSerializer(serializers.ModelSerializer):
    class Meta:
        model = models.Line
        fields = ('pk', 'uuid', 'study', 'name', 'description', 'control', 'replicate', 'contact',
                  'experimenter', 'protocols', 'strains', 'meta_store', 'active')
        carbon_source = serializers.StringRelatedField(many=False)
        depth = 0

        def create(self, validated_data):
            """
            Create and return a new Line instance, given the validated data
            """
            return models.Line.objects.create(**validated_data)


class UserSerializer(serializers.ModelSerializer):
    class Meta:
        model = get_user_model()
        depth = 0
        fields = ('pk', 'username', 'first_name', 'last_name', 'email', 'is_active')


class MetadataTypeSerializer(serializers.ModelSerializer):
    class Meta:
        model = models.MetadataType
        depth = 0
        fields = ('pk', 'uuid', 'type_name', 'type_i18n', 'input_size', 'input_type',
                  'default_value', 'prefix', 'postfix', 'for_context', 'type_class', 'group')


class MeasurementTypeSerializer(serializers.ModelSerializer):
    class Meta:
        model = models.MeasurementType
        depth = 0
        fields = _MEASUREMENT_TYPE_FIELDS


class MetaboliteSerializer(serializers.ModelSerializer):
    class Meta:
        model = models.Metabolite
        depth = 0
        fields = _MEASUREMENT_TYPE_FIELDS + ('charge', 'carbon_count', 'molar_mass',
                                             'molecular_formula', 'smiles', 'id_map', 'tags')


class ProteinIdSerializer(serializers.ModelSerializer):
    class Meta:
        model = models.ProteinIdentifier
        depth = 0
        fields = _MEASUREMENT_TYPE_FIELDS + ('accession_id', 'length', 'mass')


class GeneIdSerializer(serializers.ModelSerializer):
    class Meta:
        model = models.GeneIdentifier
        depth = 0
        fields = _MEASUREMENT_TYPE_FIELDS + ('location_in_genome', 'positive_strand',
                                             'location_start', 'location_end', 'gene_length')


class PhosphorSerializer(serializers.ModelSerializer):
    class Meta:
        model = models.Phosphor
        depth = 0
        fields = _MEASUREMENT_TYPE_FIELDS + ('excitation_wavelength', 'emission_wavelength',
                                             'reference_type')


class MeasurementUnitSerializer(serializers.ModelSerializer):
    class Meta:
        model = models.MeasurementUnit
        depth = 0
        fields = ('pk', 'unit_name', 'display', 'alternate_names', 'type_group')


class ProtocolSerializer(serializers.ModelSerializer):
    class Meta:
        model = models.Protocol
        depth = 0
        fields = ('pk', 'uuid', 'name', 'description', 'owned_by', 'variant_of', 'default_units',
                  'categorization')


class MetadataGroupSerializer(serializers.ModelSerializer):
    class Meta:
        model = models.MetadataGroup
        depth = 0


class StrainSerializer(serializers.ModelSerializer):

    class Meta:
        model = models.Strain

        fields = ('name', 'description', 'registry_url', 'registry_id', 'pk')
        depth = 0
