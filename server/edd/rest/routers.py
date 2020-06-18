from rest_framework import routers as rest_routers
from rest_framework_nested import routers as nested_routers

from . import views

###################################################################################################
# Define a router for base REST API methods & views
###################################################################################################
base_rest_api_router = rest_routers.DefaultRouter()
base_rest_api_router.register(r"assays", views.AssaysViewSet, basename="assays")
base_rest_api_router.register(r"lines", views.LinesViewSet, basename="lines")
base_rest_api_router.register(
    r"measurements", views.MeasurementsViewSet, basename="measurements"
)
base_rest_api_router.register(
    r"values", views.MeasurementValuesViewSet, basename="values"
)
base_rest_api_router.register(r"studies", views.StudiesViewSet, basename="studies")
base_rest_api_router.register(
    r"measurement_units", views.MeasurementUnitViewSet, basename="measurement_units"
)
base_rest_api_router.register(
    r"metadata_types", views.MetadataTypeViewSet, basename="metadata_type"
)
base_rest_api_router.register(r"metadata_groups", views.MetadataGroupViewSet)
base_rest_api_router.register(r"protocols", views.ProtocolViewSet)
base_rest_api_router.register(
    r"measurement_types", views.MeasurementTypesViewSet, basename="measurement_types"
)
base_rest_api_router.register(r"users", views.UsersViewSet, basename="users")
base_rest_api_router.register("export", views.ExportViewSet, basename="export")
base_rest_api_router.register(
    "stream-export", views.StreamingExportViewSet, basename="stream-export"
)

###################################################################################################
# /rest/studies nested resources
###################################################################################################
study_router = nested_routers.NestedSimpleRouter(
    base_rest_api_router, r"studies", lookup="study"
)
study_router.register(r"lines", views.StudyLinesView, basename="study-lines")
study_router.register(r"assays", views.StudyAssaysViewSet, basename="study-assays")
study_router.register(
    r"measurements", views.StudyMeasurementsViewSet, basename="study-measurements"
)
study_router.register(r"values", views.StudyValuesViewSet, basename="study-values")
