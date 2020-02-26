import json
import logging

from celery.exceptions import OperationalError
from django.core.exceptions import ObjectDoesNotExist
from django.db import transaction
from django.db.models import Prefetch
from django.http import Http404, JsonResponse
from django.utils.translation import ugettext_lazy as _
from django_filters import filters as django_filters
from django_filters import rest_framework as filters
from requests import codes
from rest_framework import mixins, viewsets
from rest_framework.exceptions import ParseError as RequestParseError
from rest_framework.parsers import JSONParser, MultiPartParser
from rest_framework.permissions import IsAuthenticated

from edd.load.broker import ImportBroker
from edd.rest.views import StudyInternalsFilterMixin
from edd.utilities import JSONEncoder
from main.models import Measurement, MeasurementUnit, Study, StudyPermission

# TODO: models already imported as module,
# use module instead of individual class imports below
from .. import models
from ..exceptions import EDDImportError
from ..models import Import, ImportCategory, ImportFile, ImportFormat, ImportParser
from ..notify.backend import ImportWsBroker
from ..tasks import attempt_status_transition, process_import_file
from ..utilities import build_ui_payload, update_import_status
from .serializers import ImportCategorySerializer, ImportSerializer

logger = logging.getLogger(__name__)

_MUTATOR_METHODS = ("POST", "PUT", "PATCH", "DELETE")


# compare with EDDObjectFilter, which is the same except for the model
class BaseImportModelFilter(filters.FilterSet):
    active = django_filters.BooleanFilter(name="active")
    created_before = django_filters.IsoDateTimeFilter(
        name="created__mod_time", lookup_expr="lte"
    )
    created_after = django_filters.IsoDateTimeFilter(
        name="created__mod_time", lookup_expr="gte"
    )
    description = django_filters.CharFilter(name="description", lookup_expr="iregex")
    name = django_filters.CharFilter(name="name", lookup_expr="iregex")
    updated_before = django_filters.IsoDateTimeFilter(
        name="updated__mod_time", lookup_expr="lte"
    )
    updated_after = django_filters.IsoDateTimeFilter(
        name="updated__mod_time", lookup_expr="gte"
    )

    class Meta:
        model = models.BaseImportModel
        fields = []


class ImportFilter(BaseImportModelFilter):
    file_format = line = django_filters.ModelChoiceFilter(
        name="import__file_format", queryset=models.ImportFormat.objects.all()
    )

    class Meta:
        model = models.Import
        fields = {
            "study": ["exact", "in"],
            "protocol": ["exact", "in"],
            "category": ["exact", "in"],
            "status": ["exact", "in"],
            "file_format": ["exact", "in"],
        }


class BaseImportsViewSet(StudyInternalsFilterMixin, viewsets.ReadOnlyModelViewSet):
    permission_classes = [IsAuthenticated]
    serializer_class = ImportSerializer

    def get_queryset(self):
        return super().get_queryset().filter(self.get_nested_filter())


def _build_simple_err_response(
    category, summary, status=codes.internal_server_error, detail=None
):
    payload = {
        "errors": [
            {
                "category": category,
                "summary": summary,
                "detail": detail,
                # TODO: make these options
                "resolution": "",
                "doc_url": "",
            }
        ]
    }
    return JsonResponse(payload, encoder=JSONEncoder, status=status)


class ImportCategoriesViewSet(viewsets.ReadOnlyModelViewSet):
    """
    View for getting ImportCategories and related content for display in the UI.  This REST-based
    implementation roughly approximates the result of a likely eventual GraphQL query result (but
    with less short-term effort)
    """

    permission_classes = [IsAuthenticated]
    serializer_class = ImportCategorySerializer
    queryset = ImportCategory.objects.all()

    def get_queryset(self):
        # build a Prefetch object that allows us to sort returned ImportFormats in the defined
        # display_order for each ImportCategory. We'll also throw in a few select_related calls
        # in a first-pass attempt to reduce # queries.
        base_fields = ["object_ref", "object_ref__updated", "object_ref__created"]
        ordered_fmts_qs = ImportFormat.objects.select_related(*base_fields)
        ordered_fmts_qs = ordered_fmts_qs.order_by("categoryformat__display_order")
        ordered_fmts_pf = Prefetch("file_formats", queryset=ordered_fmts_qs)

        ordered_parsers_qs = ImportParser.objects.order_by("mime_type")
        ordered_parsers_pf = Prefetch(
            "file_formats__parsers", queryset=ordered_parsers_qs
        )

        # build the main queryset
        qs = ImportCategory.objects.all().select_related(*base_fields)
        qs = qs.prefetch_related(ordered_fmts_pf)
        qs = qs.prefetch_related(ordered_parsers_pf)
        qs = qs.prefetch_related("protocols")  # no defined ordering for protocols
        qs = qs.order_by("display_order")
        return qs


