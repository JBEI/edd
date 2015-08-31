
import json
import logging
import re
import warnings

from django.core.exceptions import PermissionDenied
from main.models import *


logger = logging.getLogger(__name__)


class TableImport(object):
    """ Object to handle processing of data POSTed to /study/{id}/import view and add
        measurements to the database. """

    def __init__(self, study, user):
        self._study = study
        self._user = user
        if not study.user_can_write(user):
            raise PermissionDenied("%s does not have write access to %s" % (
                user.username, study.name))
        self._assay_lookup = {}
        self._meta_lookup = {}
        self._type_lookup = {}
        self._unit_lookup = {}

    def import_data(self, data):
        self._data = data
        series = json.loads(data.get('jsonoutput', '[]'))
        self.check_series_points(series)
        self.init_lines_and_assays(series)
        return self.create_measurements(series)

    def check_series_points(self, series):
        """ Checks that each item in the series has some data """
        for item in series:
            points = item.get('data', [])
            # if no array of data, check for 'singleData' and add to data array
            # with master_timestamp (if validly defined)
            if len(points) == 0 and 'singleData' in item and self._valid_time():
                points.append([ self._time(), item['singleData'] ])
            meta = item.get('metadata', {})
            for label in meta:
                self._metatype(label) # don't care about return value here
            if len(points) == 0 and len(meta) == 0:
                item['nothing_to_import'] = True

    def init_lines_and_assays(self, series):
        """ Client-side code detects labels for assays/lines, and allows the user to select
            an "ID" for each label; this initializes a mapping from client-side label to 
            actual Line and Assay instances. """
        for item in series:
            label = item.get('assay', None)
            if label is None or self._assay_id(label) is None or self._assay(label) is not None:
                continue # skip when no label, no ID, or already looked up assay
            assay_id = self._assay_id(label)
            if assay_id != 'new':
                try:
                    assay = Assay.objects.get(pk=assay_id, line__study_id=self._study.pk)
                except Assay.DoesNotExist:
                    logger.warning('Failed to load assay,study combo %s,%s' % (
                        assay_id, self._study.pk))
                else:
                    self._assay_lookup[label] = assay
                continue # skip to next, created assay
            line_id = self._line_id(label)
            if line_id == 'new':
                name = item.get('assayName', None)
                if name is None:
                    name = 'Imported %s' % (self._study.line_set.count() + 1)
                line = self._study.line_set.create(
                    name=name,
                    contact=self._user,
                    experimenter=self._user)
                logger.info('Created import line %s:%s' % (line.id, name))
                line_id = line.id
            else:
                try:
                    line = Line.objects.get(pk=line_id, study_id=self._study.pk)
                except Line.DoesNotExist:
                    logger.warning('Failed to load line,study combo %s,%s' % (
                        line_id, self._study.pk))
            if line_id == 'new' or line is None:
                continue # skip to next, cannot create the assay
            name = item.get('assayName', None)
            if name is None:
                name = '%s-%s' % (line.name, line.assay_set.count() + 1)
            self._assay_lookup[label] = line.assay_set.create(
                name=name,
                protocol=self._protocol(),
                experimenter=self._user)
        if len(self._assay_lookup) == 0:
            master_assay = self._master_assay()
            if master_assay is None:
                raise UserWarning("Did you forget to specify a master assay?")
            elif master_assay == 'new':
                master_line = self._master_line()
                if master_line is None:
                    raise UserWarning("Did you forget to specify a master line?")
                elif master_line == 'new':
                    line = self._study.line_set.create(
                        name='Imported %s' % (self._study.line_set.count() + 1),
                        contact=self._user,
                        experimenter=self._user)
                    logger.info('Created import master line %s:%s' % (line.id, line.name))
                else:
                    line = Line.objects.get(pk=master_line)
                self._master = line.assay_set.create(
                    name='%s-%s' % (line.name, line.assay_set.count() + 1),
                    protocol=self._protocol(),
                    experimenter=self._user)
                logger.info('Created import master assay %s:%s' % (
                    self._master.id, self._master.name))
            else:
                try:
                    self._master = Assay.objects.get(pk=master_assay, line__study_id=self._study.pk)
                except Assay.DoesNotExist:
                    logger.warning('Failed to load master assay,study combo %s,%s' % (
                        assay_id, self._study.pk))

    def create_measurements(self, series):
        added = 0
        fake_index = 0
        hours = MeasurementUnit.objects.get(unit_name='hours')
        for item in series:
            index = item.get('parsingIndex', fake_index)
            name = item.get('name', 'set %s' % (index + 1))
            points = item.get('data', [])
            meta = item.get('metadata', {})
            fake_index += 1
            if item.get('nothing_to_import', False):
                warnings.warn('Skipped %s because it has no data' % name)
                continue
            assay = self._assay(item.get('assay', None))
            if assay is None:
                warnings.warn('Skipped %s because it does not reference a valid Assay.' % name)
                continue
            (comp, mtype, unit_id) = self._mtype(item.get('measurementType', None))
            if mtype == 0:
                warnings.warn('Skipped %s because it does not reference a known measurement.' % name)
                continue
            logger.info('Loading measurements for %s:%s' % (str(comp), mtype))
            records = assay.measurement_set.filter(
                measurement_type_id=mtype,
                compartment=str(comp),)
            unit = self._unit(unit_id)
            record = None
            if records.count() > 0:
                if self._replace():
                    records.delete()
                else:
                    record = records[0]
                    record.save() # force refresh of Update
            if record is None:
                record = assay.measurement_set.create(
                    measurement_type_id=mtype,
                    measurement_format=self._mtype_format(points),
                    compartment=str(comp),
                    experimenter=self._user,
                    x_units=hours,
                    y_units=unit)
            for x,y in points:
                (xvalue, yvalue) = (self._extract_value(x), self._extract_value(y))
                try:
                    point = record.measurementvalue_set.get(x=xvalue)
                except MeasurementValue.DoesNotExist:
                    point = record.measurementvalue_set.create(x=xvalue,y=yvalue)
                else:
                    point.y = yvalue
                    point.save()
                added += 1
            if len(meta) > 0:
                if self._replace():
                    # would be simpler to do assay.meta_store.clear()
                    # but we only want to replace types included in import data
                    for label, metatype in self._meta_lookup.items():
                        if metatype.pk in assay.meta_store:
                            del assay.meta_store[metatype.pk]
                        elif metatype.pk in assay.line.meta_store:
                            del assay.line.meta_store[metatype.pk]
                for label, value in meta.items():
                    metatype = self._metatype(label)
                    if metatype is not None:
                        if metatype.for_line():
                            assay.line.meta_store[metatype.pk] = value
                        elif metatype.for_protocol():
                            assay.meta_store[metatype.pk] = value
        for label, assay in self._assay_lookup.items():
            # force refresh of Update (also saves any changed metadata)
            assay.save()
            assay.line.save()
        self._study.save()
        return added

    def _assay(self, label):
        if len(self._assay_lookup) == 0 and hasattr(self, '_master'):
            return self._master
        return self._assay_lookup.get(label, None)

    def _assay_id(self, label):
        return self._data.get('disamAssay%s' % label, None)

    def _extract_value(self, value):
        # make sure input is string first, split on slash or colon, and give back array of numbers
        try:
            return map(float, re.split('/|:', unicode(value)))
        except ValueError:
            warnings.warn('Value %s could not be interpreted as a number' % value)
        return []

    def _layout(self):
        return self._data.get('datalayout', None)

    def _line_id(self, label):
        return self._data.get('disamLine%s' % label, None)

    def _master_assay(self):
        return self._data.get('masterAssay', None)

    def _master_line(self):
        return self._data.get('masterLine', None)

    def _metatype(self, label):
        if label not in self._meta_lookup:
            meta_id = self._data.get('disamMetaHidden%s', None)
            if meta_id is not None:
                try:
                    self._meta_lookup[label] = MetadataType.objects.get(pk=meta_id)
                except MetadataType.DoesNotExist:
                    logger.warning('No MetadataType found for %s' % meta_id)
        return self._meta_lookup.get(label, None)

    def _mtype(self, label):
        layout = self._layout()
        if layout == 'tr':
            gene_ids = GeneIdentifier.objects.filter(type_name=label).values_list('id')
            if len(gene_ids) == 1:
                return (0, ) + gene_ids[0] + (1, )
            else:
                logger.warning('Found %s GeneIdentifier instances for %s' % (
                    len(gene_ids), label))
            return (0, 0, 1)
        elif layout == 'pr':
            protein_ids = ProteinIdentifer.objects.filter(type_name=label).values_list('id')
            if len(protein_ids) == 1:
                return (0, ) + protein_ids[0] + (1, )
            else:
                logger.warning('Found %s ProteinIdentifer instances for %s' % (
                    len(protein_ids), label))
            return (0, 0, 1)
        if label not in self._type_lookup:
            if label is None:
                self._type_lookup[label] = (
                    self._data.get('masterMCompValue', 0),
                    self._data.get('masterMTypeValue', 0),
                    self._data.get('masterMUnitsValue', 1) if layout == 'std' else 1,)
            else:
                self._type_lookup[label] = (
                    self._data.get('disamMComp%s' % label, 0),
                    self._data.get('disamMType%s' % label, 0),
                    self._data.get('disamMUnits%s' % label, 1) if layout == 'std' else 1,)
        return self._type_lookup.get(label)

    def _mtype_format(self, points):
        layout = self._layout()
        if layout == 'mdv':
            return 1    # carbon ratios are vectors
        elif layout in ('tr', 'pr'):
            return 0    # always single values
        else:
            # if any value looks like carbon ratio (vector), treat all as vector
            for (x,y) in points:
                if y is not None and ('/' in y or ':' in y):
                    return 1
            return 0

    def _protocol(self):
        if not hasattr(self, '_import_protocol'):
            self._import_protocol = Protocol.objects.get(pk=self._data.get('masterProtocol', None))
        return self._import_protocol

    def _replace(self):
        return self._data.get('writemode', None) == 'r'

    def _time(self):
        return self._data.get('masterTimestamp', '')

    def _unit(self, unit_id):
        if unit_id not in self._unit_lookup:
            try:
                self._unit_lookup[unit_id] = MeasurementUnit.objects.get(id=unit_id)
            except MeasurementUnit.DoesNotExist:
                logger.warning('No MeasurementUnit found for %s' % unit_id)
        return self._unit_lookup[unit_id]

    def _valid_time(self):
        return self._time().isdigit()


