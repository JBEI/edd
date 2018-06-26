# coding: utf-8

from collections import OrderedDict
from enum import Enum
from requests import codes

# error conditions that are detected / handled during Experiment Description upload process.
# These values must remain unique, and are used both as dictionary keys within the back-end code
# and for user display in the front end
# TODO: consider creating an class to encapsulate error title/subtitle/(HTTP status code?)
# associations implied here and elsewhere in the code.  This approach evolved from the ground up,
# but might be clarified by a refactor.

###################################################################################################
# User data entry errors
###################################################################################################
# generic errors (apply regardless of input format)
NO_INPUT = "No line description data were found in the input"
EMPTY_RESULTS = 'No lines created as a result of the input'
DUPLICATE_COMPUTED_LINE_NAMES = 'Computed line names have insufficient data to make them unique'
DUPLICATE_LINE_NAME_LITERAL = 'Duplicate line name'  # for the simple, non-combo ED file case
EXISTING_LINE_NAMES = 'Input would duplicate existing line names'
DUPLICATE_INPUT_ASSAY_NAMES = 'Duplicate assay names within the input for a single protocol'
EXISTING_ASSAY_NAMES = 'Inputs would duplicate existing assay names'

NON_STRAINS_CATEGORY = 'Non-Strains'
NON_STRAIN_ICE_ENTRY = 'Non-strain ICE entries'
PART_NUMBER_NOT_FOUND = 'Part number(s) not found in ICE'
FOLDER_NOT_FOUND = ("Folder(s) weren't found found in ICE, or your account doesn't have "
                    "permission to read them")


# Experiment Description file-specific errors
BAD_FILE_CATEGORY = 'Incorrect file format'
EMPTY_WORKBOOK = 'Empty workbook'
DUPLICATE_LINE_ATTR = 'Duplicate line attribute column'
DUPLICATE_ASSAY_METADATA = ('Several columns specify the same (protocol + assay metadata) '
                            'combination')
DUPLICATE_LINE_METADATA = 'Duplicate line metadata column'
INVALID_CELL_TYPE_TITLE = 'Invalid cell type'
INVALID_CELL_TYPE = 'Cells have invalid type'
INVALID_REPLICATE_COUNT = 'Invalid replicate count'
ZERO_REPLICATES = ('Zero replicates are not allowed. If no lines are desired, remove row(s) from '
                   'the file.')
MISSING_REQUIRED_LINE_NAME = 'Missing required line name in non-empty row(s)'
MISSING_REQUIRED_COLUMN_TITLE = 'Incorrect file format'
UNMATCHED_ASSAY_COL_HEADERS_KEY = 'Invalid column header(s) (Unmatched assay metadata suffix)'
INVALID_COLUMN_HEADER = 'Invalid column header(s)'
INCORRECT_TIME_FORMAT = 'Incorrect time format'
# only supported for strains, since some metadata columns purposefully allow comma-delimited entry
INCONSISTENT_COMBINATORIAL_VALUE = 'Combinatorial value provided for single-valued column'
UNPARSEABLE_COMBINATORIAL_VALUE = 'Unparseable combinatorial value'
DELIMETER_NOT_ALLOWED_VALUE = ("Semicolon character isn't allowed within part numbers. Use commas "
                               "to delimit ICE part numbers, except when defining multiple strain "
                               "groups for combinatorial creation")

INTERNAL_EDD_ERROR_CATEGORY = 'Internal EDD error'

POSSIBLE_USER_ERROR_CATEGORY = 'Possible User Error'


# either user input error in Experiment Description/ICE part permissions, or an ICE error (known
# ICE errors exist in ICE 5.2.2 as of 3-1-17)
SINGLE_PART_ACCESS_ERROR_CATEGORY = 'ICE part access problem'
SINGLE_FOLDER_ACCESS_ERROR_CATEGORY = 'ICE folder access problem'
EMPTY_FOLDER_ERROR_CATEGORY = 'Empty ICE folder(s)'
EMPTY_FOLDER_ERROR_TITLE = ''
NO_FILTERED_ENTRIES_ERROR_CATEGORY = 'Folder contents filtered out'
NO_ENTRIES_TITLE = 'No entries passed filtering for folders'
FORBIDDEN_PART_KEY = 'Missing ICE read permission for part number(s)'
FORBIDDEN_FOLDER_KEY = ("Unable to determine how many lines to create, since folder "
                        "contents can't be read.  ICE read permission is missing for folder(s)")

