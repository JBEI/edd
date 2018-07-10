# coding: utf-8
from django.conf.urls import include, url

app_name = 'edd_file_importer'
urlpatterns = [
    url(r'^', include('edd_file_importer.rest.urls', namespace='edd_file_importer.rest')),
]
