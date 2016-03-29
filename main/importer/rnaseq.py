# coding: utf-8
from __future__ import unicode_literals

import json
import logging

from collections import defaultdict
from six import string_types

from .models import (
    Assay, GeneIdentifier, Line, Measurement, MeasurementCompartment,
    MeasurementUnit, MeasurementValue, Protocol, Update
)


logger = logging.getLogger(__name__)


########################################################################
# RNA-SEQ DATA IMPORT
#
# TODO this should be able to work with existing assays!
class import_rna_seq(object):
    """
    Import a set of RNA-Seq measurements all at once.  These may be any
    combination of lines, biological replicates, technical replications,
    or timepoints but each needs to be labeled distinctly.  The input table
    should take this form:

    GENE <label1> <label2> <label3>
    <ID1> <value> <value> <value>
    <ID2> <value> <value> <value>

    (with the first row being optional, since the meaning of each column
    should have already been disambiguated before form submission.)

    This functionality is implemented as a class to facilitate tracking of new
    record creation, but the resulting object is essentially disposable.
    """

    # TODO: refactor __init__, waaaay too long now
    def __init__(self, study, user, update, **kwds):
        self.n_meas = self.n_meas_data = self.n_assay = self.n_meas_type = 0
        assert study.user_can_write(user)
        assert (user.id == update.mod_by.id)
        data_type = kwds.get("data_type", "combined")
        assert (data_type in ["combined", "fpkm", "counts"])
        n_cols = kwds["n_cols"]
        line_ids = kwds["line_ids"]
        assay_ids = kwds["assay_ids"]
        descriptions = kwds.get('descriptions', None)
        group_timepoints = int(kwds.get("group_timepoints", "0"))
        meas_times = [float(x) for x in kwds["meas_times"]]
        assert (len(line_ids) == len(assay_ids) == len(meas_times) == n_cols)
        if (descriptions is None):
            descriptions = [None] * n_cols
        unique_ids = set()
        for line_id, assay_id, t in zip(line_ids, assay_ids, meas_times):
            key = (line_id, assay_id, t)
            if key in unique_ids and (assay_id != 0 or group_timepoints):
                raise ValueError(
                    "Duplicate line/assay/timepoint selections - each combination must be unique! "
                    "For technical replicates, you should treat each replica as a separate assay."
                )
            unique_ids.add(key)
        protocol = Protocol.objects.get(name="Transcriptomics")
        table = kwds["table"]
        if isinstance(table, string_types):
            table = json.loads(table)  # XXX ugh....
        assert (len(table) > 0) and isinstance(table[0], list)
        for row in table:
            assert (len(row[1:]) == n_cols), row
        lines = {l.pk: l for l in Line.objects.filter(id__in=line_ids)}
        assays = {}
        new_assays = {}
        new_assay_ids = []
        for line_id, assay_id, desc, t in zip(line_ids, assay_ids, descriptions, meas_times):
            line = lines[line_id]
            if (assay_id == 0):  # new assay needed
                if (group_timepoints):
                    if (line_id in new_assays):
                        assay = new_assays[line_id]
                        new_assay_ids.append(assay.id)
                        continue
                assay_start_id = line.new_assay_number(protocol)
                assay = line.assay_set.create(
                    name=str(assay_start_id),
                    description=desc,
                    protocol=protocol,
                    experimenter=user,
                )
                assays[(line_id, assay.pk)] = assay
                new_assays[line_id] = assay
                new_assay_ids.append(assay.pk)
                self.n_assay += 1
            else:
                assay = line.assay_set.get(pk=assay_id)
                assays[(line_id, assay_id)] = assay
                new_assay_ids.append(assay_id)
        assay_ids = new_assay_ids
        meas_units = {
            "fpkm": MeasurementUnit.objects.get(unit_name="FPKM"),
            "counts": MeasurementUnit.objects.get(unit_name="counts"),
            "hours": MeasurementUnit.objects.get(unit_name="hours"),
        }
        genes = GeneIdentifier.by_name()

        def get_measurements_dict():
            # collect all Measurements for each assay, and store in a dict
            # keyed by (assay_id, measurement_type_id, y_units_id)
            meas_dict_ = {}
            for line_id, assay_id in zip(line_ids, assay_ids):
                assay = assays[(line_id, assay_id)]
                all_measurements = assay.measurement_set.all()
                for m in all_measurements:
                    key = (assay_id, m.measurement_type_id, m.y_units_id)
                    meas_dict_[key] = m
            return meas_dict_
        meas_dict = get_measurements_dict()
        new_measurements = []
        update_measurements = []
        values_by_gene = {"fpkm": {}, "counts": {}}
        for i_row, row in enumerate(table):
            gene_id = row[0]
            if (gene_id == "GENE"):
                continue
            gene_meas = genes.get(gene_id, None)
            if (gene_meas is None):
                gene_meas = GeneIdentifier.objects.create(  # FIXME annotation?
                    type_name=gene_id,
                )
                genes[gene_id] = gene_meas
                self.n_meas_type += 1
            all_fpkms = []
            all_counts = []
            for i_col, value in enumerate(row[1:]):
                try:
                    if (data_type == "combined"):
                        fields = value.split(",")
                        all_counts.append(int(fields[0]))
                        all_fpkms.append(float(fields[1]))
                    elif (data_type == "fpkm"):
                        all_fpkms.append(float(value))
                    elif (data_type == "counts"):
                        all_counts.append(int(value))
                except ValueError:
                    raise ValueError("Couldn't interpret value at (%d,%d): %s" %
                                     (i_row+1, i_col+2, value))
            if (all_counts):
                values_by_gene["counts"][gene_id] = all_counts
            if (all_fpkms):
                values_by_gene["fpkm"][gene_id] = all_fpkms

            def add_measurement_data(values, units):
                assert len(values) == n_cols
                measurements = {}
                for i_col, (line_id, assay_id) in enumerate(zip(line_ids, assay_ids)):
                    key = (assay_id, gene_meas.pk, units.pk)
                    if (key in meas_dict):
                        meas = meas_dict[key]
                        update_measurements.append(meas.pk)
                    else:
                        meas = measurements.get((line_id, assay_id), None)
                    if (meas is None):
                        assay = assays[(line_id, assay_id)]
                        meas = Measurement(
                            assay=assay,
                            measurement_type=gene_meas,
                            x_units=meas_units["hours"],
                            y_units=units,
                            experimenter=user,
                            update_ref=update,
                            compartment=MeasurementCompartment.INTRACELLULAR
                        )
                        self.n_meas += 1
                        new_measurements.append(meas)
                        measurements[(line_id, assay_id)] = meas
                    # meas.measurementdatum_set.create(
                    #    x=meas_times[i_col],
                    #    y=values[i_col],
                    #    updated=update)
                    # self.n_meas_data += 1
            if (len(all_fpkms) > 0):
                add_measurement_data(all_fpkms, meas_units["fpkm"])
            if (len(all_counts) > 0):
                add_measurement_data(all_counts, meas_units["counts"])
        if (len(new_measurements) > 0):
            Measurement.objects.bulk_create(new_measurements)
        self.n_meas_updated = len(update_measurements)
        if (self.n_meas_updated):
            Measurement.objects.filter(id__in=update_measurements).update(update_ref=update)
        meas_dict = get_measurements_dict()
        new_meas_data = []
        for gene_id in genes.keys():
            meas_type = genes[gene_id]
            for ytype in ["counts", "fpkm"]:
                if (len(values_by_gene[ytype]) > 0):
                    for i_col, (assay_id, t) in enumerate(zip(assay_ids, meas_times)):
                        key = (assay_id, meas_type.pk, meas_units[ytype].pk)
                        mdata = MeasurementValue(
                            measurement=meas_dict[key],
                            x=[t],
                            y=[values_by_gene[ytype][gene_id][i_col]],
                            updated=update
                        )
                        new_meas_data.append(mdata)
                        self.n_meas_data += 1
        if (len(new_meas_data) > 0):
            MeasurementValue.objects.bulk_create(new_meas_data)

    @classmethod
    def from_form(cls, request, study):
        form = request.POST
        n_cols = int(form["n_cols"])
        meas_times = []
        line_ids = []
        assay_ids = []
        descriptions = []
        for i in range(n_cols):
            meas_times.append(float(form["time-%d" % i]))
            assay_ids.append(int(form["assay-%d" % i]))
            line_ids.append(int(form["line-%d" % i]))
            descriptions.append(form.get("desc-%d" % i, None))
        return cls(
            study=study,
            user=request.user,
            update=Update.load_request_update(request),
            n_cols=n_cols,
            line_ids=line_ids,
            assay_ids=assay_ids,
            meas_times=meas_times,
            descriptions=descriptions,
            table=form["data_table"],
            data_type=form["data_type"]
        )


