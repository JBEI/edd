# coding: utf-8

from django.apps import AppConfig


class FileImporterConfig(AppConfig):
    name = "edd_file_importer"
    verbose_name = "File importer"

    def ready(self):
        # The F401 error code is "imported but unused" warning; we ignore it here because we're
        # purposefully importing unused modules to make certain signals / signal handlers are
        # defined at the correct time

        # make sure the @receiver function will work in tests
        from django.core import signals as core_signals  # noqa: F401

        # make sure to load/register all the signals
        from . import signals  # noqa: F401

        # pick up exception-specific signal handlers so they're available in tests
        from .exceptions import core  # noqa: F401

        # add additional REST routes
        from .rest import urls  # noqa: F401
