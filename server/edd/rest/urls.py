from django.urls import include, path
from rest_framework import routers
from rest_framework_simplejwt import views as jwt

from . import views

app_name = "edd.rest"
router = routers.DefaultRouter()
router.register("assays", views.AssaysViewSet, basename="assays")
router.register("compartments", views.CompartmentViewSet, basename="compartments")
router.register("export", views.ExportViewSet, basename="export")
router.register("lines", views.LinesViewSet, basename="lines")
router.register("measurements", views.MeasurementsViewSet, basename="measurements")
router.register("metadata_types", views.MetadataTypeViewSet, basename="metadata_types")
router.register("protocols", views.ProtocolViewSet, basename="protocols")
router.register("stream-export", views.StreamingExportViewSet, basename="stream-export")
router.register("studies", views.StudiesViewSet, basename="studies")
router.register("types", views.MeasurementTypesViewSet, basename="types")
router.register("units", views.MeasurementUnitViewSet, basename="units")
router.register("users", views.UsersViewSet, basename="users")

urlpatterns = [
    path("", include(router.urls)),
    path("docs/", views.schema_view.with_ui("swagger", cache_timeout=0), name="docs"),
    path(
        "redoc/",
        views.schema_view.with_ui("redoc", cache_timeout=0),
        name="docs-redoc",
    ),
    path("token/", jwt.TokenObtainPairView.as_view(), name="token_obtain_pair"),
    path("token/refresh/", jwt.TokenRefreshView.as_view(), name="token_refresh"),
    path("token/verify/", jwt.TokenVerifyView.as_view(), name="token_verify"),
]
