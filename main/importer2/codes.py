# -*- coding: utf-8 -*-
"""
Error codes for cases handled during the import process
"""
from enum import auto, Enum


class FileParseCodes(Enum):
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

    # communication errors
    PARTNER_INTERNAL_ERROR = auto()
    COMMUNICATION_ERROR = auto()
    NOT_FOUND = auto()
    PERMISSION_DENIED = auto()