# Experiment Description file-specific warnings
MULTIPLE_WORKSHEETS_FOUND = 'Multiple worksheets were found in the document'
LINE_META_CAPITALIZATION_ONLY_DIFFERENCE = ('Found some line metadata types that differ only by '
                                            'case. Case-insensitive matching in parsing code will '
                                            'arbitrarily choose one')
ASSAY_META_CAPITALIZATION_ONLY_DIFFERENCE = ('Found some assay metadata types that differ only by '
                                             'case. Case-insensitive matching in parsing code will'
                                             ' arbitrarily choose one')
UNSUPPORTED_LINE_METADATA = 'Unsupported line metadata'
ICE_NOT_CONFIGURED = 'ICE connection not configured'
IGNORED_INPUT_CATEGORY = 'User input ignored'
ROWS_MISSING_REPLICATE_COUNT = 'Rows missing replicate count (assumed only 1 line)'

###################################################################################################
# Self/client consistency checks.  Experiment Description code is written defensively to help to
# detect coding errors in EDD's eventual Experiment Description GUI, an API client,
# or in development / maintenance of complex Experiment Description back-end code)
###################################################################################################
FOUND_PART_NUMBER_DOESNT_MATCH_QUERY = 'Found part number does not match query'
INVALID_ASSAY_META_PK = 'Invalid assay metadata pks'
INVALID_LINE_META_PK = 'Invalid line metadata pks'
INVALID_PROTOCOL_META_PK = 'Invalid protocol pks'
PARSE_ERROR = 'Parse error'
UNMATCHED_PART_NUMBER = 'Unmatched part number(s). This indicates a coding error in EDD.'

# Combinatorial GUI or API - specific errors
INVALID_AUTO_NAMING_INPUT = 'Invalid element for automatic naming'
MISSING_REQUIRED_NAMING_INPUT = 'Missing required input for line names'

###################################################################################################
# ICE-related errors
###################################################################################################

# anticipated systemic (e.g. communication) error or error that isn't otherwise planned for /
# handled separately (e.g. EDD/ICE configuration errors or ICE bugs)
SYSTEMIC_ICE_ACCESS_ERROR_CATEGORY = 'ICE access error'
GENERIC_ICE_RELATED_ERROR = ("ICE couldn't be contacted to find strains")

# Proactively check for part numbers that don't match EDD's part number pattern. This will help
# users detect bad data entry when diagnosing other parsing-related errors, and will also help
# us keep EDD's pattern configuration data up to date with use
PART_NUMBER_PATTERN_UNMATCHED_WARNING = "Part number(s) didn't match the expected pattern"

###################################################################################################
# Generic errors... likely require admin investigation / determination re: cause
###################################################################################################

UNPREDICTED_ERROR = 'An unpredicted error occurred, and administrators have been notified'
UNSUPPORTED_FILE_TYPE = 'Unsupported file type'  # TODO RESOLVE WITH incorrect file format

# Errors caused by outstanding curation work in JBEI's database / resulting lack of constraints in
# EDD's DB schema...see EDD-158
NON_UNIQUE_STRAIN_UUIDS = 'Non-unique strain uuids'

###################################################################################################
# Request parameters
###################################################################################################
OMIT_STRAINS = 'OMIT_STRAINS'
IGNORE_ICE_ACCESS_ERRORS_PARAM = 'IGNORE_ICE_ACCESS_ERRORS'
ALLOW_NON_STRAIN_PARTS = 'ALLOW_NON_STRAIN_PARTS'
ALLOW_DUPLICATE_NAMES_PARAM = 'ALLOW_DUPLICATE_NAMES'
DRY_RUN_PARAM = 'DRY_RUN'
EMAIL_WHEN_FINISHED = 'EMAIL_WHEN_FINISHED'

