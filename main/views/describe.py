# coding: utf-8
"""
Views for the Experiment Description upload feature.
"""

import json
import logging

from django.db import transaction
from django.http import JsonResponse
from django.views import generic, View
from django.views.decorators.csrf import ensure_csrf_cookie
from requests import codes
from rest_framework.exceptions import MethodNotAllowed

from .study import load_study, StudyObjectMixin
from .. import models as edd_models
from ..importer import experiment_desc, parser
from ..tasks import create_ice_connection


logger = logging.getLogger(__name__)


class ExperimentDescriptionHelp(generic.TemplateView):
    template_name = "main/experiment_description_help.html"


class AddLineCombos(StudyObjectMixin, generic.DetailView):
    template_name = "main/study-lines-add-combos.html"

    def get(self, request, *args, **kwargs):
        # only render the view if request user has write permission
        self.check_write_permission(request)
        return super().get(request, *args, **kwargs)


# /ice_folder
class ICEFolderView(View):
    """
    A stopgap view to support UI for looking up an ICE folder by browser URL and confirming it
    exists and has been entered correctly. Final solution should likely tie into a
    not-yet-implemented ICE REST resource for searching for folders by name. Most of the code
    here is to test user input and provide helpful UI-level output.
    """

    def get(self, request, *args, **kwargs):
        # TODO: uncovered code
        try:
            ice = create_ice_connection(request.user.email)
            folder = ice.folder_from_url(request.GET.get("url", None))
            if folder is None:
                return self._build_simple_err_response(
                    experiment_desc.constants.SYSTEMIC_ICE_ACCESS_ERROR_CATEGORY,
                    "Folder was not found",
                    status=codes.not_found,
                )
            return JsonResponse(folder.to_json_dict())
        except Exception as e:
            return self._build_simple_err_response(
                experiment_desc.constants.SYSTEMIC_ICE_ACCESS_ERROR_CATEGORY,
                "Failed to load ICE Folder",
                detail=str(e),
            )
        # END uncovered

    def _build_simple_err_response(
        self, category, title, status=codes.internal_server_error, detail=None
    ):
        # TODO: uncovered code
        err = experiment_desc.importer.ImportErrorSummary(category, title)
        if detail:
            err.add_occurrence(detail)
        return JsonResponse({"errors": [err.to_json_dict()]}, status=status)
        # END uncovered


# /study/<study_id>/describe/
@ensure_csrf_cookie
def study_describe_experiment(request, pk=None, slug=None):
    """
    View for defining a study's lines / assays from an Experiment Description file or from the
    "Add Line Combo's" GUI.
    """

    # load the study first to detect any permission errors / fail early
    study = load_study(
        request, pk=pk, slug=slug, permission_type=edd_models.StudyPermission.CAN_EDIT
    )

    if request.method != "POST":
        raise MethodNotAllowed(request.method)

    # parse request parameter input to keep subsequent code relatively format-agnostic
    user = request.user
    options = experiment_desc.importer.ExperimentDescriptionOptions.of(request)

    # detect the input format (either Experiment Description file or JSON)
    stream = request
    file = request.FILES.get("file", None)
    file_name = None
    file_extension = None
    if file:
        stream = file
        file_name = file.name
        file_extension = parser.guess_extension(file.content_type)

        if file_extension not in (
            parser.ImportFileTypeFlags.EXCEL,
            parser.ImportFileTypeFlags.CSV,
        ):
            summary = experiment_desc.importer.ImportErrorSummary(
                experiment_desc.constants.BAD_FILE_CATEGORY,
                experiment_desc.constants.UNSUPPORTED_FILE_TYPE,
            )
            summary.add_occurrence(file.content_type)
            errors = {
                experiment_desc.constants.BAD_FILE_CATEGORY: {
                    experiment_desc.constants.UNSUPPORTED_FILE_TYPE: summary
                }
            }
            return JsonResponse(
                experiment_desc.importer._build_response_content(errors, {}),
                status=codes.bad_request,
            )

    # attempt the import
    importer = experiment_desc.CombinatorialCreationImporter(study, user)
    try:
        with transaction.atomic(savepoint=False):
            status_code, reply_content = importer.do_import(
                stream,
                options,
                filename=file_name,
                file_extension=file_extension,
                encoding=request.encoding or "utf8",
            )

        if options.email_when_finished and not options.dry_run:
            # TODO: uncovered code
            if status_code == codes.ok:
                importer.send_user_success_email(reply_content)
            else:
                importer.send_user_err_email()
            # END uncovered code

        if logger.getEffectiveLevel() == logging.DEBUG:
            logger.debug(f"Reply content: {json.dumps(reply_content)}")
        return JsonResponse(reply_content, status=status_code)

    # TODO: uncovered code
    except RuntimeError as e:
        # log the exception, but return a response to the GUI/client anyway to help it remain
        # responsive
        importer.add_error(
            experiment_desc.constants.INTERNAL_EDD_ERROR_CATEGORY,
            experiment_desc.constants.UNPREDICTED_ERROR,
            str(e),
        )

        logger.exception(
            "Unpredicted exception occurred during experiment description processing"
        )

        if options.email_when_finished and not options.dry_run:
            importer.send_user_err_email()

        importer.send_unexpected_err_email(
            options.dry_run,
            options.ignore_ice_access_errors,
            options.allow_duplicate_names,
        )
        return JsonResponse(
            experiment_desc.importer._build_response_content(
                importer.errors, importer.warnings
            ),
            status=codes.internal_server_error,
        )
    # END uncovered
