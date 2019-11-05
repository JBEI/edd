# coding: utf-8

import csv
import io
import logging
import operator
from collections import OrderedDict
from functools import reduce
from itertools import chain, islice

from django.contrib.postgres.aggregates import ArrayAgg, JSONBAgg
from django.db.models import Prefetch, Q
from django.utils.translation import ugettext_lazy as _

from .. import models

logger = logging.getLogger(__name__)


class TableOptions:
    def __init__(self, model, instances=None):
        self.model = model
        self._columns = []
        model.export_columns(self, instances=instances)

    @property
    def choices(self):
        return [c.get_field_choice() for c in self._columns]

    @property
    def coerce(self):
        lookup = {col.key: col for col in self._columns}
        return lambda key: lookup.get(key, None)

    def define_field_column(self, field, lookup=None, heading=None):
        self._columns.append(
            ColumnChoice(
                self.model,
                field.name,
                field.verbose_name,
                field.value_from_object if lookup is None else lookup,
                heading=heading,
            )
        )

    def define_meta_column(self, meta_type):
        self._columns.append(
            ColumnChoice(
                self.model,
                f"meta.{meta_type.id}",
                meta_type.type_name,
                lambda instance: instance.metadata_get(meta_type, default=""),
            )
        )


class ColumnChoice:
    def __init__(self, model, key, label, lookup, heading=None, lookup_kwargs=None):
        self.model = model
        self.key = ".".join([model.__name__, key]) if model else key
        self.label = label
        self.lookup = lookup
        self.heading = label if heading is None else heading
        self.lookup_kwargs = {} if lookup_kwargs is None else lookup_kwargs

    @classmethod
    def from_model(cls, column):
        def lookup_format(instance, **kwargs):
            return column.get_default() % column.get_format_dict(instance, **kwargs)

        def lookup_meta(instance, **kwargs):
            default = column.get_default() % kwargs
            if instance:
                return instance.metadata_get(column.meta_type, default=default)
            return default

        if column.meta_type:
            model = {
                models.MetadataType.STUDY: models.Study,
                models.MetadataType.LINE: models.Line,
                models.MetadataType.ASSAY: models.Assay,
            }.get(column.meta_type.for_context, None)
            lookup = lookup_meta
        else:
            model = None
            lookup = lookup_format
        return cls(model, f"worklist_column_{column.pk}", str(column), lookup)

    def convert_instance_from_measure(self, measure, default=None):
        try:
            # aggregated fields on measurement, move to proper object
            measure.assay.line.strain_names = measure.strain_names
            measure.assay.line.cs_names = measure.cs_names
            return {
                models.Assay: measure.assay,
                models.Line: measure.assay.line,
                models.Measurement: measure,
                models.Protocol: measure.assay.protocol,
                models.Study: measure.study,
            }.get(self.model, default)
        except AttributeError:
            return default

    def convert_instance_from_assay(self, assay, default=None):
        try:
            return {
                models.Assay: assay,
                models.Line: assay.line,
                models.Protocol: assay.protocol,
                models.Study: assay.study,
                None: assay.line,
            }.get(self.model, default)
        except AttributeError:
            return default

    def get_field_choice(self):
        return (self.key, self.label)

    def get_value(self, instance, **kwargs):
        try:
            lookup_kwargs = {}
            lookup_kwargs.update(**self.lookup_kwargs)
            lookup_kwargs.update(**kwargs)
            return self.lookup(instance, **lookup_kwargs)
        except Exception as e:
            logger.exception("Failed to get column value: %s", e)
            return ""


class EmptyChoice(ColumnChoice):
    """Always inserts an empty value on lookup callback."""

    def __init__(self):
        super().__init__(str, "", "", lambda x: "")


