# coding: utf-8
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
from rest_framework_swagger.renderers import OpenAPIRenderer, SwaggerUIRenderer
from uuid import UUID

from main import models
from . import paginators, permissions, renderers, serializers


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


class StudyFilter(EDDObjectFilter):
    class Meta:
        model = models.Study
        fields = ['slug', 'contact', 'metabolic_map']


class StudyInternalsFilterMixin(object):
    """
    Mixin class handling the filtering of a queryset to only return objects linked to a
    visible study.
    """
    filter_class = EDDObjectFilter
    _filter_joins = []

    @classmethod
    def _filter_key(cls, *args):
        return '__'.join(cls._filter_joins + list(args))

    def filter_queryset(self, queryset):
        """
        Overrides GenericAPIView's filter_queryset() to filter results to only studies the user has
        access to.
        """
        queryset = super(StudyInternalsFilterMixin, self).filter_queryset(queryset)
        if not models.Study.user_role_can_read(self.request.user):
            access = models.Study.access_filter(self.request.user, via=self._filter_joins)
            queryset = queryset.filter(access).distinct()
        return queryset

    def get_nested_filter(self):
        study_id = self.kwargs.get('study_pk', None)
        # try converting to UUID
        try:
            study_id = UUID(study_id)
            return Q(**{self._filter_key('uuid'): study_id})
        except ValueError:
            pass
        return Q(**{self._filter_key(self.lookup_field): study_id})

    def get_object(self):
        """
        Find the object if the parameter matches the primary key OR the UUID.
        Overrides GenericAPIView's implementation.
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
        return super(StudyInternalsFilterMixin, self).get_object()


class StudyFilterMixin(StudyInternalsFilterMixin):
    filter_class = StudyFilter


class StudiesViewSet(StudyFilterMixin,
                     mixins.CreateModelMixin,
                     mixins.UpdateModelMixin,
                     viewsets.ReadOnlyModelViewSet):
    """
    API endpoint that provides access to studies, subject to user/role read access
    controls. Note that some privileged 'manager' users may have access to the base study name,
    description, etc, but not to the contained lines or other data.
    """
    serializer_class = serializers.StudySerializer
    permission_classes = [permissions.StudyResourcePermissions]
    queryset = models.Study.objects.order_by('pk').select_related('created', 'updated')


class LineFilter(EDDObjectFilter):
    strain = django_filters.CharFilter(name='strains', method='filter_strain')
    strains__in = django_filters.CharFilter(name='strains', method='filter_strains')
    # TODO: filter on Carbon Source.  Note that 'in' filtering via Meta.fields doesn't work on
    # m2m relationships

    class Meta:
        model = models.Line
        fields = {
            'study': ['exact', 'in'],
            'control': ['exact'],
            'contact': ['exact'],
            'experimenter': ['exact'],
        }

    def filter_strain(self, queryset, name, value):
        return self.filter_strains(queryset, name, (value,))

    def filter_strains(self, queryset, name, values):
        # split out multiple values similar to other django_filters 'in' param processing
        values = values.split(',')
        try:
            return queryset.filter(strains__registry_id__in=(UUID(value) for value in values))
        except ValueError:
            pass
        return queryset.filter(strains__registry_url__in=values)


class LineFilterMixin(StudyInternalsFilterMixin):
    filter_class = LineFilter
    serializer_class = serializers.LineSerializer
    _filter_joins = ['study']

    def get_queryset(self):
        qs = models.Line.objects.order_by('pk')
        qs = qs.select_related('created', 'updated')
        return qs.prefetch_related('strains', 'carbon_source')


class LinesViewSet(LineFilterMixin, viewsets.ReadOnlyModelViewSet):
    """
    API endpoint that allows Lines to be searched, viewed, and edited.
    """
    pass


class StudyLinesView(LineFilterMixin, viewsets.ReadOnlyModelViewSet):
    """
    API endpoint that allows Lines within a study to be searched, viewed, and edited.
    """
    def get_queryset(self):
        return super(StudyLinesView, self).get_queryset().filter(self.get_nested_filter())


class AssayFilter(EDDObjectFilter):
    class Meta:
        model = models.Assay
        fields = {
            'line': ['exact', 'in'],
            'protocol': ['exact', 'in'],
            'experimenter': ['exact', 'in'],
        }


class AssayFilterMixin(StudyInternalsFilterMixin):
    filter_class = AssayFilter
    serializer_class = serializers.AssaySerializer
    _filter_joins = ['line', 'study']

    def get_queryset(self):
        qs = models.Assay.objects.order_by('pk')
        return qs.select_related('created', 'updated')


class AssaysViewSet(AssayFilterMixin, viewsets.ReadOnlyModelViewSet):
    """
    API endpoint that allows Assays to be searched, viewed, and edited.
    """
    pass


class StudyAssaysViewSet(AssayFilterMixin, viewsets.ReadOnlyModelViewSet):
    """
    API endpoint that allows Assays within a study to be searched, viewed, and edited.
    """
    def get_queryset(self):
        return super(StudyAssaysViewSet, self).get_queryset().filter(self.get_nested_filter())


class MeasurementFilter(filters.FilterSet):
    active = django_filters.BooleanFilter(name='active')
    created_before = django_filters.IsoDateTimeFilter(
        name='update_ref__mod_time',
        lookup_expr='lte',
    )
    created_after = django_filters.IsoDateTimeFilter(
        name='update_ref__mod_time',
        lookup_expr='gte',
    )
    compartment = django_filters.ChoiceFilter(
        name='compartment',
        choices=models.Measurement.Compartment.CHOICE,
    )
    line = django_filters.ModelChoiceFilter(
        name='assay__line',
        queryset=models.Line.objects.all(),
    )
    measurement_format = django_filters.ChoiceFilter(
        name='measurement_format',
        choices=models.Measurement.Format.CHOICE,
    )

    class Meta:
        model = models.Measurement
        fields = {'assay': ['exact', 'in'],
                  'measurement_type': ['exact', 'in'],
                  'x_units': ['exact', 'in'],
                  'y_units': ['exact', 'in']}


class MeasurementFilterMixin(StudyInternalsFilterMixin):
    filter_class = MeasurementFilter
    serializer_class = serializers.MeasurementSerializer
    _filter_joins = ['assay', 'line', 'study']

    def get_queryset(self):
        qs = models.Measurement.objects.order_by('pk')
        return qs.select_related('update_ref')


class MeasurementsViewSet(MeasurementFilterMixin, viewsets.ReadOnlyModelViewSet):
    """
    API endpoint that allows Measurements to be searched, viewed, and edited.
    """
    pass


class StudyMeasurementsViewSet(MeasurementFilterMixin, viewsets.ReadOnlyModelViewSet):
    """
    API endpoint that allows Measurements within a study to be searched, viewed, and edited.
    """
    def get_queryset(self):
        qs = super(StudyMeasurementsViewSet, self).get_queryset()
        return qs.filter(self.get_nested_filter())


export_via_lookup = {
    models.Study: None,
    models.Line: ('study', ),
    models.Assay: ('line', 'study'),
    models.Measurement: ('study', ),
}


def export_queryset(model):
    via = export_via_lookup.get(model, None)

    def queryset(request):
        user = request.user if request else None
        qs = model.objects.distinct().filter(active=True)
        if (models.Study.user_role_can_read(user)):
            # no need to do special permission checking if role automatically can read
            return qs
        access = models.Study.access_filter(user, via=via)
        qs = qs.filter(access)
        return qs

    return queryset


class ExportFilter(filters.FilterSet):
    """
    FilterSet used to select data for exporting. See <main.export.table.ExportSelection>.
    """
    study_id = django_filters.ModelMultipleChoiceFilter(
        lookup_expr='in',
        name='study',
        queryset=export_queryset(models.Study),
    )
    line_id = django_filters.ModelMultipleChoiceFilter(
        lookup_expr='in',
        name='measurement__assay__line',
        queryset=export_queryset(models.Line),
    )
    assay_id = django_filters.ModelMultipleChoiceFilter(
        lookup_expr='in',
        name='measurement__assay',
        queryset=export_queryset(models.Assay),
    )
    measure_id = django_filters.ModelMultipleChoiceFilter(
        lookup_expr='in',
        name='measurement_id',
        queryset=export_queryset(models.Measurement),
    )

    class Meta:
        model = models.MeasurementValue
        fields = []

    @property
    def qs(self):
        if not hasattr(self, '_qs'):
            # define filters for special handling
            names = ['study_id', 'line_id', 'assay_id', 'measure_id']
            special = {name: self.filters.get(name, None) for name in names}
            fields = {name: f.field for name, f in special.items()}
            # create a custom form for the filters with special handling
            form = self._custom_form(fields)
            if not form.is_valid():
                return self.queryset.none()
            # now do special handling to OR together the filters
            id_filter = Q()
            for name, filter_ in special.items():
                if filter_ is not None:
                    # when a value is found, OR together with others
                    value = form.cleaned_data.get(name)
                    if value:
                        id_filter |= Q(**{f'{filter_.field_name}__{filter_.lookup_expr}': value})
            self._qs = self.queryset.filter(
                id_filter,
                study__active=True,
                measurement__active=True,
                measurement__assay__active=True,
                measurement__assay__line__active=True,
            )
        # filter with the aggregated filter expression
        return self._qs

    def _custom_form(self, fields):
        # create a custom form for the filters with special handling
        Form = type(f'{self.__class__.__name__}IDForm', (self._meta.form,), fields)
        if self.is_bound:
            form = Form(self.data, prefix=self.form_prefix)
        else:
            form = Form(prefix=self.form_prefix)
        return form


class ExportViewSet(mixins.ListModelMixin, viewsets.GenericViewSet):
    """API endpoint for running exports of data."""
    filter_class = ExportFilter
    pagination_class = paginators.LinkHeaderPagination
    renderer_classes = (renderers.ExportRenderer, )
    serializer_class = serializers.ExportSerializer

    def finalize_response(self, request, response, *args, **kwargs):
        response = super().finalize_response(request, response, *args, **kwargs)
        pp = request.query_params.get('page', 1)
        response['Content-Disposition'] = f'attachment; filename=export_page{pp}.csv'
        return response

    def get_queryset(self):
        qs = models.MeasurementValue.objects.order_by('pk')
        return qs.select_related(
            'measurement__measurement_type',
            'measurement__y_units',
            'measurement__assay__protocol',
            'measurement__assay__line',
            'study',
        )

    # The get_renderers API does not take the request object, cannot configure at this level
    # The perform_content_negotiation API *does* take request; can inject a custom renderer here
    def perform_content_negotiation(self, request, force=False):
        # to customize renderer:
        # 1. need a method that extracts parameters for customization from request, store on self;
        # 2. override get_renderers() to use parameters when creating ExportRenderer;
        # 3. call to parameter extraction must come *before* the below super call
        return super().perform_content_negotiation(request, force)


class MeasurementValueFilter(filters.FilterSet):
    assay = django_filters.ModelChoiceFilter(
        name='measurement__assay',
        queryset=models.Assay.objects.all(),
    )
    created_before = django_filters.IsoDateTimeFilter(
        name='updated__mod_time',
        lookup_expr='lte',
    )
    created_after = django_filters.IsoDateTimeFilter(
        name='updated__mod_time',
        lookup_expr='gte',
    )
    line = django_filters.ModelChoiceFilter(
        name='measurement__assay__line',
        queryset=models.Line.objects.all(),
    )
    x__gt = django_filters.NumberFilter(name='x', lookup_expr='0__gte')
    x__lt = django_filters.NumberFilter(name='x', lookup_expr='0__lte')
    y__gt = django_filters.NumberFilter(name='y', lookup_expr='0__gte')
    y__lt = django_filters.NumberFilter(name='y', lookup_expr='0__lte')

    class Meta:
        model = models.MeasurementValue
        fields = {'measurement': ['exact', 'in']}


class ValuesFilterMixin(StudyInternalsFilterMixin):
    filter_class = MeasurementValueFilter
    serializer_class = serializers.MeasurementValueSerializer
    _filter_joins = ['measurement', 'assay', 'line', 'study']

    def get_queryset(self):
        return models.MeasurementValue.objects.order_by('pk').select_related('updated')


class MeasurementValuesViewSet(ValuesFilterMixin, viewsets.ReadOnlyModelViewSet):
    """
    API endpoint that allows Values to be searched, viewed, and edited.
    """
    pass


class StudyValuesViewSet(ValuesFilterMixin, viewsets.ReadOnlyModelViewSet):
    """
    API endpoint that allows Values within a study to be searched, viewed, and edited.
    """
    def get_queryset(self):
        return super(StudyValuesViewSet, self).get_queryset().filter(self.get_nested_filter())


class MeasurementTypesFilter(filters.FilterSet):
    type_name = django_filters.CharFilter(name='type_name', lookup_expr='iregex')
    type_group = django_filters.CharFilter(name='type_group', lookup_expr='iregex')

    class Meta:
        model = models.MeasurementType
        fields = []


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


class MeasurementUnitFilter(filters.FilterSet):
    unit_name = django_filters.CharFilter(name='unit_name', lookup_expr='iregex')
    alternate_names = django_filters.CharFilter(name='alternate_names', lookup_expr='iregex')

    class Meta:
        model = models.MeasurementUnit
        fields = []


class MeasurementUnitViewSet(viewsets.ReadOnlyModelViewSet):
    filter_class = MeasurementUnitFilter
    queryset = models.MeasurementUnit.objects.order_by('pk')
    serializer_class = serializers.MeasurementUnitSerializer
    lookup_url_kwarg = 'id'


class ProtocolFilter(EDDObjectFilter):
    class Meta:
        model = models.Protocol
        fields = ['owned_by', 'variant_of', 'default_units']


class ProtocolViewSet(viewsets.ReadOnlyModelViewSet):
    filter_class = ProtocolFilter
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

    def get_queryset(self):
        User = get_user_model()
        return User.objects.order_by('pk')
