
"""
Functions for exporting tables of assay measurements from EDD.  Replaces most
of the old StudyExport.cgi.
"""

from main.models import Assay, Line, Measurement, MetadataType
from collections import defaultdict
import re

column_labels = [
  'Study ID', 'Line ID', 'Line', 'Control', 'Strain', 'Media', 'Carbon Source',
  'Carbon Labeling', 'Line Metadata', 'Line Experimenter', 'Line Contact',
  'Line Last Modified', 'Protocol', 'Assay Suffix', 'Assay Metadata',
  'Assay Experimenter', 'Assay Last Modified', 'Measurement Compartment',
]
column_param_names = [ "col" + "".join(l.split()) + "include"
                        for l in column_labels ]
params_dict = { n:l for (n, l) in zip(column_param_names, column_labels) }
labels_dict = { l:n for (n, l) in zip(column_param_names, column_labels) }
column_info = [ { "label" : l, "name" : n}
                for (n, l) in zip(column_param_names, column_labels) ]

def extract_id_list (form, key) :
    """
    Given a form parameter, extract the list of unique IDs that it specifies.
    Both multiple key-value pairs (someIDs=1&someIDs=2) and comma-separated
    lists (someIDs=1,2) are supported.
    """
    param = form[key]
    if isinstance(param, basestring) :
        return param.split(",")
    else :
        ids = []
        for item in param :
            ids.extend(item.split(","))
        return ids

def extract_id_list_as_form_keys (form, prefix) :
    """
    Extract unique IDs embedded in parameter keys, e.g. "prefix123include=1".
    """
    re_str = "^%s([0-9]+)include$" % prefix
    ids = []
    for key in form :
        if re.match(re_str, key) and (not form.get(key, "0") in ["0", ""]) :
            ids.append(form[key])
    return ids

def extract_column_flags (form) :
    column_flags = {}
    for column in column_param_names :
        key = "col" + column + "include"
        if (form.get("key", "0") != "1") :
            column_flags[column] = True
    return column_flags

def select_objects_for_export (study, user, form) :
    """
    Given a set of form parameters from a GET or POST request, extract the
    assay, line, and measurement objects that are specified (both explicitly
    and implicitly).  Returns a dict storing lists of each object type.
    """
    # FIXME permissions?  I think these are broken right now...
    if (user is not None) and (not study.user_can_read(user)) :
        raise RuntimeError("You do not have permissions to view data "+
            "for this study.")
    assay_level = form.get("assaylevel", None) == "1"
    # these hold unique IDs from the form
    selected_line_ids = []
    selected_assay_ids = []
    selected_measurement_ids = []
    # these hold actual Django model instances
    selected_lines = []
    selected_assays = []
    selected_measurements = []
    if (not assay_level) :
        if ("selectedLineIDs" in form) :
            line_id_param = form['selectedLineIDs']
            selected_line_ids = extract_id_list(form, "selectedLineIDs")
        else :
            selected_line_ids = extract_id_list_as_form_keys(form, "line")
        if (len(selected_line_ids) == 0) :
            selected_lines = list(study.line_set.all())
            selected_assays = study.get_assays()
        else :
            selected_lines=study.line_set.filter(id__in=selected_line_ids)
            for line in selected_lines :
                assays = line.assay_set.filter(active=True)
                selected_assays.extend(list(assays))
                for assay in assays :
                    selected_measurements.extend(
                        list(assay.measurement_set.filter(active=True)))
    else :
        if ("selectedAssayIDs" in form) :
            selected_assay_ids = extract_id_list(form, "selectedAssayIDs")
        else :
            selected_assay_ids = extract_id_list_as_form_keys(form, "assay")
        if ("selectedMeasurementIDs" in form) :
            selected_measurement_ids = extract_id_list(form,
                "selectedMeasurementIDs")
        else :
            selected_measurement_ids = extract_id_list_as_form_keys(form,
                "measurement")
        selected_assays = Assay.objects.filter(line__study=study,
            id__in=selected_assay_ids)
        selected_lines = Line.objects.filter(
          assay__in=selected_assays).distinct()
        if (len(selected_measurement_ids) == 0) :
            selected_measurements = Measurement.objects.filter(
                assay__in=selected_assays)
        if (len(selected_measurement_ids) > 0) :
            selected_measurements = Measurement.objects.filter(
                assay__line__study=study).filter(
                id__in=selected_measurement_ids)
    return {
        "lines" : selected_lines,
        "assays" : selected_assays,
        "measurements" : selected_measurements,
    }

