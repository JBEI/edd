
import rest_framework.routers as rest_routers
import rest_framework_nested.routers as nested_routers
from django.conf.urls import include, url

from jbei.rest.clients.edd.constants import (ASSAYS_RESOURCE_NAME, LINES_RESOURCE_NAME,
                                             MEASUREMENTS_RESOURCE_NAME,
                                             MEASUREMENT_TYPES_RESOURCE_NAME,
                                             MEASUREMENT_UNITS_RESOURCE_NAME,
                                             METADATA_GROUPS_RESOURCE_NAME,
                                             METADATA_TYPES_RESOURCE_NAME,
                                             PROTOCOLS_RESOURCE_NAME, STRAINS_RESOURCE_NAME,
                                             STUDIES_RESOURCE_NAME, USERS_RESOURCE_NAME,
                                             VALUES_RESOURCE_NAME)
from views import schema_view
from .views import (AssaysViewSet, LinesViewSet, MeasurementTypesViewSet, MeasurementUnitViewSet,
                    MeasurementValuesViewSet, MeasurementsViewSet, MetadataGroupViewSet,
                    MetadataTypeViewSet,
                    ProtocolViewSet, StrainsViewSet, StudyAssaysViewSet,
                    StudyLinesView,
                    StudyMeasurementsViewSet, StudyValuesViewSet, StudiesViewSet, UsersViewSet,
                    )

###################################################################################################
# Define a router for base REST API methods & views
###################################################################################################
base_rest_api_router = rest_routers.DefaultRouter()
base_rest_api_router.register(ASSAYS_RESOURCE_NAME, AssaysViewSet, 'assays')
base_rest_api_router.register(LINES_RESOURCE_NAME, LinesViewSet, 'lines')
base_rest_api_router.register(MEASUREMENTS_RESOURCE_NAME, MeasurementsViewSet, 'measurements')
base_rest_api_router.register(VALUES_RESOURCE_NAME, MeasurementValuesViewSet, 'values')
base_rest_api_router.register(STUDIES_RESOURCE_NAME, StudiesViewSet, STUDIES_RESOURCE_NAME)
base_rest_api_router.register(STRAINS_RESOURCE_NAME, StrainsViewSet, STRAINS_RESOURCE_NAME)
base_rest_api_router.register(MEASUREMENT_UNITS_RESOURCE_NAME, MeasurementUnitViewSet,
                              'measurement_units')
base_rest_api_router.register(METADATA_TYPES_RESOURCE_NAME, MetadataTypeViewSet, 'metadata_type')
base_rest_api_router.register(METADATA_GROUPS_RESOURCE_NAME, MetadataGroupViewSet)
base_rest_api_router.register(PROTOCOLS_RESOURCE_NAME, ProtocolViewSet)
base_rest_api_router.register(MEASUREMENT_TYPES_RESOURCE_NAME, MeasurementTypesViewSet,
                              'measurement_types')
base_rest_api_router.register(USERS_RESOURCE_NAME, UsersViewSet, 'users')

###################################################################################################
# /rest/studies nested resources
###################################################################################################
study_router = nested_routers.NestedSimpleRouter(base_rest_api_router,
                                                 STUDIES_RESOURCE_NAME, lookup='study')
study_router.register(LINES_RESOURCE_NAME, StudyLinesView, base_name='study-lines')
study_router.register(ASSAYS_RESOURCE_NAME, StudyAssaysViewSet, base_name='study-assays')
study_router.register(MEASUREMENTS_RESOURCE_NAME, StudyMeasurementsViewSet,
                      base_name='study-measurements')
study_router.register(VALUES_RESOURCE_NAME, StudyValuesViewSet, base_name='study-values')


###################################################################################################
# Use routers & supporting frameworks to construct URL patterns
###################################################################################################
urlpatterns = [
    # url(r'docs/$', include('rest_framework_swagger.urls')),

    url(r'^', include(base_rest_api_router.urls)),
    url(r'^', include(study_router.urls)),
    url(r'^', include('rest_framework.urls', namespace='rest_framework')),
    url(r'docs/', schema_view),
    # url(r'^', not_found_view), # TODO: this improves consistency, but stops the docs from working
]
