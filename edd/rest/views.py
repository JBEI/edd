# coding: utf-8
from __future__ import unicode_literals

"""
Defines views for EDD's REST API.

Assuming Django REST Framework (DRF) will be adopted in EDD, new and existing views should be
ported to this class over time. Several potential REST resources are currently defined in
main/views.py, but are not accessible using the same URL scheme.
"""

import logging

from django.contrib.auth import get_user_model
from django.db.models import Q
from rest_framework import mixins, response, schemas, viewsets
from rest_framework.decorators import api_view, renderer_classes
from rest_framework.permissions import DjangoModelPermissions, IsAuthenticated
from rest_framework.viewsets import GenericViewSet
from rest_framework_swagger.renderers import OpenAPIRenderer, SwaggerUIRenderer
from threadlocals.threadlocals import get_request_variable, set_request_variable

from jbei.rest.clients.edd import constants
from main.models import (
    Assay,
    Line,
    Measurement,
    MeasurementType,
    MeasurementUnit,
    MeasurementValue,
    MetadataGroup,
    MetadataType,
    Protocol,
    Study,
    StudyPermission,
)
from .permissions import StudyResourcePermissions
from . import serializers


logger = logging.getLogger(__name__)


@api_view()
@renderer_classes([OpenAPIRenderer, SwaggerUIRenderer])
def schema_view(request):
    """
    Auto-generated, web-browseable documentation for EDD's REST API.
    """
    generator = schemas.SchemaGenerator(title='Experiment Data Depot')
    return response.Response(generator.get_schema(request=request))


def cached_request_queryset(get_queryset):
    """
    A simple decorator to prevent multiple calls to get_queryset() during processing of a single
    client request from performing the same database query. Presence or absence of queryset
    results is used by ImpliedPermissions to determine user access to Study internals based on
    StudyPermissions, which without this decorator would result in running the query twice.
    """
    def wrapper(*args):
        _CACHE_VAR_NAME = 'edd_rest_cached_queryset'
        queryset = get_request_variable(_CACHE_VAR_NAME, use_threadlocal_if_no_request=False)

        view = args[0]
        log_msg = ('%(class)s.%(method)s. %(http_method)s %(uri)s: kwargs=%(kwargs)s,'
                   ' query_params = %(query_params)s' % {
                       'class': view.__class__.__name__,
                       'method': get_queryset.__name__,
                       'http_method': view.request.method,
                       'uri': view.request.path,
                       'kwargs': view.kwargs,
                       'query_params': view.request.query_params,
                   })

        # if we've already cached this queryset during this request, use the cached copy
        if queryset:
            logger.info('Using cache for %s' % log_msg)
            return queryset

        # otherwise, cache a reference to the queryset
        else:
            logger.info(log_msg)
            queryset = get_queryset(*args)
            set_request_variable(_CACHE_VAR_NAME, queryset, use_threadlocal_if_no_request=False)
            return queryset

    return wrapper


class StudyFilterMixin(object):
    """
    Mixin class handling the filtering of a queryset to only return objects linked to a
    visible study.
    """
    _filter_prefix = ''

    def filter_queryset(self, queryset):
        queryset = super(StudyFilterMixin, self).filter_queryset(queryset)
        if not Study.user_role_can_read(self.request.user):
            q_filter = Study.user_permission_q(
                self.request.user,
                StudyPermission.CAN_VIEW,
                self._filter_prefix,
            )
            queryset = queryset.filter(q_filter)
        return queryset


class StudiesViewSet(StudyFilterMixin,
                     mixins.CreateModelMixin,
                     mixins.UpdateModelMixin,
                     mixins.RetrieveModelMixin,
                     mixins.ListModelMixin,
                     GenericViewSet):
    """
    API endpoint that provides access to studies, subject to user/role read access
    controls. Note that some privileged 'manager' users may have access to the base study name,
    description, etc, but not to the contained lines or other data.
    """
    serializer_class = serializers.StudySerializer
    permission_classes = [StudyResourcePermissions]
    queryset = Study.objects.order_by('pk')