class TableRow (list) :
    """
    Wrapper class for building a table row (Python list), depending on which
    columns are flagged for exclusion.
    """
    def __init__ (self, column_flags) :
        self._column_flags = column_flags

    def add_header_if_not_flagged (self, col_label) :
        if (not self._column_flags.get("".join(col_label.split()), False)) :
            self.append(col_label)

    def add_item_if_not_flagged (self, col_flag, value) :
        if (not self._column_flags.get(col_flag, False)) :
            self.append(value)

# XXX Should this be a method of models.Line instead?
def extract_line_info_rows (lines, metadata_labels, column_flags) :
    """
    Generate re-usable partial row contents for a list of line objects, for
    later combination with (multiple) measurements.  The column_flags dict
    specifies a which columns should be ignored.
    """
    rows = {}
    for line in lines :
        row = TableRow(column_flags)
        row.add_item_if_not_flagged("StudyID", "S" + str(line.study.id))
        row.add_item_if_not_flagged("LineID", "L" + str(line.id))
        row.add_item_if_not_flagged("Line", line.name)
        row.add_item_if_not_flagged("Control", "T" if line.control else "")
        row.add_item_if_not_flagged("Strain", line.strain_ids)
        row.add_item_if_not_flagged("CarbonSource", line.carbon_source_info)
        if (not column_flags.get("LineMetadata")) :
            metadata = line.meta_store
            for column_name in metadata_labels :
                row.append(str(metadata.get(column_name, "")))
        row.add_item_if_not_flagged("LineExperimenter",
            line.experimenter.username)
        row.add_item_if_not_flagged("LineContact", line.contact.email)
        row.add_item_if_not_flagged("LineLastModified", line.last_modified)
        rows[line.id] = row
    return rows

def get_unique_metadata_names (objects) :
    names = []
    type_ids = set()
    for obj in objects :
        type_ids.update(obj.meta_store.keys())
    return MetadataType.objects.filter(pk__in=type_ids).values('type_name').order_by('type_name')

def extract_line_column_headers (metadata_labels, column_flags) :
    row = TableRow(column_flags)
    row.add_header_if_not_flagged("Study ID")
    row.add_header_if_not_flagged("Line ID")
    row.add_header_if_not_flagged("Line")
    row.add_header_if_not_flagged("Control")
    row.add_header_if_not_flagged("Strain")
    row.add_header_if_not_flagged("Carbon Source")
    if (not column_flags.get("LineMetadata")) :
        for label in metadata_labels :
            row.append(label)
    row.add_header_if_not_flagged("Line Experimenter")
    row.add_header_if_not_flagged("Line Contact")
    row.add_header_if_not_flagged("Line Last Modified")
    return row

def extract_assay_column_headers (metadata_labels, column_flags) :
    row = TableRow(column_flags)
    row.add_header_if_not_flagged("Protocol")
    row.add_header_if_not_flagged("Assay Suffix")
    row.add_header_if_not_flagged("Assay Experimenter")
    row.add_header_if_not_flagged("Assay Last Modified")
    if (not column_flags.get("AssayMetadata")) :
        for label in metadata_labels :
            row.append(label)
    return row

def extract_protocol_column_headers (metadata_labels, column_flags) :
    row = TableRow(column_flags)
    row.add_header_if_not_flagged("Protocol")
    row.append("Assay Full Name")
    row.add_header_if_not_flagged("Assay Suffix")
    row.add_header_if_not_flagged("Assay Experimenter")
    row.add_header_if_not_flagged("Assay Last Modified")
    if (not column_flags.get("AssayMetadata")) :
        for label in metadata_labels :
            row.append(label)
    return row

