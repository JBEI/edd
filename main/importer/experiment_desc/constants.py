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


NON_STRAIN_ICE_ENTRY = 'Non-strain ICE entries'
PART_NUMBER_NOT_FOUND = 'Part number(s) not found in ICE'
NO_INPUT = "No line description data were found in the input"

# Experiment Description file-specific errors
EMPTY_WORKBOOK = 'Empty workbook'
DUPLICATE_ASSAY_METADATA = 'Duplicate assay metadata columns'
DUPLICATE_LINE_METADATA = 'Duplicate line metadata columns'
INVALID_CELL_FORMAT = 'Invalid cell format'
INVALID_REPLICATE_COUNT = 'Invalid replicate count'
MISSING_LINE_NAME_ROWS_KEY = 'Missing line name rows'
EXISTING_LINE_NAMES = 'Existing line names'
INCORRECT_FILE_FORMAT = 'Incorrect file format'


UNMATCHED_COL_HEADERS_KEY = 'Unmatched column header indexes'
SKIPPED_KEY = 'Skipped columns'


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
ROWS_MISSING_REPLICATE_COUNT = 'Rows missing replicate counts assumed to have no replicates'

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
PART_NUMBER_PATTERN_UNMATCHED_WARNING = 'Part number pattern unmatched for part(s)'

####################################################################################################
# Generic errors... likely require admin investigation / determination re: cause
####################################################################################################

UNPREDICTED_ERROR = 'An unpredicted error occurred'
UNSUPPORTED_FILE_TYPE = 'Unsupported file type'

# Errors caused by outstanding curation work in JBEI's database / resulting lack of constraints in
# EDD's DB schema...see EDD-158
NON_UNIQUE_STRAIN_UUIDS = 'Non-unique strain uuids'
SUSPECTED_MATCH_STRAINS = 'Suspected match strain(s)'

####################################################################################################
# Request parameters
####################################################################################################
IGNORE_ICE_RELATED_ERRORS_PARAM = 'ignoreIceRelatedErrors'
ALLOW_DUPLICATE_NAMES_PARAM = 'allowDuplicateNames'

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

