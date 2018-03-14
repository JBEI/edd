# coding: utf-8

from django.conf.urls import include, url
from rest_framework import routers as rest_routers
from rest_framework_nested import routers as nested_routers

from jbei.rest.clients.edd import constants
from . import views


###################################################################################################
# Define a router for base REST API methods & views
###################################################################################################
base_rest_api_router = rest_routers.DefaultRouter()
base_rest_api_router.register(
    constants.ASSAYS_RESOURCE_NAME,
    views.AssaysViewSet,
    base_name='assays',
)
base_rest_api_router.register(
    constants.LINES_RESOURCE_NAME,
    views.LinesViewSet,
    base_name='lines',
)
base_rest_api_router.register(
    constants.MEASUREMENTS_RESOURCE_NAME,
    views.MeasurementsViewSet,
    base_name='measurements',
)
base_rest_api_router.register(
    constants.VALUES_RESOURCE_NAME,
    views.MeasurementValuesViewSet,
    base_name='values',
)
base_rest_api_router.register(
    constants.STUDIES_RESOURCE_NAME,
    views.StudiesViewSet,
    base_name='studies',
)
base_rest_api_router.register(
    constants.MEASUREMENT_UNITS_RESOURCE_NAME,
    views.MeasurementUnitViewSet,
    base_name='measurement_units',
)
base_rest_api_router.register(
    constants.METADATA_TYPES_RESOURCE_NAME,
    views.MetadataTypeViewSet,
    base_name='metadata_type',
)
base_rest_api_router.register(
    constants.METADATA_GROUPS_RESOURCE_NAME,
    views.MetadataGroupViewSet,
)
base_rest_api_router.register(
    constants.PROTOCOLS_RESOURCE_NAME,
    views.ProtocolViewSet,
)
base_rest_api_router.register(
    constants.MEASUREMENT_TYPES_RESOURCE_NAME,
    views.MeasurementTypesViewSet,
    base_name='measurement_types',
)
base_rest_api_router.register(
    constants.USERS_RESOURCE_NAME,
    views.UsersViewSet,
    base_name='users',
)

###################################################################################################
# /rest/studies nested resources
###################################################################################################
study_router = nested_routers.NestedSimpleRouter(
    base_rest_api_router,
    constants.STUDIES_RESOURCE_NAME,
    lookup='study',
)
study_router.register(
    constants.LINES_RESOURCE_NAME,
    views.StudyLinesView,
    base_name='study-lines'
)
study_router.register(
    constants.ASSAYS_RESOURCE_NAME,
    views.StudyAssaysViewSet,
    base_name='study-assays'
)
study_router.register(
    constants.MEASUREMENTS_RESOURCE_NAME,
    views.StudyMeasurementsViewSet,
    base_name='study-measurements',
)
study_router.register(
    constants.VALUES_RESOURCE_NAME,
    views.StudyValuesViewSet,
    base_name='study-values'
)


###################################################################################################
# Use routers & supporting frameworks to construct URL patterns
###################################################################################################
urlpatterns = [
    url(r'^', include(base_rest_api_router.urls)),
    url(r'^', include(study_router.urls)),
    url(r'docs/', views.schema_view),
]
