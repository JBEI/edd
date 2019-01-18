# coding: utf-8
import celery
import json
import logging

from django.core.exceptions import ObjectDoesNotExist
from django.db import transaction
from django.db.models import Prefetch
from django_filters import filters as django_filters, rest_framework as filters
from django.http import JsonResponse
from requests import codes
from rest_framework.parsers import JSONParser, MultiPartParser
from rest_framework.permissions import IsAuthenticated
from rest_framework import mixins, viewsets


from .serializers import ImportSerializer, ImportCategorySerializer
from ..models import Import, ImportCategory, ImportFormat, ImportFile
from ..tasks import attempt_status_transition, build_ui_payload_from_cache, process_import_file
from ..utilities import build_err_payload, CommunicationError, EDDImportError
from main.models import Measurement, MeasurementUnit, StudyPermission
from main.views import load_study
from edd.rest.views import StudyInternalsFilterMixin
from edd.utilities import JSONEncoder
from edd_file_importer import models
from main.importer.table import ImportBroker


logger = logging.getLogger(__name__)

_MUTATOR_METHODS = ('POST', 'PUT', 'PATCH', 'DELETE')


# compare with EDDObjectFilter, which is the same except for for the model
class BaseImportModelFilter(filters.FilterSet):
    active = django_filters.BooleanFilter(name='active')
    created_before = django_filters.IsoDateTimeFilter(name='created__mod_time', lookup_expr='lte')
    created_after = django_filters.IsoDateTimeFilter(name='created__mod_time', lookup_expr='gte')
    description = django_filters.CharFilter(name='description', lookup_expr='iregex')
    name = django_filters.CharFilter(name='name', lookup_expr='iregex')
    updated_before = django_filters.IsoDateTimeFilter(name='updated__mod_time', lookup_expr='lte')
    updated_after = django_filters.IsoDateTimeFilter(name='updated__mod_time', lookup_expr='gte')

    class Meta:
        model = models.BaseImportModel
        fields = []


class ImportFilter(BaseImportModelFilter):
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


class BaseImportsViewSet(StudyInternalsFilterMixin, viewsets.ReadOnlyModelViewSet):
    permission_classes = [IsAuthenticated]
    serializer_class = ImportSerializer

    def get_queryset(self):
        return super().get_queryset().filter(self.get_nested_filter())


