"""
Module contains exceptions and exception reporting API's for edd_file_importer
"""

# expose only public API for error / warning tracking; note some functions in core purposefully
# omitted here
from .core import (  # noqa: F401
    EDDImportError,
    EDDImportException,
    EDDImportWarning,
    add_errors,
    errors,
    raise_errors,
    track_msgs,
    warnings,
)
from .execute import (  # noqa: F401
    ExecutionError,
    ExecutionWarning,
    MissingAssayError,
    MissingLineError,
    UnplannedOverwriteError,
)
from .parse import (  # noqa: F401
    BadParserError,
    DuplicateColumnError,
    EmptyFileError,
    IgnoredColumnWarning,
    IgnoredValueWarning,
    IgnoredWorksheetWarning,
    InvalidValueError,
    MissingParameterError,
    ParseError,
    RequiredColumnError,
    RequiredValueError,
    UnsupportedMimeTypeError,
    UnsupportedUnitsError,
)
from .resolve import (  # noqa: F401
    CommunicationError,
    CompartmentNotFoundError,
    DuplicateAssayError,
    DuplicateLineError,
    DuplicateMergeWarning,
    DuplicationWarning,
    GeneNotFoundError,
    IllegalTransitionError,
    ImportConflictWarning,
    ImportTooLargeError,
    InvalidIdError,
    MeasurementCollisionError,
    MergeWarning,
    MetaboliteNotFoundError,
    MissingAssayTimeError,
    OverdeterminedTimeError,
    OverwriteWarning,
    PhosphorNotFoundError,
    ProteinNotFoundError,
    ResolveError,
    ResolveWarning,
    TimeNotProvidedError,
    TimeUnresolvableError,
    UnexpectedError,
    UnitsNotProvidedError,
    UnmatchedAssayError,
    UnmatchedLineError,
    UnmatchedMtypeError,
    UnmatchedNamesError,
    UnmatchedStudyInternalsError,
)

# The F401 error code is "imported but unused" warning; we ignore it here because this __init__
#   module exists only to map the individual files in this directory to the exceptions module.
