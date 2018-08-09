# coding: utf-8
import json
import logging

from celery import chain
from django.core.exceptions import ObjectDoesNotExist
from django.db.models import Prefetch
from django_filters import filters as django_filters
from django.http import JsonResponse
from requests import codes
from rest_framework.parsers import JSONParser, MultiPartParser
from rest_framework.permissions import IsAuthenticated
from rest_framework import mixins, viewsets

from .serializers import FileImportSerializer, ImportCategorySerializer
from ..importer.table import ImportFileHandler
from ..models import Import, ImportCategory, ImportFormat
from ..tasks import mark_import_complete, mark_import_failed, mark_import_processing
from ..utilities import EDDImportError
from main.tasks import import_table_task
from edd.rest.views import EDDObjectFilter, StudyInternalsFilterMixin
from edd_file_importer import models
from main.importer.table import ImportBroker


logger = logging.getLogger(__name__)


class ImportFilter(EDDObjectFilter):
    file_format = line = django_filters.ModelChoiceFilter(
        name='import__file_format',
        queryset=models.ImportFormat.objects.all()
    )

    class Meta:
        model = models.Import
        fields = {
            'study': ['exact', 'in'],
            'protocol': ['exact', 'in'],
            'category': ['exact', 'in'],
            'status': ['exact', 'in'],
            'file_format': ['exact', 'in']
        }


# TODO: enforce user write permissions
class ImportFilterMixin(StudyInternalsFilterMixin):
    filter_class = ImportFilter
    serializer_class = FileImportSerializer
    _filter_joins = ['study']

    def get_queryset(self):
        qs = models.Import.objects.order_by('pk')
        return qs.select_related('created', 'updated')


class BaseImportsViewSet(ImportFilterMixin, viewsets.ReadOnlyModelViewSet):
    permission_classes = [IsAuthenticated]
    serializer_class = FileImportSerializer

    def get_queryset(self):
        return super(BaseImportsViewSet, self).get_queryset().filter(self.get_nested_filter())


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
        base_fields = ['object_ref', 'object_ref__updated', 'object_ref__created']
        ordered_fmts_qs = ImportFormat.objects.select_related(*base_fields)
        ordered_fmts_qs = ordered_fmts_qs.order_by('categoryformat__display_order')
        ordered_fmts_pf = Prefetch('file_formats', queryset=ordered_fmts_qs)

        # build the main queryset
        qs = ImportCategory.objects.all().select_related(*base_fields)
        qs = qs.prefetch_related(ordered_fmts_pf)
        qs = qs.prefetch_related('protocols')  # no defined ordering for protocols
        qs = qs.order_by('display_order')
        return qs


