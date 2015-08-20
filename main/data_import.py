
from main.models import *
from django.core.exceptions import ObjectDoesNotExist
import warnings
import json

def import_assay_table_data(study, user, post_data, update):
    """
    Process the query POSTed by the /study/ID/import view and add measurements
    to the database.  Ported from AssayTableData.cgi in Perl EDD.  This is
    somewhat convoluted because of the flexibility of the input interface.

    A number of warnings may be emitted by this routine if data items cannot
    be interpreted meaningfully; these will be caught in the view and
    propagated to the client.
    """
    assert study.user_can_write(user)
    assert (user.id == update.mod_by.id)
    json_data = post_data["jsonoutput"]
    data_series = json.loads(json_data)
    data_layout = post_data['datalayout']
    master_protocol = post_data['masterProtocol']
    protocol = Protocol.objects.get(pk=master_protocol)
    replace = (post_data['writemode'] == "r")
    n_added = 0
    found_usable_index = 0
    master_compartment_id = post_data['masterMCompValue']
    master_meas_type_id = post_data['masterMTypeValue']
    master_meas_units_id = post_data['masterMUnitsValue']
    valid_master_timestamp = False
    master_timestamp = post_data['masterTimestamp']
    if (master_timestamp.isdigit()) :
        valid_master_timestamp = True
    # Attepmt to set a 'hasNothingToImport' flag for later reference.
    for u in data_series:
        udata = u.get('data', [])
        # if no array of data, check for 'singleData' and add to data array
        # with master_timestamp (if validly defined)
        if len(udata) == 0 and 'singleData' in u and valid_master_timestamp:
            udata.append([ master_timestamp, u['singleData'] ])
        umeta = u.get('metadata', {})
        if len(udata) == 0 and len(umeta) == 0:
            u['nothing_to_import'] = True
    # If the list of parsed data sets contains even one valid reference to an
    # assay ID or a 'new' Assay keyword, we should not use the master Assay
    # value, and instead report errors if any data set contains a blank Assay
    # value.  On the other hand, if the list of parsed sets consistently
    # reports no valid Assay, then we are clearly meant to use the master Assay
    # value for them all.
    use_master_assay = True
    master_assay = None
    # After setting or clearing this flag, we will walk through the set of
    # Assay references and create new Assays as needed, developing a hash for
    # later use, so we don't create multiple Assays when multiple columns
    # reference the same disambiguation fields.
    resolved_disambiguation_assays = {}
    lines_for_assays = {}
    for u in data_series:
        assay_index = u['assay']
        if (not assay_index) :
            continue
        assay_id = post_data.get("disamAssay" + assay_index, None)
        if not assay_id:
            continue
        # At this point we know there is at least one attempt to link an
        # individual set with an individual disambiguation pulldown, so we
        # clear the flag
        use_master_assay = False
        # If this set has no data or metadata to import, don't bother creating
        # any Assays or Lines for it.
        if u.get("nothing_to_import") :
            continue
        if assay_id != "new":
            try:
                assay = Assay.objects.get(pk=assay_id)
            except ObjectDoesNotExist as e:
                pass
            else:
                assert assay.line.study.id == study.id
                # If the disambiguation element value is nonzero and not 'new',
                # and points to a valid Assay, note and move on.
                resolved_disambiguation_assays[assay_index] = assay_id
                lines_for_assays[assay_id] = assay.line.id
            # If we didn't resolve it, we didn't populate the hash.
            # That's all the error reporting we need for now.
            continue
        # Now we know the Assay element is set to 'new', so we need the value
        # of the corresponding Line element.
        line_id = post_data.get("disamLine" + assay_index, None)
        if not line_id:
            continue
        line = None
        # If the value is 'new', we always create a new Line.
        # You might think that we'd need a resolved_disambiguation_lines
        # structure, but resolved_disambiguation_assays takes care of this.
        if line_id == "new":
            new_line_name = u.get("assayName")
            if not new_line_name:
                new_line_name = str(study.line_set.count() + 1)
            line = study.line_set.create(
                study=study,
                name=new_line_name,
                experimenter=user,
                control=False)
            line_id = line.id
        else:
            line = Line.objects.get(pk=line_id)
        if line_id == "new":
            # If we didn't change $lID to a valid record, we failed to create a
            # Line, so we can't create an Assay.
            continue
        new_assay_name = u.get("assayName", None)
        if not new_assay_name:
            new_assay_name = line.name + "-" + str(line.assay_set.count() + 1)
        assay = line.assay_set.create(
            name=new_assay_name,
            protocol=master_protocol,
            experimenter=user)
        # Finally we've got everything resolved
        resolved_disambiguation_assays[assay_index] = assay
        lines_for_assays[assay.id] = line
    master_assay_id = post_data.get('masterAssay', None)
    master_assay = None
    if use_master_assay:
        master_line_id = post_data['masterLine']
        if not master_assay_id:
            raise UserWarning("Did you forget to specify a master assay?")
        elif master_assay_id == "new":
            line = None
            if not master_line_id:
                raise UserWarning("Did you forget to specify a master line?")
            elif master_line_id == "new":
                line = study.line_set.create(
                    study=study,
                    name=str(study.line_set.count() + 1),
                    experimenter=user)
            else:
                line = Line.objects.get(pk=master_line_id)
            master_assay = line.assay_set.create(
                line=line,
                name=line.name + "-" + str(line.assay_set.count() + 1),
                protocol=protocol,
                experimenter=user)
        else:
            try:
                master_assay = Assay.objects.get(pk=master_assay_id)
            except ObjectDoesNotExist as e:
                pass
            else:
                assert master_assay.line.study.id == study.id
                lines_for_assays[master_assay_id] = master_assay.line.id
    # At this point we have a value for the "master" Assay, if any, and a dict
    # resolving all the individually referenced disambiguation elements in the
    # sets to their corresponding Assay IDs, and a flag telling us whether to
    # use that dict or ignore in (in which case it will also be empty).
    warn_about_master_timsetamp = False
    # Before the 'official' run through of the data sets, we need to make
    # another preliminary run to make a master list of all the resolvable
    # metadata types seen across all sets.  If the page is in 'replace' mode,
    # we need to use this master list to delete all the pre-existing values -
    # but only for the metadata types that are mentioned in the new data,
    # and supplied with at least one valid value somewhere in one of the new
    # sets.  (This way, submitting an entirely blank column will be a NO-OP
    # even in 'replace' mode, which is expected behavior since there is nothing
    # to replace the old data WITH.)
    all_seen_metadata_types = {}
    for u in data_series:
        metadata = u['metadata']
        for md_label in metadata:
            meta_type_id = post_data.get("disamMetaHidden" + md_label, None)
            if meta_type_id:
                all_seen_metadata_types[md_label] = meta_type_id
    # Now we take our last trek through the sets and import the data...
    current_genes_by_name = GeneIdentifier.by_name()
    current_proteins_by_name = MeasurementType.proteins_by_name()
    # This is used to display a number in the log, for each data set being
    # imported
    fake_index = 1
    # XXX INPUTROW block in AssayTableData.cgi
    mu_t = MeasurementUnit.objects.get(unit_name="hours")
    for u in data_series:
        name = u.get('name', None)
        parsing_index = u.get('parsingIndex', None)
        if not parsing_index:
            parsing_index = fake_index
        setname = name
        if not setname:
            setname = "set %s" % (parsing_index + 1)
        fake_index += 1
        data = u.get('data', [])
        # If we saw no array of data, check and see if 'singleData' is set,
        # and if so, push it onto the array along with the master timestamp
        # (if sensibly defined).
        if len(data) < 1 and u['singleData']:
            if valid_master_timestamp:
                data.append( [ master_timestamp, u['singleData'] ] )
            elif not warn_about_master_timsetamp:
                warn_about_master_timsetamp = True
                warnings.warn("Did you forget to specify a timestamp for the "+
                    "data in step 4?")
        if u.get('nothing_to_import', False):
            warnings.warn("Skipped " + setname + " because it has no data.")
            continue
        assay = None
        if use_master_assay:
            assay = master_assay
        else:
            assay = resolved_disambiguation_assays.get(u['assay'], None)
        if assay is None:
            warnings.warn("Skipped " + setname + " because it does not "+
              "reference a valid assay.")
            continue
        mtype_format = 0
        for (x,y) in data:
            # If even one of the values looks like a carbon ratio, treat them
            # all as such.
            if (y is not None) and ("/" in y):
                mtype_format = 1
                break
        if data_layout == "mdv":
            mtype_format = 1 # Carbon ratio data format
        elif data_layout in ["tr", "pr"]:
            # Transcription (RPKM) and proteomics values are always a single
            # number
            mtype_format = 0
        meas_idx = u['measurementType']
        compartment_id = master_compartment_id
        meas_type_id = master_meas_type_id
        meas_units_id = master_meas_units_id
        if meas_idx:
            compartment_id = post_data.get("disamMCompHidden"+str(meas_idx), 0)
            meas_type_id = post_data.get("disamMTypeHidden" + str(meas_idx), 0)
            meas_units_id = post_data.get("disamMUnitsHidden"+str(meas_idx), 1)
        if data_layout == "mdv":
            meas_units_id = 1 # MDV values don't have units
        # refactored function, takes lots of parameters; should be a class?
        iatd_handle_data(data, data_layout, meas_type_id, setname, meas_units_id,
                assay, replace, update, compartment_id, mu_t)
        metadata = u.get('metadata', None)
        if len(metadata) > 0:
            if replace:
                # would be simpler to do assay.meta_store.clear()
                # but we only want to replace types included in import data
                for _, md_type in all_seen_metadata_types:
                    if md_type:
                        del assay.meta_store[md_type]
            for mdkey, mdval in metadata.items():
                md_type = all_seen_metadata_types.get(mdkey, None)
                if md_type:
                    assay.meta_store[md_type.pk] = mdval
            assay.save()
    return n_added

