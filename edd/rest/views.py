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
from django_filters import filters as django_filters, rest_framework as filters
from rest_framework import mixins, response, schemas, viewsets
from rest_framework.decorators import api_view, permission_classes, renderer_classes
from rest_framework.permissions import AllowAny, DjangoModelPermissions, IsAuthenticated
from rest_framework.viewsets import GenericViewSet
from rest_framework_swagger.renderers import OpenAPIRenderer, SwaggerUIRenderer
from threadlocals.threadlocals import get_request_variable, set_request_variable
from uuid import UUID

from main import models
from .permissions import StudyResourcePermissions
from . import serializers


logger = logging.getLogger(__name__)


@api_view()
@permission_classes([AllowAny, ])
@renderer_classes([OpenAPIRenderer, SwaggerUIRenderer, ])
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


class EDDObjectFilter(filters.FilterSet):
    active = django_filters.BooleanFilter(name='active')
    created_before = django_filters.IsoDateTimeFilter(name='created__mod_time', lookup_expr='lte')
    created_after = django_filters.IsoDateTimeFilter(name='created__mod_time', lookup_expr='gte')
    description = django_filters.CharFilter(name='description', lookup_expr='iregex')
    name = django_filters.CharFilter(name='name', lookup_expr='iregex')
    updated_before = django_filters.IsoDateTimeFilter(name='updated__mod_time', lookup_expr='lte')
    updated_after = django_filters.IsoDateTimeFilter(name='updated__mod_time', lookup_expr='gte')

    class Meta:
        model = models.EDDObject
        fields = []


class StudyFilterMixin(object):
    """
    Mixin class handling the filtering of a queryset to only return objects linked to a
    visible study.
    """
    filter_class = EDDObjectFilter
    _filter_prefix = ''

    def filter_queryset(self, queryset):
        queryset = super(StudyFilterMixin, self).filter_queryset(queryset)
        if not models.Study.user_role_can_read(self.request.user):
            q_filter = models.Study.user_permission_q(
                self.request.user,
                models.StudyPermission.CAN_VIEW,
                self._filter_prefix,
            )
            queryset = queryset.filter(q_filter)
        return queryset

    def get_nested_filter(self):
        study_id = self.kwargs.get('study_pk', None)
        # try converting to UUID
        try:
            study_id = UUID(study_id)
            return Q(**{self._filter_prefix + 'uuid': study_id})
        except ValueError:
            pass
        return Q(**{self._filter_prefix + self.lookup_field: study_id})

    def get_object(self):
        """
        Find the object if the parameter matches the primary key OR the UUID.
        """
        url_kwarg = self.lookup_url_kwarg or self.lookup_field
        lookup = self.kwargs.get(url_kwarg, None)
        # try converting to UUID, call parent to lookup by UUID if successful
        try:
            lookup = UUID(lookup)
            self.lookup_url_kwarg = url_kwarg
            self.lookup_field = 'uuid'
        except ValueError:
            pass
        return super(StudyFilterMixin, self).get_object()


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
    queryset = models.Study.objects.order_by('pk')


class LinesViewSet(StudyFilterMixin, viewsets.ReadOnlyModelViewSet):
    """
    API endpoint that allows to be searched, viewed, and edited.
    """
    serializer_class = serializers.LineSerializer
    queryset = models.Line.objects.order_by('pk')
    _filter_prefix = 'study__'


class StudyLinesView(StudyFilterMixin, mixins.ListModelMixin, GenericViewSet):
    """
    API endpoint that allows lines within a study to be searched, viewed, and edited.
    """
    serializer_class = serializers.LineSerializer
    _filter_prefix = 'study__'

    @cached_request_queryset
    def get_queryset(self):
        return models.Line.objects.filter(self.get_nested_filter()).order_by('pk')


class AssaysViewSet(StudyFilterMixin, viewsets.ReadOnlyModelViewSet):
    serializer_class = serializers.AssaySerializer
    queryset = models.Assay.objects.order_by('pk')
    _filter_prefix = 'line__study__'


class StudyAssaysViewSet(StudyFilterMixin, mixins.ListModelMixin, GenericViewSet):
    serializer_class = serializers.AssaySerializer
    _filter_prefix = 'line__study__'

    @cached_request_queryset
    def get_queryset(self):
        return models.Assay.objects.filter(self.get_nested_filter()).order_by('pk')


class MeasurementsViewSet(StudyFilterMixin, viewsets.ReadOnlyModelViewSet):
    serializer_class = serializers.MeasurementSerializer
    queryset = models.Measurement.objects.order_by('pk')
    _filter_prefix = 'assay__line__study__'


