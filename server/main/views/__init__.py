"""Module contains HTTP views for the main EDD functionality."""

from .ajax import (
    InlineMetadataPartialView,
    study_access,
    study_assay_table_data,
    study_edddata,
)
from .description import (
    AddAssayView,
    CloneLineView,
    CreateLineView,
    GroupLineView,
    InitialAddAssayView,
    InitialModifyLineView,
    ModifyLineView,
    RemoveLineView,
    StudyDescriptionView,
)
from .index import StudyCreateView, StudyIndexView
from .mixins import StudyObjectMixin
from .overview import (
    CreateAttachmentView,
    CreateCommentView,
    DeleteStudyView,
    ModifyPermissionView,
    ModifyStudyView,
    RestoreStudyView,
    StudyAttachmentView,
    StudyOverviewView,
)
from .study import StudyDetailView, StudyLinesView

__all__ = [
    AddAssayView,
    CloneLineView,
    CreateAttachmentView,
    CreateCommentView,
    CreateLineView,
    DeleteStudyView,
    GroupLineView,
    InitialAddAssayView,
    InitialModifyLineView,
    InlineMetadataPartialView,
    ModifyLineView,
    ModifyPermissionView,
    ModifyStudyView,
    RemoveLineView,
    RestoreStudyView,
    study_access,
    study_assay_table_data,
    study_edddata,
    StudyAttachmentView,
    StudyCreateView,
    StudyDescriptionView,
    StudyDetailView,
    StudyIndexView,
    StudyLinesView,
    StudyObjectMixin,
    StudyOverviewView,
]
