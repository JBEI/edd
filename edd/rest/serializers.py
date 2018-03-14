"""
Defines serializers for EDD's nascent REST API, as supported by the Django Rest Framework
(http://www.django-rest-framework.org/)
"""

from django.contrib.auth import get_user_model
from rest_framework import serializers

from main import models


class UpdateSerializer(serializers.ModelSerializer):
    class Meta:
        model = models.Update
        fields = ('mod_time', 'mod_by', 'path', 'origin')
        depth = 0


class UserSerializer(serializers.ModelSerializer):
    class Meta:
        model = get_user_model()
        depth = 0
        fields = (
            'email',
            'first_name',
            'is_active',
            'last_name',
            'pk',
            'username',
        )


class EDDObjectSerializer(serializers.ModelSerializer):
    created = UpdateSerializer(read_only=True)
    pk = serializers.IntegerField(read_only=True)
    updated = UpdateSerializer(read_only=True)
    uuid = serializers.UUIDField(format='hex_verbose', read_only=True)

    class Meta:
        model = models.EDDObject
        fields = (
            'active',
            'created',
            'description',
            'meta_store',
            'name',
            'pk',
            'updated',
            'uuid',
        )


class AssaySerializer(EDDObjectSerializer):
    class Meta:
        model = models.Assay
        fields = EDDObjectSerializer.Meta.fields + (
            'experimenter',
            'line',
            'protocol',
        )


class MeasurementSerializer(serializers.ModelSerializer):
    pk = serializers.IntegerField(read_only=True)
    update_ref = UpdateSerializer(read_only=True)

    class Meta:
        model = models.Measurement
        fields = (
            'assay',
            'compartment',
            'experimenter',
            'measurement_format',
            'measurement_type',
            'pk',
            'update_ref',
            'x_units',
            'y_units',
        )


class MeasurementValueSerializer(serializers.ModelSerializer):
    pk = serializers.IntegerField(read_only=True)
    updated = UpdateSerializer(read_only=True)

    class Meta:
        model = models.MeasurementValue
        fields = (
            'measurement',
            'pk',
            'updated',
            'x',
            'y',
        )


class StudySerializer(EDDObjectSerializer):
    contact = UserSerializer(read_only=True)
    contact_id = serializers.IntegerField(write_only=True, required=False)
    contact_extra = serializers.CharField(allow_blank=True, required=False)

    class Meta:
        model = models.Study
        depth = 0
        fields = EDDObjectSerializer.Meta.fields + (
            'contact',
            'contact_extra',
            'contact_id',
            'metabolic_map',
            'slug',
        )
        read_only_fields = ('slug', )

    def validate(self, data):
        if 'contact_id' not in data and 'contact_extra' not in data:
            raise serializers.ValidationError(
                'Must specify one of "contact_id" or "contact_extra"'
            )
        return data


class LineSerializer(EDDObjectSerializer):
    carbon_source = serializers.StringRelatedField(many=True)
    strains = serializers.SlugRelatedField(many=True, read_only=True, slug_field='registry_url')

    class Meta:
        model = models.Line
        depth = 0
        fields = EDDObjectSerializer.Meta.fields + (
            'carbon_source',
            'contact',
            'control',
            'experimenter',
            'strains',
            'study',
        )


class MetadataTypeSerializer(serializers.ModelSerializer):
    class Meta:
        model = models.MetadataType
        depth = 0
        fields = (
            'default_value',
            'for_context',
            'group',
            'input_size',
            'input_type',
            'pk',
            'postfix',
            'prefix',
            'type_class',
            'type_i18n',
            'type_name',
            'uuid',
        )


class MeasurementTypeSerializer(serializers.ModelSerializer):
    class Meta:
        model = models.MeasurementType
        depth = 0
        fields = (
            'alt_names',
            'pk',
            'type_group',
            'type_name',
            'type_source',
            'uuid',
        )


class MetaboliteSerializer(MeasurementTypeSerializer):
    class Meta:
        model = models.Metabolite
        depth = 0
        fields = MeasurementTypeSerializer.Meta.fields + (
            'carbon_count',
            'charge',
            'id_map',
            'molar_mass',
            'molecular_formula',
            'smiles',
            'tags',
        )


class ProteinIdSerializer(MeasurementTypeSerializer):
    class Meta:
        model = models.ProteinIdentifier
        depth = 0
        fields = MeasurementTypeSerializer.Meta.fields + (
            'accession_id',
            'length',
            'mass',
        )


class GeneIdSerializer(MeasurementTypeSerializer):
    class Meta:
        model = models.GeneIdentifier
        depth = 0
        fields = MeasurementTypeSerializer.Meta.fields + (
            'gene_length',
            'location_end',
            'location_in_genome',
            'location_start',
            'positive_strand',
        )


class PhosphorSerializer(MeasurementTypeSerializer):
    class Meta:
        model = models.Phosphor
        depth = 0
        fields = MeasurementTypeSerializer.Meta.fields + (
            'emission_wavelength',
            'excitation_wavelength',
            'reference_type',
        )


class MeasurementUnitSerializer(serializers.ModelSerializer):
    class Meta:
        model = models.MeasurementUnit
        depth = 0
        fields = (
            'alternate_names',
            'display',
            'pk',
            'type_group',
            'unit_name',
        )


class ProtocolSerializer(EDDObjectSerializer):
    class Meta:
        model = models.Protocol
        depth = 0
        fields = EDDObjectSerializer.Meta.fields + (
            'categorization',
            'default_units',
            'owned_by',
            'variant_of',
        )


class MetadataGroupSerializer(serializers.ModelSerializer):
    class Meta:
        model = models.MetadataGroup
        depth = 0
        fields = (
            'group_name',
        )