class LinesViewSet(StudyFilterMixin, viewsets.ReadOnlyModelViewSet):
    """
    API endpoint that allows to be searched, viewed, and edited.
    """
    serializer_class = serializers.LineSerializer
    queryset = Line.objects.order_by('pk')
    _filter_prefix = 'study__'


class StudyLinesView(StudyFilterMixin, mixins.ListModelMixin, GenericViewSet):
    """
    API endpoint that allows lines within a study to be searched, viewed, and edited.
    """
    serializer_class = serializers.LineSerializer
    _filter_prefix = 'study__'

    @cached_request_queryset
    def get_queryset(self):
        study_id = self.kwargs.get('study_id', None)
        return Line.objects.filter(study_id=study_id).order_by('pk')


class AssaysViewSet(StudyFilterMixin, viewsets.ReadOnlyModelViewSet):
    serializer_class = serializers.AssaySerializer
    queryset = Assay.objects.order_by('pk')
    _filter_prefix = 'line__study__'


class StudyAssaysViewSet(StudyFilterMixin, mixins.ListModelMixin, GenericViewSet):
    serializer_class = serializers.AssaySerializer
    _filter_prefix = 'line__study__'

    @cached_request_queryset
    def get_queryset(self):
        study_id = self.kwargs.get('study_id')
        return Assay.objects.filter(line__study_id=study_id).order_by('pk')


class MeasurementsViewSet(StudyFilterMixin, viewsets.ReadOnlyModelViewSet):
    serializer_class = serializers.MeasurementSerializer
    queryset = Measurement.objects.order_by('pk')
    _filter_prefix = 'assay__line__study__'


class StudyMeasurementsViewSet(StudyFilterMixin, mixins.ListModelMixin, GenericViewSet):
    serializer_class = serializers.MeasurementSerializer
    _filter_prefix = 'assay__line__study__'

    @cached_request_queryset
    def get_queryset(self):
        study_id = self.kwargs.get('study_id')
        return Measurement.objects.filter(assay__line__study_id=study_id).order_by('pk')


class MeasurementValuesViewSet(StudyFilterMixin, viewsets.ReadOnlyModelViewSet):
    serializer_class = serializers.MeasurementValueSerializer
    queryset = MeasurementValue.objects.order_by('pk')
    _filter_prefix = 'measurement__assay__line__study__'


class StudyValuesViewSet(StudyFilterMixin, mixins.ListModelMixin, GenericViewSet):
    serializer_class = serializers.MeasurementValueSerializer
    _filter_prefix = 'measurement__assay__line__study__'

    @cached_request_queryset
    def get_queryset(self):
        study_id = self.kwargs.get('study_id')
        queryset = MeasurementValue.objects.order_by('pk')
        return queryset.filter(measurement__assay__line__study_id=study_id)


class MeasurementTypesViewSet(viewsets.ReadOnlyModelViewSet):
    """
    API endpoint that provides search/detail access to all MeasurementTypes. Clients can filter
    results to the desired type. and can get additional type-specific details by setting the
    'type_group' parameter: GeneIdentifiers ('g'), Metabolites ('m'), Phosphors ('h'),
    and ProteinIdentifiers ('p').
    """
    serializer_class = serializers.MeasurementTypeSerializer
    permission_classes = [DjangoModelPermissions, ]

    serializer_lookup = {
        MeasurementType.Group.GENERIC: serializers.MeasurementTypeSerializer,
        MeasurementType.Group.METABOLITE: serializers.MetaboliteSerializer,
        MeasurementType.Group.GENEID: serializers.GeneIdSerializer,
        MeasurementType.Group.PROTEINID: serializers.ProteinIdSerializer,
        MeasurementType.Group.PHOSPHOR: serializers.PhosphorSerializer,
    }

    @cached_request_queryset
    def get_queryset(self):
        return MeasurementType.objects.order_by('pk')

    def filter_queryset(self, queryset):
        queryset = super(MeasurementTypesViewSet, self).filter_queryset(queryset)
        if self.request.query_params:
            group_filter = self.request.query_params.get(constants.TYPE_GROUP_PARAM, None)
            sort = self.request.query_params.get(constants.SORT_PARAM, None)
            if group_filter:
                queryset = queryset.filter(type_group=group_filter)
            if sort:
                queryset = queryset.order_by('type_name')
                if sort == constants.REVERSE_SORT_VALUE:
                    queryset = queryset.reverse()
        return queryset

    def get_serializer_class(self):
        """
        Overrides the parent implementation to provide serialization that's dynamically determined
        by the requested result type
        """
        group = self.request.query_params.get(constants.TYPE_GROUP_PARAM)
        return self.serializer_lookup.get(group, serializers.MeasurementTypeSerializer)


