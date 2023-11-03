import dataclasses
import decimal
import itertools
import logging
import re
import typing
from collections.abc import Iterable

from django.db.models import Q
from django.utils.translation import gettext_lazy as _

from edd.lttb import largest_triangle_three_buckets
from main import models

from . import exceptions
from .models import DefaultUnit

if typing.TYPE_CHECKING:
    Any = typing.Any
    import uuid

logger = logging.getLogger(__name__)


class LocatorResolver(typing.Protocol):
    def locator_ids(self, locator: str) -> tuple[int | None, int | None]:
        ...


class TypeNameResolver(typing.Protocol):
    def type_id(self, type_name: str) -> int | None:
        ...


class UnitResolver(typing.Protocol):
    def unit_id(self, unit_name: str) -> int | None:
        ...


class ValueResolver(typing.Protocol):
    def values(self, record: "Record") -> list[decimal.Decimal]:
        ...


MetadataContainer = dict[str | int, str]
Values = typing.Sequence[typing.SupportsFloat]
T = typing.TypeVar("T")
C = typing.TypeVar("C", covariant=True)
V = typing.TypeVar("V", contravariant=True)
Pair = tuple[T, T]


def pairs(iterable: Iterable[T]) -> Iterable[Pair]:
    # make a two-item tuple of the *same* iterator
    it = iter(iterable)
    iters = (it, it)
    # zip the iterators so ABCDEF -> AB CD EF
    return zip(*iters)


@dataclasses.dataclass
class Record:
    """
    A record of a single value of set-of-values from a payload.

    This object should collect the pieces needed to construct a Measurement
    and MeasurementValue from any data payload.

    :param locator: the name of a line or assay parent record for the data
    :param metadata: key-value pairs of metadata to attach to the Assay
    :param shape: enum value from Measurement.Format describing how data is
        packed in the `x`/`y` lists
    :param type_name: a name or lookup key for a MeasurementType
    :param x: list of x-values to store in the database
    :param x_unit: name or lookup key for X-axis MeasurementUnit
    :param y: list of y-values to store in the database
    :param y_unit: name or lookup key for Y-axis MeasurementUnit
    """

    # from inputs
    locator: str | None = None
    metadata: MetadataContainer = dataclasses.field(default_factory=dict)
    shape: str | None = None
    type_name: str | None = None
    x: list[typing.SupportsFloat] = dataclasses.field(default_factory=list)
    x_unit: str | None = None
    y: list[typing.SupportsFloat] = dataclasses.field(default_factory=list)
    y_unit: str | None = None
    # resolved IDs
    assay_id: int | None = None
    line_id: int | None = None
    type_id: int | None = None
    x_unit_id: int | None = None
    y_unit_id: int | None = None

    def is_ready(self) -> bool:
        checks = (
            self.locator is not None,
            self.shape is not None,
            self.type_name is not None,
            self.x_unit is not None,
            self.y_unit is not None,
            len(self.y) > 0,
        )
        return all(checks)

    def resolve(self, resolver) -> set[str]:
        failed: set[str] = set()
        if missing_locator := self._resolve_locator(resolver):
            failed.add(f"locator:{missing_locator}")
        if missing_type := self._resolve_type(resolver):
            failed.add(f"type:{missing_type}")
        if missing_x_unit := self._resolve_x_unit(resolver):
            failed.add(f"unit:{missing_x_unit}")
        if missing_y_unit := self._resolve_y_unit(resolver):
            failed.add(f"unit:{missing_y_unit}")
        if not self._resolve_x(resolver):
            failed.add("x:")
        return failed

    def _resolve_locator(self, resolver: LocatorResolver) -> str | None:
        """
        Assign Line/Assay IDs from the LocatorResolver if needed, returning
        any unresolved locator tokens.
        """
        if self.line_id is None and self.locator is not None:
            self.assay_id, self.line_id = resolver.locator_ids(self.locator)
        return self.locator if self.line_id is None else None

    def _resolve_type(self, resolver: TypeNameResolver) -> str | None:
        """
        Assign MeasurementType IDs from the TypeNameResolver if needed,
        returning any unresolved type name tokens.
        """
        if self.type_id is None and self.type_name is not None:
            self.type_id = resolver.type_id(self.type_name)
        return self.type_name if self.type_id is None else None

    def _resolve_x(self, resolver: ValueResolver) -> bool:
        """
        Assign values from the ValueResolver if needed, returning True only if
        the record has X-values.
        """
        if not self.x:
            self.x = resolver.values(self)
        return bool(self.x)

    def _resolve_x_unit(self, resolver: UnitResolver) -> str | None:
        """
        Assign Unit IDs from the UnitResolver if needed, returning any
        unresolved unit tokens.
        """
        if self.x_unit_id is None and self.x_unit is not None:
            self.x_unit_id = resolver.unit_id(self.x_unit)
        return self.x_unit if self.x_unit_id is None else None

    def _resolve_y_unit(self, resolver: UnitResolver) -> str | None:
        """
        Assign Unit IDs from the UnitResolver if needed, returning any
        unresolved unit tokens.
        """
        if self.y_unit_id is None and self.y_unit is not None:
            self.y_unit_id = resolver.unit_id(self.y_unit)
        return self.y_unit if self.y_unit_id is None else None