INCONSISTENT_FOLDERS = 'Inconsistent ICE folders.  Folders must be the same for all rows'
INCONSISTENT_FILTERS = 'Inconsistent filters.  Filters must be the same for all rows'

###################################################################################################
# Categorization and display priority order for predicted errors / warnings
###################################################################################################
# Define display priority order for all errors defined in this file.  The back-end will provide
# errors in this order for display in the user interface. Generally, we list user errors first
# so that even in the case of EDD / ICE errors, users and client code can see / resolve their own
# errors first. There's also some dependence here on the order in which the back end code executes
# major steps.
ERROR_PRIORITY_ORDER = OrderedDict()

# Experiment Description file-specific errors
ERROR_PRIORITY_ORDER[BAD_FILE_CATEGORY] = (
        # file-wide errors
        EMPTY_WORKBOOK,
        UNSUPPORTED_FILE_TYPE,
        MULTIPLE_WORKSHEETS_FOUND,

        # errors in defining column headers
        MISSING_REQUIRED_COLUMN_TITLE,
        INVALID_COLUMN_HEADER,
        UNMATCHED_ASSAY_COL_HEADERS_KEY,  # TODO: specifically mention assay col header suffix

        DUPLICATE_LINE_ATTR,
        DUPLICATE_LINE_METADATA,
        DUPLICATE_ASSAY_METADATA,
)
INVALID_FILE_VALUE_CATEGORY = 'Invalid data cells'
ERROR_PRIORITY_ORDER[INVALID_FILE_VALUE_CATEGORY] = (
    # cell-specific values
    MISSING_REQUIRED_LINE_NAME,
    DUPLICATE_LINE_NAME_LITERAL,
    INVALID_CELL_TYPE,
    INCONSISTENT_COMBINATORIAL_VALUE,
    INCORRECT_TIME_FORMAT,
    UNPARSEABLE_COMBINATORIAL_VALUE,
    DELIMETER_NOT_ALLOWED_VALUE,
    INCONSISTENT_FOLDERS,
    INCONSISTENT_FILTERS,
)

INVALID_JSON = 'Invalid JSON format'
ILLEGAL_FIELD_REFERENCE = ''
INVALID_RELATED_FIELD_REFERENCE = 'Invalid related field reference'
ILLEGAL_RELATED_FIELD_REFERENCE = 'Illegal related field reference'
INVALID_LINE_ATTRIBUTE = 'Invalid Line attribute'

# these apply equally to JSON or Excel
BAD_GENERIC_INPUT_CATEGORY = 'Invalid values'
ERROR_PRIORITY_ORDER[BAD_GENERIC_INPUT_CATEGORY] = (
        NO_INPUT,
        INVALID_RELATED_FIELD_REFERENCE,
        ILLEGAL_RELATED_FIELD_REFERENCE,
        ILLEGAL_RELATED_FIELD_REFERENCE,
        INVALID_LINE_ATTRIBUTE,
        INVALID_REPLICATE_COUNT,
        ZERO_REPLICATES,
        INVALID_JSON,

)

STRAINS_REQUIRED_TITLE = ("ICE strains are required for combinatorial line creation, but couldn't "
                          "be found in ICE")
STRAINS_ACCESS_REQUIRED_FOR_COMBO = ('Missing ICE read permission for parts required as input '
                                     'for combinatorial line creation')

STRAINS_REQUIRED_FOR_COMBO = ('ICE lookup failed for one or more entries, but entries are '
                              'required for combinatorial line creation')
STRAINS_REQUIRED_FOR_NAMES = ('ICE lookup failed for one or more entries, but entry names are '
                              'required as input to computing line names')

STRAINS_ACCESS_REQUIRED_FOR_NAMES = ('Missing ICE read permission for part(s) required as input '
                                     'to computing EDD line names')

###################################################################################################
# User-created ICE part access errors
###################################################################################################
USER_CREATED_ICE_PART_ERRORS = (
    PART_NUMBER_NOT_FOUND,
    FORBIDDEN_PART_KEY,)
ERROR_PRIORITY_ORDER[SINGLE_PART_ACCESS_ERROR_CATEGORY] = USER_CREATED_ICE_PART_ERRORS