class StudyImportsViewSet(ImportFilterMixin, mixins.CreateModelMixin,
                          mixins.UpdateModelMixin, viewsets.ReadOnlyModelViewSet):
    """
    API endpoint that allows users with study write permission to create, configure, and run a data
    import.
    """
    parsers = (JSONParser, MultiPartParser)  # multipart supports optional single-request upload
    permission_classes = [IsAuthenticated]
    serializer_class = FileImportSerializer

    def get_queryset(self):
        return super(StudyImportsViewSet, self).get_queryset().filter(self.get_nested_filter())

    def create(self, request, *args, **kwargs):

        study_pk = self.kwargs['study_pk']

        try:
            upload_handler = ImportFileHandler(
                    import_id=None,
                    user_pk=request.user.pk,
                    study_pk=study_pk,
                    category_pk=request.data['category'],
                    file_format_pk=request.data['file_format'],
                    protocol_pk=request.data['protocol'],
                    uploaded_file=request.data['file'],
                    compartment=request.data.get('compartment', None),
                    x_units=request.data.get('x_units', None),
                    y_units=request.data.get('y_units', None),
            )
            import_, ui_payload = upload_handler.process_file(reprocessing_file=False)

            # if client requested a status transition, in this case, likely to SUBMITTED, verify
            # that import state is consistent with attempting it
            response = self.attempt_status_transition(import_, request.data.get('status', None),
                                                      ui_payload.get('required_values'))
            if response:
                return response

            return JsonResponse(ui_payload, status=codes.ok, safe=False)

        except KeyError as k:
            logger.exception('Exception processing import upload')
            missing_key = k.args[0]
            return self._build_simple_err_response('Bad request', 'Missing required parameter',
                                                   status=codes.bad_request,
                                                   detail=missing_key)
        except ObjectDoesNotExist:
            logger.exception('Exception processing import upload')
            return JsonResponse({}, status=codes.bad_request)
        except EDDImportError as p:
            # TODO: differentiate more clearly between client & server errors after we've added
            # detail re: which MeasurementType ID lookup errors occurred
            logger.exception('Exception processing import upload')
            return self._build_err_response(p.aggregator, codes.bad_request)
        except RuntimeError as r:
            logger.exception('Exception processing import upload')
            return self._build_simple_err_response(
                'Error',
                'An unexpected error occurred',
                status=codes.internal_server_error,
                detail=r)

    def partial_update(self, request, *args, **kwargs):
        """
        Handles HTTP PATCH requests, e.g. to adjust import parameters during multiple steps of
        the UI wizard.
        """

        user_pk = request.user.pk,
        study_pk = self.kwargs['study_pk'],
        import_pk = self.kwargs['pk']

        try:
            ui_payload = None
            new_upload = 'file' in request.data
            import_ = models.Import.objects.get(pk=import_pk)

            # reject changes if the import is already submitted
            if import_.status in (Import.Status.SUBMITTED, Import.Status.COMPLETED):
                return self._build_simple_err_response('Invalid state',
                                                       'Modifications are not allowed once '
                                                       f'imports reach the {import_.status} state',
                                                       codes.internal_server_error)

            # if file is changed or content needs post-processing, (re)parse and (re)process it
            process_file = new_upload or self._test_context_changed(request, import_)
            if process_file:

                # get the file to parse. it could be one uploaded in an earlier request
                file = request.data.get('file', None)
                if not file:
                    file = models.ImportFile.get(import_id=import_.pk)

                file_processor = ImportFileHandler(
                    import_id=import_.uuid,
                    user_pk=user_pk,
                    study_pk=study_pk,
                    category_pk=request.data.get('category', import_.category),
                    file_format_pk=request.data.get('file_format', import_.file_format),
                    protocol_pk=request.data.get('protocol', import_.protocol),
                    uploaded_file=file,
                    compartment=request.data.get('compartment', import_.compartment),
                    x_units=request.data.get('x_units', None),
                    y_units=request.data.get('y_units', None),
                )
                import_, ui_payload = file_processor.process_file(reprocessing_file=not new_upload)

            # otherwise, save changes and determine any additional missing inputs
            else:
                self._save_context(import_, request)

            # if client requested a status transition, verify it and try to fulfill
            response = self.attempt_status_transition(import_, request.data.get('status', None),
                                                      user_pk)
            if response:
                return response

            # if the file was parsed in an earlier request, e.g. in the first half of Step 3,
            # get cached parse results from Redis & from the EDD database, and return them to
            # the client.  This step requires re-querying EDD's DB for MeasurementTypes,
            # but needs less code and also skips potentially-expensive line/assay lookup and
            # external ID verification
            if not process_file:
                try:
                    ui_payload = self._build_ui_payload_from_cache(import_)
                except EDDImportError as e:
                    return self._build_err_response(e.aggregator, codes.internal_server_error)

            return JsonResponse(ui_payload, status=codes.ok, safe=False)

        # TODO: improve error handling here based on results of testing, esp initial testing of
        # create()
        except Exception as e:
            logger.exception('Exception processing import')
            return self._build_simple_err_response(
                'Error',
                'An unexpected error occurred',
                status=codes.internal_server_error,
                detail=str(e)
            )

    def retrieve(self, request, *args, **kwargs):
        pass   # TODO

    def update(self, request, *args, **kwargs):
        pass  # TODO

    def _save_context(self, import_, request):
        """
        Saves parameters to persistent storage that don't require reprocessing the file, but will
        affect the final stage of the import.  Note we purposefully don't let just anything
        through here, e.g. allowing client to change "study" or "status"
        """
        update_params = [param for param in ('x_units', 'y_units', 'compartment')
                         if param in request.data]
        for param in update_params:
            setattr(import_, param, request.data.get(param))
        import_.save()

        # push the changes to Redis too
        broker = ImportBroker()
        context = json.loads(broker.load_context(import_.uuid))
        for param in update_params:
            context[param] = request.data[param]
        broker.set_context(import_.uuid, json.dumps(context))

    def attempt_status_transition(self, import_, requested_status, user_pk):
        if not requested_status:
            return None

        # if client suggested a status transition, verify that state is correct to perform it
        err_response = self._verify_status_transition(import_, requested_status)
        if err_response:
            return err_response

        if requested_status == Import.Status.SUBMITTED:
            return self._submit_import_task(import_, user_pk)

    def _test_context_changed(self, request, import_):
        """
        Determines if client provided any Step 1 context that requires reprocessing the file,
        do it
        """
        #
        reprocessing_triggers = ('category', 'protocol', 'file_format')

        for key in reprocessing_triggers:
            if key in request.data and request.data[key] != getattr(import_, key):
                return True
        return False

    def _verify_status_transition(self, import_, requested_status):
        if requested_status is None:
            return

        # clients may only directly request a status transition to SUBMITTED...and eventually
        # ABORTED.  Reject all other status change requests.
        if requested_status != Import.Status.SUBMITTED:
            return self._build_simple_err_response(
                'Invalid request',
                'Illegal status transition',
                detail=f'Clients may only request {Import.Status.SUBMITTED} status',
                status=codes.bad_request)

        elif import_.status not in (Import.Status.READY, Import.Status.ABORTED,
                                    Import.Status.FAILED):
            return self._build_simple_err_response(
                'Invalid request',
                'Illegal status transition',
                detail=f'Transition from {import_.status} to {Import.Status.SUBMITTED} is not '
                f'allowed or not yet supported', status=codes.bad_request)

    def _submit_import_task(self, import_, user_pk):
        """
        Schedules a Celery task to do the heavy lifting to finish the import data cached in Redis
        """
        try:
            # first mark the import as submitted to prevent a race condition with the chain of
            # async Celery tasks we're about to submit
            import_.status = Import.Status.SUBMITTED
            import_.save()

            logger.info(f'Submitting import to worker {import_.uuid}')

            # run the legacy import task, layering on updates to import status stored in the
            # database without modifying the legacy code
            # TODO: use when refactoring legacy Celery task, do it all this in a single task and
            # use apply_async() instead to use the import UUID as the task ID (supports
            # cancellation)
            uuid = import_.uuid
            chain(mark_import_processing.si(uuid) |
                  import_table_task.si(import_.study_id, user_pk, uuid).on_error(
                      mark_import_failed.s(uuid)) |
                  mark_import_complete.si(uuid)).delay()

            return JsonResponse({}, status=codes.accepted)
        except import_table_task.OperationalError as e:
            import_.status = Import.Status.FAILED
            import_.save()

            logger.exception('Exception submitting import {existing_import.uuid}')
            return self._build_simple_err_response(
                'Error',
                'An unexpected error occurred',
                status=codes.internal_server_error,
                detail=e.message)

    def _build_err_response(self, aggregator, status=codes.bad_request):
        # flatten errors & warnings into a single list to send to the UI. Each ImportErrorSummary
        # may optionally contain multiple related errors grouped by subcategory
        errs = []
        for err_type_summary in aggregator.errors.values():
            errs.extend(err_type_summary.to_json())

        warns = []
        for warn_type_summary in aggregator.warnings.values():
            warns.extend(warn_type_summary.to_json())

        return JsonResponse({
            'errors': errs,
            'warnings': warns,
        }, status=status)

    def _build_simple_err_response(self, category, summary,
                                   status=codes.internal_server_error,
                                   detail=None):
        return JsonResponse({'errors': [{
            'category': category,
            'summary': summary,
            'detail': detail,
            'resolution': '',
            'doc_url': '',
        }]}, status=status)
