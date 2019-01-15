# -*- coding: utf-8 -*-

from django.contrib.auth.decorators import login_required
from django.urls import include, path

from main import views


app_name = 'main'


ed_patterns = [
    path('', login_required(views.StudyLinesView.as_view()), name='lines'),
    path('combos/', login_required(views.AddLineCombos.as_view()), name='combos'),
]

# These are the URL endpoints nested under a link to a specific Study, for use with include() in
#   the two URL paths for study below. Because this list is included twice, there should be no
#   URL with the name kwarg here, as that will result in conflicts looking up URLs by name.
study_url_patterns = [
    path('', login_required(views.StudyDetailView.as_view()), name='detail'),
    path('overview/', login_required(views.StudyOverviewView.as_view()), name='overview'),
    path('experiment-description/', include(ed_patterns)),
    path('assaydata/', login_required(views.study_assay_table_data), name="assaydata"),
    path('edddata/', login_required(views.study_edddata), name="edddata"),
    path('measurements/<int:protocol>/', include([
        path('', login_required(views.study_measurements), name="measurements"),
        path(
            '<int:assay>/', login_required(views.study_assay_measurements),
            name="assay_measurements",
        ),
    ])),
    path(
        'permissions/', login_required(views.StudyPermissionJSONView.as_view()),
        name="permissions",
    ),
    path('files/<int:file_id>/', include([
        # require the ID in URL
        path('', login_required(views.StudyAttachmentView.as_view()), name="attachment_list"),
        # optional to include file name in URL; reverse() should include it
        path('<path:file_name>/',
             login_required(views.StudyAttachmentView.as_view()),
             name='attachment'),
    ])),
    path('describe/', login_required(views.study_describe_experiment), name='describe'),
    path('import/', include([
        path('', login_required(views.ImportTableView.as_view()), name='table-import'),
    ])),
]

urlpatterns = [
    # "homepage" URLs
    path('', login_required(views.StudyIndexView.as_view()), name='index'),
    path('study/', login_required(views.StudyCreateView.as_view()), name='create_study'),
    path('study/study-search/', login_required(views.study_search), name="study_search"),

    # Individual study-specific pages loaded by primary key
    # reverse('main:edd-pk:overview', kwargs={'pk': pk})
    path('study/<int:pk>/', include((study_url_patterns, 'edd-pk'))),
    # Individual study-specific pages loaded by slug
    # reverse('main:overview', kwargs={'slug': slug})
    path('s/<slug:slug>/', include(study_url_patterns)),

    # "export" URLs
    path('export/', login_required(views.ExportView.as_view()), name='export'),
    path('worklist/', login_required(views.WorklistView.as_view()), name='worklist'),
    path('sbml/', login_required(views.SbmlView.as_view()), name='sbml'),

    # Miscellaneous URLs; most/all of these should eventually be delegated to REST API
    path(
        'utilities/parsefile/',
        login_required(views.utilities_parse_import_file),
        name='import_parse',
    ),
    path('help/experiment_description/',
         login_required(views.ExperimentDescriptionHelp.as_view()),
         name='experiment_description_help'),
    path('search/', include([
        path('', login_required(views.search)),
        path('<slug:model>/', login_required(views.model_search)),
    ])),
    path('ice_folder/', login_required(views.ICEFolderView.as_view()), name='folder'),
]