Cell = typing.Any
Row = Iterable[Cell]
Sheet = Iterable[tuple[int, Row]]


class ImportParser(typing.Protocol):
    """Interface for parsing values via an ImportReader."""

    reader: "ImportReader"
    uuid: "uuid.UUID"

    def parse(self, stream: "Any") -> Iterable[Record]:
        ...


class ImportReader(typing.Protocol):
    """
    Interface for reading in an arbitrary stream of payload data, to pass off
    to a Parser for interpreting.
    """

    def read(self, stream: "Any", layout: "ImportLayout") -> Sheet:
        ...

    def value(self, cell: Cell) -> "Any":
        ...


class ImportLayout(typing.Protocol):
    """Interface for interpreting layout of values with a Parser."""

    def __init__(self, parser: ImportParser):
        ...

    def finish(self) -> None:
        ...

    def process_row(self, row: Row, row_index: int) -> Iterable[Record]:
        ...

    def sheet(self, name: str | None) -> None:
        ...


class RecordUpdater(typing.Protocol[V]):
    """Interface for updating a Record with values extracted from a Parser."""

    def update(self, parser: ImportParser, record: Record, value: V) -> None:
        ...


LayoutInfo = tuple[str, type[ImportLayout]]
layout_registry: dict[str, LayoutInfo] = {}


class Layout:
    def __init__(self, *, key: str, label: str):
        self.key = key
        self.label = label

    def __call__(self, fn: type[ImportLayout]) -> type[ImportLayout]:
        layout_registry[self.key] = (self.label, fn)
        return fn

    @classmethod
    def all_available(cls) -> list[tuple[str, str]]:
        return [(k, v[0]) for k, v in layout_registry.items()]

    @classmethod
    def get_class(cls, key: str) -> type[ImportLayout]:
        entry = layout_registry.get(key, None)
        if entry:
            return entry[1]
        raise exceptions.UnknownLayout(key)

    @classmethod
    def get_label(cls, key: str) -> str:
        entry = layout_registry.get(key, None)
        if entry:
            return entry[0]
        raise exceptions.UnknownLayout(key)


def convert_datum(value: "Any") -> decimal.Decimal:
    try:
        datum = decimal.Decimal(value)
        if datum.is_finite():
            return datum
        raise exceptions.InvalidValueWarning(bad_value=value)
    except decimal.DecimalException as e:
        if value == "#N/A":
            return decimal.Decimal(0)
        raise exceptions.InvalidValueWarning(bad_value=value) from e


@dataclasses.dataclass
class HeadingPrototype(typing.Generic[T]):
    """
    Object used to mark a column in a spreadsheet-like payload as field(s) for
    a Record object. A defined Layout object has a set of headings / columns
    that it can interpret.
    """

    title: str
    is_required: bool = True

    def accept(self, heading_value: "Any") -> RecordUpdater[T] | None:
        """
        Given a potential heading value, return True if this object can try
        interpreting that column.
        """
        raise NotImplementedError()

    def check(self, value: "Any") -> T:
        if self.is_required and not value:
            raise exceptions.RequiredValueWarning()
        return value


@dataclasses.dataclass(eq=False)
class ColumnHeading(typing.Generic[T]):
    """
    Matches a HeadingPrototype to a specific column location in a payload.
    """

    prototype: HeadingPrototype[T]
    updater: RecordUpdater[T]

    column_index: int | None = None
    row_index: int | None = None
    title: str | None = None

    def check(self, value: "Any") -> T:
        return self.prototype.check(value)

    def save(self, parser: ImportParser, record: Record, value: T) -> None:
        self.updater.update(parser, record, value)


