import csv
import dataclasses
import logging
import re
import typing
from collections.abc import Iterable

from django.utils.translation import gettext_lazy as _
from openpyxl import load_workbook

from main import models as edd_models

from .exceptions import SetupException

logger = logging.getLogger(__name__)
__doc__ = """
The concept of this module is providing a flexible way to read an input file,
and convert the information into a series of "Record" objects that can be used
to define the database records relating to Lines, Assays, Metadata, and
Strains. The "Parser" class does this by reading in a file header, then match
header values with a list of "Prototype" columns. If one of these prototypes
matches a column header, it provides an "Updater" object to the parser, so that
when the parser reads a row of data, that "Updater" can insert the data of the
row into a "Record" object and do validation, data conversions, etc. Then, the
parser can act as a generator for "Record" objects, given an input file.
"""


class MetaInfo(typing.TypedDict):
    name: str
    protocol: str | None
    uuid: str | None
    value: typing.Any | None


class StrainInfo(typing.TypedDict):
    name: str
    uuids: list[str] | None


class RecordResolver(typing.Protocol):
    """Interface for resolving record values to database identifiers."""

    def is_meta_ignored(self, name: str) -> bool:
        ...

    def is_strain_ignored(self, name: str) -> bool:
        ...

    def metatype_from_name(self, name: str) -> edd_models.MetadataType | None:
        ...

    def metatype_from_uuid(self, uuid: str) -> edd_models.MetadataType | None:
        ...

    def protocol_id_from_name(self, name: str) -> int | None:
        ...

    def strains_from_name(self, name: str) -> Iterable[edd_models.Strain]:
        ...


Cell = typing.Any
Row = Iterable[Cell]
Sheet = Iterable[tuple[int, Row]]
T = typing.TypeVar("T")
V = typing.TypeVar("V", contravariant=True)
EMPTY_ROW: tuple[int, Row] = (-1, [])
mime_csv = "text/csv"
mime_excel = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
mime_win_csv = "application/vnd.ms-excel"


@dataclasses.dataclass
class Record:
    """
    A record of name and metadata from a payload.

    This object should collect the pieces needed to construct a Line with its
    metadata, and any Assay with metadata known up-front.
    """

    # from inputs
    description: str | None = None
    meta: list[MetaInfo] = dataclasses.field(default_factory=list)
    name: str | None = None
    replicates: int | None = None
    strain: list[StrainInfo] = dataclasses.field(default_factory=list)

    def resolve(self, resolver: RecordResolver) -> set[str]:
        """
        Attempt to resolve string fields of record to database identifiers,
        using the passed Resolver object. Return a set of strings of typed
        tokens, made from prefixing the string with the type of field that
        needs resolving.
        """
        failed: set[str] = set()
        # filter metadata listing based on resolver inputs
        self.meta = list(self._filter_metadata(resolver, failed))
        # filter strains listing based on resolver inputs
        self.strain = list(self._filter_strain(resolver, failed))
        return failed

    def _filter_metadata(
        self,
        resolver: RecordResolver,
        failed: set[str],
    ) -> Iterable[MetaInfo]:
        for m in self.meta:
            meta_name = m["name"]
            meta_uuid = m["uuid"]
            # first pass resolve
            if meta_uuid is None:
                t = resolver.metatype_from_name(meta_name)
            else:
                t = resolver.metatype_from_uuid(meta_uuid)
            if t:
                self._update_metadata(m, t, resolver, failed)
                yield m
            elif resolver.is_meta_ignored(meta_name):
                pass
            else:
                failed.add("form:meta")
                failed.add(f"meta:{meta_name}")
                yield m

    def _filter_strain(
        self,
        resolver: RecordResolver,
        failed: set[str],
    ) -> Iterable[StrainInfo]:
        for s in self.strain:
            strain_name = s["name"]
            if s["uuids"]:
                yield s
            elif resolver.is_strain_ignored(strain_name):
                pass
            elif strains := resolver.strains_from_name(strain_name):
                s["uuids"] = [x.registry_id for x in strains]
                yield s
            else:
                failed.add("form:strain")
                failed.add(f"strain:{strain_name}")
                yield s

    def _update_metadata(
        self,
        meta: MetaInfo,
        metatype: edd_models.MetadataType,
        resolver: RecordResolver,
        failed: set[str],
    ) -> None:
        meta["uuid"] = metatype.uuid
        if metatype.for_assay() and meta["protocol"] is None:
            meta_name = meta["name"]
            p = resolver.protocol_id_from_name(meta_name)
            if p:
                meta["protocol"] = p
            else:
                failed.add(f"protocol:{meta_name}")


class RecordUpdater(typing.Protocol[V]):
    """Interface for updating a Record with values extracted from a Parser."""

    def update(self, record: Record, value: V) -> None:
        ...


class RequiredValueWarning(Warning):
    pass


@dataclasses.dataclass
class HeadingPrototype(typing.Generic[T]):
    """
    Object used to mark a column in a spreadsheet-like payload as field(s) for
    a Record object.
    """

    title: str
    is_required: bool = True

    def accept(self, heading_value: Cell) -> RecordUpdater[T] | None:
        """
        Given a potential heading value, return True if this object can try
        interpreting that column.
        """
        raise NotImplementedError()

    def check(self, value: Cell) -> T:
        if self.is_required and not value:
            raise RequiredValueWarning()
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

    def check(self, value: Cell) -> T:
        return self.prototype.check(value)

    def save(self, record: Record, value: T) -> None:
        self.updater.update(record, value)