def interpret_raw_rna_seq_data(raw_data, study, file_name=None):
    """
    Given tabular RNA-Seq data (reads or FPKMs), attempt to determine the
    data type and groupings automatically, and return a dictionary that
    will be used to populate the view with new form elements.
    """
    data_type = None
    lines = study.line_set.all()
    table = [l.strip().split() for l in raw_data.splitlines()]
    if (len(table) < 2):
        raise ValueError(
            "These data do not appear to be in the expected format. You must have a single line "
            "specifying column labels, followed by a separate line for each gene."
        )
    elif (len(table[0]) < 2):
        raise ValueError(
            "These data do not appear to be in the expected format. At least two columns are "
            "required, the first for gene IDs, followed by a column for each condition/sample."
        )
    samples = _extract_samples_from_headers(table[0], lines)
    if (file_name is not None):
        if ("rpkm" in file_name.lower()) or ("fpkm" in file_name.lower()):
            data_type = "fpkm"
        elif ("counts" in file_name.lower()):
            data_type = "counts"
    for i, row in enumerate(table[1:]):
        if ("," in row[1]):
            data_type = "combined"
            _validate_row(row, i, True)
        else:
            if (data_type is None):
                if (["." in cell for cell in row[1:]].count(True) > 0):
                    data_type = "fpkm"
            _validate_row(row, i)
    assays = Assay.objects.filter(
        line__study=study, protocol__name="Transcriptomics"
    ).select_related("line__study", "protocol")
    return {
        "guessed_data_type": data_type,
        "raw_data": raw_data,
        "table": table,
        "samples": samples,
        "assays": [{"id": a.id, "name": a.long_name} for a in assays],
    }


