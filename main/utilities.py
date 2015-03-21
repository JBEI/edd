
from main.models import *
from collections import defaultdict
import os.path

def get_edddata_study (study) :
    """
    Dump of selected database contents used to populate EDDData object on the
    client.  This contains mostly global metadata, but the assays are specific
    to a study..
    """
    mdtypes = MetadataType.objects.all()
    unit_types = MeasurementUnit.objects.all()
    metab_types = Metabolite.objects.all()
    protocols = Protocol.objects.all()
    enabled_protocols = Protocol.objects.filter(active=True)
    carbon_sources = CarbonSource.objects.all()
    assays = study.get_assays()
    strains = study.get_strains_used()
    lines = study.line_set.all()
    # Static metadata
    # XXX should these be stored elsewhere (postgres, other module)?
    measurement_compartments = { i : comp for i, comp in enumerate([
      { "name" : "", "sn" : "" },
      { "name" : "Intracellular/Cytosol (Cy)", "sn" : "IC" },
      { "name" : "Extracellular", "sn" : "EC" },
    ]) }
    media_types = {
        '--' : '-- (No base media used)',
        'LB' : 'LB (Luria-Bertani Broth)',
        'TB' : 'TB (Terrific Broth)',
        'M9' : 'M9 (M9 salts minimal media)',
        'EZ' : 'EZ (EZ Rich)',
    }
    return {
      # compartments
      "MeasurementTypeCompartmentIDs" : measurement_compartments.keys(),
      "MeasurementTypeCompartments" : measurement_compartments,
      # metabolites
      "MetaboliteTypeIDs" : [ mt.id for mt in metab_types ],
      "MetaboliteTypes" : { mt.id : mt.to_json() for mt in metab_types },
      # Assay metadata
      "MetaDataTypeIDs" : [ m.id for m in mdtypes ],
      "MetaDataTypes" : { m.id : m.to_json() for m in mdtypes },
      # Protocols
      "ProtocolIDs" : [ p.id for p in protocols ],
      "EnabledProtocolIDs" : [ p.id for p in enabled_protocols ],
      "Protocols" : { p.id : p.to_json() for p in protocols },
      # Measurement units
      "UnitTypeIDs" : [ ut.id for ut in unit_types ],
      "UnitTypes" : { ut.id : ut.to_json() for ut in unit_types },
      ### Everything below here is study-specific
      # Assays
      "AssayIDs" : [ a.id for a in assays ],
      "EnabledAssayIDs" : [ a.id for a in assays if a.active ],
      "Assays" : { a.id : a.to_json() for a in assays },
      # Strains
      "StrainIDs" : [ s.id for s in strains ],
      "EnabledStrainIDs" : [ s.id for s in strains if s.active ],
      "Strains" : { s.id : s.to_json() for s in strains },
      # Lines
      "LineIDs" : [ l.id for l in lines ],
      "Lines" : { l.id : l.to_json() for l in lines },
    }

def get_edddata_misc () :
    carbon_sources = CarbonSource.objects.all()
    media_types = {
        '--' : '-- (No base media used)',
        'LB' : 'LB (Luria-Bertani Broth)',
        'TB' : 'TB (Terrific Broth)',
        'M9' : 'M9 (M9 salts minimal media)',
        'EZ' : 'EZ (EZ Rich)',
    }
    users = [] # TODO
    return {
      # Carbon sources
      "CSourceIDs" : [ cs.id for cs in carbon_sources ],
      "EnabledCSourceIDs" : [ cs.id for cs in carbon_sources if cs.active ],
      "CSources" : { cs.id : cs.to_json() for cs in carbon_sources },
      # media types
      "MediaTypes" : media_types,
      # Users
      "UserIDs" : [ u.id for u in users ],
      "EnabledUserIDs" : [ u.id for u in users if u.is_active ],
      "Users" : {},
    }

def migrate_attachment_files (force=False) :
    """
    Write out actual files populating the 'attachments' table in the old EDD
    schema.  This should be done after running convert.sql to populate the new
    database (which only stores the filenames and metadata, not the contents).
    """
    attachments = Attachment.objects.all()
    for a in attachments :
        file_path = a.file.path
        if (not os.path.exists(file_path)) or force :
            raw = Attachment.objects.raw("SELECT * FROM old_edd.attachments WHERE filename = '%s'" % a.filename)
            print "Writing to %s" % file_path
            f = open(file_path, "wb")
            f.write(raw[0].file_data)
            f.close()

def interpolate_at (measurement_data, x) :
  """
  Given an X-value without a measurement, use linear interpolation to
  compute an approximate Y-value based on adjacent measurements (if any).
  """
  import numpy
  data = [ md for md in measurement_data if md.fx is not None ]
  data.sort(lambda a,b: cmp(a.x, b.x))
  if (len(data) == 0) :
      raise ValueError("Can't interpolate because no valid "+
        "measurement data are present.")
  xp = numpy.array([ d.fx for d in data ])
  if (not (xp[0] <= x <= xp[-1])) :
      return None
  fp = numpy.array([ d.fy for d in data ])
  return numpy.interp(float(x), xp, fp)

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

def get_selected_lines (form, study) :
    selected_line_ids = []
    if ("selectedLineIDs" in form) :
        line_id_param = form['selectedLineIDs']
        selected_line_ids = extract_id_list(form, "selectedLineIDs")
    else :
        selected_line_ids = extract_id_list_as_form_keys(form, "line")
    if (len(selected_line_ids) == 0) :
        return list(study.line_set.all())
    else :
        return study.line_set.filter(id__in=selected_line_ids)

