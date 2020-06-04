import logging
from collections import namedtuple

from django.db import transaction
from django.http import JsonResponse
from django.views import View, generic
from requests import codes

from edd.utilities import guess_extension
from main.tasks import create_ice_connection
from main.views.study import StudyObjectMixin

from . import constants, importer
from .exceptions import DescriptionError

logger = logging.getLogger(__name__)


class HelpView(generic.TemplateView):
    template_name = "edd/describe/help.html"


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
                    constants.SYSTEMIC_ICE_ACCESS_ERROR_CATEGORY,
                    "Folder was not found",
                    status=codes.not_found,
                )
            return JsonResponse(folder.to_json_dict())
        except Exception as e:
            return self._build_simple_err_response(
                constants.SYSTEMIC_ICE_ACCESS_ERROR_CATEGORY,
                "Failed to load ICE Folder",
                detail=str(e),
            )
        # END uncovered

    def _build_simple_err_response(
        self, category, title, status=codes.internal_server_error, detail=None
    ):
        # TODO: uncovered code
        err = importer.ImportErrorSummary(category, title)
        if detail:
            err.add_occurrence(detail)
        return JsonResponse({"errors": [err.to_json_dict()]}, status=status)
        # END uncovered


class DescribeView(StudyObjectMixin, generic.DetailView):
    template_name = "edd/describe/combos.html"

    class Upload(namedtuple("Upload", ("stream", "name", "extension"))):
        pass

    def _check_upload(self, request):
        file = request.FILES.get("file", None)
        if file:
            # basic checks on uploaded file content
            upload = DescribeView.Upload(
                stream=file,
                name=file.name,
                extension=self._extract_file_extension(file),
            )
        else:
            # assume entire body is JSON upload if no "file" in FILES
            upload = DescribeView.Upload(stream=request, name=None, extension=None)
        return upload

    def _extract_file_extension(self, file):
        extension = guess_extension(file.content_type)
        if extension not in ("xlsx", "csv"):
            summary = importer.ImportErrorSummary(
                constants.BAD_FILE_CATEGORY, constants.UNSUPPORTED_FILE_TYPE
            )
            summary.add_occurrence(file.content_type)
            errors = {
                constants.BAD_FILE_CATEGORY: {constants.UNSUPPORTED_FILE_TYPE: summary}
            }
            raise DescriptionError(
                response_dict=importer._build_response_content(errors, {})
            )
        return extension

    def _finished_import(self, cc, options, reply_content):
        if options.email_when_finished and not options.dry_run:
            cc.send_user_success_email(reply_content)

    def _handle_exception(self, cc, options, e):
        cc.add_error(
            constants.INTERNAL_EDD_ERROR_CATEGORY, constants.UNPREDICTED_ERROR, str(e),
        )
        logger.exception(
            "Unpredicted exception occurred during experiment description processing"
        )
        if options.email_when_finished and not options.dry_run:
            cc.send_user_err_email()
        cc.send_unexpected_err_email(
            options.dry_run,
            options.ignore_ice_access_errors,
            options.allow_duplicate_names,
        )

    def get(self, request, *args, **kwargs):
        # only render the view if request user has write permission
        self.check_write_permission(request)
        return super().get(request, *args, **kwargs)

    def post(self, request, *args, **kwargs):
        # only render the view if request user has write permission
        self.check_write_permission(request)
        cc = importer.CombinatorialCreationImporter(self.get_object(), request.user)
        try:
            options = importer.ExperimentDescriptionOptions.of(request)
            upload = self._check_upload(request)
            # attempt the import
            with transaction.atomic(savepoint=False):
                status_code, reply_content = cc.do_import(
                    upload.stream,
                    options,
                    filename=upload.name,
                    file_extension=upload.extension,
                    encoding=request.encoding or "utf8",
                )
            if status_code == codes.ok:
                self._finished_import(cc, options, reply_content)
                return JsonResponse(reply_content)
        except DescriptionError:
            return JsonResponse(
                importer._build_response_content(cc.errors, cc.warnings),
                status=codes.bad_request,
            )
        except Exception as e:
            self._handle_exception(cc, options, e)
            return JsonResponse(
                importer._build_response_content(cc.errors, cc.warnings),
                status=codes.internal_server_error,
            )
        return JsonResponse(reply_content, status=codes.bad_request)
