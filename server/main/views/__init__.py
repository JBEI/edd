"""
Module contains HTTP views for the main EDD functionality.
"""

# The F401 error code is "imported but unused" warning; we ignore it here because this __init__
#   module exists only to map the individual files in this directory to the views module.

from .ajax import (  # noqa: F401
    StudyPermissionJSONView,
    study_assay_measurements,
    study_assay_table_data,
    study_edddata,
    study_measurements,
)

from .study import (  # noqa: F401; noqa: F401
    StudyAttachmentView,
    StudyCreateView,
    StudyDeleteView,
    StudyDetailView,
    StudyIndexView,
    StudyLinesView,
    # TODO: StudyObjectMixin should be internal-only
    StudyObjectMixin,
    StudyOverviewView,
    # TODO: load_study should be internal-only
    load_study,
)
