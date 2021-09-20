"""Defines views for EDD's REST API."""

import logging
from uuid import UUID

from django.contrib.auth import get_user_model
from django.http import StreamingHttpResponse
from rest_framework import mixins, response, schemas, viewsets
from rest_framework.decorators import api_view, permission_classes, renderer_classes
from rest_framework.negotiation import DefaultContentNegotiation
from rest_framework.permissions import AllowAny, DjangoModelPermissions, IsAuthenticated
from rest_framework_swagger.renderers import OpenAPIRenderer, SwaggerUIRenderer

from main import models
from main.signals import study_exported

from . import filters, paginators, permissions, renderers, serializers

logger = logging.getLogger(__name__)
User = get_user_model()


@api_view()
@permission_classes([AllowAny])
@renderer_classes([OpenAPIRenderer, SwaggerUIRenderer])
def schema_view(request):
    """Auto-generated, web-browseable documentation for EDD's REST API."""
    generator = schemas.SchemaGenerator(title="Experiment Data Depot")
    return response.Response(generator.get_schema(request=request))


class StudyInternalsFilterMixin:
    """
    Mixin class handling the filtering of a queryset to only return objects
    linked to a visible study.
    """

    filterset_class = filters.EDDObjectFilter
    _filter_joins = []

    def filter_queryset(self, queryset):
        """
        Overrides GenericAPIView's filter_queryset() to filter results to only
        studies the user has access to.
        """
        queryset = super().filter_queryset(queryset)
        if not models.Study.user_role_can_read(self.request.user):
            access = models.Study.access_filter(
                self.request.user, via=self._filter_joins
            )
            queryset = queryset.filter(access).distinct()
        return queryset

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
            self.lookup_field = "uuid"
        except ValueError:
            pass
        return super().get_object()


class StudiesViewSet(
    StudyInternalsFilterMixin,
    mixins.CreateModelMixin,
    mixins.UpdateModelMixin,
    viewsets.ReadOnlyModelViewSet,
):
    """
    API endpoint that provides access to studies, subject to user/role read
    access controls.
    """

    filterset_class = filters.StudyFilter
    permission_classes = [permissions.StudyResourcePermissions]
    queryset = models.Study.objects.order_by("pk").select_related("created", "updated")
    serializer_class = serializers.StudySerializer


class LinesViewSet(StudyInternalsFilterMixin, viewsets.ReadOnlyModelViewSet):
    """API endpoint that allows Lines to be searched, viewed."""

    filterset_class = filters.LineFilter
    serializer_class = serializers.LineSerializer
    _filter_joins = ["study"]

    def get_queryset(self):
        qs = models.Line.objects.order_by("pk")
        qs = qs.select_related("created", "updated")
        return qs.prefetch_related("strains")


class AssaysViewSet(StudyInternalsFilterMixin, viewsets.ReadOnlyModelViewSet):
    """API endpoint that allows Assays to be searched, viewed."""

    filterset_class = filters.AssayFilter
    serializer_class = serializers.AssaySerializer
    _filter_joins = ["line", "study"]

    def get_queryset(self):
        qs = models.Assay.objects.order_by("pk")
        return qs.select_related("created", "updated")


class MeasurementsViewSet(StudyInternalsFilterMixin, viewsets.ReadOnlyModelViewSet):
    """API endpoint that allows Measurements to be searched, viewed."""

    filterset_class = filters.MeasurementFilter
    serializer_class = serializers.MeasurementSerializer
    _filter_joins = ["assay", "line", "study"]

    def get_queryset(self):
        qs = models.Measurement.objects.order_by("pk")
        return qs.select_related("update_ref")


class ExportCsvContentNegotiation(DefaultContentNegotiation):
    """
    Forces adding text/csv to the list for the Accept header. This allows for
    the Swagger UI generator to properly use the Export endpoints, as it
    otherwise hard-codes only accepting application/json.
    """

    def get_accept_list(self, request):
        return super().get_accept_list(request) + ["text/csv"]


class BaseExportViewSet(mixins.ListModelMixin, viewsets.GenericViewSet):
    """Base class for the streaming and paging exports."""

    content_negotiation_class = ExportCsvContentNegotiation
    filterset_class = filters.ExportFilter

    def _send_export_signal(self, request):
        try:
            # fetch the lines matching the ExportFilter for counting
            f = filters.ExportLineFilter(request.query_params, request=request)
            # don't care about validation result
            f.is_valid()
            line_qs = f.filter_queryset(models.Line.objects.distinct())
            # fetch studies from lines, because ExportFilter only works on children of Study
            study_qs = models.Study.objects.distinct().filter(line__in=line_qs)
            study_list = list(study_qs[:2])
            cross = len(study_list) != 1
            study_exported.send(
                sender=self.__class__,
                study=None if cross else study_list[0],
                user=request.user,
                count=line_qs.count(),
                cross=cross,
            )
        except Exception as e:
            logger.exception(f"Problem generating export signal: {e}")


