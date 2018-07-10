# coding: utf-8
from django.apps import AppConfig


class FileImporterConfig(AppConfig):
    name = 'edd_file_importer'
    verbose_name = 'File importer'

    def ready(self):
        # make sure to load/register all the signals
        from . import signals  # noqa
