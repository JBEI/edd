from rest_framework import serializers

from edd.utilities import guess_extension

from .. import models


class ParserMappingSerializer(serializers.ModelSerializer):
    mime_type = serializers.CharField(read_only=True)
    extension = serializers.SerializerMethodField("get_extension")

    class Meta:
        model = models.ParserMapping
        fields = ("mime_type", "extension")

    def get_extension(self, parser):
        """
        Guesses the file extension from the parser's MIME type as input to building helpful
        client-side error messages.
        """
        return guess_extension(parser.mime_type)


class LayoutSerializer(serializers.ModelSerializer):
    pk = serializers.IntegerField(read_only=True)
    parsers = ParserMappingSerializer(many=True)

    class Meta:
        model = models.Layout
        fields = ("pk", "parsers", "name", "description")


class CategorySerializer(serializers.ModelSerializer):
    pk = serializers.IntegerField(read_only=True)
    layouts = LayoutSerializer(many=True)

    class Meta:
        model = models.Category
        depth = 1
        fields = (
            "pk",
            "name",
            "layouts",
        )
