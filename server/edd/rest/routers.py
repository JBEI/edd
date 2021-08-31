from rest_framework import routers as rest_routers
from rest_framework_nested import routers as nested_routers

from . import views

router = rest_routers.DefaultRouter()
router.register("assays", views.AssaysViewSet, basename="assays")
router.register("lines", views.LinesViewSet, basename="lines")
router.register("measurements", views.MeasurementsViewSet, basename="measurements")
router.register("values", views.MeasurementValuesViewSet, basename="values")
router.register("studies", views.StudiesViewSet, basename="studies")
router.register("units", views.MeasurementUnitViewSet, basename="units")
router.register("metadata_types", views.MetadataTypeViewSet, basename="metadata_types")
router.register("protocols", views.ProtocolViewSet)
router.register("types", views.MeasurementTypesViewSet, basename="types")
router.register("users", views.UsersViewSet, basename="users")
router.register("export", views.ExportViewSet, basename="export")
router.register("stream-export", views.StreamingExportViewSet, basename="stream-export")

study_router = nested_routers.NestedSimpleRouter(router, r"studies", lookup="study")
