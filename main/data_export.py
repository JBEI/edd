
from collections import DefaultDict
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

# support both 'selectedLineIDs=42,9000' and
# 'selectedLineIDs=42&selectedLineIDs=9000'
def extract_id_list (form, key) :
    param = form[key]
    if isinstance(param, basestring) :
        return param.split(",")
    else :
        ids = []
        for item in param :
            ids.extend(item.split(","))
        return ids

def extract_id_list_as_form_keys (form, prefix) :
    re_str = "^%s([0-9]+)include$" % prefix
    ids = []
    for key in form :
        if re.match(re_str, key) :
            ids.append(form[key])
    return ids

def select_objects_for_export (study, user, form) :
    """
    Given a set of form parameters from a GET or POST request, extract the
    assay, line, and measurement objects that are specified (both explicitly
    and implicitly).  Returns a dict storing lists of each object type.
    """
    # TODO permissions?
    if (not study.user_can_read(user)) :
        raise RuntimeError("You do not have permissions to view data "+
            "for this study.")
    assay_level = form.get("assaylevel", None)
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
        line_id_set = set()
        # XXX is there a simpler way to do this?
        for assay in selected_assays :
            if (not assay.line.id in line_id_set) :
                selected_lines.append(assay.line)
                line_id_set.add(assay.line.id)
        selected_measurements = Measurement.objects.filter(
            assay__line__study=study).filter(
            id__in=selected_measurement_ids)
    if (len(selected_measurements) == 0) :
        raise RuntimeError("No measurements selected for export!")
    return {
        "lines" : selected_lines,
        "assays" : selected_assays,
        "measurements" : selected_measurements,
    }

# XXX Should this be a method of models.Line instead?
def extract_line_info_rows (lines, column_flags) :
    """
    Generate re-usable partial row contents for a list of line objects, for
    later combination with (multiple) measurements.  The column_flags dict
    specifies a which columns should be ignored.
    """
    rows = {}
    for line in lines :
        row = []
        if (not column_flags.get("StudyID")) :
            row.append("S" + str(line.study.id))
        if (not column_flags.get("LineID")) :
            row.append("L" + str(line.id))
        if (not column_flags.get("Line")) :
            row.append(line.name)
        if (not column_flags.get("Control")) :
            row.append("T" if line.control else "")
        if (not column_flags.get("Strain")) :
            row.append(line.strain_ids)
        if (not column_flags.get("Media")) :
            pass # TODO ???
        if (not column_flags.get("CarbonSource")) :
            row.append(line.carbon_source_names)
        if (not column_flags.get("LineMetadata")) :
            pass # TODO
        if (not column_flags.get("LineExperimenter")) :
            row.append(line.experimenter.username)
        if (not column_flags.get("LineContact")) :
            row.append(line.contact.username)
        if (not column_flags.get("LineLastModified")) :
            row.append(str(line.updated()))
        rows[line.id] = row
    return rows

def extract_column_headers (column_flags) :
    row = []
    if (not column_flags.get("StudyID")) :
        row.append("Study ID")
    if (not column_flags.get("LineID")) :
        row.append("Line ID")
    if (not column_flags.get("Line")) :
        row.append("Line")
    if (not column_flags.get("Control")) :
        row.append("Control")
    if (not column_flags.get("Strain")) :
        row.append("Strain")
    if (not column_flags.get("Media")) :
        pass # TODO leaving blank for now because not in model
    if (not column_flags.get("CarbonSource")) :
        row.append("Carbon Source")
    if (not column_flags.get("LineMetadata")) :
        pass # TODO
    if (not column_flags.get("LineExperimenter")) :
        row.append("Line Experimenter")
    if (not column_flags.get("LineContact")) :
        row.append("Line Contact")
    if (not column_flags.get("LineLastModified")) :
        row.append("Line Last Modified")
    return row

def extract_protocol_assay_lookup (assays) :
    protocols_dict = DefaultDict(list)
    for assay in assays :
        protocols_dict[assay.protocol.name].append(assay)
    return protocols_dict

def extract_assay_measurement_lookup (measurements) :
    assays_dict = DefaultDict(list)
    for meas in measurements :
        assays_dict[assay.id].append(meas)
    return assays_dict

def extract_x_values (assays_dict, measurements_dict) :
    xvalues_by_protocol = DefaultDict(list)
    xvalues_by_assay = DefaultDict(list)
    for protocol_name in assays_by_protocol :
        for assay in assays_by_protocol[protocol_name] :
            for measurement in measurements_dict[assay.id] :
                xvalues = sorted(measurement.extract_data_xvalues())
                xvalues_by_assay[assay.id] = xvalues
                xvalues_by_protocol[protocol_name].extend(xvalues)
