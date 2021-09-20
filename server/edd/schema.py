"""GraphQL schema definitions for EDD."""

import logging

import graphene
from graphene_django import DjangoObjectType
from graphene_django.filter import DjangoFilterConnectionField

from edd.rest import filters
from main import models

logger = logging.getLogger(__name__)


class UpdateNode(DjangoObjectType):
    class Meta:
        interfaces = (graphene.Node,)
        model = models.Update


class ProtocolNode(DjangoObjectType):
    class Meta:
        interfaces = (graphene.Node,)
        model = models.Protocol


class UnitNode(DjangoObjectType):
    class Meta:
        interfaces = (graphene.Node,)
        model = models.MeasurementUnit


class TypeNode(DjangoObjectType):
    class Meta:
        interfaces = (graphene.Node,)
        model = models.MeasurementType


class StrainNode(DjangoObjectType):
    class Meta:
        interfaces = (graphene.Node,)
        model = models.Strain


class MetadataTypeNode(DjangoObjectType):
    class Meta:
        interfaces = (graphene.Node,)
        model = models.MetadataType


class MetadataNode(graphene.ObjectType):
    class Meta:
        interfaces = (graphene.Node,)

    kind = graphene.Field(lambda: MetadataTypeNode)
    value = graphene.types.json.JSONString()


class StudyAccessMixin:
    """
    Override the fetch for EDDObject nodes; filter results to only those attached to a
    readable study.
    """

    _filter_joins = []

    @classmethod
    def get_node(cls, info, id):
        try:
            access = models.Study.access_filter(
                info.context.user, via=cls._filter_joins
            )
            return cls._meta.model.objects.filter(access).distinct().get(pk=id)
        except cls._meta.model.DoesNotExist:
            return None

    def resolve_metadata(self, info, *args, **kwargs):
        logger.info(
            f"resolve_metadata info={info} dir(info)={dir(info)} "
            f"type(self.metadata)={type(self.metadata)}"
        )
        return self.metadata


class StudyNode(StudyAccessMixin, DjangoObjectType):
    class Meta:
        interfaces = (graphene.Node,)
        model = models.Study


class LineNode(StudyAccessMixin, DjangoObjectType):
    _filter_joins = ["study"]

    class Meta:
        interfaces = (graphene.Node,)
        model = models.Line


class AssayNode(StudyAccessMixin, DjangoObjectType):
    _filter_joins = ["line", "study"]

    class Meta:
        interfaces = (graphene.Node,)
        model = models.Assay


class MeasurementNode(StudyAccessMixin, DjangoObjectType):
    _filter_joins = ["assay", "line", "study"]

    class Meta:
        interfaces = (graphene.Node,)
        model = models.Measurement


class MeasurementValueNode(StudyAccessMixin, DjangoObjectType):
    _filter_joins = ["measurement", "assay", "line", "study"]

    class Meta:
        interfaces = (graphene.Node,)
        model = models.MeasurementValue


class Query(graphene.ObjectType):
    study = graphene.relay.Node.Field(StudyNode)
    line = graphene.relay.Node.Field(LineNode)
    assay = graphene.relay.Node.Field(AssayNode)
    measurement = graphene.relay.Node.Field(MeasurementNode)
    unit = graphene.relay.Node.Field(UnitNode)
    value = graphene.relay.Node.Field(MeasurementValueNode)

    all_studies = DjangoFilterConnectionField(
        StudyNode, filterset_class=filters.StudyFilter
    )
    all_lines = DjangoFilterConnectionField(
        LineNode, filterset_class=filters.LineFilter
    )
    all_assays = DjangoFilterConnectionField(
        AssayNode, filterset_class=filters.AssayFilter
    )
    all_measurements = DjangoFilterConnectionField(
        MeasurementNode, filterset_class=filters.MeasurementFilter
    )
    all_units = DjangoFilterConnectionField(
        UnitNode, filterset_class=filters.MeasurementUnitFilter
    )
    all_values = DjangoFilterConnectionField(
        MeasurementValueNode, filterset_class=filters.MeasurementValueFilter
    )


schema = graphene.Schema(query=Query)

__all__ = [schema]