def _extract_samples_from_headers(headers, lines):
    if (headers[0] != "GENE"):
        raise ValueError("These data do not appear to be in the expected format. First column of "
                         "first row must be 'GENE'")
    lines_by_name = {line.name: line for line in lines}
    samples = []
    condition_ids = defaultdict(int)
    for i_sample, label in enumerate(headers[1:]):
        fields = label.split("-")
        # rep_id = fields[-1]
        condition_name = "-".join(fields[:-1])
        condition_ids[condition_name] += 1
        line_id = None
        if (condition_name in lines_by_name):
            line_id = lines_by_name[condition_name].id
        samples.append({
            "i_sample": i_sample,
            "label": label,
            "assay_id": condition_ids[condition_name],
            "line_id": line_id,
        })
    return samples


def _validate_row(row, i_row, assume_csv_pairs=False):
    """ Utility function to verify that a row of RNA-seq data to be imported conforms to the
        expected format."""
    if assume_csv_pairs:
        for j in range(1, len(row)):
            fields = row[j].split(",")
            try:
                float(fields[0])
                float(fields[1])
            except Exception:
                raise ValueError(
                    "Can't interpret field (%d,%d) as a pair of real numbers: '%s'" % (
                        i_row+1, j+2, row[j]
                    )
                )
    else:
        for j in range(1, len(row)):
            try:
                float(row[j])
            except Exception:
                raise ValueError(
                    "Can't interpret field (%d,%d) as a real number: '%s'" % (
                        i_row+1, j+2, row[j]
                    )
                )


def get_edgepro_genes(data):
    """ Iterator for parsing tabular data from EDGE-pro; yields the gene ID, number of reads, and
        RPKM in each valid row (starting from the 3rd row). """
    table = data.splitlines()
    if (not table[0].startswith("gene_ID")):
        raise ValueError(
            "This does not appear to be an output file from EDGE-pro: the first line of the file "
            "should start with 'gene_ID'"
        )
    for i_row, row in enumerate(table[2:]):
        row = row.strip()
        if (row == ""):
            continue
        fields = row.split()
        if (len(fields) != 6):
            raise ValueError("Unexpected number of fields in line: '%s'" % row)
        gene_id = fields[0]
        n_reads = int(fields[4])
        rpkm = float(fields[5])
        yield gene_id, n_reads, rpkm


def interpret_edgepro_data(raw_data):
    """
    Process data uploaded from a form and return a summary of its contents
    """
    n_genes = 0
    rpkm_max = 0
    count_max = 0
    for gene_id, n_reads, rpkm in get_edgepro_genes(raw_data):
        n_genes += 1
        rpkm_max = max(rpkm, rpkm_max)
        count_max = max(n_reads, count_max)
    return {
        "n_genes": n_genes,
        "rpkm_max": rpkm_max,
        "count_max": count_max,
        "raw_data": raw_data,
    }


