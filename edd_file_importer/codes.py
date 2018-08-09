# -*- coding: utf-8 -*-
"""
Error codes for cases handled during the import process
"""
from enum import auto, Enum

from django.utils.translation import ugettext_lazy as _


class FileParseCodes(Enum):
    PARSER_NOT_FOUND = auto()

    # basic file read errors
    UNSUPPORTED_FILE_TYPE = auto()
    EMPTY_FILE = auto()

    # file format errors
    IGNORED_WORKSHEET = auto()
    MISSING_REQ_COL_HEADER = auto()
    DUPLICATE_COL_HEADER = auto()
    COLUMN_IGNORED = auto()
    IGNORED_VALUE_BEFORE_HEADERS = auto()

    # file content errors
    UNSUPPORTED_UNITS = auto()
    MISSING_REQ_VALUE = auto()
    INVALID_VALUE = auto()
    DUPLICATE_DATA_ENTRY = auto()


class FileProcessingCodes(Enum):
    # invalid identifier format
    INVALID_ID_FORMAT = auto()

    # missing study ids
    UNMATCHED_ASSAY_NAME = auto()
    UNMATCHED_LINE_NAME = auto()
    UNNMATCHED_STUDY_INTERNALS = auto()

    # communication errors... current model load_or_create methods don't support differentiating
    #  between different, but we'll ha
    # PARTNER_INTERNAL_ERROR = auto()
    # COMMUNICATION_ERROR = auto()
    # PERMISSION_DENIED = auto()
    MEASUREMENT_TYPE_NOT_FOUND = auto()

    MEASUREMENT_UNIT_NOT_FOUND = auto()

    MERGE_NOT_SUPPORTED = auto()

    MEASUREMENT_COLLISION = auto()

    ASSAYS_MISSING_TIME = auto()


parse_code_to_ui_detail = {
    # basic file read errors
    FileParseCodes.UNSUPPORTED_FILE_TYPE: {
        'category': _('Bad file'),
        'summary': _('Unsupported file type'),
    },
    FileParseCodes.EMPTY_FILE: {
        'category': _('Empty file'),
        'summary': _(''),
    },

    # file format errors
    FileParseCodes.IGNORED_WORKSHEET: {
        'category': _('Ignored data'),
        'summary': _(''),
    },
    FileParseCodes.MISSING_REQ_COL_HEADER: {
        'category': _('Bad file'),
        'summary': _(''),
    },
    FileParseCodes.DUPLICATE_COL_HEADER: {
        'category': _('Bad file'),
        'summary': _('Duplicate column headers'),
    },
    FileParseCodes.COLUMN_IGNORED: {
        'category': _('Ignored data'),
        'summary': _('Ignored columns'),
    },
    FileParseCodes.IGNORED_VALUE_BEFORE_HEADERS: {
        'category': _('Ignored data'),
        'summary': _(''),
    },

    # file content errors
    FileParseCodes.UNSUPPORTED_UNITS: {
        'category': _('Bad file'),
        'summary': _('Unsupported units'),
    },
    FileParseCodes.MISSING_REQ_VALUE: {
        'category': _('Bad file'),
        'summary': _('Required values missing'),
    },
    FileParseCodes.INVALID_VALUE: {
        'category': _('Bad file'),
        'summary': _('Invalid value'),
    },
    FileParseCodes.DUPLICATE_DATA_ENTRY: {
        'category': _(''),
        'summary': _(''),
    },
}

processing_code_to_ui_detail = {
    # invalid identifier format
    FileProcessingCodes.INVALID_ID_FORMAT: {
        'category': _('Bad file'),
        'summary': _('Invalid identifier format'),
    },

    FileProcessingCodes.UNMATCHED_ASSAY_NAME: {
        'category': _('Unmatched assay names'),
        'summary': _(),
    },

    FileProcessingCodes.UNMATCHED_LINE_NAME: {
        'category': _('Unmatched line names'),
        'summary': _(),
    },

    FileProcessingCodes.UNNMATCHED_STUDY_INTERNALS: {
        'category': _('Unmatched study internals'),
        'summary': _('Identifiers must either match line or assay names in the study.  Neither '
                     'matched'),
    },
    FileProcessingCodes.MEASUREMENT_TYPE_NOT_FOUND: {
        'category': _('Identifiers not found'),
        'summary': _(''),
    },

    FileProcessingCodes.ASSAYS_MISSING_TIME: {
        'category': _('Incomplete time data'),
        'summary': _(''),
    },

    FileProcessingCodes.MEASUREMENT_COLLISION: {
        'category': _('Measurement collision'),
        'summary': _('File contains duplicate measurements of the same quantity at the same time'),
    },

    FileProcessingCodes.MERGE_NOT_SUPPORTED: {
        'category': _('Merge not yet supported'),
        'summary': _('Your study already contains data for this protocol.  Merge is not yet '
                     'supported.'),
    }
}


def get_ui_summary(err_type):
    """
    Explodes the error code used by the import back end into UI-centric title and summary data
    for user consumption
    """
    src_dict = (parse_code_to_ui_detail if isinstance(err_type, FileParseCodes) else
                processing_code_to_ui_detail)
    return src_dict[err_type]
