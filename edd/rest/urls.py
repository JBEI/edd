
from django.conf import settings
from django.conf.urls import include, url, static
from django.contrib import admin
import rest_framework.routers as rest_routers
from . import views
import rest_framework_nested.routers as nested_routers
from django.conf import settings


# define a router for plain REST API methods & views
rest_api_router = rest_routers.DefaultRouter()
rest_api_router.register(r'line', views.LineViewSet)
rest_api_router.register(r'study', views.StudyViewSet, 'study')
rest_api_router.register(r'strain', views.StrainViewSet, 'strain')

# non-working dev code...maybe useful as an example for further work later on.
# this was the first attempt to create nested resources based on some misleading docs on the django
# rest framework
#rest_api_router.register(r'study/(?P<study>\d+)/lines', views.StudyLineView,
#                         "StudyLine")
# rest_api_router.register(r'study/(?P<study>\d+)/lines(/(?P<line>\d+))?',
#                          views.StudyListLinesView.as_view(),
#                          "StudyListLinesView1")
#rest_api_router.register(r'study/(?P<study>\d+)/lines',
                         # views.StudyListLinesView.as_view(),
                         # "StudyListLinesView")

# define a separate router for nested resources under /study (not clearly supported by normal
# django rest framework routers)
nested_study_router = nested_routers.NestedSimpleRouter(rest_api_router, r'study', lookup='study')
nested_study_router.register(r'lines', views.StudyLineView, base_name='study-lines')

urlpatterns = [
    #url(r'docs/$', include('rest_framework_swagger.urls')),
    url(r'', include(rest_api_router.urls)),
    url(r'', include(nested_study_router.urls)),
    url(r'', include('rest_framework.urls', namespace='rest_framework')),
]


