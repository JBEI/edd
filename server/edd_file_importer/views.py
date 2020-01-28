from django.conf import settings
from django.urls import reverse
from django.views import generic

from main.models.permission import StudyPermission
from main.views import StudyObjectMixin, load_study


class ImportView(StudyObjectMixin, generic.DetailView):
    template_name = "edd_file_importer/import2.html"

    def get_context_data(self, **kwargs):
        context = super(ImportView, self).get_context_data(**kwargs)

        # send server-side settings needed by the front end: the upload limit (1 MB by default
        # for nginx) so we can provide a good user-facing error message re: files that are too
        # large
        context["upload_limit"] = getattr(settings, "EDD_IMPORT_UPLOAD_LIMIT", 1048576)
        return context

    def get(self, request, *args, **kwargs):
        # load study to enforce permissions check... permissions should also be checked by back end
        # during user attempt to create the lines, but better to identify permissions errors before
        # loading the form
        pk = kwargs.get("pk", None)
        slug = kwargs.get("slug", None)
        load_study(request, pk=pk, slug=slug, permission_type=StudyPermission.CAN_EDIT)

        # render the template
        return super(ImportView, self).get(request, *args, **kwargs)


class ImportHelpView(generic.TemplateView):
    template_name = "edd_file_importer/import_help.html"

    def get_context_data(self, **kwargs):
        context = super(ImportHelpView, self).get_context_data(**kwargs)

        # create a UUID for the import about to be performed.  Avoids potential for race conditions
        # in initial DB record creation & file processing that happen in separate containers
        prot_scripts = getattr(settings, "EDD_IMPORT_REQUEST_PROTOCOL_SCRIPTS", "")
        format_scripts = getattr(settings, "EDD_IMPORT_REQUEST_FORMAT_SCRIPTS", "")
        mtype_scripts = getattr(settings, "EDD_IMPORT_REQUEST_MTYPE_SCRIPTS", "")
        unit_scripts = getattr(settings, "EDD_IMPORT_REQUEST_UNITS_SCRIPTS", "")

        context["ice_url"] = getattr(settings, "ICE_URL", None)
        context["ed_help"] = reverse("main:experiment_description_help")
        context["prot_scripts"] = prot_scripts
        context["format_scripts"] = format_scripts
        context["mtype_scripts"] = mtype_scripts
        context["units_scripts"] = unit_scripts
        context["include_scripts"] = (
            prot_scripts + format_scripts + mtype_scripts + unit_scripts
        )
        limit_bytes = getattr(settings, "EDD_IMPORT_UPLOAD_LIMIT", 10485760)
        context["upload_limit_mb"] = round(limit_bytes / 1048576, 2)
        return context
