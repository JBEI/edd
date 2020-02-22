from rest_framework import serializers

from edd.rest.serializers import ProtocolSerializer, UpdateSerializer
from edd.utilities import guess_extension

from .. import models


class BaseImportObjectSerializer(serializers.ModelSerializer):
    created = UpdateSerializer(read_only=True)
    pk = serializers.IntegerField(read_only=True)
    updated = UpdateSerializer(read_only=True)
    uuid = serializers.UUIDField(format="hex_verbose", read_only=True)

    class Meta:
        model = models.BaseImportModel
        fields = ("active", "created", "description", "name", "pk", "updated", "uuid")


class ImportParserSerializer(serializers.ModelSerializer):
    mime_type = serializers.CharField(read_only=True)
    extension = serializers.SerializerMethodField("get_extension")

    class Meta:
        model = models.ImportParser
        fields = ("mime_type", "extension")

    def get_extension(self, parser):
        """
        Guesses the file extension from the parser's MIME type as input to building helpful
        client-side error messages.
        """
        return guess_extension(parser.mime_type)


class ImportFormatSerializer(BaseImportObjectSerializer):
    pk = serializers.IntegerField(read_only=True)
    parsers = ImportParserSerializer(many=True)

    class Meta:
        model = models.ImportFormat
        fields = BaseImportObjectSerializer.Meta.fields + ("parsers",)


class ImportCategorySerializer(BaseImportObjectSerializer):
    protocols = ProtocolSerializer(many=True)
    file_formats = ImportFormatSerializer(many=True)

    class Meta:
        model = models.ImportCategory

        depth = 1
        fields = BaseImportObjectSerializer.Meta.fields + (
            "display_order",
            "protocols",
            "file_formats",
        )


class ImportSerializer(BaseImportObjectSerializer):
    class Meta:
        model = models.Import
        depth = 0
        fields = BaseImportObjectSerializer.Meta.fields + (
            "study",
            "status",
            "category",
            "protocol",
            "file_format",
            "x_units",
            "y_units",
            "compartment",
            "meta_store",
        )
        read_only_fields = ("study", "status")
