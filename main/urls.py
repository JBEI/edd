# -*- coding: utf-8 -*-
from __future__ import unicode_literals

from django.conf.urls import include, url
from django.contrib.auth.decorators import login_required
from django.contrib.staticfiles.storage import staticfiles_storage
from django.views.generic.base import RedirectView

from main import autocomplete, views


study_url_patterns = [
    url(r'^assaydata/$', login_required(views.study_assay_table_data)),
    url(r'^edddata/$', login_required(views.study_edddata)),
    url(
        r'^measurements/(?P<protocol>\d+)/$',
        include([
            url(r'^$', login_required(views.study_measurements)),
            url(r'^(?P<assay>\d+)/$', login_required(views.study_assay_measurements)),
        ])
    ),
    url(r'^map/$', login_required(views.study_map)),
    url(r'^permissions/$', login_required(views.permissions)),
    url(
        r'^import/$',
        include([
            url(r'^$', login_required(views.study_import_table)),
            # TODO these should be folded into the main import page at some point
            url(r'^rnaseq/$', login_required(views.study_import_rnaseq)),
            url(r'^rnaseq/parse/$', login_required(views.study_import_rnaseq_parse)),
            url(r'^rnaseq/process/$', login_required(views.study_import_rnaseq_process)),
            url(r'^rnaseq/edgepro$', login_required(views.study_import_rnaseq_edgepro)),
        ])
    ),
    url(r'^lines/$', login_required(autocomplete.search_study_lines)),
]

urlpatterns = [
    url(r'^$', login_required(views.StudyIndexView.as_view()), name='index'),
    url(
        r'^study/$',
        login_required(views.StudyCreateView.as_view()),
        name='create_study'
    ),
    url(r'^study/search/$', login_required(views.study_search)),

    # Individual study-specific pages loaded by primary key
    url(
        r'^study/(?P<study_pk>\d+)/',
        include(
            [url(r'^$', login_required(views.StudyDetailView.as_view()), name='detail_by_pk', )] +
            study_url_patterns
        )
    ),

    # Individual study-specific pages loaded by slug
    url(
        r'^study/(?P<slug>[-\w]+)/',
        include(
            [url(r'^$', login_required(views.StudyDetailView.as_view()), name='detail', )] +
            study_url_patterns
        )
    ),

    url(r'^export/$', login_required(views.ExportView.as_view()), name='export'),
    url(r'^worklist/$', login_required(views.WorklistView.as_view()), name='worklist'),
    url(r'^sbml/$', login_required(views.SbmlView.as_view()), name='sbml'),

    url(r'^file/download/(?P<file_id>\d+)$', login_required(views.download)),
    url(r'^file/delete/(?P<file_id>\d+)$', login_required(views.delete_file)),
    url(r'^utilities/parsefile$', login_required(views.utilities_parse_import_file)),
    url(r'^data/carbonsources/$', login_required(views.data_carbonsources)),
    url(r'^data/measurements/$', login_required(views.data_measurements)),
    url(r'^data/metadata/$', login_required(views.data_metadata)),
    url(r'^data/misc/$', login_required(views.data_misc)),
    url(r'^data/sbml/$', login_required(views.data_sbml)),
    url(r'^data/sbml/(?P<sbml_id>\d+)/$', login_required(views.data_sbml_info)),
    url(r'^data/sbml/(?P<sbml_id>\d+)/reactions/$', login_required(views.data_sbml_reactions)),
    url(r'^data/sbml/(?P<sbml_id>\d+)/reactions/(?P<rxn_id>.+)/$',
        login_required(views.data_sbml_reaction_species)),
    url(r'^data/strains/$', login_required(views.data_strains)),
    url(r'^data/users/$', login_required(views.data_users)),
    url(r'^search/$', login_required(views.search)),
    url(r'^search/(?P<model>\w+)/$', login_required(views.model_search)),
    url(r'^favicon\.ico$',
        RedirectView.as_view(
            url=staticfiles_storage.url('favicon.ico'),
            permanent=False
            ),
        name='favicon'),
]
