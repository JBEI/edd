from django.contrib.auth import get_user_model
from rest_framework import serializers

from main import models


class UpdateSerializer(serializers.ModelSerializer):
    by = serializers.IntegerField(source="mod_by_id")
    time = serializers.IntegerField(source="int_timestamp")

    class Meta:
        depth = 0
        fields = ("time", "by")
        model = models.Update


class UserSerializer(serializers.ModelSerializer):
    display = serializers.CharField(
        allow_blank=True,
        required=False,
        source="profile.display_name",
    )
    initials = serializers.CharField(
        allow_blank=True,
        required=False,
        source="profile.initials",
    )

    class Meta:
        depth = 0
        fields = (
            "display",
            "email",
            "initials",
            "is_active",
            "pk",
            "username",
        )
        model = get_user_model()


class EDDObjectSerializer(serializers.ModelSerializer):
    created = UpdateSerializer(read_only=True)
    pk = serializers.IntegerField(read_only=True)
    updated = UpdateSerializer(read_only=True)
    uuid = serializers.UUIDField(format="hex_verbose", read_only=True)

    class Meta:
        model = models.EDDObject
        fields = (
            "active",
            "created",
            "description",
            "metadata",
            "name",
            "pk",
            "updated",
            "uuid",
        )


class StrainSerializer(serializers.ModelSerializer):
    class Meta:
        model = models.Strain
        depth = 0
        fields = ("name", "registry_id", "registry_url")


class AssaySerializer(EDDObjectSerializer):
    class Meta:
        model = models.Assay
        fields = EDDObjectSerializer.Meta.fields + (
            "experimenter",
            "line",
            "protocol",
            "study",
        )


class CompartmentSerializer(serializers.Serializer):
    # Compartment is a static list in code, but treat as database record anyway
    pk = serializers.IntegerField(read_only=True, source="id")
    code = serializers.CharField(read_only=True)
    name = serializers.CharField(read_only=True)


class ValueSerializer(serializers.ModelSerializer):
    # force-cast Decimal to Float; prevents value repr as strings instead of numbers
    x = serializers.ListField(child=serializers.FloatField())
    y = serializers.ListField(child=serializers.FloatField())

    class Meta:
        model = models.MeasurementValue
        fields = ("x", "y")


class MeasurementSerializer(serializers.ModelSerializer):
    pk = serializers.IntegerField(read_only=True)
    compartment = serializers.CharField(read_only=True)
    type = serializers.IntegerField(read_only=True, source="measurement_type_id")
    format = serializers.CharField(read_only=True, source="measurement_format")
    values = ValueSerializer(many=True)

    class Meta:
        model = models.Measurement
        fields = (
            "assay",
            "compartment",
            "experimenter",
            "format",
            "pk",
            "type",
            "study",
            "values",
            "x_units",
            "y_units",
        )


class StudySerializer(EDDObjectSerializer):
    contact = UserSerializer(read_only=True)
    contact_id = serializers.IntegerField(write_only=True, required=False)
    contact_extra = serializers.CharField(allow_blank=True, required=False)

    class Meta:
        model = models.Study
        depth = 0
        fields = EDDObjectSerializer.Meta.fields + (
            "contact",
            "contact_extra",
            "contact_id",
            "slug",
        )
        read_only_fields = ("slug",)

    def validate(self, data):
        if (
            not self.partial
            and "contact_id" not in data
            and "contact_extra" not in data
        ):
            raise serializers.ValidationError(
                'Must specify one of "contact_id" or "contact_extra"'
            )
        return data


class LineSerializer(EDDObjectSerializer):
    replicate = serializers.CharField(
        allow_blank=True,
        required=False,
        source="replicate_key",
    )
    strains = StrainSerializer(many=True, read_only=True)

    class Meta:
        model = models.Line
        depth = 0
        fields = EDDObjectSerializer.Meta.fields + (
            "contact",
            "control",
            "experimenter",
            "replicate",
            "strains",
            "study",
        )


