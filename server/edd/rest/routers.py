# coding: utf-8
from rest_framework import routers as rest_routers
from rest_framework_nested import routers as nested_routers

from . import views

###################################################################################################
# Define a router for base REST API methods & views
###################################################################################################
base_rest_api_router = rest_routers.DefaultRouter()
base_rest_api_router.register(r"assays", views.AssaysViewSet, base_name="assays")
base_rest_api_router.register(r"lines", views.LinesViewSet, base_name="lines")
base_rest_api_router.register(
    r"measurements", views.MeasurementsViewSet, base_name="measurements"
)
base_rest_api_router.register(
    r"values", views.MeasurementValuesViewSet, base_name="values"
)
base_rest_api_router.register(r"studies", views.StudiesViewSet, base_name="studies")
base_rest_api_router.register(
    r"measurement_units", views.MeasurementUnitViewSet, base_name="measurement_units"
)
base_rest_api_router.register(
    r"metadata_types", views.MetadataTypeViewSet, base_name="metadata_type"
)
base_rest_api_router.register(r"metadata_groups", views.MetadataGroupViewSet)
base_rest_api_router.register(r"protocols", views.ProtocolViewSet)
base_rest_api_router.register(
    r"measurement_types", views.MeasurementTypesViewSet, base_name="measurement_types"
)
base_rest_api_router.register(r"users", views.UsersViewSet, base_name="users")
base_rest_api_router.register("export", views.ExportViewSet, base_name="export")
base_rest_api_router.register(
    "stream-export", views.StreamingExportViewSet, base_name="stream-export"
)

###################################################################################################
# /rest/studies nested resources
###################################################################################################
study_router = nested_routers.NestedSimpleRouter(
    base_rest_api_router, r"studies", lookup="study"
)
study_router.register(r"lines", views.StudyLinesView, base_name="study-lines")
study_router.register(r"assays", views.StudyAssaysViewSet, base_name="study-assays")
study_router.register(
    r"measurements", views.StudyMeasurementsViewSet, base_name="study-measurements"
)
study_router.register(r"values", views.StudyValuesViewSet, base_name="study-values")