def extract_protocol_assay_lookup (assays) :
    protocols_dict = defaultdict(list)
    for assay in assays :
        protocols_dict[assay.protocol.name].append(assay)
    return protocols_dict

def extract_assay_measurement_lookup (measurements) :
    assays_dict = defaultdict(list)
    for meas in measurements :
        assays_dict[meas.assay.id].append(meas)
    return assays_dict

# XXX as usual, the flexibility of the (original) data export function requires
# a rather complex set of data shuffling procedures.  If we can simplify this
# in any way it would make life considerably easier.
def assemble_table (
        assays,
        lines,
        measurements,
        column_flags={},
        dlayout_type="dbyl",
        mdata_format="all",
        separate_lines=False,
        separate_protocols=False) :
    assert (mdata_format in ["all", "sum", "none"])
    assert (dlayout_type in ["dbya", "dbyl", "lbyd"])
    # Collect column headers and partial columns for lines
    line_metadata_labels = get_unique_metadata_names(lines)
    line_headers = extract_line_column_headers(line_metadata_labels,
        column_flags)
    line_info = extract_line_info_rows(
        lines=lines,
        metadata_labels=line_metadata_labels,
        column_flags=column_flags)
    # Now the data generation process for Assays...
    # This is going to be a bit more complicated, because we may have to
    # produce distinct tables for each group of Assays, by Protocol.
    assays_by_protocol = extract_protocol_assay_lookup(assays)
    used_protocols = sorted(assays_by_protocol.keys())
    measurements_dict = extract_assay_measurement_lookup(measurements)
    measurement_inclusion_hash = { m.id : True for m in measurements }
    # The first thing we're going to do is get a complete list of all the "x"
    # values used across all the Measurements in all the Assays for each
    # Protocol, with no duplicate values, in order.  This will be necessary for
    # building our data tables.  We'll also make a similar global list, for all
    # Measurements across all Assays together (not just per-Protocol).
    xvalues_by_protocol = defaultdict(list)
    xvalues_by_assay = defaultdict(list)
    all_xvalues = []
    for protocol_name in assays_by_protocol :
        protocol_xvalues = set() # unique X values only
        for assay in assays_by_protocol[protocol_name] :
            for m in measurements_dict[assay.id] :
                xvalues = sorted(m.extract_data_xvalues())
                xvalues_by_assay[assay.id].append(xvalues)
                protocol_xvalues.update(set(xvalues))
                all_xvalues.extend(xvalues)
        xvalues_by_protocol[protocol_name] = sorted(list(protocol_xvalues))
    # Using these lists, we can make appropriately-spaced sequences of Y values
    # for our Measurement data.
    all_xvalues = sorted(list(set(all_xvalues)))
    # Now we get an array of all the Meta Data Types that have been used across
    # all Assays, for creating an all-inclusive segment of metadata.
    assay_metadata_labels = get_unique_metadata_names(assays)
    # With that array collected, we can use it to help build a standard set of
    # headers for exporting Assay data.  Note that if we are dividing the data
    # across Protocols, we will use a custom set of headers for each Protocol,
    # which we will be constructing within the loop below.
    assay_headers = extract_assay_column_headers(assay_metadata_labels,
        column_flags)
    protocol_headers = {}
    assay_export_rows = {}
    assay_protocol_export_rows = {}
    measurement_export_rows = {}
    measurement_protocol_export_rows = {}
    assay_summaries = {}
    assay_have_data = {}
    def sorted_by_measurement_type_name (m) :
        return sorted(m, lambda a,b: cmp(a.measurement_type.type_name,
                                         b.measurement_type.type_name))
    for protocol_name in used_protocols :
        protocol_headers[protocol_name] = extract_protocol_column_headers(
            metadata_labels=assay_metadata_labels,
            column_flags=column_flags)
        for assay in assays_by_protocol[protocol_name] :
            row = TableRow(column_flags)
            row.add_item_if_not_flagged("Protocol", protocol_name)
            row.append(assay.name)
            row.add_item_if_not_flagged("AssayExperimenter",
                assay.experimenter.username)
            row.add_item_if_not_flagged("AssayLastModified", assay.mod_epoch())
            assay_metadata = assay.meta_store
            if (not column_flags.get("AssayMetadata", False)) :
                for column_label in assay_metadata_labels :
                    row.append(str(assay_metadata.get(column_label, "")))
            assay_export_rows[assay.id] = row
            # A second version of the row, customized for exporting within this
            # Assay's Protocol.
            protocol_row = TableRow(column_flags)
            protocol_row.add_item_if_not_flagged("Protocol", protocol_name)
            protocol_row.append(assay.name) # XXX assay_full_name???
            protocol_row.add_item_if_not_flagged("AssaySuffix", assay.name)
            protocol_row.add_item_if_not_flagged("AssayExperimenter",
                assay.mod_epoch())
            protocol_row.add_item_if_not_flagged("AssayLastModified",
                str(assay.updated()))
            if (not column_flags.get("AssayMetadata", False)) :
                for column_label in assay_metadata_labels :
                    protocol_row.append(
                        str(assay_metadata.get(column_label, "")))
            assay_protocol_export_rows[assay.id] = protocol_row
            # Now let's create both a summary blurb for all the selected
            # Measurements for the Line, as well as the full data strings for
            # each Measurement.
            assay_measurements = sorted_by_measurement_type_name(
                measurements_dict[assay.id])
            found_meas_data = False
            measurement_summaries = []
            for m in assay_measurements :
                type_name = m.measurement_type.type_name
                if m.measurement_type.is_metabolite() :
                    type_name = m.measurement_type.short_name
                mdata = sorted(m.measurementdatum_set.all(),
                    lambda a,b: cmp(a.x, b.x))
                ydata = []
                ydata_for_protocol = []
                if (len(mdata) > 0) :
                    found_meas_data = True
                    k = 0
                    for x in all_xvalues :
                        if (k < len(mdata)) and (x == mdata[k].x) :
                            ydata.append(mdata[k].fy)
                            k += 1
                        else :
                            ydata.append("")
                    k = 0
                    for x in xvalues_by_protocol[protocol_name] :
                        if (k < len(mdata)) and (x == mdata[k].x) :
                            ydata_for_protocol.append(mdata[k].fy)
                            k += 1
                        else :
                            ydata_for_protocol.append("")
                    xvalues = m.extract_data_xvalues()
                    x_min = max(xvalues)
                    x_max = max(xvalues)
                    x_cnt = len(xvalues)
                    summary = "%s(%sh-%sh %st)" % (m.id, x_min, x_max, x_cnt)
                    # Note that this is inside the if statement, so if there's
                    # no data we don't list this Measurement in the summary.
                    measurement_summaries.append(summary)
                    assert (len(ydata) == len(all_xvalues))
                measurement_export_rows[m.id] = ydata
                measurement_protocol_export_rows[m.id] = ydata_for_protocol
            assay_summaries[assay.id] = " + ".join(measurement_summaries)
            assay_have_data[assay.id] = found_meas_data
            # End of Assay loop
        # End of Protocol loop
    # Now we can connect together all our prepared arrays and print them.
    table = []
    # separate section for lines
    if (separate_lines) :
        rows = [ line_headers ] + [ line_info[l.id] for l in lines ]
        table.extend(rows)
    def get_measurement_headers () :
        headers_ = []
        if (dlayout_type == "dbya") :
            if (not column_flags.get("MeasurementCompartment")) :
                headers_.append("Measurement Compartment")
            headers_.extend(['X Value','Measurement Type','Measurement Value'])
        elif (mdata_format == "sum") :
            headers_.append("Data Summary")
        elif (mdata_format == "all") :
            if (not column_flags.get("MeasurementCompartment")) :
                headers_.append("Measurement Compartment")
            headers_.append("Measurement")
            headers_.extend(all_xvalues)
        return headers_
    if (not separate_protocols) :
        headers = []
        if (not separate_lines) :
            headers.extend(line_headers)
        headers.extend(assay_headers)
        headers.extend(get_measurement_headers())
        table.append(headers)
    for protocol_name in used_protocols :
        # If we're doing each Protocol separately, each needs its own header
        # list
        if (separate_protocols) :
            headers = []
            if (not separate_lines) :
                headers.extend(line_headers)
            headers.extend(protocol_headers[protocol_name])
            headers.extend(get_measurement_headers())
            table.append(headers)
        protocol_assays = sorted(assays_by_protocol[protocol_name],
            lambda a,b: cmp(a.name, b.name))
        for assay in protocol_assays :
            common_values = []
            line_id = assay.line.id
            if (not separate_lines) :
                common_values.extend(line_info[line_id])
            if (not separate_protocols) :
                common_values.extend(assay_export_rows[assay.id])
            else :
                common_values.extend(assay_protocol_export_rows[assay.id])
            if (mdata_format == "sum") :
                common_values.append(assay_summaries[assay.id])
                table.append(common_values)
                continue
            if (not assay_have_data[assay.id]) or (mdata_format == "none") :
                table.append(common_values)
                continue
            # COMMON FUNCTIONS
            def create_rows_dbya (m) :
                mt_name = m.measurement_type.short_name
                # Only include the measurement if there is data for it.
                # FIXME confirm that this is actually what happens...
                for i in range(len(all_xvalues)) :
                    row = list(common_values)
                    row.extend([ all_xvalues[i], mt_name ])
                    if separate_protocols :
                        row.append(measurement_protocol_export_rows[m.id][i])
                    else :
                        row.append(measurement_export_rows[m.id][i])
                    table.append(row)
            def create_row_other (m, mt_compartment) :
                mt_name = m.measurement_type.short_name
                row = list(common_values)
                if (not column_flags.get("MeasurementCompartment", False)):
                    row.append(mt_compartment)
                row.append(mt_name)
                if separate_protocols :
                    row.extend(measurement_protocol_export_rows[m.id])
                else :
                    row.extend(measurement_export_rows[m.id])
                table.append(row)
            assay_measurements = sorted_by_measurement_type_name(
                measurements_dict[assay.id])
            # METABOLITES
            for m in assay_measurements :
                if (not m.measurement_type.is_metabolite()) : continue
                mt_compartment = "" # TODO
                if (dlayout_type == "dbya") :
                    create_rows_dbya(m)
                elif (len(mdata) > 0) :
                    create_row_other(m, mt_compartment)
            # GENES
            for m in assay_measurements :
                if (not m.measurement_type.is_gene()) : continue
                if (dlayout_type == "dbya") :
                    create_rows_dbya(m)
                else :
                    create_row_other(m, "") # compartment always blank?
            # PROTEINS
            for m in assay_measurements :
                if (not m.measurement_type.is_protein()) : continue
                if (dlayout_type == "dbya") :
                    create_rows_dbya(m)
                else :
                    create_row_other(m, "") # compartment always blank?
    return table

def export_table (table, sep=",") :
    return "\n".join([ sep.join([ str(x) for x in row ]) for row in table ])

def table_view (export_data, form) :
    table_format = form.get("recordformat", "csv")
    table = assemble_table(
        assays=export_data['assays'],
        lines=export_data['lines'],
        measurements=export_data['measurements'],
        column_flags=extract_column_flags(form),
        dlayout_type=(form.get("dlayouttype", "dbyl")),
        mdata_format=(form.get("mdataformat", "all")),
        separate_lines=(form.get("separateLines", "0") == "1"),
        separate_protocols=(form.get("separateProtocols", "0") == "1"))
    sep = ","
    if (table_format == "tab") :
        sep = "\t"
    return export_table(table, sep)
