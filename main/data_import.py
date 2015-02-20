
# local imports
from main.models import Protocol, Assay
# global imports
from django.core.exceptions import ObjectDoesNotExist
import json

def import_assay_table_data (study, user, post_data) :
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
    m_mc = post_data['masterMCompValue']
    m_mt = post_data['masterMTypeValue']
    m_mu = post_data['masterMUnitsValue']
    valid_timestamp = False
    m_timestamp = post_data['masterTimestamp']
    if (m_timestamp.isdigit()) :
        valid_timestamp = True
    # TODO  Attepmt to set a 'hasNothingToImport' flag for later reference.
    #
    # If the list of parsed data sets contains even one valid reference to an
    # assay ID or a 'new' Assay keyword, we should not use the master Assay
    # value, and instead report errors if any data set contains a blank Assay
    # value.  On the other hand, if the list of parsed sets consistently
    # reports no valid Assay, then we are clearly meant to use the master Assay
    # value for them all.
    use_master_assay = True
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
        if (line_id == "new" :
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
        resolved_disambiguation_assays[assay_index] = assay.id
        lines_for_assays[assay.id] = line_id
    master_assay = post_data.get('masterAssay', None)
    if use_master_assay :
        assay = None
        master_line = post_data['masterLine']
        if (not master_assay) :
            raise UserWarning("Did you forget to specify a master assay?")
        elif (master_assay == "new") :
            line = None
            if (not master_line) :
                raise UserWarning("Did you forget to specify a master line?")
            elif (master_line == "new") :
                line = study.line_set.create(
                    study=study,
                    name=str(unique_new_assay_index),
                    experimenter=user)
            else :
                line = Line.objects.get(pk=master_line)
            assay = line.assay_set.create(
                line=line,
                protocol=protocol
        else :
            try :
                assay = Assay.objects.get(pk=assay_id)
            except ObjectDoesNotExist as e :
                pass
            else :
                assert assay.line.study.id == study.id
                lines_for_assays[master_assay] = assay.line.id
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