class RegexHeading(HeadingPrototype[T]):
    """A HeadingPrototype that uses a RegEx pattern to match a column."""

    def __init__(
        self,
        *,
        property_name: str,
        regex: re.Pattern[str],
        **kwargs,
    ):
        super().__init__(**kwargs)
        self.property_name = property_name
        self.regex = regex

    def accept(self, heading_value: "Any") -> RecordUpdater[T] | None:
        if isinstance(heading_value, str) and self.regex.fullmatch(heading_value):
            return self

    def update(self, parser: ImportParser, record: Record, value: T) -> None:
        setattr(record, self.property_name, value)


class DataHeading(RegexHeading[decimal.Decimal]):
    """A HeadingPrototype that matches columns containing data point(s)."""

    def check(self, value: "Any") -> decimal.Decimal:
        return convert_datum(super().check(value))

    def update(
        self,
        parser: ImportParser,
        record: Record,
        value: decimal.Decimal,
    ) -> None:
        getattr(record, self.property_name, []).append(value)


class MetadataUpdate:
    def __init__(self, metadata_type: models.MetadataType):
        self.metadata_type = metadata_type

    def update(self, parser: ImportParser, record: Record, value: "Any") -> None:
        meta = {self.metadata_type.pk: value}
        record.metadata.update(meta)


class MetadataHeading(HeadingPrototype[MetadataContainer]):
    """A HeadingPrototype that matches a MetadataType from the database."""

    def __init__(self, **kwargs) -> None:
        super().__init__(is_required=False, **kwargs)

    def accept(self, heading_value: "Any") -> RecordUpdater | None:
        if isinstance(heading_value, str) and heading_value:
            found = self.queryset().filter(type_name__iexact=heading_value)
            # limiting to 2 results; we need to check for 0, 1, or more
            results = found[:2]
            if len(results) == 1:
                return MetadataUpdate(results[0])
            elif len(results) == 2:
                raise exceptions.IgnoredMetadataColumnWarning(
                    ignored_name=heading_value
                )

    def queryset(self):
        return models.MetadataType.objects.filter(for_context=models.MetadataType.ASSAY)


class MeasurementUpdate:
    def __init__(
        self,
        measurement_type: models.MeasurementType,
        y_unit: models.MeasurementUnit,
    ):
        self.measurement_type = measurement_type
        self.y_unit = y_unit

    def update(
        self,
        parser: ImportParser,
        record: Record,
        value: decimal.Decimal,
    ) -> None:
        record.type_name = self.measurement_type.type_name
        record.type_id = self.measurement_type.pk
        record.y_unit = self.y_unit.unit_name
        record.y_unit_id = self.y_unit.pk
        record.y.append(value)


class MeasurementHeading(HeadingPrototype[decimal.Decimal]):
    """A HeadingPrototype that matches a MeasurementType from the database."""

    def __init__(self, *, layout_key, **kwargs):
        super().__init__(**kwargs)
        self.layout_key = layout_key

    def accept(self, heading_value: "Any") -> RecordUpdater[decimal.Decimal] | None:
        if isinstance(heading_value, str) and heading_value:
            try:
                found_type = self.lookup_type(name=heading_value)
                found_unit = self.lookup_unit(found_type)
                return MeasurementUpdate(found_type, found_unit)
            except Exception:
                raise exceptions.IgnoredColumnWarning(details=heading_value)

    def check(self, value: "Any") -> decimal.Decimal:
        return convert_datum(super().check(value))

    def lookup_type(self, *, name):
        try:
            direct_match = Q(
                type_name=name,
                type_group=models.MeasurementType.Group.GENERIC,
            )
            translated = Q(
                measurementnametransform__input_type_name=name,
                measurementnametransform__parser=self.layout_key,
            )
            possible = models.MeasurementType.objects.filter(direct_match | translated)
            return possible.get()
        except models.MeasurementType.DoesNotExist:
            logger.error(f"Measurement Type for `{name}` could not be found")
            raise
        except models.MeasurementType.MultipleObjectsReturned:
            candidates = [f"`{t.type_name}` (ID: {t.id})" for t in possible[:10]]
            logger.error(
                f"Measurement Type for `{name}` has multiple possible results, "
                f"including: {', '.join(candidates)}"
            )
            raise

    def lookup_unit(self, mtype):
        try:
            default = DefaultUnit.objects.get(
                measurement_type=mtype,
                parser=self.layout_key,
            )
            return default.unit
        except DefaultUnit.DoesNotExist:
            logger.error(
                f"Default Unit for (ID: {mtype.pk}) {mtype.type_name} could not be found"
            )
            raise


