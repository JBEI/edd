from django.conf.urls import patterns, url
from edd_utils import views

urlpatterns = patterns('',
    url(r'^$', views.utilities_index, name='utilities_index'),
    url(r'^gc_ms$', views.gcms_home, name='gc_ms_home'),
    url(r'^gc_ms/parse$', views.gcms_parse, name='parse_gc_ms'),
    url(r'^gc_ms/merge$', views.gcms_merge, name='merge_gc_ms'),
    url(r'^gc_ms/export$', views.gcms_export, name='export_gc_ms'),
    url(r'^proteomics$', views.skyline_home, name='proteomics_home'),
    url(r'^proteomics/parse$', views.skyline_parse, name='parse_skyline'),
)