class MetadataTypeViewSet(viewsets.ReadOnlyModelViewSet):
    """
    API endpoint that supports viewing and searching EDD's metadata types.
    """
    serializer_class = serializers.MetadataTypeSerializer
    permission_classes = [DjangoModelPermissions, ]

    def get_queryset(self):
        return MetadataType.objects.order_by('pk')

    def filter_queryset(self, queryset):
        queryset = super(MetadataTypeViewSet, self).filter_queryset(queryset)
        if self.request.query_params:
            # group id
            group_id = self.request.query_params.get(constants.METADATA_TYPE_GROUP)
            for_context = self.request.query_params.get(constants.METADATA_TYPE_CONTEXT)
            type_i18n = self.request.query_params.get(constants.METADATA_TYPE_I18N)
            sort = self.request.query_params.get(constants.SORT_PARAM)
            if group_id:
                queryset = queryset.filter(Q(group=group_id) | Q(group__group_name=group_id))
            if for_context:
                queryset = queryset.filter(for_context=for_context)
            if type_i18n:
                queryset = queryset.filter(type_i18n=type_i18n)
            if sort:
                queryset = queryset.order_by('type_name')
                if sort == constants.REVERSE_SORT_VALUE:
                    queryset = queryset.reverse()
        return queryset


class MeasurementUnitViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = MeasurementUnit.objects.order_by('pk')  # must be defined for DjangoModelPermissions
    serializer_class = serializers.MeasurementUnitSerializer
    lookup_url_kwarg = 'id'


class ProtocolViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = Protocol.objects.order_by('pk')  # must be defined for DjangoModelPermissions
    serializer_class = serializers.ProtocolSerializer

    def filter_queryset(self, queryset):
        queryset = super(ProtocolViewSet, self).filter_queryset(queryset)
        if self.request.query_params:
            owned_by_id = self.request.query_params.get('owned_by')
            variant_of = self.request.query_params.get('variant_of')
            default_units = self.request.query_params.get('default_units')
            sort = self.request.query_params.get(constants.SORT_PARAM)
            if owned_by_id:
                queryset = queryset.filter(owned_by_id=owned_by_id)
            if variant_of:
                queryset = queryset.filter(variant_of_id=variant_of)
            if default_units:
                queryset = queryset.filter(default_units_id=default_units)
            if sort:
                queryset = queryset.order_by('name')
                if sort == constants.REVERSE_SORT_VALUE:
                    queryset = queryset.reverse()
        return queryset


class MetadataGroupViewSet(viewsets.ReadOnlyModelViewSet):
    """
    API endpoint that supports read-only access to EDD's metadata groups.
    """
    queryset = MetadataGroup.objects.order_by('pk')
    serializer_class = serializers.MetadataGroupSerializer


class UsersViewSet(viewsets.ReadOnlyModelViewSet):
    """
    API endpoint that allows privileged users to get read-only information on the current set of
    EDD user accounts.
    """
    permission_classes = [IsAuthenticated, ]
    serializer_class = serializers.UserSerializer

    @cached_request_queryset
    def get_queryset(self):
        User = get_user_model()
        return User.objects.order_by('pk')
