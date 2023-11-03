import decimal
import functools
import logging
import typing

from django.core.exceptions import MultipleObjectsReturned, ValidationError

from main import models

if typing.TYPE_CHECKING:
    from .layout import Record

logger = logging.getLogger(__name__)


class Resolver:
    def __init__(self, *, load, user):
        self.load = load
        self.user = user

    @functools.cache
    def assay(self, assay_id):
        try:
            return models.Assay.objects.get(
                active=True,
                id=assay_id,
                protocol_id=self.protocol.pk,
                study_id=self.study.pk,
            )
        except models.Assay.DoesNotExist:
            return None

    @functools.cache
    def assay_queryset(self):
        return models.Assay.objects.filter(
            active=True,
            protocol_id=self.protocol.pk,
            study_id=self.study.pk,
        )

    @functools.cache
    def line_queryset(self):
        return models.Line.objects.filter(
            active=True,
            study_id=self.study.pk,
        )

    @functools.cache
    def locator_ids(self, locator: str) -> (int | None, int | None):
        try:
            # search assays
            found_assay_qs = self.assay_queryset().filter(name=locator)
            # limit results
            found = found_assay_qs.values_list("id", "line_id")[:2]
            if len(found) == 1:
                return found[0]
            # try looking for line name
            found_line_qs = self.line_queryset().filter(name=locator)
            # limit results
            lines = found_line_qs[:2]
            if len(lines) == 1:
                line = lines[0]
                assay = line.new_assay(locator, self.protocol)
                return (assay.id, line.id)
        except Exception as e:
            logger.debug(f"Resolver error matching locator {locator}: {e}")
        return (None, None)

    @functools.cached_property
    def protocol(self):
        return self.load.protocol

    @functools.cached_property
    def study(self):
        return self.load.study

    @functools.cache
    def time_meta(self):
        return models.MetadataType.system("Time")

    @functools.cache
    def type_id(self, type_name: str) -> int | None:
        try:
            if found := (
                self.__typename(type_name)
                or self.__pubchem(type_name)
                or self.__uniprot(type_name)
                or self.__gene(type_name)
            ):
                return found.pk
        except Exception as e:
            logger.exception(f"Resolver error matching type {type_name}", exc_info=e)
        return None

    @functools.cache
    def unit_id(self, unit: str) -> int | None:
        try:
            found = models.MeasurementUnit.objects.get(unit_name__iexact=unit)
            return found.pk
        except MultipleObjectsReturned:
            logger.warning(f"Multiple matches on unit {unit}")
        except Exception:
            logger.debug(f"Resolver error matching unit {unit}")
        return None

    def values(self, record: "Record") -> list[decimal.Decimal]:
        time_meta = self.time_meta()
        if assay := self.assay(record.assay_id):
            if time := assay.metadata_get(time_meta):
                return [decimal.Decimal(time)]
        return []

    def __gene(self, token):
        # check on gene identifiers, *without* generating one
        try:
            return models.GeneIdentifier.load_existing(str(token), self.user)
        except models.GeneIdentifier.DoesNotExist:
            # no match, fall through
            pass

    def __pubchem(self, token):
        try:
            return models.Metabolite.load_or_create(str(token))
        except ValidationError:
            pass

    def __typename(self, token):
        try:
            return models.MeasurementType.objects.get(
                type_name__iexact=token,
                type_group=models.MeasurementType.Group.GENERIC,
            )
        except MultipleObjectsReturned as e:
            msg = f'Multiple Measurement Types found matching "{token}"'
            raise ValidationError(msg) from e
        except models.MeasurementType.DoesNotExist:
            pass

    def __uniprot(self, token):
        try:
            return models.ProteinIdentifier.load_or_create(str(token), self.user)
        except ValidationError:
            pass
