from django.contrib.auth.decorators import login_required
from django.urls import path

from . import views

app_name = "tools"

urlpatterns = [
    path("", views.utilities_index, name="index"),
    path("gc_ms/", views.gcms_home, name="gc_ms_home"),
    path("gc_ms/parse/", views.gcms_parse, name="parse_gc_ms"),
    path("gc_ms/merge/", views.gcms_merge, name="merge_gc_ms"),
    path("gc_ms/export/", views.gcms_export, name="export_gc_ms"),
    path("proteomics/", views.skyline_home, name="proteomics_home"),
    path("proteomics/parse/", views.skyline_parse, name="parse_skyline"),
    path("cytometry/", login_required(views.cytometry_home), name="cytometry_home"),
    path(
        "cytometry/parse/",
        login_required(views.cytometry_parse),
        name="cytometry_parse",
    ),
    path(
        "cytometry/import/",
        login_required(views.cytometry_import),
        name="cytometry_import",
    ),
]