class RegexHeading(HeadingPrototype[T]):
    """
    A HeadingPrototype that uses a RegEx pattern to match a column.
    """

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

    def accept(self, heading: Cell) -> RecordUpdater[T] | None:
        if isinstance(heading, str) and self.regex.fullmatch(heading):
            return self

    def update(self, record: Record, value: T) -> None:
        setattr(record, self.property_name, value)


class IntHeading(RegexHeading[int]):
    """
    A HeadingPrototype that matches columns containing integer values.
    """

    def check(self, value: Cell) -> int:
        return int(super().check(value))


class StrainHeading(RegexHeading):
    """
    A HeadingPrototype that matches columns containing data point(s).
    """

    def update(self, record: Record, value: Cell) -> None:
        if value:
            # adding a StrainInfo dict to the list
            record.strain.append({"name": value, "uuids": None})


class MetadataHeading(HeadingPrototype[str]):
    """
    HeadingPrototype that will try to match existing metadata types.
    """

    def __init__(self, *, is_required=None, **kwargs):
        # Always disabling required flag
        super().__init__(is_required=False, **kwargs)

    def accept(self, heading: Cell) -> RecordUpdater[str] | None:
        # almost a catch-all; we're going to ignore empty headings
        if heading:
            return MetadataUpdater(heading)


class MetadataUpdater(RecordUpdater[str]):
    def __init__(self, heading: Cell):
        self.heading = heading

    def update(self, record: Record, value: str) -> None:
        if value:
            record.meta.append(
                {
                    "name": self.heading,
                    "protocol": None,
                    "uuid": None,
                    "value": value,
                }
            )


class Parser:
    """
    Extracts a sequence of Record objects from an upload, that can then be used
    to save Line and associated records to the database.
    """

    prototypes: Iterable[HeadingPrototype] = [
        RegexHeading(
            property_name="name",
            regex=re.compile(r"\s*(?:line\s*)?name\s*", flags=re.IGNORECASE),
            title="Line Name",
        ),
        RegexHeading(
            is_required=False,
            property_name="description",
            regex=re.compile(r"\s*(?:line\s*)?description\s*", flags=re.IGNORECASE),
            title="Description",
        ),
        IntHeading(
            is_required=False,
            property_name="replicates",
            regex=re.compile(r"\s*replicate\s*(?:count\s*)?", flags=re.IGNORECASE),
            title="Replicates",
        ),
        StrainHeading(
            is_required=False,
            property_name="strain",
            regex=re.compile(r"\s*part\s*id\s*|\s*strains?\s*", flags=re.IGNORECASE),
            title="Strains",
        ),
        MetadataHeading(title="Metadata"),
    ]

    def __init__(self, mime_type: str):
        self.columns: Iterable[ColumnHeading | None] = []
        self.mime_type = mime_type

    def parse(self, stream: typing.IO) -> Iterable[Record]:
        for i, row in self._read(stream):
            yield from self._process_row(row, i)

    def _match_header_row(self, row: Row, row_index: int) -> None:
        headings = [
            self._match_header(self._value(cell), row_index, column_index)
            for column_index, cell in enumerate(row)
        ]
        all_required = True
        for c in self.prototypes:
            found = filter(lambda h: h and c == h.prototype, headings)
            if c.is_required:
                all_required = all_required and any(found)
        if all_required:
            self.columns = headings

    def _match_header(
        self,
        content: Cell,
        row_index: int,
        column_index: int,
    ) -> ColumnHeading | None:
        for c in self.prototypes:
            if updater := c.accept(content):
                return ColumnHeading(
                    prototype=c,
                    updater=updater,
                    column_index=column_index,
                    row_index=row_index,
                    title=content,
                )

    def _process_row(self, row: Row, index: int) -> Iterable[Record]:
        if not self.columns:
            self._match_header_row(row, index)
        else:
            record = Record()
            for column, cell in zip(self.columns, row):
                try:
                    if column:
                        value = column.check(self._value(cell))
                        column.save(record, value)
                except Exception:
                    continue
            if record.name:
                yield record

    def _read(self, stream: typing.IO) -> Sheet:
        if self.mime_type.startswith("text/"):
            yield from self._read_csv(stream)
        elif self.mime_type == mime_win_csv:
            yield from self._read_csv(stream)
        elif self.mime_type == mime_excel:
            yield from self._read_excel(stream)
        else:
            raise SetupException(
                _("Cannot read file type. EDD supports: {supported}").format(
                    supported=[mime_csv, mime_excel, mime_win_csv],
                )
            )

    def _read_csv(self, stream: typing.IO) -> Sheet:
        # generator from the CSV rows
        yield from enumerate(csv.reader(stream))
        # add an empty row to indicate we're done
        yield EMPTY_ROW

    def _read_excel(self, stream: typing.IO) -> Sheet:
        workbook = load_workbook(stream, read_only=True, data_only=True)
        for worksheet in workbook.worksheets:
            yield from enumerate(worksheet.iter_rows())
            # giving an empty row to indicate we're done with the sheet
            yield EMPTY_ROW

    def _value(self, cell: Cell) -> Cell:
        if self.mime_type == mime_excel:
            value = cell.value
            if isinstance(value, str):
                return value.strip().strip("\ufeff")
            return value
        return cell.strip().strip("\ufeff")