class ExportViewSet(BaseExportViewSet):
    """API endpoint for running exports of data."""

    pagination_class = paginators.LinkHeaderPagination
    renderer_classes = (renderers.ExportRenderer,)
    serializer_class = serializers.ExportSerializer

    def finalize_response(self, request, response, *args, **kwargs):
        response = super().finalize_response(request, response, *args, **kwargs)
        name = request.query_params.get("out", "export")
        pp = request.query_params.get("page", 1)
        response["Content-Disposition"] = f"attachment; filename={name}_page{pp}.csv"
        # only logging export on first page
        if pp == 1:
            self._send_export_signal(request)
        return response

    def get_queryset(self):
        qs = models.MeasurementValue.objects.order_by("pk")
        return qs.select_related(
            "measurement__measurement_type",
            "measurement__y_units",
            "measurement__assay__protocol",
            "measurement__assay__line",
            "study",
        )

    # The get_renderers API does not take the request object, cannot configure at this level
    # The perform_content_negotiation API *does* take request; can inject a custom renderer here
    def perform_content_negotiation(self, request, force=False):
        # to customize renderer:
        # 1. need a method that extracts parameters for customization from request, store on self;
        # 2. override get_renderers() to use parameters when creating ExportRenderer;
        # 3. call to parameter extraction must come *before* the below super call
        return super().perform_content_negotiation(request, force)


class StreamingExportViewSet(BaseExportViewSet):
    """
    API endpoint for streaming exports of data.

    This class is purposefully short-circuiting several parts of the Django and
    DRF APIs to try getting at export data as quickly as possible. It is not
    meant to be flexible or extensible. Do not use this as an example without
    knowing *EXACTLY* what you are doing.
    """

    pagination_class = None

    def get_queryset(self):
        return models.MeasurementValue.objects.order_by("pk")

    def list(self, request, *args, **kwargs):
        # custom implementation of list() ignores serializers
        queryset = self.filter_queryset(self.get_queryset())
        renderer = renderers.StreamingExportRenderer()
        response = StreamingHttpResponse(
            renderer.stream_csv(queryset), content_type="text/csv; charset=utf-8"
        )
        # TODO make sure to test with weird non-ascii names
        name = request.query_params.get("out", "export.csv")
        response["Content-Disposition"] = f"attachment; filename={name}"
        self._send_export_signal(request)
        return response


class MeasurementValuesViewSet(
    StudyInternalsFilterMixin, viewsets.ReadOnlyModelViewSet
):
    """API endpoint that allows Values to be searched, viewed, and edited."""

    filterset_class = filters.MeasurementValueFilter
    serializer_class = serializers.MeasurementValueSerializer
    _filter_joins = ["measurement", "assay", "line", "study"]

    def get_queryset(self):
        return models.MeasurementValue.objects.order_by("pk").select_related("updated")


class MeasurementTypesViewSet(viewsets.ReadOnlyModelViewSet):
    """
    API endpoint that provides search/detail access to all MeasurementTypes.
    Clients can filter results to the desired type, and can get additional
    type-specific details by setting the 'type_group' parameter:
    GeneIdentifiers ('g'), Metabolites ('m'), Phosphors ('h'),
    and ProteinIdentifiers ('p').
    """

    filterset_class = filters.MeasurementTypesFilter
    permission_classes = [DjangoModelPermissions]

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
        group = self.request.query_params.get("type_group")
        return self.model_lookup.get(group, models.MeasurementType).objects.order_by(
            "pk"
        )

    def get_serializer_class(self):
        """
        Overrides the parent implementation to provide serialization
        dynamically determined by the requested result type.
        """
        group = self.request.query_params.get("type_group")
        return self.serializer_lookup.get(group, serializers.MeasurementTypeSerializer)


class MetadataTypeViewSet(viewsets.ReadOnlyModelViewSet):
    """
    API endpoint that supports viewing and searching EDD's metadata types.
    """

    filterset_class = filters.MetadataTypesFilter
    permission_classes = [DjangoModelPermissions]
    queryset = models.MetadataType.objects.select_related("group").order_by("pk")
    serializer_class = serializers.MetadataTypeSerializer


class MeasurementUnitViewSet(viewsets.ReadOnlyModelViewSet):
    filterset_class = filters.MeasurementUnitFilter
    queryset = models.MeasurementUnit.objects.order_by("pk")
    serializer_class = serializers.MeasurementUnitSerializer
    lookup_url_kwarg = "id"


class ProtocolViewSet(viewsets.ReadOnlyModelViewSet):
    filterset_class = filters.ProtocolFilter
    queryset = models.Protocol.objects.order_by("pk")
    serializer_class = serializers.ProtocolSerializer


class UsersViewSet(viewsets.ReadOnlyModelViewSet):
    """
    API endpoint that allows privileged users to get read-only information on
    the current set of EDD user accounts.
    """

    permission_classes = [IsAuthenticated]
    serializer_class = serializers.UserSerializer

    def get_queryset(self):
        User = get_user_model()
        return User.objects.order_by("pk")
