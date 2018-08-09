# coding: utf-8
import logging
from collections import defaultdict

from .codes import get_ui_summary

logger = logging.getLogger(__name__)


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
        detail_str = str(occurrence)
        subcategory = subcategory if subcategory else 'default'
        self._occurrence_details[subcategory].append(detail_str)

    def to_json(self):
        # explode error code into UI-centric category + summary
        ui_summary = get_ui_summary(self.err)

        results = []
        for subcategory, occurrences in self._occurrence_details.items():
            summary = {
                **ui_summary,
                'resolution': self.resolution,
                'doc_url': self.doc_url,
                'detail': ', '.join(occurrences)
            }
            if subcategory != 'default':
                summary['subcategory'] = subcategory
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
        summary = dest.get(type_id)
        if not summary:
            summary = ImportErrorSummary(type_id)
            dest[type_id] = summary
        if occurrence:
            summary.add_occurrence(occurrence=occurrence, subcategory=subcategory)

    def add_errors(self, err_type, subcategory=None, occurrences=None):
        logger.debug(f'add_errors called! {err_type}: {occurrences}')
        for detail in occurrences:
            self.add_error(err_type, subcategory=subcategory, occurrence=detail)

    def add_warnings(self, warn_type, occurrences):
        for detail in occurrences:
            self.add_warning(warn_type, occurrence=detail)

    def raise_errors(self, err_type=None, subcategory=None, occurrences=None):
        if err_type:
            self.add_errors(err_type, subcategory=subcategory, occurrences=occurrences)

        if self.errors:
            raise EDDImportError(self)