class BaseLayout:
    """
    A Strategy class for processing rows of data from an ImportReader.
    Sub-classes should implement get_prototypes() and no_header_row().
    """

    def __init__(self, parser: ImportParser):
        self.parser: ImportParser = parser
        self.reader: ImportReader = parser.reader
        self.columns: Iterable[ColumnHeading | None] = []

    def get_prototypes(self) -> Iterable[HeadingPrototype]:
        raise NotImplementedError()

    def finish(self) -> None:
        if not self.columns:
            raise self.no_header_row()

    def is_header_row(self, row: Row, row_index: int) -> bool:
        matched = self._match_header_row(row, row_index)
        if self._all_required_present(matched):
            self.columns = matched
            return True
        return False

    def no_header_row(self) -> exceptions.RequiredColumnError:
        raise NotImplementedError()

    def process_row(self, row: Row, row_index: int) -> Iterable[Record]:
        raise NotImplementedError()

    def sheet(self, name):
        # default to doing nothing
        pass

    def _all_required_present(self, matched: Iterable[ColumnHeading | None]) -> bool:
        any_required = False
        all_required = True
        for c in self.get_prototypes():
            found = filter(lambda m: m and c == m.prototype, matched)
            if c.is_required:
                is_found = any(found)
                any_required = any_required or is_found
                all_required = all_required and is_found
        if any_required and not all_required:
            raise self.no_header_row()
        return all_required

    def _match_header_row(
        self,
        row: Row,
        row_index: int,
    ) -> Iterable[ColumnHeading | None]:
        return [
            self._match_header(self.reader.value(cell), row_index, column_index)
            for column_index, cell in enumerate(row)
        ]

    def _match_header(
        self,
        content: "Any",
        row_index: int,
        column_index: int,
    ) -> ColumnHeading | None:
        for c in self.get_prototypes():
            try:
                if updater := c.accept(content):
                    return ColumnHeading(
                        prototype=c,
                        updater=updater,
                        column_index=column_index,
                        row_index=row_index,
                        title=content,
                    )
            except exceptions.ParseWarning as w:
                logger.warning("Problem parsing header", exc_info=w)
        return None

    def _start_record(self, **kwargs) -> Record:
        raise NotImplementedError()


@Layout(key="generic", label=_("Generic"))
class GenericLayout(BaseLayout):
    """
    Layout for "Generic" data files, one datapoint per row.
    """

    prototypes: Iterable[HeadingPrototype] = [
        RegexHeading(
            property_name="locator",
            regex=re.compile(r"\s*Line\s*Name\s*", flags=re.IGNORECASE),
            title="Line Name",
        ),
        RegexHeading(
            property_name="type_name",
            regex=re.compile(r"\s*Measurement\s*Type\s*", flags=re.IGNORECASE),
            title="Measurement Type",
        ),
        DataHeading(
            property_name="y",
            regex=re.compile(r"\s*Value\s*", flags=re.IGNORECASE),
            title="Value",
        ),
        DataHeading(
            property_name="x",
            regex=re.compile(r"\s*Time\s*", flags=re.IGNORECASE),
            title="Time",
        ),
        RegexHeading(
            property_name="y_unit",
            regex=re.compile(r"\s*Units?\s*", flags=re.IGNORECASE),
            title="Units",
        ),
        MetadataHeading(title="Metadata"),
    ]

    def get_prototypes(self) -> Iterable[HeadingPrototype]:
        return self.prototypes

    def no_header_row(self) -> exceptions.RequiredColumnError:
        return exceptions.RequiredColumnError(
            details=[
                _(
                    "The generic layout requires columns of `Line Name`, "
                    "`Measurement Type`, `Time`, `Value`, and `Units`."
                )
            ],
        )

    def process_row(self, row: Row, row_index: int) -> Iterable[Record]:
        if not self.columns:
            self.is_header_row(row, row_index)
        else:
            record = self._apply_row(row, row_index)
            if record.is_ready():
                yield record

    def _apply_row(self, row, row_index) -> Record:
        record = self._start_record()
        for column, cell in zip(self.columns, row):
            try:
                if column:
                    value = column.check(self.parser.reader.value(cell))
                    column.save(self.parser, record, value)
            except (exceptions.EDDImportError, exceptions.EDDImportWarning) as e:
                logger.info(
                    f"({self.parser.uuid}) Failed to process row {row_index}: {e}",
                )
                break
        return record

    def _start_record(self, **kwargs) -> Record:
        return Record(
            shape=models.Measurement.Format.SCALAR,
            x_unit="hours",
            **kwargs,
        )


