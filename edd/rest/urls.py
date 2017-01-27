
from django.conf.urls import include, url
import rest_framework.routers as rest_routers

from .views import (LineViewSet, MetadataGroupViewSet, MetadataTypeViewSet,
                    STRAIN_NESTED_RESOURCE_PARENT_PREFIX, StrainStudiesView, StrainViewSet,
                    StudyLineView, StudyStrainsView, StudyViewSet, ProtocolViewSet,
                    MeasurementUnitViewSet)
import rest_framework_nested.routers as nested_routers


# define a router for plain REST API methods & views
base_rest_api_router = rest_routers.DefaultRouter()
base_rest_api_router.register(r'line', LineViewSet)
base_rest_api_router.register(r'study', StudyViewSet, 'study')
base_rest_api_router.register(r'strain', StrainViewSet, 'strain')
base_rest_api_router.register(r'measurement_unit', MeasurementUnitViewSet, 'measurement_unit')
base_rest_api_router.register(r'metadata_type', MetadataTypeViewSet)
base_rest_api_router.register(r'metadata_group', MetadataGroupViewSet)
base_rest_api_router.register(r'protocol', ProtocolViewSet)

# non-working dev code...maybe useful as an example for further work later on.
# this was the first attempt to create nested resources based on some misleading docs on the django
# rest framework
# rest_api_router.register(r'study/(?P<study>\d+)/lines', views.StudyLineView,
#                         "StudyLine")
# rest_api_router.register(r'study/(?P<study>\d+)/lines(/(?P<line>\d+))?',
#                          views.StudyListLinesView.as_view(),
#                          "StudyListLinesView1")
# rest_api_router.register(r'study/(?P<study>\d+)/lines',
#                        views.StudyListLinesView.as_view(),
#                        "StudyListLinesView")

# define a separate router for nested resources under /study (not clearly supported by normal
# django rest framework routers)
# TODO: for consistency, adjust pluralization to always plural
study_nested_resources_router = nested_routers.NestedSimpleRouter(base_rest_api_router, r'study',
                                                                  lookup='study')
study_nested_resources_router.register(r'lines', StudyLineView, base_name='study-lines')
study_nested_resources_router.register(r'strains', StudyStrainsView, base_name='study-strains')
strain_nested_resources_router = (
    nested_routers.NestedSimpleRouter(base_rest_api_router, STRAIN_NESTED_RESOURCE_PARENT_PREFIX,
                                      lookup='strain'))
strain_nested_resources_router.register(r'studies', StrainStudiesView, base_name='strain-studies')

# TODO: consider re-jiggering urlpatterns to make nested resources visible in the browseable API
urlpatterns = [
    # url(r'docs/$', include('rest_framework_swagger.urls')),
    url(r'', include(base_rest_api_router.urls)),
    url(r'', include(study_nested_resources_router.urls)),
    url(r'', include(strain_nested_resources_router.urls)),
    url(r'', include('rest_framework.urls', namespace='rest_framework')),
]
