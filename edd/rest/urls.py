# coding: utf-8

from django.urls import include, path

from . import routers, views


app_name = 'edd.rest'


###################################################################################################
# Use routers & supporting frameworks to construct URL patterns
###################################################################################################
urlpatterns = [
    path(r'', include(routers.base_rest_api_router.urls)),
    path(r'', include(routers.study_router.urls)),
    path(r'docs/', views.schema_view),
]