###################################################################################################
# User-created ICE folder access errors
###################################################################################################
ERROR_PRIORITY_ORDER[EMPTY_FOLDER_ERROR_CATEGORY] = EMPTY_FOLDER_ERROR_TITLE
ERROR_PRIORITY_ORDER[NO_FILTERED_ENTRIES_ERROR_CATEGORY] = NO_ENTRIES_TITLE
USER_CREATED_ICE_FOLDER_ERRORS = (
    FOLDER_NOT_FOUND,
    FORBIDDEN_FOLDER_KEY,
)
ERROR_PRIORITY_ORDER[SINGLE_FOLDER_ACCESS_ERROR_CATEGORY] = USER_CREATED_ICE_FOLDER_ERRORS


################################
# ICE-related software/configuration/communication errors
################################
ICE_CONNECTION_ERROR = 'A problem occurred while trying to connect to ICE.'
ERROR_PRIORITY_ORDER[SYSTEMIC_ICE_ACCESS_ERROR_CATEGORY] = (ICE_NOT_CONFIGURED,
                                                            ICE_CONNECTION_ERROR,
                                                            STRAINS_REQUIRED_FOR_NAMES,
                                                            GENERIC_ICE_RELATED_ERROR,)

ERROR_PRIORITY_ORDER[NON_STRAINS_CATEGORY] = (NON_STRAIN_ICE_ENTRY,)

NON_UNIQUE_LINE_NAMES_CATEGORY = 'Non-unique line names'

# User-created naming overlaps (depend on prior ICE communication since strain names could be used
# in line/assay naming)
_NAMING_OVERLAPS = (
    DUPLICATE_COMPUTED_LINE_NAMES,
    EXISTING_LINE_NAMES,  # TODO make var name study-specific

    # TODO: included here for safety, but unlikely at present that these will be created...wait
    # until we implement/use a combinatorial GUI under EDD-257, then remove if never witnessed.
    DUPLICATE_INPUT_ASSAY_NAMES,
    EXISTING_ASSAY_NAMES,
    STRAINS_REQUIRED_FOR_NAMES,
)
ERROR_PRIORITY_ORDER[NON_UNIQUE_LINE_NAMES_CATEGORY] = _NAMING_OVERLAPS

################################
# Generic errors... users can't help with these
################################
ERROR_PRIORITY_ORDER[INTERNAL_EDD_ERROR_CATEGORY] = (
    INVALID_AUTO_NAMING_INPUT,  # Combinatorial GUI- or other API-client errors
    MISSING_REQUIRED_NAMING_INPUT,

    UNPREDICTED_ERROR,
    # Errors caused by outstanding curation work in JBEI's database / resulting lack of constraints
    # in EDD's DB schema...see EDD-158
    NON_UNIQUE_STRAIN_UUIDS,

    ##################################
    # EDD self/client consistency checks
    ##################################
    FOUND_PART_NUMBER_DOESNT_MATCH_QUERY,
    INVALID_ASSAY_META_PK,
    INVALID_LINE_META_PK,
    INVALID_PROTOCOL_META_PK,
    PARSE_ERROR,
    UNMATCHED_PART_NUMBER,
    EMPTY_RESULTS
)

WARNING_PRIORITY_ORDER = OrderedDict()
WARNING_PRIORITY_ORDER[IGNORED_INPUT_CATEGORY] = (
    # Experiment Description file-specific warnings
    UNSUPPORTED_LINE_METADATA,
    ROWS_MISSING_REPLICATE_COUNT,
    LINE_META_CAPITALIZATION_ONLY_DIFFERENCE,
    ASSAY_META_CAPITALIZATION_ONLY_DIFFERENCE,
)
WARNING_PRIORITY_ORDER[POSSIBLE_USER_ERROR_CATEGORY] = (PART_NUMBER_PATTERN_UNMATCHED_WARNING,)

WARNING_PRIORITY_ORDER[SINGLE_PART_ACCESS_ERROR_CATEGORY] = USER_CREATED_ICE_PART_ERRORS
WARNING_PRIORITY_ORDER[NON_UNIQUE_LINE_NAMES_CATEGORY] = _NAMING_OVERLAPS
WARNING_PRIORITY_ORDER[SYSTEMIC_ICE_ACCESS_ERROR_CATEGORY] = (GENERIC_ICE_RELATED_ERROR,)