class StudyMeasurementsViewSet(StudyFilterMixin, mixins.ListModelMixin, GenericViewSet):
    serializer_class = serializers.MeasurementSerializer
    _filter_prefix = 'assay__line__study__'

    @cached_request_queryset
    def get_queryset(self):
        return models.Measurement.objects.filter(self.get_nested_filter()).order_by('pk')


class MeasurementValuesViewSet(StudyFilterMixin, viewsets.ReadOnlyModelViewSet):
    serializer_class = serializers.MeasurementValueSerializer
    queryset = models.MeasurementValue.objects.order_by('pk')
    _filter_prefix = 'measurement__assay__line__study__'


class StudyValuesViewSet(StudyFilterMixin, mixins.ListModelMixin, GenericViewSet):
    serializer_class = serializers.MeasurementValueSerializer
    _filter_prefix = 'measurement__assay__line__study__'

    @cached_request_queryset
    def get_queryset(self):
        return models.MeasurementValue.objects.filter(self.get_nested_filter()).order_by('pk')


class MeasurementTypesFilter(filters.FilterSet):
    class Meta:
        model = models.MeasurementType
        fields = ['type_group']


class MeasurementTypesViewSet(viewsets.ReadOnlyModelViewSet):
    """
    API endpoint that provides search/detail access to all MeasurementTypes. Clients can filter
    results to the desired type. and can get additional type-specific details by setting the
    'type_group' parameter: GeneIdentifiers ('g'), Metabolites ('m'), Phosphors ('h'),
    and ProteinIdentifiers ('p').
    """
    filter_class = MeasurementTypesFilter
    permission_classes = [DjangoModelPermissions, ]

    model_lookup = {
        models.MeasurementType.Group.GENERIC: models.MeasurementType,
        models.MeasurementType.Group.METABOLITE: models.Metabolite,
        models.MeasurementType.Group.GENEID: models.GeneIdentifier,
        models.MeasurementType.Group.PROTEINID: models.ProteinIdentifier,
        models.MeasurementType.Group.PHOSPHOR: models.Phosphor,
    }
    serializer_lookup = {
        models.MeasurementType.Group.GENERIC: serializers.MeasurementTypeSerializer,
        models.MeasurementType.Group.METABOLITE: serializers.MetaboliteSerializer,
        models.MeasurementType.Group.GENEID: serializers.GeneIdSerializer,
        models.MeasurementType.Group.PROTEINID: serializers.ProteinIdSerializer,
        models.MeasurementType.Group.PHOSPHOR: serializers.PhosphorSerializer,
    }

    def get_queryset(self):
        group = self.request.query_params.get('type_group')
        return self.model_lookup.get(group, models.MeasurementType).objects.order_by('pk')

    def get_serializer_class(self):
        """
        Overrides the parent implementation to provide serialization that's dynamically determined
        by the requested result type
        """
        group = self.request.query_params.get('type_group')
        return self.serializer_lookup.get(group, serializers.MeasurementTypeSerializer)


class MetadataTypesFilter(filters.FilterSet):
    group = django_filters.CharFilter(name='group__group_name')

    class Meta:
        model = models.MetadataType
        fields = ['for_context', 'type_i18n']


class MetadataTypeViewSet(viewsets.ReadOnlyModelViewSet):
    """
    API endpoint that supports viewing and searching EDD's metadata types.
    """
    filter_class = MetadataTypesFilter
    permission_classes = [DjangoModelPermissions, ]
    queryset = models.MetadataType.objects.order_by('pk')
    serializer_class = serializers.MetadataTypeSerializer


class MeasurementUnitViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = models.MeasurementUnit.objects.order_by('pk')
    serializer_class = serializers.MeasurementUnitSerializer
    lookup_url_kwarg = 'id'


class ProtocolFilter(EDDObjectFilter):
    class Meta:
        model = models.Protocol
        fields = ['owned_by', 'variant_of', 'default_units']


class ProtocolViewSet(viewsets.ReadOnlyModelViewSet):
    filter_class = EDDObjectFilter
    queryset = models.Protocol.objects.order_by('pk')
    serializer_class = serializers.ProtocolSerializer


class MetadataGroupViewSet(viewsets.ReadOnlyModelViewSet):
    """
    API endpoint that supports read-only access to EDD's metadata groups.
    """
    queryset = models.MetadataGroup.objects.order_by('pk')
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
