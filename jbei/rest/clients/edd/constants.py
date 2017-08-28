"""
Contains constant REST query parameter names / values used by both the client and server side code
for EDD's REST API. Although in many cases, the string values here exactly match the data member
names used in EDD's the Django Model classes, explicitly capturing them here helps
maintainability of the API across data member renames in Django's model classes
"""

###################################################################################################
# String constants for REST resource names
###################################################################################################
LINES_RESOURCE_NAME = r'lines'
ASSAYS_RESOURCE_NAME = r'assays'
MEASUREMENTS_RESOURCE_NAME = r'measurements'
PROTOCOLS_RESOURCE_NAME = r'protocols'
VALUES_RESOURCE_NAME = r'values'
STUDIES_RESOURCE_NAME = r'studies'
SEARCH_RESOURCE_NAME = r'search'
STRAINS_RESOURCE_NAME = r'strains'  # TODO: remove
MEASUREMENT_TYPES_RESOURCE_NAME = r'measurement_types'
MEASUREMENT_UNITS_RESOURCE_NAME = r'measurement_units'
METADATA_TYPES_RESOURCE_NAME = r'metadata_types'
METADATA_GROUPS_RESOURCE_NAME = r'metadata_groups'
USERS_RESOURCE_NAME = r'users'

###################################################################################################
# General parameter names / values that apply to multiple REST resources. Consistency!! :-)
###################################################################################################
ACTIVE_STATUS_PARAM = 'active'
QUERY_ANY_ACTIVE_STATUS = 'all'
QUERY_ACTIVE_OBJECTS_ONLY = 'active'
QUERY_INACTIVE_OBJECTS_ONLY = 'inactive'
NAME_REGEX_PARAM = 'name_regex'
DESCRIPTION_REGEX_PARAM = 'description'
MEASUREMENT_TYPE_PARAM = 'measurement_type'
META_SEARCH_PARAM = 'meta'
META_KEY_PARAM = 'key'
META_OPERATOR_PARAM = 'op'
META_VALUE_PARAM = 'test'
ACTIVE_STATUS_DEFAULT = QUERY_ACTIVE_OBJECTS_ONLY
ACTIVE_STATUS_OPTIONS = (QUERY_ANY_ACTIVE_STATUS, QUERY_ACTIVE_OBJECTS_ONLY,
                         QUERY_INACTIVE_OBJECTS_ONLY)
UNKNOWN = 0
INTRACELLULAR = 1
EXTRACELLULAR = 2

LOCALE_PARAM = 'locale'
CASE_SENSITIVE_PARAM = 'case_sensitive'
CASE_SENSITIVE_DEFAULT = False

CREATED_AFTER_PARAM = 'created_after'
CREATED_BEFORE_PARAM = 'created_before'
UPDATED_BEFORE_PARAM = 'updated_before'
UPDATED_AFTER_PARAM = 'updated_after'

PAGE_SIZE_QUERY_PARAM = 'page_size'
PAGE_NUMBER_QUERY_PARAM = 'page'
RESULTS_OFFSET_QUERY_PARAM = 'offset'

SORT_PARAM = 'sort_order'
FORWARD_SORT_VALUE = 'ascending'
REVERSE_SORT_VALUE = 'descending'

TYPE_GROUP_PARAM = 'type_group'

###################################################################################################
# DRF page result key names
###################################################################################################
RESULT_COUNT_KEY = 'count'
RESULTS_KEY = 'results'
NEXT_PAGE_KEY = 'next'
PREVIOUS_PAGE_KEY = 'previous'

###################################################################################################
# Parameter names & values for /rest/metadata_types
###################################################################################################
METADATA_TYPE_GROUP = 'group'
METADATA_TYPE_CONTEXT = 'for_context'
METADATA_TYPE_I18N = 'type_i18n'
METADATA_TYPE_NAME_REGEX = 'local_name_regex'
METADATA_TYPE_LOCALE = LOCALE_PARAM
METADATA_TYPE_CASE_SENSITIVE = CASE_SENSITIVE_PARAM

# METADATA applicability context. See uses in models.py, which should be maintained with these
METADATA_CONTEXT_LINE = 'L'
METADATA_CONTEXT_STUDY = 'S'
METADATA_CONTEXT_ASSAY = 'A'

METADATA_CONTEXT_VALUES = (METADATA_CONTEXT_LINE, METADATA_CONTEXT_STUDY, METADATA_CONTEXT_ASSAY)

###################################################################################################
# Parameter names & values for /rest/measurement_units/
###################################################################################################
UNIT_NAME_PARAM = 'unit_name'
ALT_NAMES_PARAM = 'alternate_names'

###################################################################################################
# Parameter names & values for /rest/strains/
###################################################################################################
STRAIN_REGISTRY_ID = 'registry_id'
STRAIN_REGISTRY_URL_REGEX = 'registry_url_regex'
STRAIN_NAME = 'name'
STRAIN_NAME_REGEX = NAME_REGEX_PARAM
STRAIN_CASE_SENSITIVE = CASE_SENSITIVE_PARAM

###################################################################################################
# Parameter names & values for /rest/studies/
###################################################################################################
STUDY_NAME_KEY = 'name'
STUDY_DESCRIPTION_KEY = 'description'
STUDY_CONTACT_KEY = 'contact'
UUID_KEY = 'uuid'

################
# /rest/studies/lines
################
STUDY_LINE_NAME_REGEX = NAME_REGEX_PARAM


###################################################################################################
# Others TODO: (need organization)
###################################################################################################

STRAIN_NAME_KEY = 'name'
STRAIN_DESCRIPTION_KEY = 'description'
STRAIN_REG_ID_KEY = 'registry_id'
STRAIN_REG_URL_KEY = 'registry_url'
