# coding: utf-8
import json

import celery
from celery import shared_task
from celery.result import allow_join_result
from celery.utils.log import get_task_logger
from django.contrib.auth import get_user_model
from django.core.exceptions import ObjectDoesNotExist
from django.urls import reverse
from django.utils.translation import ugettext_lazy as _

from .codes import FileProcessingCodes as err_codes
from .importer.table import ImportFileHandler
from .models import Import
from .utilities import (build_err_payload, build_summary_json, compute_required_context,
                        EDDImportError, ErrorAggregator, MTYPE_GROUP_TO_CLASS,
                        verify_assay_times)
from edd.notify.backend import RedisBroker
from main.importer.table import ImportBroker
from main.models import MeasurementUnit, MetadataType
from main.tasks import import_table_task


logger = get_task_logger(__name__)


@shared_task
def update_import_status(status, import_uuid, user_pk, notify=None):
    """
        A simple task whose job is to update an import's status and send a related user
        notification
    """
    logger.info(f'Updating import status to {status} for {import_uuid}')
    User = get_user_model()
    user = User.objects.get(pk=user_pk)
    logger.debug(f"Marking import {user.username}'s, {import_uuid} as {status}")
    import_ = Import.objects.filter(uuid=import_uuid).select_related('file').get()
    import_.status = status
    import_.save()

    # send an async notification of the status update
    if not notify:
        notify = RedisBroker(user)
    file_name = import_.file.file.name
    msg = 'Your import for file "{file_name}" is {status}'.format(file_name=file_name,
                                                                  status=status.lower())
    notify.notify(msg,
                  tags=['import-status-update'],
                  payload={
                      'status': status,
                      'uuid': import_uuid,
                      'pk': import_.pk
                  })


@shared_task
def process_import_file(import_pk, user_pk, requested_status, initial_upload):
    """
    The back end Celery task supporting import Step 2, "Upload", and also single-request
    imports made via the REST API.  Parses and verifies the file format and content,
    then proceeds to additional phases if requested / allowed.
    This includes verifying identifiers with external databases (e.g. PubChem, UnipProt).
    """
    import_ = None
    notify = None
    handler = None
    try:
        fetch_fields = ('category', 'file', 'file_format', 'protocol', 'study', 'x_units',
                        'y_units')
        import_ = Import.objects.filter(pk=import_pk).select_related(*fetch_fields).get()
        User = get_user_model()
        user = User.objects.get(pk=user_pk)
        notify = RedisBroker(user)

        # process the file, sending notifications along the way. Raises EDDImportError.
        handler = ImportFileHandler(notify, import_, user)
        handler.process_file(initial_upload)

        # if client requested a status transition, likely to SUBMITTED, verify
        # that import state is consistent with attempting it. Raises EDDImportError.
        attempt_status_transition(import_, requested_status, user, notify=notify, run_async=False,
                                  aggregator=handler)

    except (EDDImportError, ObjectDoesNotExist, RuntimeError) as e:
        file_name = import_.file.filename if import_ else ''
        study_url = (reverse('main:overview', kwargs={'slug': import_.study.slug}) if import_
                     else '')
        logger.exception(f'Exception processing import upload for file "{file_name}".  '
                         f'Study is {study_url}')
        if import_:
            import_.status = Import.Status.FAILED
            import_.save()

            # add this error to the list if it's not one detected by the import code
            if not isinstance(e, EDDImportError):
                handler.add_error(err_codes.UNEXPECTED_ERROR, occurrence=str(e))

            # build a payload including any earlier errors
            payload = build_err_payload(handler, import_) if handler else {}

            if notify:
                msg = 'Processing for your import file "{file_name}" has failed'.format(
                            file_name=file_name)
                notify.notify(msg,
                              tags=['import-status-update'], payload=payload)

        # if this was a predicted error encountered during normal processing, the task has
        # succeeded...also Celery will have trouble serializing the Exception
        if isinstance(e, EDDImportError):
            logger.info('Predicted error during import processing')
            return

        raise e