class MetadataTypeSerializer(serializers.ModelSerializer):
    group = serializers.StringRelatedField()

    class Meta:
        model = models.MetadataType
        fields = (
            "default_value",
            "description",
            "for_context",
            "group",
            "input_type",
            "pk",
            "postfix",
            "prefix",
            "type_i18n",
            "type_name",
            "uuid",
        )


class MeasurementTypeSerializer(serializers.ModelSerializer):
    accession = serializers.CharField(
        read_only=True,
        required=False,
        source="proteinidentifier.accession_id",
    )
    cid = serializers.IntegerField(
        read_only=True,
        required=False,
        source="metabolite.pubchem_cid",
    )
    family = serializers.CharField(read_only=True, source="type_group")
    name = serializers.CharField(read_only=True, source="type_name")
    url = serializers.SerializerMethodField()

    class Meta:
        model = models.MeasurementType
        depth = 0
        fields = ("accession", "cid", "family", "name", "pk", "url", "uuid")

    def get_url(self, obj):
        match obj.type_group:
            case models.MeasurementType.Group.METABOLITE:
                return f"https://pubchem.ncbi.nlm.nih.gov/compound/{obj.metabolite.pubchem_cid}"
            case models.MeasurementType.Group.PROTEINID:
                return f"https://www.uniprot.org/uniprot/{obj.proteinidentifier.accession_code}"
            case _:
                return
        return obj.measurement_type.type_name


class MeasurementUnitSerializer(serializers.ModelSerializer):
    name = serializers.CharField(read_only=True, source="unit_name")

    class Meta:
        model = models.MeasurementUnit
        depth = 0
        fields = ("display", "pk", "name")


class ProtocolSerializer(serializers.ModelSerializer):
    created = UpdateSerializer(read_only=True)
    pk = serializers.IntegerField(read_only=True)
    updated = UpdateSerializer(read_only=True)
    uuid = serializers.UUIDField(format="hex_verbose", read_only=True)

    class Meta:
        model = models.Protocol
        depth = 0
        fields = (
            "active",
            "created",
            "destructive",
            "external_url",
            "name",
            "pk",
            "sbml_category",
            "updated",
            "uuid",
        )


class ExportEDDObjectSerializer(serializers.Serializer):
    pk = serializers.IntegerField(read_only=True)
    name = serializers.CharField(read_only=True)
    description = serializers.CharField(read_only=True)


class ExportAssaySerializer(ExportEDDObjectSerializer):
    line = ExportEDDObjectSerializer(read_only=True)
    protocol = ExportEDDObjectSerializer(read_only=True)


class ExportMeasurementSerializer(serializers.Serializer):
    assay = ExportAssaySerializer(read_only=True)
    compartment = serializers.ChoiceField(choices=models.Measurement.Compartment.CHOICE)
    type_name = serializers.SerializerMethodField()
    unit_name = serializers.SerializerMethodField()

    def get_type_name(self, obj):
        return obj.measurement_type.type_name

    def get_unit_name(self, obj):
        return obj.y_units.unit_name


class ExportSerializer(serializers.Serializer):
    study = ExportEDDObjectSerializer(read_only=True)
    measurement = ExportMeasurementSerializer(read_only=True)
    replicate_key = serializers.SerializerMethodField()
    type_formal = serializers.SerializerMethodField()
    x = serializers.SerializerMethodField()
    y = serializers.SerializerMethodField()

    def get_replicate_key(self, obj):
        # when replicate_key annotated from edd.rest.views.ExportFilter
        # when not annotated, return empty string
        return getattr(obj, "replicate_key", "")

    def get_type_formal(self, obj):
        # when anno_formal_type annotated from edd.rest.views.ExportFilter
        # when not annotated, return empty string
        return getattr(obj, "anno_formal_type", "")

    def get_x(self, obj):
        # TODO: handle vector values
        if len(obj.x) > 0:
            return obj.x[0]
        return None

    def get_y(self, obj):
        # TODO: handle vector values
        if len(obj.y) > 0:
            return obj.y[0]
        return None
