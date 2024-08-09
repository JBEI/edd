import functools

from drf_spectacular.utils import extend_schema_serializer
from rest_framework import serializers
from rest_framework.reverse import reverse

from main.models import Assay, Line, Measurement, MeasurementType, Protocol

from .broker import LoadRequest
from .layout import Record


@extend_schema_serializer(component_name="LoadProgress")
class ProgressSerializer(serializers.Serializer):
    """ """

    added = serializers.IntegerField(required=False)
    resolved = serializers.IntegerField(required=False)
    status = serializers.ChoiceField(choices=[s.value for s in LoadRequest.Status])
    tokens = serializers.IntegerField(required=False)
    unresolved = serializers.IntegerField(required=False)
    updated = serializers.IntegerField(required=False)


@extend_schema_serializer(component_name="LoadRecord")
class RecordSerializer(serializers.Serializer):
    """
    A single Record of measurement to import into EDD.
    """

    assay_id = serializers.UUIDField(format="hex_verbose", required=False)
    line_id = serializers.UUIDField(format="hex_verbose", required=False)
    type_id = serializers.UUIDField(format="hex_verbose")
    x_unit_id = serializers.IntegerField(required=False)
    x = serializers.ListField(child=serializers.FloatField())
    y_unit_id = serializers.IntegerField(required=False)
    y = serializers.ListField(child=serializers.FloatField())

    def validate(self, data: any) -> any:
        if not data.get("assay_id", None) and not data.get("line_id", None):
            raise serializers.ValidationError("Must provide assay or line UUID")
        return data


class RecordsSerializer(serializers.Serializer):
    """
    A collection of records of measurements to import into EDD.
    """

    compartment = serializers.ChoiceField(
        choices=Measurement.Compartment.CHOICE,
        required=False,
    )
    protocol = serializers.UUIDField(format="hex_verbose")
    records = serializers.ListField(child=RecordSerializer())
    x_unit_id = serializers.IntegerField(required=False)
    y_unit_id = serializers.IntegerField(required=False)

    def create(self, validated_data):
        return (
            validated_data.get("compartment", Measurement.Compartment.UNKNOWN),
            validated_data.get("protocol"),
            self._generate_records(validated_data),
        )

    def validate(self, data: any) -> any:
        records = data.get("records", [])
        no_x = filter(lambda r: r.get("x_unit_id", None) is None, records)
        no_y = filter(lambda r: r.get("y_unit_id", None) is None, records)
        if not data.get("x_unit_id", None) and any(no_x):
            raise serializers.ValidationError(
                "Must provide default X unit ID if any records are missing X unit ID"
            )
        if not data.get("y_unit_id", None) and any(no_y):
            raise serializers.ValidationError(
                "Must provide default Y unit ID if any records are missing Y unit ID"
            )
        return data

    def _generate_records(self, validated_data):
        for r in validated_data.get("records", []):
            line_id, assay_id = self._lookup_ids(r.get("line_id", None), r.get("assay_id", None))
            kwargs = {
                # translated UUID to local IDs
                "assay_id": assay_id,
                "line_id": line_id,
                "type_id": self._lookup_type_id(r["type_id"]),
                # TODO: just assume "packed" shape for now, should do validations
                "shape": Measurement.Format.PACKED,
                # if record already has x_unit_id or y_unit_id, those take precedence
                "x_unit_id": r.get("x_unit_id", validated_data.get("x_unit_id", None)),
                "y_unit_id": r.get("y_unit_id", validated_data.get("y_unit_id", None)),
                # pass values directly
                "x": r["x"],
                "y": r["y"],
            }
            yield Record(**kwargs)

    @functools.cache
    def _lookup_ids(self, line_id, assay_id):
        if assay_id is not None:
            # can get both IDs from only assay
            qs = Assay.objects.filter(uuid=assay_id)
            return qs.values_list("line_id", "id")[0]
        line = Line.objects.get(uuid=line_id)
        protocol = self._lookup_protocol()
        count = Assay.objects.filter(line=line, protocol=protocol).count()
        name = Assay.build_name(line, protocol, count + 1)
        assay = Assay.objects.create(name=name, study=line.study, line=line, protocol=protocol)
        return line.id, assay.id

    @functools.cache
    def _lookup_protocol(self):
        return Protocol.objects.get(uuid=self.validated_data["protocol"])

    @functools.cache
    def _lookup_type_id(self, type_id):
        return MeasurementType.objects.filter(uuid=type_id).values_list("id", flat=True)[0]


@extend_schema_serializer(component_name="LoadSession")
class SessionSerializer(serializers.Serializer):
    """
    Information on an Experiment Setup session. Use the UUID of the session
    for checking progress and status of the task.
    """

    url = serializers.CharField()
    uuid = serializers.UUIDField(format="hex_verbose")

    def to_representation(self, instance):
        return {
            "url": reverse("rest:load-detail", args=[instance.request_uuid]),
            "uuid": instance.request_uuid,
        }