class IceErrCondition(Enum):
    COMBINATORIAL_STRAINS = 1
    STRAIN_NAMES_REQUIRED = 2
    GENERIC_ERR = 3


SINGLE_ENTRY_LOOKUP_ERRS = {
    codes.forbidden: {
        IceErrCondition.COMBINATORIAL_STRAINS: (SINGLE_PART_ACCESS_ERROR_CATEGORY,
                                                STRAINS_REQUIRED_TITLE),
        IceErrCondition.STRAIN_NAMES_REQUIRED: (SINGLE_PART_ACCESS_ERROR_CATEGORY,
                                                STRAINS_ACCESS_REQUIRED_FOR_NAMES),
        IceErrCondition.GENERIC_ERR: (SINGLE_PART_ACCESS_ERROR_CATEGORY, FORBIDDEN_PART_KEY),
    },
    codes.not_found: {
        IceErrCondition.STRAIN_NAMES_REQUIRED: (NON_UNIQUE_LINE_NAMES_CATEGORY,
                                                STRAINS_REQUIRED_FOR_NAMES),
        IceErrCondition.COMBINATORIAL_STRAINS: (NON_UNIQUE_LINE_NAMES_CATEGORY,
                                                STRAINS_REQUIRED_FOR_COMBO),
        IceErrCondition.GENERIC_ERR: (SINGLE_PART_ACCESS_ERROR_CATEGORY, PART_NUMBER_NOT_FOUND),
    }
}

SINGLE_FOLDER_LOOKUP_ERRS = {
    codes.forbidden: {
        IceErrCondition.COMBINATORIAL_STRAINS: (SINGLE_FOLDER_ACCESS_ERROR_CATEGORY,
                                                FORBIDDEN_FOLDER_KEY),
        IceErrCondition.STRAIN_NAMES_REQUIRED: None,  # case is unique to single-entry query
        IceErrCondition.GENERIC_ERR: (SINGLE_FOLDER_ACCESS_ERROR_CATEGORY, FORBIDDEN_FOLDER_KEY),
    },
    codes.not_found: {
        IceErrCondition.COMBINATORIAL_STRAINS: (SINGLE_FOLDER_ACCESS_ERROR_CATEGORY,
                                                FOLDER_NOT_FOUND),
        IceErrCondition.STRAIN_NAMES_REQUIRED: None,  # case is unique to single-entry query
        IceErrCondition.GENERIC_ERR: (SINGLE_FOLDER_ACCESS_ERROR_CATEGORY, FOLDER_NOT_FOUND),
    }
}


###################################################################################################
# Name elements for AutomatedNamingStrategy (used during JSON input implemented for eventual
# combinatorial line creation GUI).
###################################################################################################
NAME_ELT_STRAIN_NAME = 'strain__name'
NAME_ELT_REPLICATE_NUM = 'replicate_num'
REPLICATE_COUNT_ELT = 'replicate_count'
ICE_FOLDERS_KEY = 'ice_folder'
BASE_NAME_ELT = 'base_name'
ELEMENTS_SECTION = 'elements'
CUSTOM_ADDITIONS_SECTION = 'custom_additions'
ABBREVIATIONS_SECTION = 'abbreviations'
NAME_ELEMENTS_SECTION = 'name_elements'
COMMON_LINE_METADATA_SECTION = 'common_line_metadata'
COMBINATORIAL_LINE_METADATA_SECTION = 'combinatorial_line_metadata'
PROTOCOL_TO_ASSAY_METADATA_SECTION = 'protocol_to_assay_metadata'
PROTOCOL_TO_COMBINATORIAL_METADATA_SECTION = 'protocol_to_combinatorial_metadata'

# TODO: flesh out other items that are doubly-defined based on database field / metadata
# conflicts --
# CARBON_SOURCE = 'carbon_source'
# EXPERIMENTER = 'experimenter'
# CONTACT = 'contact'
