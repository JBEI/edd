from django.conf.urls import patterns, url
from django.contrib.auth.decorators import login_required
from main import views


urlpatterns = patterns('',
    url(r'^$', login_required(views.StudyCreateView.as_view()), name='index'),
    url(r'^study/$', login_required(views.StudyCreateView.as_view()), name='create_study'),
    url(r'^study/(?P<pk>\d+)/$', login_required(views.StudyDetailView.as_view()), name='detail'),
    url(r'^study/(?P<study>\d+)/lines/$', login_required(views.study_lines)),
    url(r'^study/search/$', login_required(views.study_search)),
    url(r'^study/(?P<study>\d+)/assays$', login_required(views.study_assays)),
    url(r'^globals/metadata$', login_required(views.globals_metadata_types)),
    url(r'^globals/units$', login_required(views.globals_unit_types)),
    url(r'^globals/metabolites$', login_required(views.globals_metabolite_types)),
    url(r'^globals/compartments$', login_required(views.globals_measurement_compartments)),
    url(r'^globals/protocols$', login_required(views.globals_protocols)),
)
