# coding: utf-8

from django.urls import include, path

app_name = 'edd_file_importer'
urlpatterns = [
    path('', include('edd_file_importer.rest.urls', namespace='edd_file_importer.rest')),
]
