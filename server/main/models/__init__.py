"""Module contains the database models for the core EDD functionality."""

from .common import EDDSerialize
from .core import (
    Assay,
    Attachment,
    CarbonSource,
    Comment,
    EDDObject,
    Line,
    Measurement,
    MeasurementValue,
    Protocol,
    Strain,
    Study,
)
from .measurement_type import (
    GeneIdentifier,
    MeasurementType,
    MeasurementUnit,
    Metabolite,
    Phosphor,
    ProteinIdentifier,
)
from .metadata import EDDMetadata, MetadataGroup, MetadataType
from .permission import (
    EveryonePermission,
    GroupPermission,
    StudyPermission,
    UserPermission,
)
from .sbml import MetaboliteExchange, MetaboliteSpecies, SBMLTemplate
from .update import Datasource, Update
from .user import User, patch_user_model
from .worklist import WorklistColumn, WorklistTemplate

__all__ = [
    Assay,
    Attachment,
    CarbonSource,
    Comment,
    Datasource,
    EDDMetadata,
    EDDObject,
    EDDSerialize,
    EveryonePermission,
    GeneIdentifier,
    GroupPermission,
    Line,
    Measurement,
    MeasurementType,
    MeasurementUnit,
    MeasurementValue,
    Metabolite,
    MetaboliteExchange,
    MetaboliteSpecies,
    MetadataGroup,
    MetadataType,
    patch_user_model,
    Phosphor,
    ProteinIdentifier,
    Protocol,
    SBMLTemplate,
    Strain,
    Study,
    StudyPermission,
    Update,
    User,
    UserPermission,
    WorklistColumn,
    WorklistTemplate,
]


def __getattr__(name):
    from warnings import warn

    if name == "SYSTEM_META_TYPES":
        warn(
            "SYSTEM_META_TYPES is deprecated; use MetadataType.system() instead.",
            DeprecationWarning,
        )
        return globals()["MetadataType"].SYSTEM
    raise AttributeError(f"module {__name__} has no attribute {name}")