class ExportSelection:
    """Object used for selecting objects for export."""

    def __init__(
        self,
        user,
        exclude_disabled=True,
        studyId=None,
        lineId=None,
        assayId=None,
        measureId=None,
    ):

        hierarchy = ["study", "line", "assay", "measurement"]
        ids = {
            "study": studyId,
            "line": lineId,
            "assay": assayId,
            "measurement": measureId,
        }

        def build_path(start, end):
            """
            Programmatically build a path to another level of EDD hierarchy;
            e.g. if you have a Study queryset, and want to match to those
            containing specific Assay objects, call with start = 'study'; and
            end = 'assay'; result will be ['line', 'assay']
            """
            a = hierarchy.index(start)
            b = hierarchy.index(end)
            if a == b:
                return []
            elif a < b:
                return hierarchy[a + 1 : b + 1]
            return list(reversed(hierarchy[b:a]))

        # generate a filter expression for the ids
        def ids_filter(target_type, input_ids):
            filters = []
            for id_type, ids in input_ids.items():
                if not ids:
                    continue
                # non-empty ids to filter on
                # build path from target query to current type
                path = build_path(target_type, id_type)
                if path:
                    filters.append(
                        Q(**{"__".join(path + ["in"]): ids})
                        & Q_active(**{"__".join(path + ["active"]): True})
                    )
                else:
                    # empty path means query and id target are the same, use PK
                    filters.append(Q(pk__in=ids) & Q_active(active=True))
            # chain together all with an OR operator
            # finding all that match at least one
            return reduce(operator.or_, filters, Q())

        def Q_active(**kwargs):
            """
            Conditionally returns a QuerySet Q filter if exclude_disabled flag
            is set.
            """
            if exclude_disabled:
                return Q(**kwargs)
            return Q()

        # find all studies containing the listed IDs where the user can read the study
        self._study_queryset = models.Study.objects.distinct().filter(
            # first filter based on whether user has access
            models.Study.access_filter(user),
            # then find all studies that match at least one of the inputs
            ids_filter("study", ids),
        )
        # find all lines containing the listed (line|assay|measure) IDs
        # or contained by study IDs
        self._line_queryset = models.Line.objects.distinct().filter(
            # first filter based on whether user has access
            models.Study.access_filter(user, via=("study",)),
            # then find all lines that match at least one of the inputs
            ids_filter("line", ids),
        )
        # select_related('experimenter__userprofile', 'updated')
        # prefetch_related(strains, carbon_source)

        # find all assays containing the listed (assay|measure) IDs
        # or contained by (study|line)
        self._assay_queryset = models.Assay.objects.distinct().filter(
            # first filter based on whether user has access
            models.Study.access_filter(user, via=("study",)),
            # then find all lines that match at least one of the inputs
            ids_filter("assay", ids),
        )
        # select_related('protocol')

        # TODO: use Prefetch for measurement_type with django-model-utils
        # type_queryset = models.MeasurementType.objects.select_subclasses(
        #     models.ProteinIdentifier
        # )
        # self._measures.prefetch_related(
        #     Prefetch('measurement_type', queryset=type_queryset)
        # )
        # find all measurements contained by the listed IDs
        self._measure_queryset = (
            models.Measurement.objects.distinct()
            .filter(
                # first filter based on whether user has access
                models.Study.access_filter(user, via=("study",)),
                # then find all lines that match at least one of the inputs
                ids_filter("measurement", ids),
            )
            .order_by("assay__protocol_id")
        )

    @property
    def studies(self):
        """List of studies allowed to be viewed in the selection."""
        return self._study_queryset

    @property
    def lines(self):
        """A queryset of lines included in the selection."""
        return (
            self._line_queryset.select_related("experimenter__userprofile", "updated")
            .annotate(
                strain_names=ArrayAgg("strains__name"),
                cs_names=ArrayAgg("carbon_source__name"),
            )
            .prefetch_related(
                Prefetch("strains", to_attr="strain_list"),
                Prefetch("carbon_source", to_attr="cs_list"),
            )
        )

    @property
    def assays(self):
        """A queryset of assays included in the selection."""
        return self._assay_queryset

    @property
    def measurements(self):
        """A queryset of measurements to include."""
        # TODO: add in empty measurements for assays that have none?
        return self._measure_queryset


class ExportOption:
    """Object used for options on a table export."""

    DATA_COLUMN_BY_LINE = "dbyl"
    DATA_COLUMN_BY_POINT = "dbyp"
    LINE_COLUMN_BY_DATA = "lbyd"
    LAYOUT_CHOICE = (
        (DATA_COLUMN_BY_LINE, _("columns of metadata types, and rows of lines/assays")),
        (
            DATA_COLUMN_BY_POINT,
            _("columns of metadata types, and rows of single points"),
        ),
        (LINE_COLUMN_BY_DATA, _("columns of lines/assays, and rows of metadata types")),
    )
    COMMA_SEPARATED = ","
    COMMA_SEPARATED_TOKEN = ","
    TAB_SEPARATED = "\t"
    TAB_SEPARATED_TOKEN = "\\t"
    # need to choose value tokens that can be displayed as HTML
    SEPARATOR_CHOICE = (
        (COMMA_SEPARATED_TOKEN, _("Comma-separated (CSV)")),
        (TAB_SEPARATED_TOKEN, _("Tab-separated")),
    )
    SEPARATOR_LOOKUP = {
        COMMA_SEPARATED_TOKEN: COMMA_SEPARATED,
        TAB_SEPARATED_TOKEN: TAB_SEPARATED,
    }
    ALL_DATA = "all"
    SUMMARY_DATA = "summary"
    NONE_DATA = "none"
    FORMAT_CHOICE = (
        (ALL_DATA, _("All")),
        (SUMMARY_DATA, _("Summarize")),
        (NONE_DATA, _("None")),
    )

    def __init__(
        self,
        layout=DATA_COLUMN_BY_LINE,
        separator=COMMA_SEPARATED,
        data_format=ALL_DATA,
        line_section=False,
        protocol_section=False,
        columns=None,
        blank_columns=None,
        blank_mod=0,
    ):
        self.layout = layout
        self.separator = separator
        self.data_format = data_format
        self.line_section = line_section
        self.protocol_section = protocol_section
        self.columns = columns if columns is not None else []
        self.blank_columns = blank_columns if blank_columns is not None else []
        self.blank_mod = blank_mod

    @classmethod
    def coerce_separator(cls, value):
        return cls.SEPARATOR_LOOKUP.get(value, cls.COMMA_SEPARATED)


