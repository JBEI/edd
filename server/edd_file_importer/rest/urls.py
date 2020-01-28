# coding: utf-8

from django.conf import settings

from edd.rest.routers import base_rest_api_router, study_router

from . import views

# avoid modifying EDD's routers if the prototype import isn't switched on
# note this is needed in addition to similar checks in edd_file_importer.urls.py
if getattr(settings, "EDD_USE_PROTOTYPE_IMPORT", False):
    # merge a nested /rest/studies/X/imports/ resource into EDD's REST API
    study_router.register(
        r"imports", views.StudyImportsViewSet, base_name="study-imports"
    )

    # add URL only for the
    # add in an "imports" resource to EDD's existing base API router
    base_rest_api_router.register(
        r"imports", views.BaseImportsViewSet, base_name="imports"
    )

    base_rest_api_router.register(
        r"import_categories",
        views.ImportCategoriesViewSet,
        base_name="import_categories",
    )

app_name = "edd_file_importer.rest"
urlpatterns = []
