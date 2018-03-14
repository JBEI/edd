from django.conf.urls import url
from django.contrib.auth.decorators import login_required

from . import views

urlpatterns = [
    url(r'^$', views.utilities_index, name='index'),
    url(r'^gc_ms$', views.gcms_home, name='gc_ms_home'),
    url(r'^gc_ms/parse$', views.gcms_parse, name='parse_gc_ms'),
    url(r'^gc_ms/merge$', views.gcms_merge, name='merge_gc_ms'),
    url(r'^gc_ms/export$', views.gcms_export, name='export_gc_ms'),
    url(r'^proteomics$', views.skyline_home, name='proteomics_home'),
    url(r'^proteomics/parse$', views.skyline_parse, name='parse_skyline'),
    url(r'^cytometry/$', login_required(views.cytometry_home), name='cytometry_home'),
    url(r'^cytometry/parse/$', login_required(views.cytometry_parse), name="cytometry_parse"),
    url(r'^cytometry/import/$', login_required(views.cytometry_import), name="cytometry_import"),
]
