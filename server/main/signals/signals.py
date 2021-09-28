from django.dispatch import Signal

# Search index management signals
study_modified = Signal()
study_removed = Signal()
type_modified = Signal()
type_removed = Signal()
user_modified = Signal()
user_removed = Signal()

# EDD efficiency metric signals
study_created = Signal()
study_described = Signal()
study_exported = Signal()
study_imported = Signal()
study_permission_change = Signal()
study_viewed = Signal()
study_worklist = Signal()
