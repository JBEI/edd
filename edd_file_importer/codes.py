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
    DUPLICATE_ASSAY_NAME = auto()
    DUPLICATE_LINE_NAME = auto()
    UNNMATCHED_STUDY_INTERNALS = auto()

    # communication errors... current model load_or_create methods don't support differentiating
    #  between different, but we'll ha
    # PARTNER_INTERNAL_ERROR = auto()
    # COMMUNICATION_ERROR = auto()
    # PERMISSION_DENIED = auto()
    MEASUREMENT_TYPE_NOT_FOUND = auto()

    PROTEIN_ID_NOT_FOUND = auto()
    GENE_ID_NOT_FOUND = auto()
    PHOSPHOR_NOT_FOUND = auto()
    METABOLITE_NOT_FOUND = auto()

    COMMUNICATION_ERROR = auto()

    MEASUREMENT_UNIT_NOT_FOUND = auto()

    ILLEGAL_STATE_TRANSITION = auto()

    MERGE_NOT_SUPPORTED = auto()

    MEASUREMENT_COLLISION = auto()

    ASSAYS_MISSING_TIME = auto()

    UNEXPECTED_ERROR = auto()


parse_code_to_ui_detail = {
    # basic file read errors
    FileParseCodes.UNSUPPORTED_FILE_TYPE: {
        'category': _('Invalid file'),
        'summary': _('Unsupported file type'),
    },
    FileParseCodes.EMPTY_FILE: {
        'category': _('Invalid file'),
        'summary': _('File is empty'),
    },

    # file format errors
    FileParseCodes.IGNORED_WORKSHEET: {
        'category': _('Ignored data'),
        'summary': _('Worksheets ignored'),
    },
    FileParseCodes.MISSING_REQ_COL_HEADER: {
        'category': _('Invalid file'),
        'summary': _('Required column headers missing'),
    },
    FileParseCodes.DUPLICATE_COL_HEADER: {
        'category': _('Invalid file'),
        'summary': _('Duplicate column headers'),
    },
    FileParseCodes.COLUMN_IGNORED: {
        'category': _('Ignored data'),
        'summary': _('Ignored columns'),
    },
    FileParseCodes.IGNORED_VALUE_BEFORE_HEADERS: {
        'category': _('Ignored data'),
        'summary': _('Ignored values before recognized headers'),
    },

    # file content errors
    FileParseCodes.UNSUPPORTED_UNITS: {
        'category': _('Invalid file'),
        'summary': _('Unsupported units'),
    },
    FileParseCodes.MISSING_REQ_VALUE: {
        'category': _('Invalid file'),
        'summary': _('Required values missing'),
    },
    FileParseCodes.INVALID_VALUE: {
        'category': _('Invalid file'),
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
        'category': _('Invalid file'),
        'summary': _('Invalid identifier format'),
    },

    FileProcessingCodes.UNMATCHED_ASSAY_NAME: {
        'category': _("File doesn't match study"),
        'summary': _('Assay names in file not found in study'),
    },

    FileProcessingCodes.UNMATCHED_LINE_NAME: {
        'category': _("File doesn't match study"),
        'summary': _('Line names in file not found in study'),
    },

    FileProcessingCodes.DUPLICATE_ASSAY_NAME: {
        'category': _('Cannot resolve assay names'),
        'summary': _('Study has duplicate assay names'),
    },

    FileProcessingCodes.DUPLICATE_LINE_NAME: {
        'category': _('Cannot resolve line names'),
        'summary': _('Study has duplicate line names'),
    },

    FileProcessingCodes.UNNMATCHED_STUDY_INTERNALS: {
        'category': _("File doesn't match study"),
        'summary': _('Identifiers in your file must match either line or assay names in the '
                     'study'),
    },
    FileProcessingCodes.MEASUREMENT_TYPE_NOT_FOUND: {
        'category': _('Measurement identifiers not found'),
        'summary': _('Missing IDs'),
    },

    FileProcessingCodes.PROTEIN_ID_NOT_FOUND: {
        'category': _('Identifiers not found'),
        'summary': _('Protein identifiers in the file were not found in UniProt'),
    },
    FileProcessingCodes.GENE_ID_NOT_FOUND: {
        'category': _('Identifiers not found'),
        'summary': _('Genes identifiers in the file were not found in the registry'),
    },
    FileProcessingCodes.METABOLITE_NOT_FOUND: {
        'category': _('Identifiers not found'),
        'summary': _('Metabolites were not found by PubChem CID'),
    },

    FileProcessingCodes.ILLEGAL_STATE_TRANSITION: {
        'category': _('Invalid Request'),
        'summary': _('Illegal state transition'),
    },

    FileProcessingCodes.ASSAYS_MISSING_TIME: {
        'category': _('Incomplete study configuration'),
        'summary': _('Assays missing time metadata'),
    },

    FileProcessingCodes.MEASUREMENT_COLLISION: {
        'category': _('Measurement collision'),
        'summary': _('Duplicate simultaneous measurements'),
    },

    FileProcessingCodes.MERGE_NOT_SUPPORTED: {
        'category': _('Merge not yet supported'),
        'summary': _("Your study already contains data for this protocol.  Merge with existing "
                     "assays isn't supported"),
    },

    FileProcessingCodes.UNEXPECTED_ERROR: {
        'category': _('Error'),
        'summary': _('An unexpected error occurred'),
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
