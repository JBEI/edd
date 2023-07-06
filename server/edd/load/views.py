"""Views handling loading measurements into EDD."""

import logging

from django.conf import settings
from django.urls import reverse
from django.views import generic

from main.views.study import StudyObjectMixin

logger = logging.getLogger(__name__)


class ImportView(StudyObjectMixin, generic.DetailView):
    template_name = "edd/load/wizard.html"

    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)
        # enforce permissions check...
        self.check_write_permission(self.request)
        return context


class ImportHelpView(generic.TemplateView):
    template_name = "edd/load/wizard_help.html"

    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)

        # create a UUID for the import about to be performed.  Avoids potential for race conditions
        # in initial DB record creation & file processing that happen in separate containers
        prot_scripts = getattr(settings, "EDD_IMPORT_REQUEST_PROTOCOL_SCRIPTS", "")
        format_scripts = getattr(settings, "EDD_IMPORT_REQUEST_FORMAT_SCRIPTS", "")
        mtype_scripts = getattr(settings, "EDD_IMPORT_REQUEST_MTYPE_SCRIPTS", "")
        unit_scripts = getattr(settings, "EDD_IMPORT_REQUEST_UNITS_SCRIPTS", "")

        context["ice_url"] = getattr(settings, "ICE_URL", None)
        context["ed_help"] = reverse("describe_flat:help")
        context["prot_scripts"] = prot_scripts
        context["format_scripts"] = format_scripts
        context["mtype_scripts"] = mtype_scripts
        context["units_scripts"] = unit_scripts
        context["include_scripts"] = (
            prot_scripts + format_scripts + mtype_scripts + unit_scripts
        )
        return context
