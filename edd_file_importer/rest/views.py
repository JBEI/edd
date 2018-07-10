# coding: utf-8
import logging

from django.db.models import Prefetch
from django_filters import filters as django_filters

from rest_framework.parsers import JSONParser, MultiPartParser
from rest_framework.permissions import IsAuthenticated
from rest_framework import mixins, viewsets

from edd.rest.views import EDDObjectFilter, StudyInternalsFilterMixin
from edd_file_importer import models
from .serializers import FileImportSerializer, ImportCategorySerializer
from ..models import ImportCategory, ImportFormat

logger = logging.getLogger(__name__)


class ImportFilter(EDDObjectFilter):
    file_format = line = django_filters.ModelChoiceFilter(
        name='import__file_format',
        queryset=models.ImportFormat.objects.all()
    )

    class Meta:
        model = models.Import
        fields = {
            'study': ['exact', 'in'],
            'protocol': ['exact', 'in'],
            'category': ['exact', 'in'],
            'status': ['exact', 'in'],
            'file_format': ['exact', 'in']
        }


# TODO: enforce user write permissions
class ImportFilterMixin(StudyInternalsFilterMixin):
    filter_class = ImportFilter
    serializer_class = FileImportSerializer
    _filter_prefix = 'study__'

    def get_queryset(self):
        qs = models.Import.objects.order_by('pk')
        return qs.select_related('created', 'updated')


class BaseImportsViewSet(ImportFilterMixin, viewsets.ReadOnlyModelViewSet):
    permission_classes = [IsAuthenticated]
    serializer_class = FileImportSerializer

    def get_queryset(self):
        return super(BaseImportsViewSet, self).get_queryset().filter(self.get_nested_filter())


class ImportCategoriesViewSet(viewsets.ReadOnlyModelViewSet):
    """
    View for getting ImportCategories and related content for display in the UI.  This REST-based
    implementation roughly approximates the result of a likely eventual GraphQL query result (but
    with less short-term effort)
    """
    permission_classes = [IsAuthenticated]
    serializer_class = ImportCategorySerializer
    queryset = ImportCategory.objects.all()

    def get_queryset(self):
        # build a Prefetch object that allows us to sort returned ImportFormats in the defined
        # display_order for each ImportCategory. We'll also throw in a few select_related calls
        # in a first-pass attempt to reduce # queries.
        base_fields = ['object_ref', 'object_ref__updated', 'object_ref__created']
        ordered_fmts_qs = ImportFormat.objects.select_related(*base_fields)
        ordered_fmts_qs = ordered_fmts_qs.order_by('categoryformat__display_order')
        ordered_fmts_pf = Prefetch('file_formats', queryset=ordered_fmts_qs)

        # build the main queryset
        qs = ImportCategory.objects.all().select_related(*base_fields)
        qs = qs.prefetch_related(ordered_fmts_pf)
        qs = qs.prefetch_related('protocols')  # no defined ordering for protocols
        qs = qs.order_by('display_order')
        return qs


class StudyImportsViewSet(ImportFilterMixin, mixins.CreateModelMixin,
                          mixins.UpdateModelMixin, viewsets.ReadOnlyModelViewSet):
    """
    API endpoint that allows users with study write permission to create, configure, and run a data
    import.
    """
    parsers = (JSONParser, MultiPartParser)
    permission_classes = [IsAuthenticated]
    serializer_class = FileImportSerializer

    def get_queryset(self):
        return super(StudyImportsViewSet, self).get_queryset().filter(self.get_nested_filter())

    def create(self, request, *args, **kwargs):

        # serializer = self.get_serializer(data=request.data)
        # serializer.is_valid(raise_exception=True)
        # self.perform_create(serializer)
        # headers = self.get_success_headers(serializer.data)
        #
        # return Response(serializer.data, status=status.HTTP_201_CREATED, headers=headers)
        pass

    def retrieve(self, request, *args, **kwargs):
        pass

    def update(self, request, *args, **kwargs):
        pass

    def partial_update(self, request, *args, **kwargs):
        pass