def _build_simple_err_response(self, category, summary,
                               status=codes.internal_server_error,
                               detail=None):
    payload = {
        'errors': [
            {
                'category': category,
                'summary': summary,
                'detail': detail,
                'resolution': '',
                'doc_url': '',
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


class StudyImportsViewSet(StudyInternalsFilterMixin, mixins.CreateModelMixin,
                          mixins.UpdateModelMixin, mixins.RetrieveModelMixin,
                          mixins.ListModelMixin, viewsets.GenericViewSet):
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
        study_pk = self.kwargs['study_pk']
        load_study(self.request, pk=study_pk, permission_type=StudyPermission.CAN_EDIT)

        try:
            # if minimal inputs are provided, cache the input in the database
            import_ = self._save_new_import(request, study_pk)

            # submit a task to process it
            process_import_file.delay(import_.pk,
                                      request.user.pk,
                                      request.data.get('status',  None),
                                      initial_upload=True)

            # return identifiers the clients (esp UI) can use to monitor progress
            payload = {
                'uuid': import_.uuid,
                'pk': import_.pk
            }
            return JsonResponse(payload, status=codes.accepted, safe=False)

        except KeyError as k:
            logger.exception('Exception processing import upload')
            missing_key = k.args[0]
            return _build_simple_err_response('Bad request', 'Missing required parameter',
                                              status=codes.bad_request,
                                              detail=missing_key)
        except ObjectDoesNotExist as o:
            logger.exception('Exception processing import upload')
            return _build_simple_err_response(
                'Bad request',
                'Referenced a non-existent object',
                status=codes.bad_request,
                detail=str(o))
        except RuntimeError as r:
            logger.exception('Exception processing import upload')
            return _build_simple_err_response(
                'Error',
                'An unexpected error occurred',
                status=codes.internal_server_error,
                detail=str(r))

    def partial_update(self, request, *args, **kwargs):
        """
        Handles HTTP PATCH requests, e.g. to adjust import parameters during multiple steps of
        the UI wizard.
        """

        user_pk = request.user.pk
        study_pk = self.kwargs['study_pk']
        import_pk = self.kwargs['pk']

        # enforce study permissions...note that ImportFilterMixin.filter_queryset() isn't called
        # for partial_update()
        load_study(self.request, pk=study_pk, permission_type=StudyPermission.CAN_EDIT)

        try:
            re_upload = 'file' in request.data
            import_ = models.Import.objects.get(pk=import_pk)

            # reject changes if the import is processing or already submitted
            response = self._verify_update_status(import_)
            if response:
                return response

            # if file is changed or content needs post-processing, (re)parse and (re)process it
            response = self._reprocess_file(import_, request, re_upload, user_pk)
            if response:
                return response

            # otherwise, save changes and determine any additional missing inputs
            self._save_context(import_, request, study_pk, import_pk, user_pk)

            # if client requested a status transition, verify it and try to fulfill.
            # raises EddImportError if unable to fulfill a request
            requested_status = request.data.get('status', None)
            if requested_status:
                attempt_status_transition(import_, requested_status,
                                          self.request.user, async_=True)
                return JsonResponse({}, status=codes.accepted)

            # if the file was parsed in an earlier request, e.g. in the first half of Step 3,
            # get cached parse results from Redis & from the EDD database, and return them to
            # the client.  This step requires re-querying EDD's DB for MeasurementTypes,
            # but needs less code and also skips potentially-expensive line/assay lookup and
            # external ID verification
            logger.debug('Building UI payload from cache')
            build_ui_payload_from_cache.delay(import_, user_pk)
            return JsonResponse({}, status=codes.accepted)

        except ObjectDoesNotExist as o:
            logger.exception('Exception processing import upload')
            return _build_simple_err_response(
                'Bad request',
                'Referenced a non-existent object',
                status=codes.bad_request,
                detail=o)
        except EDDImportError as e:
            logger.exception('Exception processing import upload')
            payload = build_err_payload(e.aggregator, import_)
            return JsonResponse(payload, encoder=JSONEncoder, status=codes.bad_request)
        except (celery.exceptions.OperationalError, CommunicationError, RuntimeError) as r:
            logger.exception('Exception processing import upload')
            return _build_simple_err_response(
                'Error',
                'An unexpected error occurred',
                status=codes.internal_server_error,
                detail=r)

    def _verify_update_status(self, import_):
        if import_.status == Import.Status.PROCESSING:
            msg = ('Changes are not permitted while the import is processing.  Wait until'
                   'processing is complete.')
        elif import_.status in (Import.Status.SUBMITTED, Import.Status.COMPLETED):
            msg = 'Modifications are not allowed once imports reach the {import_.status} state'
        else:
            return None

        return _build_simple_err_response('Invalid state', msg, codes.bad_request)

    def _reprocess_file(self, import_, request, reupload, user_pk):
        process_file = reupload or self._test_context_changed(request, import_)

        if not process_file:
            return None

        import_ = self._update_import_and_file(import_, request, reupload)

        # schedule a task to process the file, and submit the import if requested
        process_import_file.delay(import_.pk, user_pk, request.data.get('status', None),
                                  initial_upload=False)
        ui_payload = {
            'uuid': import_.uuid,
            'pk': import_.pk,
            'status': import_.status
        }
        return JsonResponse(ui_payload, encoder=JSONEncoder, status=codes.accepted, safe=False)

    def _update_import_and_file(self, import_, request, reupload):
        """
        Replaces an existing import and file from request parameters
        :raises KeyError
        """
        with transaction.atomic():
            # update all parameters from the request. Since this is a re-upload,
            # and essentially the same as creating a new import, we'll allow
            # redefinition of any user-editable parameter
            import_context = {
                'status': Import.Status.CREATED,
                'category_id': request.data.get('category', import_.category_id),
                'file_format_id': request.data.get('file_format', import_.file_format_id),
                'protocol_id': request.data.get('protocol', import_.protocol.pk),
                'compartment': request.data.get('compartment', import_.compartment),
                'x_units_id': request.data.get('x_units', import_.x_units_id),
                'y_units_id': request.data.get('y_units', import_.y_units_id),
            }

            # get the file to parse. it could be one uploaded in an earlier request
            old_file = None
            if reupload:
                file = ImportFile.objects.create(file=request.data['file'])
                import_context['file_id'] = file.pk
                old_file = import_.file
            import_, created = Import.objects.update_or_create(uuid=import_.uuid,
                                                               defaults=import_context)

            # remove the old file after the reference to it is replaced
            if old_file:
                logger.debug(f'Deleting file {old_file}')
                old_file.delete()
        return import_

    def _save_new_import(self, request, study_pk):
        # grab request parameters, causing a KeyError for any minimally required params
        # missing in the request.
        file = request.data['file']
        time_units_pk = MeasurementUnit.objects.filter(unit_name='hours').values_list(
            'pk', flat=True).get()

        import_context = {
            'uuid': request.data['uuid'],
            'study_id': study_pk,
            'category_id': request.data['category'],
            'protocol_id': request.data['protocol'],
            'file_format_id': request.data['file_format'],
            'status': Import.Status.CREATED,
            'x_units_id': request.data.get('x_units', time_units_pk),
            'y_units_id': request.data.get('y_units', None),
            'compartment': request.data.get('compartment', Measurement.Compartment.UNKNOWN),
        }

        # save user inputs to the database for hand off to a Celery worker
        with transaction.atomic():
            file_model = ImportFile.objects.create(file=file)
            import_context['file_id'] = file_model.pk
            import_ = Import.objects.create(**import_context)

        return import_

    def retrieve(self, request, *args, **kwargs):
        pass   # TODO

    def update(self, request, *args, **kwargs):
        self.partial_update(request, args, kwargs)

    def _save_context(self, import_, request, study_pk, import_pk, user_pk):
        """
        Saves parameters to persistent storage that don't require reprocessing the file, but will
        affect the final stage of the import.  Note we purposefully don't let just anything
        through here, e.g. allowing client to change "study" or "status".
        """
        logger.info(f'Updating import context for study {study_pk}, import {import_pk}, '
                    f'user {user_pk}')
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