def value_str(value):
    """used to format value lists to a colon-delimited (unicode) string"""
    # cast to float to remove 0-padding
    return ":".join(map(str, map(float, value)))


class TableExport:
    """Outputs tables for export of EDD objects."""

    def __init__(self, selection, options):
        self.selection = selection
        self.options = options
        self._x_values = {}

    def output(self):
        """Builds the CSV of the table export output."""
        # store tables
        # protocol PK keys table for measurements under a protocol
        # 'line' keys table for line-only section (if enabled)
        # 'all' keys table including everything.
        tables = OrderedDict()
        if self.options.line_section:
            tables["line"] = OrderedDict()
            tables["line"]["header"] = self._output_line_header()
        if not self.options.protocol_section:
            tables["all"] = OrderedDict()
            tables["all"]["header"] = self._output_header()
        self._do_export(tables)
        return self._build_output(tables)

    def _build_output(self, tables):
        layout = self.options.layout
        if self.options.separator == ",":
            dialect = "excel"
        else:
            dialect = "excel-tab"
        out_csv = io.StringIO(newline="")
        writer = csv.writer(out_csv, dialect=dialect)
        if layout == ExportOption.DATA_COLUMN_BY_POINT:
            # data is already in correct orientation, join and return
            for table in tables:
                writer.writerows(table)
                writer.writerow([])
        # both LINE_COLUMN_BY_DATA and DATA_COLUMN_BY_LINE are constructed similarly
        # each table in LINE_COLUMN_BY_DATA is transposed
        else:
            for tkey, table in tables.items():
                # sort x values by original numeric values
                all_x = sorted(
                    list(self._x_values.get(tkey, {}).items()), key=lambda a: a[1]
                )
                # generate header row
                rows = [list(map(str, table["header"] + [x[0] for x in all_x]))]
                # go through non-header rows; unsquash final column
                for row in islice(table.values(), 1, None):
                    unsquash = self._output_unsquash(all_x, row[-1:][0])
                    rows.append(list(map(str, row[:-1] + unsquash)))
                # do the transpose here if needed
                if layout == ExportOption.LINE_COLUMN_BY_DATA:
                    rows = zip(*rows)
                writer.writerows(rows)
                writer.writerow([])
        return out_csv.getvalue()

    def _do_export(self, tables):
        # add data from each exported measurement; already sorted by protocol
        measures = self.selection.measurements.select_related(
            # add proteinidentifier so export does not repeatedly query for protein-specific stuff
            "measurement_type__proteinidentifier",
            "x_units",
            "y_units",
            "update_ref__mod_by",
            "experimenter",
            "assay__experimenter",
            "assay__protocol",
            "assay__line__contact",
            "assay__line__experimenter",
            "assay__line__study__contact",
        ).annotate(
            # eliminate some subqueries and/or repeated queries by collecting values in arrays
            strain_names=ArrayAgg("assay__line__strains__name", distinct=True),
            cs_names=ArrayAgg("assay__line__carbon_source__name", distinct=True),
            vids=ArrayAgg("measurementvalue"),
            # aggregating arrays instead of values, use JSONB
            vxs=JSONBAgg("measurementvalue__x"),
            vys=JSONBAgg("measurementvalue__y"),
        )
        for measurement in measures:
            assay = measurement.assay
            protocol = assay.protocol
            line = assay.line
            if self.options.line_section:
                line_only = [models.Line, models.Study]
                other_only = [models.Assay, models.Measurement, models.Protocol]
                # add row to line table w/ Study, Line columns only
                if line.id not in tables["line"]:
                    row = self._output_row_with_measure(measurement, models=line_only)
                    tables["line"][line.id] = row
                # create row for protocol/all table w/ Protocol, Assay, Measurement columns only
                row = self._output_row_with_measure(measurement, models=other_only)
            else:
                # create row for protocol/all table
                row = self._output_row_with_measure(measurement)
            table, table_key = self._init_tables_for_protocol(tables, protocol)
            values = sorted(
                zip(measurement.vids, measurement.vxs, measurement.vys),
                key=lambda a: a[1][0],
            )
            if self.options.layout == ExportOption.DATA_COLUMN_BY_POINT:
                for value in values:
                    arow = row[:]
                    arow.append(value_str(value[1]))  # x-values
                    arow.append(value_str(value[2]))  # y-values
                    table[value[0]] = arow  # value IDs
            else:
                # keep track of all x values encountered in the table
                xx = self._x_values[table_key] = self._x_values.get(table_key, {})
                # do value_str to the float-casted version of x to eliminate 0-padding
                xx.update({value_str(v[1]): v[1] for v in values})
                squashed = {value_str(v[1]): value_str(v[2]) for v in values}
                row.append(squashed)
                table[measurement.id] = row

    def _init_tables_for_protocol(self, tables, protocol):
        if self.options.protocol_section:
            if protocol.id not in tables:
                tables[protocol.id] = OrderedDict()
                header = []
                if self.options.line_section:
                    header += self._output_measure_header()
                else:
                    header += self._output_header()
                tables[protocol.id]["header"] = header
            table_key = protocol.id
        else:
            table_key = "all"
        table = tables[table_key]
        return (table, table_key)

    def _output_header(self, models=None):
        row = []
        for column in self.options.columns:
            if models is None or column._model in models:
                row.append(column.heading)
        if self.options.layout == ExportOption.DATA_COLUMN_BY_POINT:
            row.append("X")
            row.append("Y")
        return row

    def _output_line_header(self):
        return self._output_header([models.Line, models.Study])

    def _output_row_with_assay(self, assay, columns=None):
        row = []
        if columns is None:
            columns = self.options.columns
        for column in columns:
            instance = column.convert_instance_from_assay(assay)
            row.append(column.get_value(instance))
        return row

    def _output_row_with_measure(self, measure, models=None):
        row = []
        for column in self.options.columns:
            if models is None or column._model in models:
                instance = column.convert_instance_from_measure(measure)
                row.append(column.get_value(instance))
        return row

    def _output_measure_header(self):
        return self._output_header([models.Assay, models.Measurement, models.Protocol])

    def _output_unsquash(self, all_x, squashed):
        # all_x is list of 2-tuple from dict.items()
        if isinstance(squashed, dict):
            return [squashed.get(x[0], "") for x in all_x]
        # expecting a list to be returned
        return [squashed]


