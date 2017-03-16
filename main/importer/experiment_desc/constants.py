# coding: utf-8
from __future__ import unicode_literals

from requests import codes

# error conditions that are detected / handled during Experiment Description upload process.
# These values must remain unique, and are used both as dictionary keys within the back-end code
# and for user display in the front end

####################################################################################################
# User data entry errors
####################################################################################################
# generic errors (apply regardless of input format)
NO_INPUT = "No line description data were found in the input"
DUPLICATE_INPUT_LINE_NAMES = 'Duplicate line names in the input'
EXISTING_LINE_NAMES = 'Input would duplicate existing line names'
DUPLICATE_INPUT_ASSAY_NAMES = 'Duplicate assay names in the input'
EXISTING_ASSAY_NAMES = 'Inputs would duplicate existing assay names'

NON_STRAIN_ICE_ENTRY = 'Non-strain ICE entries'
PART_NUMBER_NOT_FOUND = 'Part number(s) not found in ICE'


# Experiment Description file-specific errors
EMPTY_WORKBOOK = 'Empty workbook'
DUPLICATE_ASSAY_METADATA = 'Duplicate assay metadata columns'
DUPLICATE_LINE_METADATA = 'Duplicate line metadata columns'
INVALID_CELL_FORMAT = 'Cells have invalid format'
INVALID_REPLICATE_COUNT = 'Invalid replicate count'
ZERO_REPLICATES = 'Zero replicates are not allowed. If no lines are desired, remove row(s) from ' \
                  'the file.'
MISSING_REQUIRED_LINE_NAME = 'Missing line name rows'
EXISTING_LINE_NAMES = 'Existing line names'
MISSING_REQUIRED_COLUMN = 'Incorrect file format'
UNMATCHED_ASSAY_COL_HEADERS_KEY = 'Invalid column header(s) (Unmatched assay metadata suffix)'
INVALID_COLUMN_HEADER = 'Invalid column header(s)'


# either user input error in Experiment Description/ICE part permissions, or an ICE error (known ICE
# errors exist in ICE 5.2.2 as of 3-1-17)
FORBIDDEN_PART_KEY = 'Missing ICE read permission for part number(s)'

# Experiment Description file-specific warnings
MULTIPLE_WORKSHEETS_FOUND = 'Multiple worksheets were found in the document'
LINE_META_CAPITALIZATION_ONLY_DIFFERENCE = ('Found some line metadata types that differ only by '
                                            'case. Case-insensitive matching in parsing code will '
                                            'arbitrarily choose one')
ASSAY_META_CAPITALIZATION_ONLY_DIFFERENCE = ('Found some assay metadata types that differ only by '
                                             'case. Case-insensitive matching in parsing code will '
                                             'arbitrarily choose one')
UNSUPPORTED_LINE_METADATA = ('Parsing is not supported for one or more line metadata type(s) '
                             'in the file. Values in these columns were not be set on your lines')
ROWS_MISSING_REPLICATE_COUNT = 'Rows missing replicate counts (assumed to have no replicates)'

####################################################################################################
# Self/client consistency checks.  Experiment Description code is written defensively to help to
# detect coding errors in EDD's eventual Experiment Description GUI, an API client,
# or in development / maintenance of complex Experiment Description back-end code)
####################################################################################################
FOUND_PART_NUMBER_DOESNT_MATCH_QUERY = 'Found part number does not match query'
INVALID_ASSAY_META_PK = 'Invalid assay metadata pks'
INVALID_LINE_META_PK = 'Invalid line metadata pks'
INVALID_PROTOCOL_META_PK = 'Invalid protocol pks'
PARSE_ERROR = 'Parse error'
UNMATCHED_PART_NUMBER = 'Unmatched part number(s). This indicates a coding error in EDD.'

# Combinatorial GUI or API - specific errors
INVALID_AUTO_NAMING_INPUT = 'Invalid element for automatic naming'

####################################################################################################
# ICE-related errors
####################################################################################################

# anticipated systemic (e.g. communication) error or error that isn't otherwise planned for /
# handled separately (e.g. EDD/ICE configuration errors or ICE bugs)
GENERIC_ICE_RELATED_ERROR = 'ICE-related error'

# Proactive check for an EDD and/or ICE error detected during earlier testing of
# maintain_ice_links.py. We can remove this if we go a while without seeing it in production.
# MF 3/1/17
PART_NUMBER_PATTERN_UNMATCHED_WARNING = ("One or more part numbers didn't match the expected "
                                         "pattern. This probably indicates a data entry error:")

####################################################################################################
# Generic errors... likely require admin investigation / determination re: cause
####################################################################################################

UNPREDICTED_ERROR = 'An unpredicted error occurred'
UNSUPPORTED_FILE_TYPE = 'Unsupported file type'  # TODO RESOLVE WITH incorrect file format

