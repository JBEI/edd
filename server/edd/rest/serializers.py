from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
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
        fields = ("name", "external_id", "external_url")


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
        if not self.partial and "contact_id" not in data and "contact_extra" not in data:
            raise serializers.ValidationError(
                'Must specify one of "contact_id" or "contact_extra"'
            )
        return data


class EntitySerializer(serializers.Serializer):
    id = serializers.IntegerField(required=False)
    kind = serializers.ChoiceField(choices=("everyone", "group", "user"))
    name = serializers.CharField(required=False)


class PermissionSerializer(serializers.Serializer):
    email = serializers.EmailField(required=False, write_only=True)
    entity = EntitySerializer(read_only=True)
    group = serializers.CharField(required=False, write_only=True)
    public = serializers.BooleanField(required=False, write_only=True)
    read = serializers.BooleanField(required=False)
    write = serializers.BooleanField(required=False)

    def create(self, validated_data):
        defaults = {"permission_type": validated_data.pop("permission_type")}
        try:
            return self._build_permission(defaults, validated_data)
        except Exception:
            self._errors = {"lookup_error": "No matching permission target found."}

    def to_representation(self, instance):
        entity = {"kind": instance.get_target_type()}
        if value := instance.get_target_id():
            entity["id"] = value
            entity["name"] = instance.get_who_label()
        return {
            "entity": entity,
            "read": instance.is_read(),
            "write": instance.is_write(),
        }

    def validate(self, data):
        who = {"email", "group", "public"}
        missing = who - data.keys()
        sent = who - missing
        # if there's 3 items in set, none of the keys were sent
        if len(missing) == 3:
            raise serializers.ValidationError("Must specify who permission applies to.")
        # if anything more than one is sent, raise error
        if len(sent) > 1:
            raise serializers.ValidationError(f"Must send only one of: {sent}.")
        # must include at least one of "read" or "write"
        match data:
            case {"write": True}:
                data.update(permission_type=models.StudyPermission.WRITE)
            case {"read": True}:
                data.update(permission_type=models.StudyPermission.READ)
            case _:
                raise serializers.ValidationError("Must include one of `read` or `write`.")
        return data

    def _build_permission(self, defaults, validated_data):
        study = validated_data["study"]
        match validated_data:
            case {"email": value}:
                user = self._get_user(value)
                p, _ = study.userpermission_set.update_or_create(user=user, defaults=defaults)
                return p
            case {"group": value}:
                group = self._get_group(value)
                p, _ = study.grouppermission_set.update_or_create(group=group, defaults=defaults)
                return p
            case {"public": True}:
                p, _ = study.everyonepermission_set.update_or_create(defaults=defaults)
                return p

    def _get_group(self, group):
        queryset = Group.objects.filter(name__iexact=group)[:2]
        if len(queryset) == 1:
            return queryset[0]
        return None

    def _get_user(self, email):
        User = get_user_model()
        queryset = User.profiles.filter(email__iexact=email)[:2]
        if len(queryset) == 1:
            return queryset[0]
        return None


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

    def get_url(self, obj) -> str | None:
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

    def get_type_name(self, obj) -> str:
        return obj.measurement_type.type_name

    def get_unit_name(self, obj) -> str:
        return obj.y_units.unit_name


class ExportSerializer(serializers.Serializer):
    study = ExportEDDObjectSerializer(read_only=True)
    measurement = ExportMeasurementSerializer(read_only=True)
    replicate_key = serializers.SerializerMethodField()
    type_formal = serializers.SerializerMethodField()
    x = serializers.SerializerMethodField()
    y = serializers.SerializerMethodField()

    def get_replicate_key(self, obj) -> str:
        # when replicate_key annotated from edd.rest.views.ExportFilter
        # when not annotated, return empty string
        return getattr(obj, "replicate_key", "")

    def get_type_formal(self, obj) -> str:
        # when anno_formal_type annotated from edd.rest.views.ExportFilter
        # when not annotated, return empty string
        return getattr(obj, "anno_formal_type", "")

    def get_x(self, obj) -> float | None:
        # TODO: handle vector values
        if len(obj.x) > 0:
            return obj.x[0]
        return None

    def get_y(self, obj) -> float | None:
        # TODO: handle vector values
        if len(obj.y) > 0:
            return obj.y[0]
        return None