########################################################################
# RNA-SEQ DATA IMPORT
#
# TODO this should be able to work with existing assays!
class import_rna_seq (object) :
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
    def __init__ (self, study, user, update, **kwds) :
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
        meas_times = [ float(x) for x in kwds["meas_times"] ]
        assert (len(line_ids) == len(assay_ids) == len(meas_times) == n_cols)
        if (descriptions is None) :
            descriptions = [ None ] * n_cols
        unique_ids = set([])
        for line_id, assay_id, t in zip(line_ids,assay_ids,meas_times) :
            key = (line_id, assay_id, t)
            if (key in unique_ids) and ((assay_id != 0) or group_timepoints) :
                raise ValueError("Duplicate line/assay/timepoint selections"+
                    "- each combination must be unique!  For technical "+
                    "replicates, you should treat each replica as a separate "+
                    "assay.")
            unique_ids.add(key)
        protocol = Protocol.objects.get(name="Transcriptomics")
        table = kwds["table"]
        if isinstance(table, basestring) :
            table = json.loads(table) # XXX ugh....
        assert (len(table) > 0) and isinstance(table[0], list)
        for row in table :
            assert (len(row[1:]) == n_cols), row
        lines = { l.pk:l for l in Line.objects.filter(id__in=line_ids) }
        assays = {}
        new_assays = {}
        new_assay_ids = []
        for line_id, assay_id, desc, t in \
                zip(line_ids, assay_ids, descriptions, meas_times) :
            line = lines[line_id]
            if (assay_id == 0) : # new assay needed
                if (group_timepoints) :
                    if (line_id in new_assays) :
                        assay = new_assays[line_id]
                        new_assay_ids.append(assay.id)
                        continue
                assay_start_id = line.new_assay_number(protocol)
                assay = line.assay_set.create(
                    name=str(assay_start_id),
                    description=desc,
                    protocol=protocol,
                    experimenter=user)
                assays[(line_id, assay.pk)] = assay
                new_assays[line_id] = assay
                new_assay_ids.append(assay.pk)
                self.n_assay += 1
            else :
                assay = line.assay_set.get(pk=assay_id)
                assays[(line_id, assay_id)] = assay
                new_assay_ids.append(assay_id)
        assay_ids = new_assay_ids
        meas_units = {
            "fpkm" : MeasurementUnit.objects.get(unit_name="FPKM"),
            "counts" : MeasurementUnit.objects.get(unit_name="counts"),
            "hours" : MeasurementUnit.objects.get(unit_name="hours"),
        }
        genes = GeneIdentifier.by_name()
        # now collect all Measurements for each assay, and store in a dict
        # keyed by (assay_id, measurement_type_id, y_units_id)
        def get_measurements_dict () :
            meas_dict_ = {}
            for line_id, assay_id in zip(line_ids, assay_ids) :
                assay = assays[(line_id, assay_id)]
                all_measurements = assay.measurement_set.all()
                for m in all_measurements :
                    key = (assay_id, m.measurement_type_id, m.y_units_id)
                    meas_dict_[key] = m
            return meas_dict_
        meas_dict = get_measurements_dict()
        new_measurements = []
        update_measurements = []
        values_by_gene = { "fpkm" : {}, "counts" : {} }
        for i_row, row in enumerate(table) :
            gene_id = row[0]
            if (gene_id == "GENE") : continue
            gene_meas = genes.get(gene_id, None)
            if (gene_meas is None) :
                gene_meas = GeneIdentifier.objects.create( # FIXME annotation?
                    type_name=gene_id,
                    type_group=MeasurementGroup.GENEID) # XXX is this necessary?
                genes[gene_id] = gene_meas
                self.n_meas_type += 1
            all_fpkms = []
            all_counts = []
            for i_col, value in enumerate(row[1:]) :
                fpkm = counts = None
                try :
                    if (data_type == "combined") :
                        fields = value.split(",")
                        all_counts.append(int(fields[0]))
                        all_fpkms.append(float(fields[1]))
                    elif (data_type == "fpkm") :
                        all_fpkms.append(float(value))
                    elif (data_type == "counts") :
                        all_counts.append(int(value))
                except ValueError :
                    raise ValueError("Couldn't interpret value at (%d,%d): %s"%
                        (i_row+1, i_col+2, value))
            if (all_counts) :
                values_by_gene["counts"][gene_id] = all_counts
            if (all_fpkms) :
                values_by_gene["fpkm"][gene_id] = all_fpkms
            def add_measurement_data (values, units) :
                assert len(values) == n_cols
                measurements = {}
                for i_col,(line_id,assay_id) in enumerate(zip(line_ids,
                                                              assay_ids)):
                    key = (assay_id, gene_meas.pk, units.pk)
                    if (key in meas_dict) :
                        meas = meas_dict[key]
                        update_measurements.append(meas.pk)
                    else :
                        meas = measurements.get((line_id, assay_id), None)
                    if (meas is None) :
                        assay = assays[(line_id, assay_id)]
                        meas = Measurement(
                            assay=assay,
                            measurement_type=gene_meas,
                            x_units=meas_units["hours"],
                            y_units=units,
                            experimenter=user,
                            update_ref=update,
                            compartment=MeasurementCompartment.INTRACELLULAR)
                        self.n_meas += 1
                        new_measurements.append(meas)
                        measurements[(line_id, assay_id)] = meas
                    #meas.measurementdatum_set.create(
                    #    x=meas_times[i_col],
                    #    y=values[i_col],
                    #    updated=update)
                    #self.n_meas_data += 1
            if (len(all_fpkms) > 0) :
                add_measurement_data(all_fpkms, meas_units["fpkm"])
            if (len(all_counts) > 0) :
                add_measurement_data(all_counts, meas_units["counts"])
        if (len(new_measurements) > 0) :
            Measurement.objects.bulk_create(new_measurements)
        self.n_meas_updated = len(update_measurements)
        if (self.n_meas_updated) :
            Measurement.objects.filter(id__in=update_measurements).update(
                update_ref=update)
        meas_dict = get_measurements_dict()
        new_meas_data = []
        for gene_id in genes.keys() :
            meas_type = genes[gene_id]
            for ytype in ["counts", "fpkm"] :
                if (len(values_by_gene[ytype]) > 0) :
                    for i_col, (assay_id, t) in enumerate(
                            zip(assay_ids, meas_times)) :
                        key = (assay_id, meas_type.pk, meas_units[ytype].pk)
                        mdata = MeasurementValue(
                            measurement=meas_dict[key],
                            x=[t],
                            y=[values_by_gene[ytype][gene_id][i_col]],
                            updated=update)
                        new_meas_data.append(mdata)
                        self.n_meas_data += 1
        if (len(new_meas_data) > 0) :
            MeasurementValue.objects.bulk_create(new_meas_data)

    @classmethod
    def from_form (cls, request, study) :
        form = request.POST
        n_cols = int(form["n_cols"])
        meas_times = []
        line_ids = []
        assay_ids = []
        descriptions = []
        for i in range(n_cols) :
            meas_times.append(float(form["time-%d"%i]))
            assay_ids.append(int(form["assay-%d"%i]))
            line_ids.append(int(form["line-%d"%i]))
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
            data_type=form["data_type"])

