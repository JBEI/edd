"""
Contains constant REST query parameter names / values used by both the client and server side code
for EDD's REST API. Although in many cases, the string values here exactly match the data member
names used in EDD's the Django Model classes, explicitly capturing them here helps
maintainability of the API across data member renames in Django's model classes
"""


####################################################################################################
# General parameter names / values that apply to multiple REST resources. Consistency!! :-)
####################################################################################################

LINE_ACTIVE_STATUS_PARAM = 'lines_active'
QUERY_ALL_OBJECTS = 'all'
QUERY_ACTIVE_OBJECTS_ONLY = 'active'
QUERY_INACTIVE_OBJECTS_ONLY = 'inactive'
NAME_REGEX = 'name_regex'
LINES_ACTIVE_DEFAULT = QUERY_ACTIVE_OBJECTS_ONLY
ACTIVE_STATUS_OPTIONS = (QUERY_ALL_OBJECTS, QUERY_ACTIVE_OBJECTS_ONLY, QUERY_INACTIVE_OBJECTS_ONLY)

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

####################################################################################################
# /rest/metadata_type
####################################################################################################
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

####################################################################################################
# /rest/strain
####################################################################################################
STRAIN_REGISTRY_ID = 'registry_id'
STRAIN_REGISTRY_URL_REGEX = 'registry_url_regex'
STRAIN_NAME = 'name'
STRAIN_NAME_REGEX = NAME_REGEX
STRAIN_CASE_SENSITIVE = CASE_SENSITIVE_PARAM

################
# /rest/study/lines
################
STUDY_LINE_NAME_REGEX = NAME_REGEX


####################################################################################################
# Others TODO: (need organization)
####################################################################################################

STRAIN_NAME_KEY = 'name'
STRAIN_DESCRIPTION_KEY = 'description'
STRAIN_REG_ID_KEY = 'registry_id'
STRAIN_REG_URL_KEY = 'registry_url'