def attempt_status_transition(import_, requested_status, user, run_async, notify=None,
                              aggregator=None):
    """
    Attempts a status transition to the client-requested status.  Does nothing if no status
    transition is requested, raises an EDDImportError if import status doesn't match the
    requested transition, or schedules a Celery task to finilize the import.

    :param run_async True to attempt the import asynchronously in a separate Celery task,
        or False to run it synchronously.
    :raises EDDImportError if the import isn't in the correct state to fulfill the requested
        state transition
    :raises celery.exceptions.OperationalError if an error occurred while submitting the Celery
        task to finalize the import
    """
    if not aggregator:
        aggregator = ErrorAggregator()

    # if client requested a status transition, verify that state is correct to perform it
    _verify_status_transition(aggregator, import_, requested_status, user, notify)

    if requested_status == Import.Status.SUBMITTED:
        submit_import(import_, user.pk, aggregator, notify, run_async)


def _verify_status_transition(aggregator, import_, requested_status, user, notify):
    if requested_status is None:
        return

    # clients may only directly request a status transition to SUBMITTED...and eventually
    # ABORTED.  Reject all other status change requests.
    if requested_status != Import.Status.SUBMITTED:
        msg = f'Clients may not request transition to {requested_status}.'
        return aggregator.raise_error(err_codes.ILLEGAL_STATE_TRANSITION,
                                      occurrence=msg)

    elif import_.status not in (Import.Status.READY, Import.Status.ABORTED,
                                Import.Status.FAILED):
        msg = (f'Transition from {import_.status} to {Import.Status.SUBMITTED} is not allowed or '
               f'not yet supported')
        return aggregator.raise_error(err_codes.ILLEGAL_STATE_TRANSITION, occurrence=msg)


def submit_import(import_, user_pk, aggregator, notify, run_async):
    """
    Schedules a Celery task to do the heavy lifting to finish the import data cached in Redis
    """
    try:
        # use the celery task code to mark the import SUBMITTED, but run it synchronously
        # here so import status gets updated before any remote tasks are launched
        update_import_status(Import.Status.SUBMITTED, import_.uuid, user_pk, notify)

        # build up signatures for tasks to be executed in a chain
        uuid = import_.uuid
        notify = None  # avoid multiple redis connections for synch
        mark_import_processing = update_import_status.si(Import.Status.PROCESSING, uuid,
                                                         user_pk)
        mark_import_complete = update_import_status.si(Import.Status.COMPLETED, uuid,
                                                       user_pk)
        mark_import_failed = update_import_status.si(Import.Status.FAILED, uuid,
                                                     user_pk)
        do_import = import_table_task.si(import_.study_id, user_pk, uuid)

        # layer new tasks on to update the import 2.0 DB status & publish notifications while
        # using the legacy Celery task to do the heavy lifting for the import itself
        chain = celery.chain(mark_import_processing |
                             do_import.on_error(mark_import_failed) |
                             mark_import_complete)

        # run the tasks, either synchronously or asynchronously
        if run_async:
            chain.delay()
        else:
            # disable celery's check on calling tasks synchronously from other tasks...we aren't
            # launching one and then waiting for it, we're running in the same worker.
            with allow_join_result():
                # don't throw exceptions generated by the task. User notifications are already
                # handled there
                chain.apply(throw=False)

    except celery.exceptions.OperationalError as e:
        import_.status = Import.Status.FAILED
        import_.save()
        logger.exception(f'Exception submitting import {import_.uuid}')
        aggregator.raise_error(err_codes.COMMUNICATION_ERROR, occurrence=str(e))


