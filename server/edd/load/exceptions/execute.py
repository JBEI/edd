from django.utils.translation import gettext_lazy as _

from .core import EDDImportError, EDDImportWarning


class ExecutionError(EDDImportError):
    pass


class ExecutionWarning(EDDImportWarning):
    pass


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
