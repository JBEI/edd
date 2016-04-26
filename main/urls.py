from django.conf.urls import url
from django.contrib.auth.decorators import login_required
from django.contrib.staticfiles.storage import staticfiles_storage
from django.views.generic.base import RedirectView
from main import views


urlpatterns = [
    url(r'^$', login_required(views.StudyCreateView.as_view()), name='index'),
    url(r'^study/$',
        login_required(views.StudyCreateView.as_view()),
        name='create_study'
        ),
    url(r'^study/search/$', login_required(views.study_search)),
    url(r'^study/(?P<pk>\d+)/$',
        login_required(views.StudyDetailView.as_view()),
        name='detail'
        ),
    url(r'^study/(?P<study>\d+)/lines/$', login_required(views.study_lines)),
    url(r'^study/(?P<study>\d+)/assaydata/$', login_required(views.study_assay_table_data)),
    url(r'^study/(?P<study>\d+)/edddata/$', login_required(views.study_edddata)),
    url(r'^study/(?P<study>\d+)/measurements/(?P<protocol>\d+)/$',
        login_required(views.study_measurements),
        ),
    url(r'^study/(?P<study>\d+)/measurements/(?P<protocol>\d+)/(?P<assay>\d+)/$',
        login_required(views.study_assay_measurements),
        ),
    url(r'^study/(?P<study>\d+)/map/$', login_required(views.study_map)),
    url(r'^study/(?P<study>\d+)/permissions/$', login_required(views.permissions)),
    # FIXME make a module/app just for import?
    # url(r'^study/(?P<study>\d+)/import/$', include('main.import.urls', namespace='edd-import'))
    url(r'^study/(?P<study>\d+)/import$', login_required(views.study_import_table)),
    url(r'^study/(?P<study>\d+)/import/rnaseq$', login_required(views.study_import_rnaseq)),
    url(r'^study/(?P<study>\d+)/import/rnaseq/parse$',
        login_required(views.study_import_rnaseq_parse)),
    url(r'^study/(?P<study>\d+)/import/rnaseq/process$',
        login_required(views.study_import_rnaseq_process)),
    url(r'^study/(?P<study>\d+)/import/rnaseq/edgepro$',
        login_required(views.study_import_rnaseq_edgepro)),

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