class import_rnaseq_edgepro (object):
    """
    Separate utility for uploading files directly from the EDGE-pro
    processing pipeline for prokaryotic RNA-seq experiments; these
    contain both read counts and RPKMs.  The data will be in a simple
    tabular format (space-delineated, column-based), with fields
    gene_ID, start_coord, end_coord, average_cov, #reads, and RPKM.
    The first line is these labels, followed by a blank line.
    """
    def __init__(self, study, form, update):
        self.n_meas = self.n_meas_type = self.n_meas_data = 0
        self.n_meas_updated = 0
        remove_all = form.get("remove_all", "0") == "1"
        assay_id = form["assay"]
        assay = Assay.objects.get(pk=assay_id)
        assert (assay.line.study.id == study.id)
        timepoint = float(form["timepoint"])
        self._rpkm_unit = MeasurementUnit.objects.get(unit_name="FPKM")
        self._counts_unit = MeasurementUnit.objects.get(unit_name="counts")
        self._hours_unit = MeasurementUnit.objects.get(unit_name="hours")
        if (remove_all):
            # get rid of all data points for this assay, regardless of timepoint
            MeasurementValue.objects.filter(measurement__assay=assay).delete()
        else:
            # delete any existing data points for this assay at the given timepoint
            MeasurementValue.objects.filter(measurement__assay=assay, x__0=timepoint).delete()
        self._init_create_or_update_measurements(assay, form, update)
        self._init_set_measurement_values(assay, form, update)

    def _init_get_measurements_dict(self, assay):
        old_measurements = assay.measurement_set.select_related(
            "measurement_type", "x_units", "y_units"
        )
        meas_dict_ = defaultdict(list)
        for m in old_measurements:
            meas_dict_[m.measurement_type.type_name].append(m)
        return meas_dict_

    def _init_create_or_update_measurements(self, assay, form, update):
        # XXX to facilitate bulk record creation, there are two loops over
        # entries in the table.  loop 1 creates new GeneIdentifiers as
        # needed, and either creates new Measurements or flags the existing
        # ones for updating.  we can't create MeasurementValue objects yet
        # because any new parent Measurements won't have IDs until they're
        # actually entered into the database.
        new_meas = []
        update_meas = []
        meas_dict = self._init_get_measurements_dict(assay)
        for gene_id, n_reads, rpkm in get_edgepro_genes(form["data_table"]):
            (gene_meas, created) = GeneIdentifier.objects.get_or_create(type_name=gene_id)
            # add new gene measurement type if necessary
            if created:
                self.n_meas_type += 1
            meas_fpkm = meas_counts = None
            # if we already have measurements for this gene, use those instead of creating new ones
            for old_meas in meas_dict.get(gene_id, []):
                if old_meas.y_units_id == self._rpkm_unit.pk:
                    meas_fpkm = old_meas
                elif old_meas.y_units_id == self._counts_unit.pk:
                    meas_counts = old_meas
            # For both types of measurement, either create a new Measurement or update the old one.
            for meas_record, meas_unit, md_value in zip(
                    [meas_fpkm, meas_counts],
                    [self._rpkm_unit, self._counts_unit],
                    [rpkm, n_reads]):
                if (meas_record is None):
                    meas_record = Measurement(
                        assay=assay,
                        compartment=MeasurementCompartment.INTRACELLULAR,
                        experimenter=update.mod_by,
                        measurement_type=gene_meas,
                        update_ref=update,
                        x_units=self._hours_unit,
                        y_units=meas_unit,
                    )
                    new_meas.append(meas_record)
                    self.n_meas += 1
                else:
                    update_meas.append(meas_record.id)
                    self.n_meas_updated += 1
        # actually run the database INSERT/UPDATE statements
        if (len(new_meas) > 0):
            Measurement.objects.bulk_create(new_meas)
        if (len(update_meas) > 0):
            Measurement.objects.filter(id__in=update_meas).update(update_ref=update)

    def _init_set_measurement_values(self, assay, form, update):
        # XXX loop 2 creates the MeasurementValue objects, now that we have
        # IDs associated with the parent measurements.
        meas_dict = self._init_get_measurements_dict(assay)
        new_meas_data = []
        timepoint = float(form["timepoint"])
        for gene_id, n_reads, rpkm in get_edgepro_genes(form["data_table"]):
            meas_fpkm = meas_counts = None
            # if we already have measurements for this gene, use those instead of creating new ones
            for old_meas in meas_dict.get(gene_id, []):
                if old_meas.y_units_id == self._rpkm_unit.pk:
                    meas_fpkm = old_meas
                elif old_meas.y_units_id == self._counts_unit.pk:
                    meas_counts = old_meas
            assert (None not in [meas_fpkm, meas_counts])
            for meas_record, meas_unit, md_value in zip(
                    [meas_fpkm, meas_counts],
                    [self._rpkm_unit, self._counts_unit],
                    [rpkm, n_reads]):
                meas_data = MeasurementValue(
                    measurement=meas_record,
                    updated=update,
                    x=[timepoint],
                    y=[md_value],
                )
                new_meas_data.append(meas_data)
                self.n_meas_data += 1
        MeasurementValue.objects.bulk_create(new_meas_data)

    def format_message(self):
        msg = "Added %d gene identifiers and %d measurements" % (self.n_meas_type, self.n_meas)
        if (self.n_meas_updated):
            msg += ", and updated %d measurements" % self.n_meas_updated
        return msg

    @classmethod
    def from_form(cls, request, study):
        return cls(
            study=study,
            form=request.POST,
            update=Update.load_request_update(request)
        )