class StudyImportsViewSet(
    StudyInternalsFilterMixin,
    mixins.CreateModelMixin,
    mixins.UpdateModelMixin,
    mixins.RetrieveModelMixin,
    mixins.ListModelMixin,
    viewsets.GenericViewSet,
):
    """
    API endpoint that allows users with study write permission to create, configure, and run a data
    import.
    """

    parsers = (JSONParser, MultiPartParser)  # multipart supports single-request upload
    permission_classes = [IsAuthenticated]
    serializer_class = ImportSerializer
    queryset = None

    def get_queryset(self):
        return super().get_queryset().filter(self.get_nested_filter())

    def create(self, request, *args, **kwargs):

        # enforce study permissions...note that ImportFilterMixin.filter_queryset() isn't called
        # for create()
        study_pk = self.kwargs["study_pk"]
        access = Study.access_filter(request.user, StudyPermission.WRITE)
        import_ = None

        if not Study.objects.filter(access, pk=study_pk).exists():
            raise Http404()

        try:
            # if minimal inputs are provided, cache the input in the database
            import_ = self._save_new_import(request, study_pk)

            # if file was included, submit a task to process it (raises OperationalError)
            if import_.file:
                process_import_file.delay(
                    import_.pk,
                    request.user.pk,
                    request.data.get("status", None),
                    initial_upload=True,
                )

            # return identifiers the clients (esp UI) can use to monitor progress
            payload = {"uuid": import_.uuid, "pk": import_.pk}
            status = codes.accepted if import_.file else codes.ok
            return JsonResponse(payload, status=status, safe=False)

        except (OperationalError, RuntimeError) as r:
            logger.exception("Exception processing import upload")
            return _build_simple_err_response(
                "Error",
                "An unexpected error occurred",
                status=codes.internal_server_error,
                detail=str(r),
            )

    def partial_update(self, request, *args, **kwargs):
        """
        Handles HTTP PATCH requests, e.g. to adjust import parameters during multiple steps of
        the UI wizard.
        """

        user = request.user
        study_pk = self.kwargs["study_pk"]
        import_pk = self.kwargs["pk"]
        import_ = None

        # enforce study permissions...note that ImportFilterMixin.filter_queryset() isn't called
        # for partial_update()
        access = Study.access_filter(request.user, StudyPermission.WRITE)
        if not Study.objects.filter(pk=study_pk).filter(access).exists():
            raise Http404()

        try:
            re_upload = "file" in request.data
            import_ = models.Import.objects.get(pk=import_pk)

            # reject changes if the import is processing or already submitted
            response = self._verify_update_status(import_)
            if response:
                return response

            # if file is new, or content needs post-processing, schedule (re)parse and
            # (re)processing it
            response = self._reprocess_file(import_, request, re_upload, user)
            if response:
                return response

            # otherwise, save changes and determine any additional missing inputs
            logger.info(
                f"Updating import for study {study_pk}, import {import_pk}, user "
                f"{request.user.pk}"
            )
            params = self._build_import_update_dict(import_, request)
            import_, _ = Import.objects.update_or_create(pk=import_.pk, defaults=params)

            # if client requested a status transition, verify it and try to fulfill.
            # raises EddImportError if unable to fulfill a request
            requested_status = request.data.get("status", None)
            if requested_status:
                # load cached parse / resolution results from redis, and attempt status transition
                # if it's allowed
                redis = ImportBroker()
                raw_context_str = redis.load_context(import_.uuid)
                context = json.loads(raw_context_str) if raw_context_str else {}
                attempt_status_transition(
                    import_,
                    context,
                    requested_status,
                    self.request.user,
                    run_async=True,
                )
            return JsonResponse({}, status=codes.accepted)

        except ObjectDoesNotExist as o:
            logger.exception("Exception processing import upload")
            return _build_simple_err_response(
                "Bad request",
                "Referenced a non-existent object",
                status=codes.bad_request,
                detail=o,
            )
        except EDDImportError:
            logger.exception("Exception processing import")
            payload = build_ui_payload(import_)
            return JsonResponse(payload, encoder=JSONEncoder, status=codes.bad_request)
        except (OperationalError, RuntimeError) as r:
            logger.exception("Exception processing import")
            return _build_simple_err_response(
                "Error",
                "An unexpected error occurred",
                status=codes.internal_server_error,
                detail=r,
            )

    def _verify_update_status(self, import_):
        if import_.status == Import.Status.PROCESSING:
            msg = _(
                "Changes are not permitted while the import is processing.  Wait until"
                "processing is complete."
            )
        elif import_.status in (Import.Status.SUBMITTED, Import.Status.COMPLETED):
            msg = _(
                "Modifications are not allowed once imports reach the {status} state"
            ).format(status=import_.status)
        else:
            return None

        return _build_simple_err_response("Invalid state", msg, codes.bad_request)

    def _reprocess_file(self, import_, request, reupload, user):
        reprocess_file = reupload or self._file_reprocessing_triggered(request, import_)

        if not reprocess_file:
            return None

        import_ = self._update_import_and_file(import_, request, reupload)

        if import_.file:
            # schedule a task to process the file, and submit the import if requested
            process_import_file.delay(
                import_.pk,
                user.pk,
                request.data.get("status", None),
                initial_upload=False,
            )
        ui_payload = {"uuid": import_.uuid, "pk": import_.pk, "status": import_.status}
        status = codes.accepted if import_.file else codes.ok
        return JsonResponse(ui_payload, encoder=JSONEncoder, status=status, safe=False)

    def _update_import_and_file(self, import_, request, reupload):
        """
        Atomically updates both an existing import and file from request parameters
        """
        # update all parameters from the request. Since this may be a re-upload,
        # and essentially the same as creating a new import, we'll allow
        # redefinition of any client-editable parameter
        params = self._build_import_update_dict(import_, request)
        params["status"] = Import.Status.CREATED

        with transaction.atomic():
            # get the file to parse. it could be one uploaded in an earlier request
            old_file = None
            if reupload:
                file = ImportFile.objects.create(file=request.data["file"])
                params["file_id"] = file.pk
                old_file = import_.file
            import_, created = Import.objects.update_or_create(
                pk=import_.pk, defaults=params
            )

            # remove the old file after the reference to it is replaced
            if old_file:
                logger.debug(f"Deleting file {old_file}")
                old_file.delete()

        # remove any (now moot) intermediate results from the earlier file
        broker = ImportBroker()
        broker.clear_context(import_.uuid)
        broker.clear_pages(import_.uuid)

        # notify any WS listeners that this import has transitioned back to CREATED status
        user = request.user
        update_import_status(import_, import_.status, user, ImportWsBroker(user))

        return import_

    def _save_new_import(self, request, study_pk):
        """
        Extract request parameters and use them to save import to the database
        :raises: rest_framework.exceptions.ParseError if any of the minimally required
        parameters are missing from the request. This results in a nice client-side error message
        """
        missing_params = ", ".join(
            [
                f"'{param}'"
                for param in ("category", "file_format", "protocol")
                if param not in request.data
            ]
        )
        if missing_params:
            raise RequestParseError(
                f"Missing required parameters: {missing_params}", code=codes.bad_request
            )
        file = request.data.get("file")

        # get the built-in "hours" unit , which is baked in via bootstrap.json
        time_units_pk = (
            MeasurementUnit.objects.filter(unit_name="hours")
            .values_list("pk", flat=True)
            .get()
        )

        params = {
            "study_id": study_pk,
            "category_id": request.data["category"],
            "protocol_id": request.data["protocol"],
            "file_format_id": request.data["file_format"],
            "status": Import.Status.CREATED,
            "x_units_id": request.data.get("x_units", time_units_pk),
            "y_units_id": request.data.get("y_units", None),
            "compartment": request.data.get(
                "compartment", Measurement.Compartment.UNKNOWN
            ),
            "email_when_complete": request.data.get("email_when_complete", False),
            "allow_overwrite": request.data.get("allow_overwrite", False),
            "allow_duplication": request.data.get("allow_duplication", False),
        }

        # save user inputs to the database for hand off to a Celery worker
        with transaction.atomic():
            if file:
                file_model = ImportFile.objects.create(file=file)
                params["file_id"] = file_model.pk
            import_ = Import.objects.create(**params)

        # notify any listeners (e.g. an eventual import status page) about the newly-created import
        user = request.user
        update_import_status(import_, import_.status, user, ImportWsBroker(user))

        return import_

    def retrieve(self, request, *args, **kwargs):
        pass  # TODO

    def update(self, request, *args, **kwargs):
        self.partial_update(request, args, kwargs)

    def _build_import_update_dict(self, import_, request):
        return {
            "allow_duplication": self._parse_bool_param(
                import_, request, "allow_duplication"
            ),
            "allow_overwrite": self._parse_bool_param(
                import_, request, "allow_overwrite"
            ),
            "category_id": request.data.get("category", import_.category_id),
            "email_when_complete": self._parse_bool_param(
                import_, request, "email_when_complete"
            ),
            "file_format_id": request.data.get("file_format", import_.file_format_id),
            "protocol_id": request.data.get("protocol", import_.protocol.pk),
            "compartment": request.data.get("compartment", import_.compartment),
            "x_units_id": request.data.get("x_units", import_.x_units_id),
            "y_units_id": request.data.get("y_units", import_.y_units_id),
        }

    def _parse_bool_param(self, import_, request, name):
        val = request.data.get(name, None)
        if val is None:
            return getattr(import_, name)
        return val if isinstance(val, bool) else val == "true"

    def _file_reprocessing_triggered(self, request, import_):
        """
        Tests whether client provided any Step 1 context that requires reprocessing the file
        """

        # return early if file isn't uploaded yet
        if not import_.file:
            return False

        reprocessing_triggers = ("category", "protocol", "file_format")

        for key in reprocessing_triggers:
            if key in request.data and request.data[key] != getattr(import_, key):
                return True

        requested_status = request.data.get("status", None)

        # TODO: as a future optimization, track the furthest state the import has successfully
        # reached since the last upload.  If it's READY/RESOLVED, we can skip potentially expensive
        # internal / external ID lookups in this step.
        if (
            requested_status
            in (Import.Status.RESOLVED, Import.Status.READY, Import.Status.SUBMITTED)
            and import_.status == Import.Status.FAILED
        ):
            return True
        return False
