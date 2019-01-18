# coding: utf-8
import logging
from collections import defaultdict

from .codes import get_ui_summary, FileProcessingCodes
from main.models import (Assay, GeneIdentifier, Measurement, MeasurementType, Metabolite,
                         Phosphor, ProteinIdentifier)

logger = logging.getLogger(__name__)


MTYPE_GROUP_TO_CLASS = {
    MeasurementType.Group.GENERIC: MeasurementType,
    MeasurementType.Group.METABOLITE: Metabolite,
    MeasurementType.Group.GENEID: GeneIdentifier,
    MeasurementType.Group.PROTEINID: ProteinIdentifier,
    MeasurementType.Group.PHOSPHOR: Phosphor,
}


class EDDImportError(Exception):
    def __init__(self, aggregator):
        super(EDDImportError, self).__init__()
        self.aggregator = aggregator

    @property
    def errors(self):
        return self.aggregator.errors

    @property
    def warnings(self):
        return self.aggregator.warnings


class ParseError(EDDImportError):
    pass


class VerificationError(EDDImportError):
    pass


class CommunicationError(EDDImportError):
    pass


class ImportTooLargeError(EDDImportError):
    pass


class ImportErrorSummary(object):
    """
    Defines error/warning information captured during an actual or attempted import attempt.
    Experiment Description file upload (and eventual combinatorial GUI) will be much easier
    to use
    if the back end can aggregate some errors and return some or all of them at the same time.
    """

    # TODO: either account for subcategory in JSON output, or remove
    def __init__(self, err):
        self.err = err
        self.resolution = None
        self.doc_url = None
        self._occurrence_details = defaultdict(list)  # maps subcategory => occurrences

    def add_occurrence(self, occurrence, subcategory=None):
        detail_str = str(occurrence) if occurrence is not None else None
        subcategory = subcategory if subcategory else 'default'
        self._occurrence_details[subcategory].append(detail_str)

    @staticmethod
    def json_of(err_type, occurrence, subcategory=None):
        err = ImportErrorSummary(err_type)
        err.add_occurrence(occurrence, subcategory)
        return err.to_json()

    def to_json(self):
        # explode error code into UI-centric category + summary
        ui_summary = get_ui_summary(self.err)

        results = []
        for subcategory, occurrences in self._occurrence_details.items():
            summary = {
                **ui_summary,
                'resolution': self.resolution,
                'doc_url': self.doc_url,
            }
            if subcategory != 'default':
                summary['subcategory'] = subcategory

            nonempty_occurrences = [detail for detail in occurrences if detail]
            if nonempty_occurrences:
                summary['detail'] = ', '.join(nonempty_occurrences)
            results.append(summary)

        return results


class ErrorAggregator(object):
    def __init__(self):
        self.warnings = {}  # maps err type -> ImportErrorSummary
        self.errors = {}    # maps warn type -> ImportErrorSummary

    def add_warning(self, warn_type, subcategory=None, occurrence=None):
        logger.debug(f'add_warning called! {warn_type}: {occurrence}')
        self._issue(self.warnings, warn_type, subcategory=subcategory,
                    occurrence=occurrence)

    def add_error(self, err_type, subcategory=None, occurrence=None):
        logger.debug(f'add_error called! {err_type}: {occurrence}')
        self._issue(self.errors, err_type, subcategory=subcategory,
                    occurrence=occurrence)

    def raise_error(self, err_type, subcategory=None, occurrence=None):
        logger.debug(f'raise_error called! {err_type}: {occurrence}')
        self._issue(self.errors, err_type, subcategory=subcategory,
                    occurrence=occurrence)
        self.raise_errors()

    @staticmethod
    def _issue(dest, type_id, subcategory=None, occurrence=None):
        errs = dest.get(type_id)
        if not errs:
            errs = ImportErrorSummary(type_id)
            dest[type_id] = errs
        errs.add_occurrence(occurrence=occurrence, subcategory=subcategory)

    @staticmethod
    def error_factory(err_type, subcategory, occurrence=None):
        aggregator = ErrorAggregator()
        aggregator.raise_error(err_type, subcategory, occurrence)

    def add_errors(self, err_type, subcategory=None, occurrences=None):
        logger.debug(f'add_errors called! {err_type}: {occurrences}')
        for detail in occurrences:
            self.add_error(err_type, subcategory=subcategory, occurrence=detail)
        if not occurrences:
            self.add_error(err_type, subcategory=subcategory, occurrence=None)

    def add_warnings(self, warn_type, occurrences):
        for detail in occurrences:
            self.add_warning(warn_type, occurrence=detail)
        if not occurrences:
            self.add_warning(warn_type)

    # TODO: add / enforce a limit so we aren't adding an unbounded list
    def raise_errors(self, err_type=None, subcategory=None, occurrences=None):
        if err_type:
            self.add_errors(err_type, subcategory=subcategory, occurrences=occurrences)

        if self.errors:
            raise EDDImportError(self)


