import logging

from collections import defaultdict

logger = logging.getLogger(__name__)


class ImportErrorSummary(object):
    """
    Defines error/warning information captured during an actual or attempted import attempt.
    Experiment Description file upload (and eventual combinatorial GUI) will be much easier
    to use
    if the back end can aggregate some errors and return some or all of them at the same time.
    """

    def __init__(self, err):
        self.err = err
        self.resolution = None
        self.doc_url = None
        self._occurrence_details = defaultdict(list)  # maps subcategory => occurrences

    def add_occurrence(self, occurrence, subcategory=None):
        detail_str = str(occurrence)
        subcategory = subcategory if subcategory else 'default'
        self._occurrence_details[subcategory].append(detail_str)


class ErrorAggregator(object):
    def __init__(self):
        self.warnings = {}
        self.errors = {}

    def add_warning(self, warn_type, subcategory=None, occurrence=None):
        logger.debug(f'add_warning called! {warn_type}: {occurrence}')
        self._issue(self.warnings, warn_type, subcategory=subcategory,
                    occurrence=occurrence)

    def add_error(self, err_type, subcategory=None, occurrence=None):
        logger.debug(f'add_error called! {err_type}: {occurrence}')
        self._issue(self.errors, err_type, subcategory=subcategory,
                    occurrence=occurrence)

    @staticmethod
    def _issue(dest, type_id, subcategory=None, occurrence=None):
        summary = dest.get(type_id)
        if not summary:
            summary = ImportErrorSummary(type_id)
            dest[type_id] = summary
        if occurrence:
            summary.add_occurrence(occurrence=occurrence, subcategory=subcategory)

    def add_errors(self, err_type, occurrences):
        logger.debug(f'add_errors called! {err_type}: {occurrences}')
        for detail in occurrences:
            self.add_error(err_type, occurrence=detail)

    def add_warnings(self, warn_type, occurrences):
        for detail in occurrences:
            self.add_warning(warn_type, occurrence=detail)
