import functools
import logging
import typing
from collections.abc import Iterable

from edd.search.registry import StrainRegistry
from main import models as edd_models

from .parser import RecordResolver

if typing.TYPE_CHECKING:
    from django.contrib.auth import get_user_model

    User = get_user_model()

logger = logging.getLogger(__name__)


class Resolver(RecordResolver):
    def __init__(self, *, user: "User"):
        self.user = user

    def is_meta_ignored(self, name: str) -> bool:
        # this will not ignore any potential metadata, but the form resolver might
        return False

    def is_strain_ignored(self, name: str) -> bool:
        # this will not ignore any potential strain, but the form resolver might
        return False

    @functools.cache
    def metatype_from_name(self, name: str) -> edd_models.MetadataType | None:
        """
        Given a metadata type name, return matching database object.
        """
        try:
            return edd_models.MetadataType.objects.get(type_name__iexact=name)
        except Exception:
            pass
        return None

    @functools.cache
    def metatype_from_uuid(self, uuid: str) -> edd_models.MetadataType | None:
        """
        Given a metadata type UUID, return matching database object.
        """
        try:
            return edd_models.MetadataType.objects.get(uuid=uuid)
        except Exception:
            pass
        return None

    def protocol_id_from_name(self, name: str) -> int | None:
        """
        Given a metadata type name, return a protocol to use for the assay
        where the metadata will be assigned.
        """
        # This cannot currently be derived only from name, but the form will
        # use this interface to update records with a required protocol.
        return None

    @functools.cache
    def strains_from_name(self, name: str) -> Iterable[edd_models.Strain]:
        """
        Given a strain part ID, return a database ID.
        """
        # TODO: update this when replacing single-ICE
        try:
            ice = StrainRegistry()
            with ice.login(self.user):
                if part := ice.get_entry(name):
                    defaults = {
                        "name": part.name,
                        "registry_url": part.registry_url,
                    }
                    strain, created = edd_models.Strain.objects.get_or_create(
                        registry_id=part.registry_id,
                        defaults=defaults,
                    )
                    return [strain]
        except Exception as e:
            logger.warning(f"Error looking up strain from part `{name}`: {e}")
        return []
