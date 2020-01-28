# coding: utf-8

from django.utils.translation import ugettext_lazy as _

from .core import EDDImportError, EDDImportWarning


class ExecutionError(EDDImportError):
    pass


class ExecutionWarning(EDDImportWarning):
    pass


class MissingAssayError(ExecutionError):
    def __init__(self, **kwargs):
        super().__init__(
            category=_("Study altered"),
            summary=_(
                "One or more assays found during initial file processing are no longer "
                "available"
            ),
            **kwargs
        )


class MissingLineError(ExecutionError):
    def __init__(self, **kwargs):
        super().__init__(
            category=_("Study altered"),
            summary=_(
                "One or more lines found during initial file processing are no longer "
                "available"
            ),
            **kwargs
        )


class UnplannedOverwriteError(ExecutionError):
    def __init__(self, **kwargs):
        super().__init__(
            category=_("Study altered"),
            summary=_(
                "Import would overwrite values that weren't detected when the file was "
                "first checked against the study"
            ),
            resolution=kwargs.get(
                "resolution, ",
                _(
                    "Check that collaborators are "
                    "finished changing the study, then re-try your "
                    "import"
                ),
            ),
            **kwargs
        )