def interpret_raw_rna_seq_data (raw_data, study, file_name=None) :
    """
    Given tabular RNA-Seq data (reads or FPKMs), attempt to determine the
    data type and groupings automatically, and return a dictionary that
    will be used to populate the view with new form elements.
    """
    data_type = None
    lines = study.line_set.all()
    lines_by_name = { line.name:line for line in lines }
    table = [ l.strip().split() for l in raw_data.splitlines() ]
    msg = "These data do not appear to be in the expected format.  "
    if (len(table) < 2) :
        raise ValueError(msg+"You must have a single line specifying column "+
            "labels, followed by a separate line for each gene.")
    elif (len(table[0]) < 2) :
        raise ValueError(msg+"At least two columns are required, the first "+
            "for gene IDs, followed by a column for each condition/sample.")
    headers = table[0]
    if (headers[0] != "GENE") :
        raise ValueError(msg+"First column of first row must be 'GENE'")
    samples = []
    condition_ids = defaultdict(int)
    for i_sample, label in enumerate(headers[1:]) :
        fields = label.split("-")
        rep_id = fields[-1]
        condition_name = "-".join(fields[:-1])
        condition_ids[condition_name] += 1
        line_id = None
        if (condition_name in lines_by_name) :
            line_id = lines_by_name[condition_name].id
        samples.append({
            "i_sample" : i_sample,
            "label" : label,
            "assay_id" : condition_ids[condition_name],
            "line_id" : line_id,
        })
    #processed_table = [ headers ]
    if (file_name is not None) :
        if ("rpkm" in file_name.lower()) or ("fpkm" in file_name.lower()) :
            data_type = "fpkm"
        elif ("counts" in file_name.lower()) :
            data_type = "counts"
    for i, row in enumerate(table[1:]) :
        if ("," in row[1]) :
            data_type = "combined"
            _validate_row(row, i, True)
        else :
            if (data_type is None) :
                if ([ "." in cell for cell in row[1:] ].count(True) > 0) :
                    data_type = "fpkm"
            _validate_row(row, i)
    assays = Assay.objects.filter(line__study=study,
        protocol__name="Transcriptomics").select_related(
        "line__study").select_related("protocol")
    return {
        "guessed_data_type" : data_type,
        "raw_data" : raw_data,
        "table" : table,
        "samples" : samples,
        "assays" : [ {"id":a.id, "name": a.long_name} for a in assays ],
    }

