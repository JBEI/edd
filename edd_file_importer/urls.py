# coding: utf-8

from django.contrib.auth.decorators import login_required
from django.urls import include, path

from edd_file_importer.views import ImportView as Import2View

app_name = 'edd_file_importer'

import2_pattern = [path('import2', login_required(Import2View.as_view()), name='import2')]

urlpatterns = [
    # import page
    path('study/<int:pk>/', include(import2_pattern), name='edd-pk:import2'),
    path('s/<slug:slug>/', include(import2_pattern), name='import2'),

    # REST views
    path('', include('edd_file_importer.rest.urls', namespace='edd_file_importer.rest')),
]
