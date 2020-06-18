import logging

from django.db.models import Prefetch
from django.http import JsonResponse
from django.utils.translation import gettext_lazy as _
from requests import codes
from rest_framework import parsers, viewsets
from rest_framework.exceptions import ParseError as DRFParseError
from rest_framework.permissions import IsAuthenticated
from rest_framework.reverse import reverse

from edd.utilities import JSONEncoder
from main.models import Protocol, Study, StudyPermission

from .. import tasks
from ..broker import LoadRequest
from ..exceptions import EDDImportError, InvalidLoadRequestError
from ..models import Category, Layout, ParserMapping
from .serializers import CategorySerializer

logger = logging.getLogger(__name__)


class ErrorListingMixin:
    """Builds JSON objects with error listings as expected by front-end."""

    def send_error_response(self, category, summary, status=None, detail=None):
        """
        On errors not from edd.load.exceptions, send ad-hoc error response.

        :param category: user-facing category of the error, a "headline"
        :param summary: summary text of the error, a "lede"
        :param status: an HTTP response code to return, defaults to HTTP 500
        :param detail: a string or list of strings with details on individual
            occurrences of an error (optional)
        :returns: a JsonResponse to send to the client
        """
        if status is None:
            status = codes.internal_server_error
        payload = {
            "errors": [
                {
                    "category": category,
                    "summary": summary,
                    "detail": detail,
                    "resolution": "",
                    "doc_url": "",
                }
            ]
        }
        return JsonResponse(payload, encoder=JSONEncoder, status=status)

    def send_exception_response(self, exc_info):
        """
        Builds an error response from an edd.load.exceptions MessagingMixin Exception.

        :param exc_info: the exception with reporting error information
        :param status: an HTTP response code to return, defaults to HTTP 500
        :returns: a JsonResponse to send to the client
        """
        payload = {
            "errors": [
                {
                    "category": exc_info.category,
                    "summary": exc_info.summary,
                    "detail": exc_info.details,
                    "resolution": exc_info.resolution,
                    "doc_url": exc_info.docs_link,
                }
            ]
        }
        return JsonResponse(
            payload, encoder=JSONEncoder, status=codes.internal_server_error
        )


class CategoriesViewSet(viewsets.ReadOnlyModelViewSet):
    """
    View for getting Categories and related content for display in the UI.

    This REST-based implementation roughly approximates the result of a likely
    eventual GraphQL query result (but with less short-term effort)
    """

    permission_classes = [IsAuthenticated]
    serializer_class = CategorySerializer
    queryset = Category.objects.order_by("sort_key")

    def get_queryset(self):
        layouts_sorted = Layout.objects.order_by("categorylayout__sort_key")
        parsers_sorted = ParserMapping.objects.order_by("mime_type")
        protocol_sorted = Protocol.objects.filter(active=True).order_by("name")
        prefetch_layout = Prefetch("layouts", queryset=layouts_sorted)
        prefetch_mapping = Prefetch("layouts__parsers", queryset=parsers_sorted)
        prefetch_protocol = Prefetch("protocols", queryset=protocol_sorted)
        # build the main queryset
        return Category.objects.prefetch_related(
            prefetch_layout, prefetch_mapping, prefetch_protocol
        ).order_by("sort_key")


class LoadRequestViewSet(ErrorListingMixin, viewsets.ViewSet):
    parsers = [parsers.JSONParser, parsers.MultiPartParser]

    def create(self, request, study_pk=None):
        forbidden = self._check_study_access(request, study_pk)
        if forbidden is not None:
            return forbidden
        self._check_post_params(request)
        try:
            load = LoadRequest.from_rest(self.study, request.data)
            load.store()
            if load.path:
                self._schedule_task(load, request)
            url = reverse("rest:study_load-detail", args=[study_pk, load.request])
            return JsonResponse({"uploadUrl": url, "uuid": load.request})
        except EDDImportError as e:
            return self.send_exception_response(e)
        except Exception as e:
            return self.send_error_response(
                _("Error"), _("An unexpected error occurred"), detail=str(e)
            )

    def partial_update(self, request, study_pk=None, pk=None):
        forbidden = self._check_study_access(request, study_pk)
        if forbidden is not None:
            return forbidden
        try:
            load = LoadRequest.fetch(pk)
            bad = self._verify_update_status(load)
            if bad:
                return bad
            load.update(request.data)
            if load.path:
                self._schedule_task(load, request)
            return JsonResponse({}, status=codes.accepted)
        except InvalidLoadRequestError:
            return self.send_error_response(
                _("Not Found"),
                _("A request matching {uuid} was not found."),
                status=codes.not_found,
            )
        except EDDImportError as e:
            logger.exception("error in upload", e)
            return self.send_exception_response(e)
        except Exception as e:
            logger.exception("unexpected error in upload", e)
            return self.send_error_response(
                _("Error"), _("An unexpected error occurred"), detail=str(e)
            )

    def destroy(self, request, study_pk=None, pk=None):
        forbidden = self._check_study_access(request, study_pk)
        if forbidden is not None:
            return forbidden
        try:
            load = LoadRequest.fetch(pk)
            load.retire()
            return JsonResponse({}, status=codes.ok)
        except InvalidLoadRequestError:
            return self.send_error_response(
                _("Not Found"),
                _("A request matching {uuid} was not found."),
                status=codes.not_found,
            )
        except EDDImportError as e:
            return self.send_exception_response(e)
        except Exception as e:
            return self.send_error_response(
                _("Error"), _("An unexpected error occurred"), detail=str(e)
            )

    def _check_study_access(self, request, study_pk):
        access = Study.access_filter(request.user, StudyPermission.WRITE)
        writeable_studies = Study.objects.filter(access).distinct()
        try:
            self.study = writeable_studies.get(pk=study_pk)
        except Study.DoesNotExist:
            return self.send_error_response(
                _("Not Allowed"),
                _("You do not have permissions to modify this Study."),
                status=codes.forbidden,
            )

    def _check_post_params(self, request):
        missing = {"category", "layout", "protocol"} - request.data.keys()
        if missing:
            raise DRFParseError(
                f"Missing required parameters: {missing}", code=codes.bad_request
            )

    def _schedule_task(self, load, request):
        layout = request.data["layout"]
        category = request.data["category"]
        target = request.data.get("status", None)
        tasks.wizard_parse_and_resolve.delay(
            load.request, request.user.pk, layout, category, target
        )

    def _verify_update_status(self, load):
        if load.study_uuid != str(self.study.uuid):
            return self.send_error_response(
                _("Invalid request"),
                _(
                    "A data loading operation cannot be accessed "
                    "through a different study"
                ),
                status=codes.bad_request,
            )
        if load.status == LoadRequest.Status.PROCESSING:
            return self.send_error_response(
                _("Invalid state"),
                _(
                    "Changes are not permitted while loaded is processing. "
                    "Wait until processing is complete."
                ),
                status=codes.bad_request,
            )
        if load.status == LoadRequest.Status.COMPLETED:
            return self.send_error_response(
                _("Invalid state"),
                _(
                    "Modifications are not allowed once loaded data "
                    "reaches the {status} state"
                ).format(status=str(load.status)),
                status=codes.bad_request,
            )