def _validate_row (row, i_row, assume_csv_pairs=False) :
    """Utility function to verify that a row of RNA-seq data to be imported
    conforms to the expected format."""
    if assume_csv_pairs :
        for j in range(1, len(row)) :
            fields = row[j].split(",")
            try :
                val1 = float(fields[0])
                val2 = float(fields[1])
            except Exception as e :
                raise ValueError(("Can't interpret field (%d,%d) as "+
                    "a pair of real numbers: '%s'") % (i_row+1, j+2, row[j]))
    else :
        for j in range(1, len(row)) :
            try :
                val = float(row[j])
            except Exception as e :
                raise ValueError(("Can't interpret field (%d,%d) as "+
                    "a real number: '%s'") % (i_row+1, j+2, row[j]))

def get_edgepro_genes (data) :
    """
    Iterator for parsing tabular data from EDGE-pro; yields the gene ID,
    number of reads, and RPKM in each valid row (starting from the 3rd row).
    """
    table = data.splitlines()
    if (not table[0].startswith("gene_ID")) :
        raise ValueError("This does not appear to be an output file from "+
            "EDGE-pro: the first line of the file should start with 'gene_ID'")
    for i_row, row in enumerate(table[2:]) :
        row = row.strip()
        if (row == "") : continue
        fields = row.split()
        if (len(fields) != 6) :
            raise ValueError("Unexpected number of fields in line: '%s'" %
                row)
        gene_id = fields[0]
        n_reads = int(fields[4])
        rpkm = float(fields[5])
        yield gene_id, n_reads, rpkm

