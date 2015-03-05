from django.conf.urls import patterns, url
from django.contrib.auth.decorators import login_required
from main import views


urlpatterns = patterns('',
    url(r'^$', login_required(views.StudyCreateView.as_view()), name='index'),
    url(r'^study/$', login_required(views.StudyCreateView.as_view()), name='create_study'),
    url(r'^study/(?P<pk>\d+)/$', login_required(views.StudyDetailView.as_view()), name='detail'),
    url(r'^study/(?P<study>\d+)/lines/$', login_required(views.study_lines)),
    url(r'^study/search/$', login_required(views.study_search)),
    url(r'^study/(?P<study>\d+)/assaydata$', login_required(views.study_assay_table_data)),
    url(r'^study/(?P<study>\d+)/edddata$', login_required(views.study_edddata)),
    url(r'^study/(?P<study>\d+)/import$', login_required(views.study_import_table)),
    url(r'^study/(?P<study>\d+)/measurements$', login_required(views.study_measurements)),
)
