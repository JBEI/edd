"""Views handling loading measurements into EDD."""

import json
import logging
import uuid

from django.conf import settings
from django.contrib import messages
from django.http import HttpResponse, JsonResponse
from django.urls import reverse
from django.utils.translation import gettext as _
from django.views import generic
from requests import codes

from edd.notify.backend import RedisBroker
from main import models as edd_models
from main.views.study import StudyObjectMixin

from . import exceptions, parser, tasks
from .broker import ImportBroker

logger = logging.getLogger(__name__)


# reverse("main:load:table", kwargs={}) => /<study_path>/load/
class ImportTableView(StudyObjectMixin, generic.DetailView):
    template_name = "edd/load/load.html"

    def get_context_data(self, **kwargs):
        study = self.object = self.get_object()
        # FIXME protocol display on import page should be an autocomplete
        protocols = edd_models.Protocol.objects.order_by("name")
        user_can_write = study.user_can_write(self.request.user)
        return super().get_context_data(
            study=study,
            protocols=protocols,
            writable=user_can_write,
            import_id=uuid.uuid4(),
            page_size_limit=settings.EDD_IMPORT_PAGE_SIZE,
            page_count_limit=settings.EDD_IMPORT_PAGE_LIMIT,
        )

    def delete(self, request, *args, **kwargs):
        study = self.object = self.get_object()
        if not study.user_can_write(request.user):
            return HttpResponse(status=codes.forbidden)

        import_id = request.body.decode("utf-8")
        try:
            uuid.UUID(import_id)
        except ValueError:
            return HttpResponse(
                f'Invalid import id "{import_id}"', status=codes.bad_request
            )

        try:
            broker = ImportBroker()
            broker.clear_pages(import_id)
            return HttpResponse(status=codes.ok)
        except Exception as e:
            logger.exception(f"Import delete failed: {e}")
            messages.error(request, str(e))
            return HttpResponse(f"Import delete failed: {e}", status=codes.server_error)

    def _parse_payload(self, request):
        # init storage for task and parse request body
        broker = ImportBroker()
        payload = json.loads(request.body)
        # check requested import parameters are acceptable
        import_id = payload["importId"]
        series = payload["series"]
        pages = payload["totalPages"]
        broker.check_bounds(import_id, series, pages)
        # store the series of points for the task to read later
        count = broker.add_page(import_id, json.dumps(series))
        # only on the first page, store the import context
        if payload["page"] == 1:
            del payload["series"]
            # include an update record from the original request
            update = edd_models.Update.load_request_update(request)
            payload.update(update_id=update.id)
            broker.set_context(import_id, json.dumps(payload))
        return import_id, count == pages

    def post(self, request, *args, **kwargs):
        study = self.object = self.get_object()
        if not study.user_can_write(request.user):
            return HttpResponse(status=codes.forbidden)
        try:
            import_id, done = self._parse_payload(request)
            if done:
                # once all pages are parsed, submit task and send notification
                logger.debug(f"Submitting Celery task for import {import_id}")
                result = tasks.import_table_task.delay(
                    study.pk, request.user.pk, import_id
                )
                RedisBroker(request.user).notify(
                    _(
                        "Data is submitted for import. You may continue to use EDD, "
                        "another message will appear once the import is complete."
                    ),
                    uuid=result.id,
                )
            return JsonResponse(data={}, status=codes.accepted)
        except exceptions.ImportBoundsError as e:
            return HttpResponse(str(e), status=codes.bad_request)
        except exceptions.LoadError as e:
            return HttpResponse(str(e), status=codes.server_error)
        except Exception as e:
            logger.exception(f"Table import failed: {e}")
            messages.error(request, e)
            return HttpResponse(f"Table import failed: {e}", status=codes.server_error)


# reverse("main:load_flat:parse") => /load/parse/
# To reach this function, files are sent from the client by the Utl.FileDropZone class (in Utl.ts).
def utilities_parse_import_file(request):
    """
    Attempt to process posted data as either a TSV or CSV file or Excel spreadsheet and extract a
    table of data automatically.
    """
    file = request.FILES.get("file")
    import_mode = request.POST.get("import_mode", parser.ImportModeFlags.STANDARD)

    parse_fn = parser.find_parser(import_mode, file.content_type)
    if parse_fn:
        try:
            result = parse_fn(file)
            return JsonResponse(
                {"file_type": result.file_type, "file_data": result.parsed_data}
            )
        except Exception as e:
            logger.exception(f"Import file parse failed: {e}")
            return JsonResponse({"python_error": str(e)}, status=codes.server_error)
    return JsonResponse(
        {
            "python_error": _(
                "The uploaded file could not be interpreted as either an Excel "
                "spreadsheet or an XML file.  Please check that the contents are "
                "formatted correctly. (Word documents are not allowed!)"
            )
        },
        status=codes.bad_request,
    )


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
        context["ed_help"] = reverse("main:describe_flat:help")
        context["prot_scripts"] = prot_scripts
        context["format_scripts"] = format_scripts
        context["mtype_scripts"] = mtype_scripts
        context["units_scripts"] = unit_scripts
        context["include_scripts"] = (
            prot_scripts + format_scripts + mtype_scripts + unit_scripts
        )
        return context
