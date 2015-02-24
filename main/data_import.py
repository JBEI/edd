
# local imports
from main.models import Protocol, Assay, MeasurementType, GeneIdentifier, \
    MeasurementUnit
# global imports
from django.core.exceptions import ObjectDoesNotExist
import warnings
import json

def import_assay_table_data (study, user, post_data) :
    """
    Process the query POSTed by the /study/ID/import view and add measurements
    to the database.  Ported from AssayTableData.cgi in Perl EDD.  This is
    somewhat convoluted because of the flexibility of the input interface.

    A number of warnings may be emitted by this routine if data items cannot
    be interpreted meaningfully; these will be caught in the view and
    propagated to the client.
    """
    #assert study.user_can_write(user) # FIXME
    json_data = post_data.get("jsonoutput")
    data_series = json.loads(json_data)
    data_layout = post_data['datalayout']
    master_protocol = post_data['masterProtocol']
    protocol = Protocol.objects.get(pk=master_protocol)
    replace = (post_data['writemode'] == "r")
    n_added = 0
    unique_new_assay_index = 1
    found_usable_index = 0
    # TODO determine assay index???
    master_compartment_id = post_data['masterMCompValue']
    master_meas_type_id = post_data['masterMTypeValue']
    master_meas_units_id = post_data['masterMUnitsValue']
    valid_master_timestamp = False
    master_timestamp = post_data['masterTimestamp']
    if (master_timestamp.isdigit()) :
        valid_master_timestamp = True
    # TODO  Attepmt to set a 'hasNothingToImport' flag for later reference.
    #
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
    for u in data_series :
        assay_index = u['assay']
        if (not assay_index) :
            continue
        assay_id = post_data.get("disamAssay" + assay_index, None)
        if (not assay_id) :
            continue
        # At this point we know there is at least one attempt to link an
        # individual set with an individual disambiguation pulldown, so we
        # clear the flag
        use_master_assay = False
        # If this set has no data or metadata to import, don't bother creating
        # any Assays or Lines for it.
        if n.get("nothing_to_import") :
            continue
        if (assay_id != "new") :
            try :
                assay = Assay.objects.get(pk=assay_id)
            except ObjectDoesNotExist as e :
                pass
            else :
                assert assay.line.study.id == study.id
                # If the disambiguation element value is nonzero and not 'new',
                # and points to a valid Assay, note this in the hash, and move
                # on.
                resolved_disambiguation_assays[assay_index] = assay_id
                lines_for_assays[assay_id] = assay.line.id
            # If we didn't resolve it, we didn't populate the hash.
            # That's all the error reporting we need for now.
            continue
        line_id = post_data.get("disamLine" + assay_index, None)
        if (not line_id) :
            continue
        line = None
        # If the value is 'new', we always create a new Line.
        # You might think that we'd need a resolved_disambiguation_lines
        # structure, but resolved_disambiguation_assays takes care of this.
        if (line_id == "new") :
            new_line_name = u.get("assayName")
            if (not new_line_name) :
                new_line_name = str(unique_new_assay_index)
            line = study.line_set.create(
                study=study,
                name=new_line_name,
                experimenter=user,
                control=False) # TODO
            line_id = line.id
        else :
            line = Line.objects.get(pk=line_id)
        if (line_id == "new") :
            # If we didn't change $lID to a valid record, we failed to create a
            # Line, so we can't create an Assay.
            continue
        new_assay_name = u.get("assayName", None)
        if (not new_assay_name) :
            new_assay_name = unique_new_assay_index
        assay = line.assay_set.create(
            name=new_assay_name,
            protocol=master_protocol,
            experimenter=user)
        # Finally we've got everything resolved
        resolved_disambiguation_assays[assay_index] = assay
        lines_for_assays[assay.id] = line
    master_assay_id = post_data.get('masterAssay', None)
    master_assay = None
    if use_master_assay :
        master_line_id = post_data['masterLine']
        if (not master_assay_id) :
            raise UserWarning("Did you forget to specify a master assay?")
        elif (master_assay_id == "new") :
            line = None
            if (not master_line_id) :
                raise UserWarning("Did you forget to specify a master line?")
            elif (master_line == "new") :
                line = study.line_set.create(
                    study=study,
                    name=str(unique_new_assay_index),
                    experimenter=user)
            else :
                line = Line.objects.get(pk=master_line_id)
            master_assay = line.assay_set.create(
                line=line,
                protocol=protocol
        else :
            try :
                master_assay = Assay.objects.get(pk=master_assay_id)
            except ObjectDoesNotExist as e :
                pass
            else :
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
    for u in data_series :
        md = u['metadata']
        for md_label in metadata :
            meta_type_id = post_data.get("disamMetaHidden" + md_label, None)
            if meta_type_id :
                all_seen_metadata_types[md_label] = meta_type_id
    # Now we take our last trek through the sets and import the data...
    current_genes_by_name = GeneIdentifier.by_name()
    current_proteins_by_name = MeasurementType.proteins_by_name()
    # This is used to display a number in the log, for each data set being
    # imported
    # XXX INPUTROW block in AssayTableData.cgi
    fake_index = 1
    for u in data_series :
        name = u['name']
        parsing_index = u.get('parsingIndex', None)
        if (not parsing_index) :
            parsing_index = fake_index
        setname = name
        if (not setname) :
            setname = "set " + str((parsing_index + 1))
        fake_index += 1
        data = u['data']
        # If we saw no array of data, check and see if 'singleData' is set,
        # and if so, push it onto the array along with the master timestamp
        # (if sensibly defined).
        if (len(data) < 1) and (u['singleData']) :
            if valid_master_timestamp :
                data.append( (master_timestamp, u['singleData']) )
            elif (not warn_about_master_timsetamp) :
                warn_about_master_timsetamp = True
                warnings.warn("Did you forget to specify a timestamp for the "+
                    "data in step 4?")
        if u.get('hasNothingToImport', False) :
            warnings.warn("Skipped " + setname + " because it has no data.")
            continue
        assay = None
        if use_master_assay :
            assay = master_assay
        else :
            assay = resolved_disambiguation_assays[u['assay']]
        if (assay is None) :
            warnings.warn("Skipped " + setname + " because it does not "+
              "reference a valid assay.")
            continue
        mtype_format = 0
        for (x,y) in data :
            # If even one of the values looks like a carbon ratio, treat them
            # all as such.
            if (y is not None) and ("/" in y) :
                mtype_format = 1
                break
        if (data_layout == "mdv") :
            mtype_format = 1 # Carbon ratio data format
        elif (data_layout in ["tr", "pr"]) :
            # Transcription (RPKM) and proteomics values are always a single
            # number
            mtype_format = 0
        meas_idx = u['measurementType']
        compartment_id = master_compartment_id
        meas_type_id = master_meas_type_id
        meas_units_id = master_meas_units_id
        if (meas_idx) :
            compartment_id = post_data.get("disamMCompHidden"+str(meas_idx), 0)
            meas_type_id = post_data.get("disamMTypeHidden" + str(meas_idx), 0)
            meas_units_id = post_data.get("disamMUnitsHidden"+str(meas_idx), 1)
        if (data_layout == "mdv") :
            meas_units_id = 1 # MDV values don't have units
        # XXX HANDLEDATA block in AssayTableData.cgi
        if (len(data) == 0) :
            # last HANDLEDATA
            continue # ???
        meas_type = None
        if (data_layout in ['std', 'mdv']) :
            # For these modes, the measurement type must already be present in
            # the database
            if (not meas_type_id) :
                warnings.warn(("Cannot add %d data points from %s because "+
                    "no measurement type was specified.")%(len(data),setname))
                continue
            # check that the specified measurement type already exists
            try :
                meas_type = MeasurementType.objects.get(id=meas_type_id)
            except MeasurementType.DoesNotExist :
                warnings.warn(("Cannot add %d data points from %s because "+
                    "measurement type %s does not exist.") % (len(data),
                    setname))
                continue
        elif (data_layout == "tr") :
            # If we're in transcription mode, we first attempt to look up the
            # name of the gene in the master table and resolve it to a
            # GeneIdentifier.
            meas_units_id = 1 # Units are always n/a
            # Given that there's currently no way to specify the compartment,
            # we'll default it to none.
            compartment_id = 0
            meas_type = current_genes_name.get(name, None)
            if (meas_type is None) :
                meas_type = GeneIdentifier(type_name=name)
                meas_type_id = gene.id
                current_genes_by_name[name] = gene
        elif (data_layout == "pr") :
            # If we're in proteomics mode, we first attempt to look up the name
            # of the protein in the master table and resolve it to a
            # Measurement Type.
            meas_units_id = 1 # Units are always n/a
            # Given that there's currently no way to specify the compartment,
            # we'll default it to none.
            compartment_id = 0 
            meas_type = current_proteins_by_name.get(name, None)
            if (meas_type is None) :
                meas_type = MeasurementType.create_protein(type_name=name)
                current_proteins_by_name[name] = protein
        else :
            warnings.warn(("Cannot add data in %s because the page is in an "+
                "unknown import mode!") % setname)
            continue
        meas_records = assay.measurement_set.filter(
            measurement_type=meas_type,
            compartment=str(compartment_id))
            # FIXME Missing: format (scalar or vector)
        meas_record = None
        if (len(meas_records) > 0) : # can it be more than 1?
            if replace :
                meas_records.delete()
            else :
                meas_record = meas_records[0]
                update = meas_record.update_ref #FIXME can this be done better?
                update.mod_time = timezone.now()
                update.mod_by = user
                meas_record.save()
        if (meas_record is None) :
            meas_record = Measurement(
                assay=assay,
                measurement_type=meas_type,
                compartment=str(compartment_id),
                experimenter=user)
            meas_record.save()
            # TODO update
        meas_units = MeasurementUnit.objects.get(id=meas_units_id)
        for x,y in data :
            if (mtype_format == 0) :
                try :
                    datum = meas_record.measurementdatum_set.get(x=x)
                except MeasurementDatum.DoesNotExist as e :
                    datum = meas_record.measurementdatum_set.create(
                        y_units=meas_units,
                        x=x,
                        y=y)
                else :
                    datum.y = y
                    datum.save()
                    # TODO update
                    datum.save()
            else :
                try :
                    mdata = meas_record.measurementvector_set.get(x=x)
                except MeasurementVector.DoesNotExist as e :
                    mdata = meas_record.measurementvector_set.create(
                        y_units=meas_units,
                        x=x,
                        y=y) # XXX check y type?
                else :
                    mdata.y = y
                    mdata.save()
                    # TODO update
            n_added += 1
        metadata = u.get('metadata', None)
        if (len(metadata) > 0) :
            pass # TODO
    # TODO update study
    return n_added
