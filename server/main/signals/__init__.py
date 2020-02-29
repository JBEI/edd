# The F401 error code is "imported but unused"
# ignoring it here because this module is imported to register handlers in submodules
from . import core, permission, sbml, user  # noqa: F401
from .signals import (
    study_modified,
    study_removed,
    type_modified,
    type_removed,
    user_modified,
    user_removed,
)

# doing `from main.signals import *` will import these names
__all__ = [
    "study_modified",
    "study_removed",
    "type_modified",
    "type_removed",
    "user_modified",
    "user_removed",
]