@shared_task
def build_ui_payload_from_cache(import_pk, user_pk):
    """
    Loads existing import records from Redis cache and parses them in lieu of re-parsing the
    file and re-resolving string-based line/assay/MeasurementType identifiers from the
    uploaded file.  This method supports the transition from Step 3 -> Step 4 of the import,
    and this implementation lets us leverage most of the same code to support the Step 3 -> 4
    transition as we use for the Step 2 -> 4 transition.

    :return: the UI JSON for Step 4 "Inspect"
    """
    import_ = Import.objects.filter(pk=import_pk).select_related('file').get()
    User = get_user_model()
    user = User.objects.get(pk=user_pk)

    logger.info(f"Building import {import_.pk}'s UI payload from cache.")
    parser = SeriesCacheParser(master_units=import_.y_units)
    import_records = parser.parse(import_.uuid)
    aggregator = ErrorAggregator()

    # look up MeasurementTypes referenced in the import so we can build JSON containing them.
    # if we got this far, they'll be in EDD's database unless recently removed, which should
    # be unlikely
    category = import_.category
    MTypeClass = MTYPE_GROUP_TO_CLASS[category.mtype_group]
    unique_mtypes = MTypeClass.objects.filter(pk__in=parser.mtype_pks)

    # get other context from the database
    hour_units = MeasurementUnit.objects.get(unit_name='hours')
    assay_time_meta_pk = MetadataType.objects.filter(type_name='Time',
                                                     for_context=MetadataType.ASSAY)
    found_count = len(unique_mtypes)

    if found_count != len(parser.mtype_pks):
        missing_pks = {mtype.pk for mtype in unique_mtypes} - parser.mtype_pks
        aggregator.raise_errors(err_codes.MEASUREMENT_TYPE_NOT_FOUND,
                                occurrences=missing_pks)

    # TODO: fold assay times into UI payload to give user helpful feedback as in UI mockup
    assay_pk_to_time = None
    if parser.matched_assays:
        assay_pks = parser.loa_pks
        assay_pk_to_time = verify_assay_times(aggregator, assay_pks, parser,
                                              assay_time_meta_pk)
    required_inputs = compute_required_context(category, import_.compartment, parser,
                                               assay_pk_to_time)
    payload = build_summary_json(import_, required_inputs, import_records, unique_mtypes,
                                 hour_units.pk)
    notify = RedisBroker(user)
    file_name = import_.file.filename
    msg = _('Your file "{file_name}" is ready to import'.format(file_name=file_name))
    notify.notify(msg, tags='import-status-update', payload=payload)


class SeriesCacheParser:
    """
    A parser that reads import records from the legacy Redis cache and extracts relevant
    data to return to the import UI without re-parsing and re-verifying the file content (e.g.
    external database identifiers)
    """
    def __init__(self, master_time=None, master_units=None, master_compartment=None):
        self.all_records_have_time = False
        self.all_records_have_units = False
        self.all_records_have_compartment = False
        self.master_time = master_time
        self.master_units = master_units
        self.master_compartment = master_compartment
        self.matched_assays = False
        self.mtype_pks = set()
        self.loa_pks = set()  # line or assay pks

    def parse(self, import_uuid):

        broker = ImportBroker()
        cache_pages = broker.load_pages(import_uuid)

        import_records = []

        self.all_records_have_time = True
        self.all_records_have_units = True
        self.all_records_have_compartment = True
        self.matched_assays = True
        for page in cache_pages:
            page_json = json.loads(page)
            for import_record in page_json:
                measurement_pk = import_record.get('measurement_id')
                self.mtype_pks.add(measurement_pk)

                if import_record.data[0] is None:
                    self.all_records_have_time = False

                if hasattr(import_record, 'line_id'):
                    self._add_id(import_record['line_id'])
                    self.matched_assays = False
                else:
                    self._add_id(import_record['assay_id'])

            import_records.extend(page_json)

        return import_records

    def _add_id(self, val):
        if val not in ('new', 'named_or_new'):  # ignore placeholders, just get real pks
            self.loa_pks.add(val)

    def has_all_times(self):
        return self.master_time or self.all_records_have_time

    def has_all_units(self):
        return self.master_units or self.all_records_have_units

    def has_all_compartments(self):
        return self.master_compartment or self.all_records_have_compartment

    @property
    def mtypes(self):
        return self.mtype_pks