def iatd_handle_data(data, layout, meas_type_id, setname, meas_units_id, assay,
        replace, update, compartment_id, mu_t):
    # XXX HANDLEDATA block in AssayTableData.cgi
    n_added = 0
    if len(data) == 0:
        return n_added
    meas_type = None
    if layout in ['std', 'mdv']:
        # For these modes, the measurement type must already be present in
        # the database
        if not meas_type_id:
            warnings.warn(("Cannot add %d data points from %s because "+
                "no measurement type was specified.")%(len(data),setname))
            return n_added
        # check that the specified measurement type already exists
        try:
            meas_type = MeasurementType.objects.get(id=meas_type_id)
        except MeasurementType.DoesNotExist:
            warnings.warn(("Cannot add %d data points from %s because "+
                "measurement type %s does not exist.") % (len(data),
                setname))
            return n_added
    elif layout == "tr":
        # If we're in transcription mode, we first attempt to look up the
        # name of the gene in the master table and resolve it to a
        # GeneIdentifier.
        meas_units_id = 1 # FIXME Units are always n/a
        # Given that there's currently no way to specify the compartment,
        # we'll default it to none.
        compartment_id = 0
        try:
            meas_type = GeneIdentifier.objects.get(type_name=name)
        except Exception:
            meas_type = GeneIdentifier(type_name=name)
            meas_type.save()
    elif layout == "pr":
        # If we're in proteomics mode, we first attempt to look up the name
        # of the protein in the master table and resolve it to a
        # Measurement Type.
        meas_units_id = 1 # FIXME Units are always n/a
        # Given that there's currently no way to specify the compartment,
        # we'll default it to none.
        compartment_id = 0 
        try:
            meas_type = ProteinIdentifier.objects.get(type_name=name)
        except Exception:
            meas_type = ProteinIdentifier(type_name=name)
            meas_type.save()
    else:
        warnings.warn(("Cannot add data in %s because the page is in an "+
            "unknown import mode!") % setname)
        return n_added
    meas_records = assay.measurement_set.filter(
        measurement_type=meas_type,
        compartment=str(compartment_id))
        # FIXME Missing: format (scalar or vector)
    meas_units = MeasurementUnit.objects.get(id=meas_units_id)
    meas_record = None
    if (len(meas_records) > 0) : # can it be more than 1?
        if replace:
            meas_records.delete()
        else:
            meas_record = meas_records[0]
            meas_record.update_ref = update
            meas_record.save()
    if meas_record is None:
        meas_record = Measurement(
            assay=assay,
            update_ref=update,
            measurement_type=meas_type,
            compartment=str(compartment_id),
            experimenter=update.mod_by,
            x_units=mu_t,
            y_units=meas_units)
        meas_record.save()
    for x,y in data:
        try:
            datum = meas_record.measurementvalue_set.get(x__0=x)
        except MeasurementValue.DoesNotExist as e:
            datum = meas_record.measurementvalue_set.create(
                x=[x], y=[y], updated=update)
        else:
            datum.y = [y]
            datum.save()
        n_added += 1
    return n_added


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