class WorklistExport(TableExport):
    """Outputs tables for line worklists."""

    def __init__(self, selection, options, worklist=None):
        super().__init__(selection, options)
        self.worklist = worklist

    def output(self):
        # store tables
        tables = OrderedDict()
        tables["all"] = OrderedDict()
        tables["all"]["header"] = self._output_header()
        if self.worklist and self.worklist.protocol:
            self._do_worklist(tables)
        return self._build_output(tables)

    def _build_assay(self, line):
        return models.Assay(
            name=models.Assay.build_name(line, self.worklist.protocol, 1),
            study=line.study,
            line=line,
            protocol=self.worklist.protocol,
        )

    def _build_list(self, lines, assays):
        """Generates list of existing assays and created assays from lines having none."""
        # keep place in assays sequence
        assay_iter = iter(assays)
        for line in lines:
            # assume building new assays
            build = True
            for assay in assay_iter:
                if assay.line_id == line.pk:
                    # when assay sequence overlaps line sequence, assays win
                    yield assay
                    # don't build assays once existing assays found
                    build = False
                    continue
                elif build:
                    yield self._build_assay(line)
                # put current assay back into iteration
                assay_iter = chain([assay], assay_iter)
                break
            else:
                # assay sequence exhausted
                if build:
                    yield self._build_assay(line)

    def _do_worklist(self, tables):
        protocol = self.worklist.protocol
        assays = self.selection.assays.filter(protocol_id=protocol.id).order_by(
            "line_id"
        )
        lines = self.selection.lines.order_by("pk")
        table = tables["all"]

        # looping over both assays and lines
        # favor adding rows from assay when available
        # otherwise add row from unsaved assay created from line/protocol
        # line_id values on assays will be a strict subset of pk values on lines
        for i, assay in enumerate(self._build_list(lines, assays), 1):
            table[f"{i}"] = self._output_row_with_assay(assay)
            if self.options.blank_mod and i % self.options.blank_mod == 0:
                table[f"blank{i}"] = self._output_row_with_assay(
                    None, columns=self.options.blank_columns
                )
