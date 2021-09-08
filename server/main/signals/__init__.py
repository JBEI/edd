"""
Signals made available to recieve for actions made in EDD.

- study_created: Sent when a Study is created.
    :study: the Study model, post-creation
    :user: the User that created the Study
- study_described: Sent when adding Lines to a Study.
    :study: the Study model linked to the Lines
    :user: the User adding Lines
    :count: total number of Lines added; negative for archived/removed Lines
- study_exported: Sent when exporting data from a Study.
    :study: the Study model
    :user: the User running the export request
    :count: total number of Lines included in export
    :cross: True if the export spans multiple Study datasets
- study_imported: Sent when importing data to a Study.
    :study: the Study model
    :user: the User adding data to the Study
    :protocol: the Protocol used for the incoming data
    :count: total number of Lines with added import data
- study_modified: Sent when a Study model or its permissions change.
    :study: the Study model getting a change
    :using: the database name
- study_permission_change: Sent when a Study model has a permissions change.
    :study_id: the Study ID; the model may no longer exist in the database
    :user: the User making the permission change
    :permission: enum string for the kind of permission, from Permission.TYPE_CHOICE
    :selector: string defining to whom the permission applies
    :applied: True if permission is being applied; False if being removed
- study_removed: Sent after a Study is fully deleted.
    :doc: the primary key previously used by the study
    :using: the database name
- study_viewed: Sent when a Study is added to a user's recently viewed list.
    :study: the Study model
    :user: the User viewing the Study
- study_worklist: Sent when a Study generates a worklist export
    :study: the Study model
    :user: the User generating the worklist
    :count: total number of Lines exported to the worklist
    :cross: True if the export spans multiple Study datasets
- type_modified: Sent when a MeasurementType model is changed.
    :measurement_type: the MeasurementType model
    :using: the database name
- type_removed: Sent when a MeasurementType model is deleted.
    :doc: the primary key previously used by the MeasurementType
    :using: the database name
- user_modified: Sent when a User model is changed.
    :user: the User model
    :using: the database name
- user_removed: Sent when a User is deleted.
    :doc: the primary key previously used by the User
    :using: the database name
"""

# The F401 error code is "imported but unused"
# ignoring it here because this module is imported to register handlers in submodules
from . import core, metrics, permission, sbml, user  # noqa: F401
from .signals import (
    study_created,
    study_described,
    study_exported,
    study_imported,
    study_modified,
    study_permission_change,
    study_removed,
    study_viewed,
    study_worklist,
    type_modified,
    type_removed,
    user_modified,
    user_removed,
)

# doing `from main.signals import *` will import these names
__all__ = [
    study_created,
    study_described,
    study_exported,
    study_imported,
    study_modified,
    study_permission_change,
    study_removed,
    study_viewed,
    study_worklist,
    type_modified,
    type_removed,
    user_modified,
    user_removed,
]