@Layout(key="skyline", label=_("Skyline"))
class SkylineLayout(BaseLayout):
    """
    Layout for "Skyline" data files, time column optional, and sum areas of a
    protein before creating a measurement.
    """

    prototypes: Iterable[HeadingPrototype] = [
        RegexHeading(
            property_name="locator",
            regex=re.compile(
                r"\s*Assay\s*Name\s*|\s*Line\s*Name\s*|\s*Replicate\s*Name\s*",
                flags=re.IGNORECASE,
            ),
            title="Replicate Name",
        ),
        RegexHeading(
            property_name="type_name",
            regex=re.compile(
                r"\s*Measurement\s*Type\s*|\s*Protein\s*Name\s*",
                flags=re.IGNORECASE,
            ),
            title="Protein Name",
        ),
        DataHeading(
            is_required=False,
            property_name="x",
            regex=re.compile(r"\s*Time\s*", flags=re.IGNORECASE),
            title="Time",
        ),
        DataHeading(
            property_name="y",
            regex=re.compile(r"\s*Total\s*Area\s*", flags=re.IGNORECASE),
            title="Total Area",
        ),
        RegexHeading(
            is_required=False,
            property_name="y_unit",
            regex=re.compile(r"\s*Units?\s*", flags=re.IGNORECASE),
            title="Units",
        ),
        MetadataHeading(title="Metadata"),
    ]
    record = None

    def get_prototypes(self) -> Iterable[HeadingPrototype]:
        return self.prototypes

    def no_header_row(self) -> exceptions.RequiredColumnError:
        return exceptions.RequiredColumnError(
            details=[
                _(
                    "The Skyline layout requires columns of `Replicate Name`, "
                    "`Protein Name`, and `Total Area`."
                ),
            ],
        )

    def process_row(self, row: Row, row_index: int) -> Iterable[Record]:
        if not self.columns:
            self.is_header_row(row, row_index)
        elif row:
            record = self._apply_row(row, row_index)
            if not record.is_ready():
                raise exceptions.IgnoredRowWarning(row_index=row_index)
            elif self.record is None:
                self.record = record
            elif self._record_match(record):
                self.record.y[0] += record.y[0]
            else:
                # starting new record
                yield self.record
                self.record = record
        elif row_index == -1 and self.record is not None:
            # yielding final record of sheet
            yield self.record

    def sheet(self, name) -> None:
        self.record = None

    def _apply_row(self, row, row_index) -> Record:
        record = self._start_record()
        for column, cell in zip(self.columns, row):
            try:
                if column:
                    value = column.check(self.parser.reader.value(cell))
                    column.save(self.parser, record, value)
            except (exceptions.EDDImportError, exceptions.EDDImportWarning) as e:
                logger.info(
                    f"({self.parser.uuid}) Failed to process row {row_index}: {e}",
                )
                break
        return record

    def _record_match(self, record) -> bool:
        return (
            self.record is not None
            and self.record.locator == record.locator
            and self.record.type_name == record.type_name
            and self.record.x == record.x
        )

    def _start_record(self, **kwargs) -> Record:
        return Record(
            shape=models.Measurement.Format.SCALAR,
            x_unit="hours",
            y_unit="counts",
            **kwargs,
        )


