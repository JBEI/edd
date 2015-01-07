from django.conf.urls import patterns, url
from main import views


urlpatterns = patterns('',
    url(r'^$', views.IndexView.as_view(), name='index'),
    url(r'^study/(?P<pk>\d+)/$', views.StudyDetailView.as_view(), name='detail')
)
