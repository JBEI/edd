# coding: utf-8
"""
Views handling the legacy import to EDD.
"""

import json
import logging
import uuid

from django.conf import settings
from django.contrib import messages
from django.http import HttpResponse, JsonResponse
from django.shortcuts import render
from django.utils.translation import ugettext as _
from django.views import generic
from requests import codes

from edd.notify.backend import RedisBroker
from .study import StudyObjectMixin
from .. import models as edd_models, tasks
from ..importer import parser, table


logger = logging.getLogger(__name__)


# /study/<study_id>/import/
class ImportTableView(StudyObjectMixin, generic.DetailView):

    def delete(self, request, *args, **kwargs):
        study = self.object = self.get_object()
        if not study.user_can_write(request.user):
            # TODO: uncovered code
            return HttpResponse(status=codes.forbidden)
            # END uncovered code

        # Note: we validate the input UUID to avoid exposing the capability to delete any
        # arbitrary cache entry from redis. As a stopgap, we'll allow any authenticated user to
        # delete the temporary cache for the import.  we should revisit this when re-casting
        # imports as REST resources. Low risk ATM for a user to delete someone else's WIP import,
        # since they'd have to both catch it before it's processed AND have its UUID.
        import_id = request.body.decode("utf-8")
        try:
            uuid.UUID(import_id)
        except ValueError:
            return HttpResponse(
                f'Invalid import id "{import_id}"', status=codes.bad_request
            )

        try:
            broker = table.ImportBroker()
            broker.clear_pages(import_id)
            return HttpResponse(status=codes.ok)
        # TODO: uncovered code
        except Exception as e:
            logger.exception(f"Import delete failed: {e}")

            # return error synchronously so it can be displayed right away in context.
            # no need for a separate notification here
            messages.error(request, str(e))
        # END uncovered code

    def get(self, request, *args, **kwargs):
        # TODO: uncovered code
        study = self.object = self.get_object()
        user_can_write = study.user_can_write(request.user)
        # FIXME protocol display on import page should be an autocomplete
        protocols = edd_models.Protocol.objects.order_by("name")
        return render(
            request,
            "main/import.html",
            context={
                "study": study,
                "protocols": protocols,
                "writable": user_can_write,
                "import_id": uuid.uuid4(),
                "page_size_limit": settings.EDD_IMPORT_PAGE_SIZE,
                "page_count_limit": settings.EDD_IMPORT_PAGE_LIMIT,
            },
        )
        # END uncovered code

    def _parse_payload(self, request):
        # init storage for task and parse request body
        broker = table.ImportBroker()
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
        # TODO: uncovered code
        except table.ImportTooLargeException as e:
            return HttpResponse(str(e), status=codes.request_entity_too_large)
        except table.ImportBoundsException as e:
            return HttpResponse(str(e), status=codes.bad_request)
        except table.ImportException as e:
            return HttpResponse(str(e), status=codes.server_error)
        except RuntimeError as e:
            logger.exception(f"Data import failed: {e}")

            # return error synchronously so it can be displayed right away in context.
            # no need for a separate notification here
            messages.error(request, e)
        # END uncovered


# /utilities/parsefile/
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
        # TODO: uncovered code
        except Exception as e:
            logger.exception(f"Import file parse failed: {e}")
            return JsonResponse({"python_error": str(e)}, status=codes.server_error)
        # END uncovered
    return JsonResponse(
        {
            "python_error": _(
                "The uploaded file could not be interpreted as either an Excel "
                "spreadsheet or an XML file.  Please check that the contents are "
                "formatted correctly. (Word documents are not allowed!)"
            )
        },
        status=codes.server_error,
    )