# Errors caused by outstanding curation work in JBEI's database / resulting lack of constraints in
# EDD's DB schema...see EDD-158
NON_UNIQUE_STRAIN_UUIDS = 'Non-unique strain uuids'
SUSPECTED_MATCH_STRAINS = 'Suspected match strain(s)'

####################################################################################################
# Request parameters
####################################################################################################
# TODO: Restore earlier values after making these POST data instead.
# IGNORE_ICE_RELATED_ERRORS_PARAM = 'ignoreIceRelatedErrors'
# ALLOW_DUPLICATE_NAMES_PARAM = 'allowDuplicateNames'
IGNORE_ICE_RELATED_ERRORS_PARAM = 'HTTP_X_EDD_IGNOREICERELATEDERRORS'
ALLOW_DUPLICATE_NAMES_PARAM = 'HTTP_X_EDD_ALLOWDUPLICATENAMES'

####################################################################################################
# Http error codes used / considered in this package.
####################################################################################################
OK = codes.ok
INTERNAL_SERVER_ERROR = codes.internal_server_error
BAD_REQUEST = codes.bad_request
NOT_FOUND = codes.not_found
METHOD_NOT_ALLOWED = codes.method_not_allowed
NOT_ACCEPTABLE = codes.not_acceptable
TOO_MANY_REQUESTS = codes.too_many_requests
SERVICE_UNAVAILABLE = codes.service_unavailable
FORBIDDEN = codes.forbidden
CONFLICT = codes.conflict

# Define display priority order for all errors defined in this file.  The back-end will provide
# errors in this order for display in the user interface. Generally, we list user errors first
# so that even in the case of EDD / ICE errors, users and client code can see / resolve their own
# errors first.
ERROR_PRIORITY_ORDER = (

    NO_INPUT,

    # Experiment Description file-specific errors
    EMPTY_WORKBOOK,
    UNSUPPORTED_FILE_TYPE,
    MULTIPLE_WORKSHEETS_FOUND,
    MISSING_REQUIRED_COLUMN,

    # errors in defining column headers
    INVALID_COLUMN_HEADER,
    UNMATCHED_ASSAY_COL_HEADERS_KEY,
    DUPLICATE_ASSAY_METADATA,
    DUPLICATE_LINE_METADATA,
    MISSING_REQUIRED_LINE_NAME,
    INVALID_CELL_FORMAT,
    INVALID_REPLICATE_COUNT,
    ZERO_REPLICATES,
    EXISTING_LINE_NAMES,

    # User-created naming overlaps
    DUPLICATE_INPUT_LINE_NAMES,
    EXISTING_LINE_NAMES,
    DUPLICATE_INPUT_ASSAY_NAMES,
    EXISTING_ASSAY_NAMES,

    ##################################
    # User-created ICE errors
    #################################
    PART_NUMBER_NOT_FOUND,
    NON_STRAIN_ICE_ENTRY,
    FORBIDDEN_PART_KEY,

    ################################
    # ICE-related software/configuration/communication errors
    ################################
    GENERIC_ICE_RELATED_ERROR,

    # Proactive check for an EDD and/or ICE error detected during earlier testing of
    # maintain_ice_links.py. We can remove this if we go a while without seeing it in production.
    # MF 3/1/17
    PART_NUMBER_PATTERN_UNMATCHED_WARNING,

    ################################
    # Generic errors... users can't help with these
    ################################
    INVALID_AUTO_NAMING_INPUT,  # Combinatorial GUI- or API-specific errors

    UNPREDICTED_ERROR,
    # Errors caused by outstanding curation work in JBEI's database / resulting lack of constraints
    # in EDD's DB schema...see EDD-158
    NON_UNIQUE_STRAIN_UUIDS,
    SUSPECTED_MATCH_STRAINS,

    ##################################
    # EDD self/client consistency checks
    ##################################

    FOUND_PART_NUMBER_DOESNT_MATCH_QUERY,
    INVALID_ASSAY_META_PK,
    INVALID_LINE_META_PK,
    INVALID_PROTOCOL_META_PK,
    PARSE_ERROR,
    UNMATCHED_PART_NUMBER,



)

WARNING_PRIORITY_ORDER = (
    # Experiment Description file-specific warnings
    LINE_META_CAPITALIZATION_ONLY_DIFFERENCE,
    ASSAY_META_CAPITALIZATION_ONLY_DIFFERENCE,
    UNSUPPORTED_LINE_METADATA,
    ROWS_MISSING_REPLICATE_COUNT,

    # User-created naming overlaps
    DUPLICATE_INPUT_LINE_NAMES,
    EXISTING_LINE_NAMES,
    DUPLICATE_INPUT_ASSAY_NAMES,
    EXISTING_ASSAY_NAMES,

    ##################################
    # User-created ICE errors
    #################################
    PART_NUMBER_NOT_FOUND,
    NON_STRAIN_ICE_ENTRY,
    FORBIDDEN_PART_KEY,

    ################################
    # ICE-related software/configuration/communication errors
    ################################
    GENERIC_ICE_RELATED_ERROR,
)