def build_summary_json(import_, required_inputs, import_records, unique_mtypes, x_units_pk):
    """
    Build some summary JSON to send to the new import front end
    """
    logger.debug('Building UI JSON for user inspection')

    assay_id_to_meas_count = {}

    measures = []
    for index, import_record in enumerate(import_records):
        import_data = import_record['data']

        # if this import is creating new assays, assign temporary IDs to them for pre-import
        # display and possible deactivation in step 4.  If the import is updating existing
        # assays, use their real pk's.
        assay_id = import_record['assay_id']
        assay_id = assay_id if assay_id not in ('new', 'named_or_new') else index
        assay_id_str = str(assay_id)

        mcount = assay_id_to_meas_count.get(assay_id_str, 0)
        mcount += 1
        assay_id_to_meas_count[assay_id_str] = mcount

        # TODO: file format, content, and protocol should all likely be considerations here.
        # Once supported by the Celery task, consider moving this determination up to the
        # parsing step  where the information is all available on a per-measurement basis.
        format = Measurement.Format.SCALAR
        if len(import_data) > 2:
            format = Measurement.Format.VECTOR

        measures.append({
            # assign temporary measurement ID's.
            # TODO: revisit when implementing collision detection/merge similar to assays
            # above. Likely need detection/tracking earlier in the process to do this with
            # measurements.
            'id': index,
            'assay': assay_id,
            'type': import_record['measurement_id'],
            'comp': import_record['compartment_id'],
            'format': format,
            'x_units': x_units_pk,
            'y_units': import_record['units_id'],
            'meta': {},
        })

    return {
        'pk': f'{import_.pk}',
        'uuid': import_.uuid,
        'status': import_.status,
        'total_measures': assay_id_to_meas_count,
        'required_values': required_inputs,
        'types': {str(mtype.id): mtype.to_json() for mtype in unique_mtypes},
        'measures': measures,
    }


def build_err_payload(aggregator, import_):
    """
    Builds a JSON error response to return as a WS client notification.
    """
    # flatten errors & warnings into a single list to send to the UI. Each ImportErrorSummary
    # may optionally contain multiple related errors grouped by subcategory
    errs = []
    for err_type_summary in aggregator.errors.values():
        errs.extend(err_type_summary.to_json())

    warns = []
    for warn_type_summary in aggregator.warnings.values():
        warns.extend(warn_type_summary.to_json())

    return {
        'pk': import_.pk,
        'uuid': import_.uuid,
        'status': import_.status,
        'errors': errs,
        'warnings': warns
    }


def verify_assay_times(err_aggregator, assay_pks, parser, assay_time_mtype):
    """
    Checks existing assays ID'd in the import file for time metadata, and verifies that they
    all either have time metadata (or don't).
    :return: a dict that maps assay pk => time if assay times were consistently found,
    None if they were consistently *not* found
    :raises ImportError if time is inconsistently specified or overspecified
    """

    assay_time_key = f'{assay_time_mtype.pk}'
    has_time_qs = Assay.objects.filter(pk__in=assay_pks, meta_store__has_key=assay_time_key)

    times_count = len(has_time_qs)

    if times_count == len(assay_pks):
        if parser.has_all_times:
            err_aggregator.add_error(
                FileProcessingCodes.DUPLICATE_DATA_ENTRY,
                occurrence='Time is provided both in the file and in assay metadata'
            )
            err_aggregator.raise_errors()

        return {assay.pk: assay.metadata_get(assay_time_key) for assay in has_time_qs}

    elif times_count != 0:
        missing_pks = Assay.objects.filter(pk__in=assay_pks)
        missing_pks = missing_pks.exclude(meta_store__has_key=assay_time_mtype.pk)
        missing_pks = missing_pks.values_list('pk', flat=True)
        err_aggregator.add_errors(FileProcessingCodes.ASSAYS_MISSING_TIME,
                                  occurrences=missing_pks)
        err_aggregator.raise_errors()

    return None


def compute_required_context(category, compartment, parser, assay_meta_times):
    required_inputs = []

    # TODO: verify assumptions here re: auto-selected compartment.
    # status quo is that its only needed for metabolomics, but should be configured in protocol
    if category.name == 'Metabolomics' and not compartment:
        required_inputs.append('compartment')

    if not (assay_meta_times or parser.has_all_times):
        required_inputs.append('time')

    if not parser.has_all_units:
        required_inputs.append('units')

    return required_inputs