class line_export_base (object) :
  """
  Helper class for extracting various data associated with a set of lines.
  Although Django models allow us to traverse a tree-like structure of objects
  starting from the Study down to individual measurement data, which enables
  relatively clean, object-oriented code, this can result in tens of thousands
  of database queries for a large dataset.  This class pulls down as many of
  the required objects out of the database as possible in advance, and tracks
  them in dictionaries.
  """
  def __init__ (self, study, lines) :
    self.study = study
    self.lines = lines
    assert (len(lines) > 0)
    # various caches
    self._assays = defaultdict(list) # keyed by protocol.id
    self._assay_names = {}
    self._measurements = defaultdict(list) # keyed by assay.id
    self._measurement_data = defaultdict(list) # keyed by measurement.id
    self._measurement_units = {} # keyed by measurement.id
    self._measurement_types = {} # keyed by measurement.id
    self._metabolites = {} # keyed by measurement.id

  def _fetch_cache_data (self) :
    assays = list(Assay.objects.filter(line__in=self.lines).select_related(
      "measurement_set").select_related("protocol").select_related("line"))
    for assay in assays :
      self._assays[assay.protocol_id].append(assay)
      self._assay_names[assay.id] = "%s-%s-%s" % (assay.line.name,
        assay.protocol.name, assay.name)
    measurements = list(Measurement.objects.filter(
      assay_id__in=[ a.id for a in assays ]).select_related(
        "assay").select_related("measurement_type"))
    #measurements.select_related("assay")
    #measurements.prefetch_related("meaurement_type")
    #measurements.prefetch_related("meaurementdatum_set")
    measurement_ids = [ m.id for m in measurements ]
    mtype_ids = list(set([ m.measurement_type_id for m in measurements ]))
    measurement_types = MeasurementType.objects.filter(id__in=mtype_ids)
    metabolites =  Metabolite.objects.filter(id__in=mtype_ids)
    mtypes_dict = { mt.id : mt for mt in measurement_types }
    metabolites_dict = { mt.id : mt for mt in metabolites }
    # FIXME this is a huge bottleneck!  can it be made more efficient?
    measurement_data = MeasurementDatum.objects.filter(
      measurement_id__in=measurement_ids)
    # FIXME this one too
    measurement_vectors = MeasurementVector.objects.filter(
      measurement_id__in=measurement_ids)
    # XXX I think the reason for this is that the old EDD stores the line and
    # study IDs directly in various other tables, and selects on these instead
    # of a huge list of measurements.
    y_units = MeasurementUnit.objects.filter(
      id__in=list(set([ md.y_units_id for md in measurement_data ])))
    y_units_dict = { yu.id : yu for yu in y_units }
    #measurement_data.prefetch_related("y_units")
    for m in measurements :
      self._measurements[m.assay_id].append(m)
      self._measurement_types[m.id] = mtypes_dict[m.measurement_type_id]
      if (m.measurement_type_id in metabolites_dict) :
        self._metabolites[m.id] = metabolites_dict[m.measurement_type_id]
    for md in measurement_data :
      meas_id = md.measurement_id
      self._measurement_data[meas_id].append(md)
      if (not meas_id in self._measurement_units) :
        self._measurement_units[meas_id] = y_units_dict[md.y_units_id]
    for mv in measurement_vectors :
      meas_id = mv.measurement_id
      self._measurement_data[meas_id].append(mv)
      self._measurement_units[meas_id] = None

  def _get_measurements (self, assay_id) :
    return self._measurements.get(assay_id, [])

  def _get_measurement_data (self, measurement_id) :
    return self._measurement_data.get(measurement_id, [])

  def _get_measurement_type (self, measurement_id) :
    return self._measurement_types[measurement_id]

  def _get_y_axis_units_name (self, measurementdatum_id) :
    units = self._measurement_units.get(measurementdatum_id, None)
    if (units is not None) :
      return units.unit_name
    return None

  def _get_measurements_by_type_group (self, assay_id, group_flag,
      sort_by_name=None) :
    metabolites = []
    for m in self._get_measurements(assay_id) :
      mtype_group = self._get_measurement_type(m.id).type_group
      if (mtype_group == group_flag) :
        metabolites.append(m)
    if sort_by_name :
      m2 = [ (m, self._get_measurement_type(m.id)) for m in metabolites ]
      m2.sort(lambda a,b: cmp(a[1].type_name, b[1].type_name))
      metabolites = [ mm[0] for mm in m2 ]
    return metabolites

  def _get_metabolite_measurements (self, assay_id, sort_by_name=False) :
    return self._get_measurements_by_type_group(assay_id,
      group_flag=MeasurementGroup.METABOLITE,
      sort_by_name=sort_by_name)

  def _get_gene_measurements (self, assay_id, sort_by_name=False) :
    return self._get_measurements_by_type_group(assay_id,
      group_flag=MeasurementGroup.GENEID,
      sort_by_name=sort_by_name)

  def _get_protein_measurements (self, assay_id, sort_by_name=False) :
    return self._get_measurements_by_type_group(assay_id,
      group_flag=MeasurementGroup.PROTEINID,
      sort_by_name=sort_by_name)