@Layout(key="ambr", label=_("Ambr"))
class AmbrLayout(ImportLayout):
    def __init__(self, parser: ImportParser):
        self.parser: ImportParser = parser
        self.reader: ImportReader = parser.reader
        self.column_pairs: Iterable[Pair[ColumnHeading | None]] = []
        self.records: list[Record | None] = []
        self.locator: str | None = None

    def finish(self) -> None:
        pass

    def check_header_row(self, row: Row, row_index: int) -> bool:
        # match pairs to time/value, alternating
        columns = [
            self._match_value(self.reader.value(cell), row_index, column_index)
            if column_index % 2
            else self._match_time(self.reader.value(cell), row_index, column_index)
            for column_index, cell in enumerate(row)
        ]
        # split into pairs
        self.column_pairs = list(pairs(columns))
        # try to create records for each pair
        self.records = [self._start_record(pair) for pair in self.column_pairs]
        # check if all the header pairs are OK
        return self._valid_header_pairs()

    def no_header_row(self) -> exceptions.EDDImportError:
        return exceptions.RequiredColumnError(
            details=[
                _(
                    "The Ambr layout requires pairs of columns, each pair a "
                    "`Time` followed by a measurement type."
                )
            ],
        )

    def process_row(self, row: Row, row_index: int) -> Iterable[Record]:
        if not self.column_pairs:
            if not self.check_header_row(row, row_index):
                # enforcing first row must be header
                raise self.no_header_row()
            return
        cell_pairs = pairs(row)
        triple = itertools.zip_longest(self.records, self.column_pairs, cell_pairs)
        yielding: set[int] = set()
        for index, (record, column_pair, data_pair) in enumerate(triple):
            if not record:
                pass
            elif self._assign_pair(record, column_pair, data_pair):
                pass
            elif record.is_ready():
                # record has all needed information, no new data added this row
                yielding.add(index)
                yield self._compress(record)
        # update self.records to remove those that have yielded already
        for item in yielding:
            self.records[item] = None

    def sheet(self, name: str | None) -> None:
        # reset locator and all the column/record definitions
        self.locator = name
        self.column_pairs = []
        self.records = []

    def _assign_pair(
        self,
        record: Record,
        column_pair: Pair[ColumnHeading | None],
        data_pair: Pair[Cell | None],
    ) -> bool:
        try:
            # get values from the reader, check values are valid
            x = column_pair[0].check(self.reader.value(data_pair[0]))
            y = column_pair[1].check(self.reader.value(data_pair[1]))
            # only save values when both are valid (no Exception raised)
            column_pair[0].save(self.parser, record, x)
            column_pair[1].save(self.parser, record, y)
            return True
        except exceptions.InvalidValueWarning:
            # not assigning any values, but continue processing column
            return True
        except Exception:
            # don't care if anything fails, continue to return False
            pass
        return False

    def _compress(self, record):
        """
        The AMBR output often contains many more values than we care to store.
        This is a hook point to sample the time series, so a more managable
        number of data points can be stored.
        """
        if len(record.x) > 200:
            points = list(zip(record.x, record.y))
            sampled = largest_triangle_three_buckets(points, 200)
            record.x, record.y = zip(*sampled)
        return record

    def _match_time(
        self,
        content: "Any",
        row_index: int,
        column_index: int,
    ) -> ColumnHeading | None:
        prototype = DataHeading(
            is_required=True,
            property_name="x",
            regex=re.compile(r"\s*Time\s*", flags=re.IGNORECASE),
            title=content,
        )
        if updater := prototype.accept(content):
            return ColumnHeading(
                prototype=prototype,
                updater=updater,
                column_index=column_index,
                row_index=row_index,
                title=content,
            )
        return None

    def _match_value(
        self,
        content: "Any",
        row_index: int,
        column_index: int,
    ) -> ColumnHeading | None:
        try:
            prototype = MeasurementHeading(title=content, layout_key="ambr")
            if updater := prototype.accept(content):
                return ColumnHeading(
                    prototype=prototype,
                    updater=updater,
                    column_index=column_index,
                    row_index=row_index,
                    title=content,
                )
        except exceptions.ParseWarning as w:
            logger.warning("Problem matching value to column", exc_info=w)
        return None

    def _start_record(self, pair: Pair[ColumnHeading | None]) -> Record | None:
        if pair[0] and pair[1]:
            return Record(
                locator=self.locator,
                shape=models.Measurement.Format.PACKED,
                type_name=pair[1].title,
                x_unit="hours",
            )
        return None

    def _valid_header_pairs(self) -> bool:
        return any((p[0] is not None) and (p[1] is not None) for p in self.column_pairs)
