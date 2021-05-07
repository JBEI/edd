from django.utils.translation import gettext_lazy as _

from .core import ReportableDescribeError


class ResolveError(ReportableDescribeError):
    """
    Parent class for all errors in the resolve phase of edd.describe app
    """

    pass


class CommunicationError(ResolveError):
    def __init__(self, **kwargs):
        super().__init__(
            category=_("Communication error"),
            summary=_("EDD was unable to contact a third-party application"),
            resolution=kwargs.get("resolution", _("Wait a few minutes and try again")),
            **kwargs,
        )