def interpret_edgepro_data (raw_data) :
    """
    Process data uploaded from a form and return a summary of its contents
    """
    n_genes = 0
    rpkm_max = 0
    count_max = 0
    for gene_id, n_reads, rpkm in get_edgepro_genes(raw_data) :
        n_genes += 1
        rpkm_max = max(rpkm, rpkm_max)
        count_max = max(n_reads, count_max)
    return {
        "n_genes" : n_genes,
        "rpkm_max" : rpkm_max,
        "count_max" : count_max,
        "raw_data" : raw_data,
    }

class import_rnaseq_edgepro (object) :
    """
    Separate utility for uploading files directly from the EDGE-pro
    processing pipeline for prokaryotic RNA-seq experiments; these
    contain both read counts and RPKMs.  The data will be in a simple
    tabular format (space-delineated, column-based), with fields
    gene_ID, start_coord, end_coord, average_cov, #reads, and RPKM.
    The first line is these labels, followed by a blank line.
    """
    def __init__ (self, study, form, update) :
        self.n_meas = self.n_meas_type = self.n_meas_data = 0
        self.n_meas_updated = 0
        remove_all = form.get("remove_all", "0") == "1"
        assay_id = form["assay"]
        assay = Assay.objects.get(pk=assay_id)
        assert (assay.line.study.id == study.id)
        def get_measurements_dict () :
            old_measurements = assay.measurement_set.select_related(
                "measurement_type", "x_units", "y_units")
            meas_dict_ = defaultdict(list)
            for m in old_measurements :
                meas_dict_[m.measurement_type.type_name].append(m)
            return meas_dict_
        meas_dict = get_measurements_dict()
        timepoint = float(form["timepoint"])
        rpkm_unit = MeasurementUnit.objects.get(unit_name="FPKM")
        counts_unit = MeasurementUnit.objects.get(unit_name="counts")
        hours_unit = MeasurementUnit.objects.get(unit_name="hours")
        genes = GeneIdentifier.by_name()
        if (remove_all) :
            # get rid of all data points for this assay, regardless of
            # timepoint
            MeasurementValue.objects.filter(measurement__assay=assay).delete()
        else :
            # delete any existing data points for this assay at the given
            # timepoint
            MeasurementValue.objects.filter(
                measurement__assay=assay,
                x__0=timepoint).delete()
        # XXX to facilitate bulk record creation, there are two loops over
        # entries in the table.  loop 1 creates new GeneIdentifiers as
        # needed, and either creates new Measurements or flags the existing
        # ones for updating.  we can't create MeasurementValue objects yet
        # because any new parent Measurements won't have IDs until they're
        # actually entered into the database.
        new_meas = []
        update_meas = []
        for gene_id, n_reads, rpkm in get_edgepro_genes(form["data_table"]) :
            gene_meas = genes.get(gene_id, None)
            # add new gene measurement type if necessary
            if (gene_meas is None) :
                gene_meas = GeneIdentifier.objects.create(
                    type_name=gene_id,
                    type_group=MeasurementGroup.GENEID) # XXX is this necessary?
                genes[gene_id] = gene_meas
                self.n_meas_type += 1
            meas_fpkm = meas_counts = None
            # add new gene measurement type if necessary
            # if we already have assay measurements for this gene, use
            # those instead of creating new ones
            if (gene_id in meas_dict) :
                for old_meas in meas_dict[gene_id] :
                    if (old_meas.y_units_id == rpkm_unit.pk) :
                        meas_fpkm = old_meas
                    elif (old_meas.y_units_id == counts_unit.pk) :
                        meas_counts = old_meas
            # For both types of measurement, either create a new Measurement
            # record or update the old one.
            for meas_record, meas_unit, md_value in zip(
                    [meas_fpkm, meas_counts],
                    [rpkm_unit, counts_unit],
                    [rpkm, n_reads]) :
                if (meas_record is None) :
                    meas_record = Measurement(
                        assay=assay,
                        measurement_type=gene_meas,
                        x_units=hours_unit,
                        y_units=meas_unit,
                        experimenter=update.mod_by,
                        update_ref=update,
                        compartment=MeasurementCompartment.INTRACELLULAR)
                    new_meas.append(meas_record)
                    self.n_meas += 1
                else :
                    update_meas.append(meas_record.id)
                    self.n_meas_updated += 1
        # actually run the database INSERT/UPDATE statements
        if (len(new_meas) > 0) :
            Measurement.objects.bulk_create(new_meas)
        if (len(update_meas) > 0) :
            Measurement.objects.filter(id__in=update_meas).update(
                update_ref=update)
        # XXX loop 2 creates the MeasurementValue objects, now that we have
        # IDs associated with the parent measurements.
        meas_dict = get_measurements_dict()
        new_meas_data = []
        for gene_id, n_reads, rpkm in get_edgepro_genes(form["data_table"]) :
            gene_meas = genes[gene_id]
            meas_fpkm = meas_counts = None
            # add new gene measurement type if necessary
            # if we already have assay measurements for this gene, use
            # those instead of creating new ones
            if (gene_id in meas_dict) :
                for old_meas in meas_dict[gene_id] :
                    if (old_meas.y_units_id == rpkm_unit.pk) :
                        meas_fpkm = old_meas
                    elif (old_meas.y_units_id == counts_unit.pk) :
                        meas_counts = old_meas
            assert (not None in [meas_fpkm, meas_counts])
            for meas_record, meas_unit, md_value in zip(
                    [meas_fpkm, meas_counts],
                    [rpkm_unit, counts_unit],
                    [rpkm, n_reads]) :
                meas_data = MeasurementValue(
                    measurement=meas_record,
                    x=[timepoint],
                    y=[md_value],
                    updated=update)
                new_meas_data.append(meas_data)
                self.n_meas_data += 1
        MeasurementValue.objects.bulk_create(new_meas_data)

    def format_message (self) :
        msg = "Added %d gene identifiers and %d measurements" % \
            (self.n_meas_type, self.n_meas)
        if (self.n_meas_updated) :
            msg += ", and updated %d measurements" % self.n_meas_updated
        return msg

    @classmethod
    def from_form (cls, request, study) :
        return cls(
            study=study,
            form=request.POST,
            update=Update.load_request_update(request))
