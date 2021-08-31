from django.dispatch import Signal

# Search index management signals
study_modified = Signal(providing_args=["study", "using"])
study_removed = Signal(providing_args=["doc", "using"])
type_modified = Signal(providing_args=["measurement_type", "using"])
type_removed = Signal(providing_args=["doc", "using"])
user_modified = Signal(providing_args=["user", "using"])
user_removed = Signal(providing_args=["doc", "using"])

# EDD efficiency metric signals
study_created = Signal(providing_args=("study", "user"))
study_described = Signal(providing_args=("study", "user", "count"))
study_exported = Signal(providing_args=("study", "user", "count"))
study_imported = Signal(providing_args=("study", "user", "protocol", "count"))
study_permission_change = Signal(providing_args=("study", "user", "permission"))
study_viewed = Signal(providing_args=("study", "user"))
study_worklist = Signal(providing_args=("study", "user", "count"))
