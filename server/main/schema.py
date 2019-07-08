# -*- coding: utf-8 -*-

import logging

import graphene
from graphene import relay
from graphene_django import DjangoObjectType
from graphene_django import filter as gfilter

from edd.rest import views as rest_views

from . import models

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


class StudyAccessMixin(object):
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


class Query(object):
    study = relay.Node.Field(StudyNode)
    line = relay.Node.Field(LineNode)
    assay = relay.Node.Field(AssayNode)
    measurement = relay.Node.Field(MeasurementNode)
    unit = relay.Node.Field(UnitNode)
    value = relay.Node.Field(MeasurementValueNode)

    all_studies = gfilter.DjangoFilterConnectionField(
        StudyNode, filterset_class=rest_views.StudyFilter
    )
    all_lines = gfilter.DjangoFilterConnectionField(
        LineNode, filterset_class=rest_views.LineFilter
    )
    all_assays = gfilter.DjangoFilterConnectionField(
        AssayNode, filterset_class=rest_views.AssayFilter
    )
    all_measurements = gfilter.DjangoFilterConnectionField(
        MeasurementNode, filterset_class=rest_views.MeasurementFilter
    )
    all_units = gfilter.DjangoFilterConnectionField(
        UnitNode, filterset_class=rest_views.MeasurementUnitFilter
    )
    all_values = gfilter.DjangoFilterConnectionField(
        MeasurementValueNode, filterset_class=rest_views.MeasurementValueFilter
    )
