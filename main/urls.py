from django.conf.urls import patterns, url
from django.contrib.auth.decorators import login_required
from django.contrib.staticfiles.storage import staticfiles_storage
from django.views.generic.base import RedirectView
from main import views


urlpatterns = patterns('',
    url(r'^$', login_required(views.StudyCreateView.as_view()), name='index'),
    url(r'^study/$', login_required(views.StudyCreateView.as_view()), name='create_study'),
    url(r'^study/(?P<pk>\d+)/$', login_required(views.StudyDetailView.as_view()), name='detail'),
    url(r'^study/(?P<study>\d+)/lines/$', login_required(views.study_lines)),
    url(r'^study/search/$', login_required(views.study_search)),
    url(r'^study/(?P<study>\d+)/assaydata$', login_required(views.study_assay_table_data)),
    url(r'^study/(?P<study>\d+)/edddata$', login_required(views.study_edddata)),
    url(r'^study/(?P<study>\d+)/measurements$', login_required(views.study_measurements)),
    url(r'^study/(?P<study>\d+)/import$', login_required(views.study_import_table)),
    url(r'^study/(?P<study>\d+)/export$', login_required(views.study_export_table)),
    url(r'^study/(?P<study>\d+)/export/data$', login_required(views.study_export_table_data)),
    url(r'^study/(?P<study>\d+)/sbml$', login_required(views.study_export_sbml)),
    url(r'^admin$', login_required(views.admin_home)),
    url(r'^admin/measurements$', login_required(views.admin_measurements)),
    url(r'^admin/protocols$', login_required(views.admin_protocols)),
    url(r'^admin/protocol/(?P<protocol_id>\d+)$', login_required(views.admin_protocol_edit)),
    url(r'^admin/sbml$', login_required(views.admin_sbml)),
    url(r'^admin/sbml/upload$', login_required(views.admin_sbml_upload)),
    url(r'^admin/sbml/(?P<template_id>\d+)/edit$', login_required(views.admin_sbml_edit)),
    url(r'^download/(?P<file_id>\d+)$', login_required(views.download)),
    url(r'^utilities/parsefile$', login_required(views.utilities_parse_table)),
    url(r'^data/users$', login_required(views.data_users)),
    url(r'^data/misc$', login_required(views.data_misc)),
    url(r'^data/measurements$', login_required(views.data_measurements)),
    url(r'^data/metadata$', login_required(views.data_metadata)),
    url(r'^favicon\.ico$', RedirectView.as_view(
        url=staticfiles_storage.url('favicon.ico'),
        permanent=False), name='favicon'),
)
