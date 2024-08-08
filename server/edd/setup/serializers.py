from rest_framework import serializers
from rest_framework.reverse import reverse

from edd.utilities import JSONEncoder

from .broker import SetupRequest
from .parser import Record


class MetaSerializer(serializers.Serializer):
    """
    Metadata values used with Experiment Setup. The UUID *must* match an
    existing MetadataType in EDD.
    """

    uuid = serializers.UUIDField(format="hex_verbose")
    value = serializers.JSONField(encoder=JSONEncoder)


class StrainSerializer(serializers.Serializer):
    """
    Strain values used with Experiment Setup. The UUIDs *must* match existing
    Strain registry_id values in EDD.
    """

    uuids = serializers.ListField(child=serializers.UUIDField(format="hex_verbose"))


class AssayField(serializers.DictField):
    """
    Metadata used to create Assay records with Experiment Setup. The keys used
    *must* match an existing Protocol in EDD to use for creating the Assay.
    """

    child = serializers.ListField(
        child=serializers.ListField(
            allow_null=True,
            child=MetaSerializer(),
            default=[],
            required=False,
        )
    )


class SavedSerializer(serializers.Serializer):
    assays = serializers.IntegerField(required=False)
    lines = serializers.IntegerField(required=False)
    records = serializers.IntegerField(required=False)


class ProgressSerializer(serializers.Serializer):
    """
    Contains information on progress in saving an Experiment Setup.
    """

    resolved = serializers.IntegerField(required=False)
    saved = SavedSerializer()
    status = serializers.ChoiceField(choices=[s.value for s in SetupRequest.Status])
    tokens = serializers.IntegerField(required=False)
    unresolved = serializers.IntegerField(required=False)


class RecordSerializer(serializers.Serializer):
    """
    A single Record in Experiment Setup has the name, description, and replicate
    count for a Line in a Study, plus the list of Strains, Metadata, and Assay
    Metadata (including Protocol UUID).
    """

    assays = AssayField(required=False)
    description = serializers.CharField(
        allow_blank=True,
        allow_null=True,
        required=False,
    )
    meta = serializers.ListField(
        allow_null=True,
        child=MetaSerializer(),
        default=[],
        required=False,
    )
    name = serializers.CharField()
    replicates = serializers.IntegerField(
        max_value=100,
        min_value=1,
        required=False,
    )
    strain = serializers.ListField(
        child=StrainSerializer(),
        default=[],
        required=False,
    )

    def create(self, validated_data):
        return Record(**validated_data)


class RecordsSerializer(serializers.ListSerializer):
    """
    Payload for Experiment Setup is a list of Record objects.
    """

    child = RecordSerializer()


class SessionSerializer(serializers.Serializer):
    """
    Information on an Experiment Setup session. Use the UUID of the session
    for checking progress and status of the task.
    """

    url = serializers.CharField()
    uuid = serializers.UUIDField(format="hex_verbose")

    def to_representation(self, instance):
        return {
            "url": reverse("rest:setup-detail", args=[instance.request_uuid]),
            "uuid": instance.request_uuid,
        }
