
from django.contrib.auth import get_user_model
from main.models import *
from collections import defaultdict
from decimal import Decimal
import json
import os.path


class JSONDecimalEncoder(json.JSONEncoder):
    def default(self, o):
        if isinstance(o, Decimal):
            return float(o)
        return super(JSONDecimalEncoder, self).default(o)

media_types = {
    '--' : '-- (No base media used)',
    'LB' : 'LB (Luria-Bertani Broth)',
    'TB' : 'TB (Terrific Broth)',
    'M9' : 'M9 (M9 salts minimal media)',
    'EZ' : 'EZ (EZ Rich)',
}

def get_edddata_study(study):
    """
    Dump of selected database contents used to populate EDDData object on the
    client.  Although this includes some data types like Strain and
    CarbonSource that are not "children" of a Study, they have been filtered
    to include only those that are used by the given study.
    """
    metab_types = Metabolite.objects.prefetch_related("keywords").filter(
        assay__line__study=study).distinct()
    protocols = Protocol.objects.filter(assay__line__study=study).distinct()
    enabled_protocols = protocols.filter(active=True)
    carbon_sources = CarbonSource.objects.filter(line__study=study).distinct()
    assays = Assay.objects.filter(line__study=study).select_related(
      'line__name', 'updated__mod_by')
    strains = study.get_strains_used()
    lines = study.line_set.all().select_related('created', 'updated').prefetch_related(
        "carbon_source", "strains")
    return {
      # metabolites
      "MetaboliteTypeIDs" : [ mt.id for mt in metab_types ],
      "MetaboliteTypes" : { mt.id : mt.to_json() for mt in metab_types },
      # Protocols
      "ProtocolIDs" : [ p.id for p in protocols ],
      "EnabledProtocolIDs" : [ p.id for p in enabled_protocols ],
      "Protocols" : { p.id : p.to_json() for p in protocols },
      # Assays
      "AssayIDs" : list(Assay.objects.filter(
        line__study=study).values_list('id', flat=True)),
      "EnabledAssayIDs" : list(Assay.objects.filter(
        line__study=study, active=True).values_list('id', flat=True)),
      "Assays" : { a.id : a.to_json() for a in assays },
      # Strains
      "StrainIDs" : [ s.id for s in strains ],
      "EnabledStrainIDs" : [ s.id for s in strains if s.active ],
      "Strains" : { s.id : s.to_json() for s in strains },
      # Lines
      "LineIDs" : [ l.id for l in lines ],
      "Lines" : { l.id : l.to_json() for l in lines },
      # Carbon sources
      "CSourceIDs" : [ cs.id for cs in carbon_sources ],
      "EnabledCSourceIDs" : [ cs.id for cs in carbon_sources if cs.active ],
      "CSources" : { cs.id : cs.to_json() for cs in carbon_sources },
    }

def get_edddata_misc():
    # XXX should these be stored elsewhere (postgres, other module)?
    measurement_compartments = { i : comp for i, comp in enumerate([
      { "name" : "", "sn" : "" },
      { "name" : "Intracellular/Cytosol (Cy)", "sn" : "IC" },
      { "name" : "Extracellular", "sn" : "EC" },
    ]) }
    users = get_edddata_users()
    mdtypes = MetadataType.objects.all().select_related('group')
    unit_types = MeasurementUnit.objects.all()
    return {
      # Measurement units
      "UnitTypeIDs" : [ ut.id for ut in unit_types ],
      "UnitTypes" : { ut.id : ut.to_json() for ut in unit_types },
      # media types
      "MediaTypes" : media_types,
      # Users
      "UserIDs" : users["UserIDs"],
      "EnabledUserIDs" : users["EnabledUserIDs"],
      "Users" : users["Users"],
      # Assay metadata
      "MetaDataTypeIDs" : [ m.id for m in mdtypes ],
      "MetaDataTypes" : { m.id : m.to_json() for m in mdtypes },
      # compartments
      "MeasurementTypeCompartmentIDs" : measurement_compartments.keys(),
      "MeasurementTypeCompartments" : measurement_compartments,
    }

def get_edddata_carbon_sources () :
    """All available CarbonSource records."""
    carbon_sources = CarbonSource.objects.all()
    return {
        "MediaTypes" : media_types,
        "CSourceIDs" : [ cs.id for cs in carbon_sources ],
        "EnabledCSourceIDs" : [ cs.id for cs in carbon_sources if cs.active ],
        "CSources" : { cs.id : cs.to_json() for cs in carbon_sources },
    } 

# TODO unit test
def get_edddata_measurement () :
    """All data not associated with a study or related objects."""
    metab_types = Metabolite.objects.all().prefetch_related("keywords")
    return {
        "MetaboliteTypeIDs" : [ mt.id for mt in metab_types ],
        "MetaboliteTypes" : { mt.id : mt.to_json() for mt in metab_types },
    }

def get_edddata_strains () :
    strains = Strain.objects.all().prefetch_related("updates")
    return {
      "StrainIDs" : [ s.id for s in strains ],
      "EnabledStrainIDs" : [ s.id for s in strains if s.active ],
      "Strains" : { s.id : s.to_json() for s in strains },
    }

def get_edddata_users (active_only=False) :
    User = get_user_model()
    users = []
    if active_only:
        users = User.objects.filter(is_active=True)
    else:
        users = User.objects.all()
    users = users.select_related('userprofile').prefetch_related('userprofile__institutions')
    return {
        "UserIDs" : [ u.id for u in users ],
        "EnabledUserIDs" : [ u.id for u in users if u.is_active ],
        "Users" : { str(u.id) : u.to_json() for u in users },
      }

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
    re_str = "^(%s)([0-9]+)include$" % prefix
    ids = []
    for key in form :
        m = re.match(re_str, key)
        if (m is not None) and (not form.get(key, "0") in ["0", ""]) :
            ids.append(m.group(2)) # e.g. "123"
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

# XXX I suspect some of this could be replaced by smarter use of
# prefetch_related and select_related
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
    assays = list(Assay.objects.filter(line__in=self.lines).prefetch_related(
      "measurement_set").select_related("protocol").select_related("line"))
    for assay in assays :
      self._assays[assay.protocol_id].append(assay)
      self._assay_names[assay.id] = "%s-%s-%s" % (assay.line.name,
        assay.protocol.name, assay.name)
    measurements = list(Measurement.objects.filter(
      assay_id__in=[ a.id for a in assays ]).select_related(
        "assay").select_related("measurement_type").select_related("y_units"))
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
      id__in=list(set([ m.y_units_id for m in measurements ])))
    y_units_dict = { yu.id : yu for yu in y_units }
    #measurement_data.prefetch_related("y_units")
    for m in measurements :
      self._measurements[m.assay_id].append(m)
      self._measurement_types[m.id] = mtypes_dict[m.measurement_type_id]
      if (m.measurement_type_id in metabolites_dict) :
        self._metabolites[m.id] = metabolites_dict[m.measurement_type_id]
      if (not m.id in self._measurement_units) :
        self._measurement_units[m.id] = y_units_dict[m.y_units_id]
    for md in measurement_data :
      meas_id = md.measurement_id
      self._measurement_data[meas_id].append(md)
    for mv in measurement_vectors :
      meas_id = mv.measurement_id
      self._measurement_data[meas_id].append(mv)
      self._measurement_units[meas_id] = None

  def _get_measurements (self, assay_id) :
    assert isinstance(assay_id, int)
    return self._measurements.get(assay_id, [])

  def _get_measurement_data (self, measurement_id) :
    assert isinstance(measurement_id, int)
    return self._measurement_data.get(measurement_id, [])

  def _get_measurement_type (self, measurement_id) :
    assert isinstance(measurement_id, int)
    return self._measurement_types[measurement_id]

  def _get_y_axis_units_name (self, measurement_id) :
    assert isinstance(measurement_id, int)
    units = self._measurement_units.get(measurement_id, None)
    if (units is not None) :
      return units.unit_name
    return None

  def _get_measurements_by_type_group (self, assay_id, group_flag,
      sort_by_name=None) :
    assert isinstance(assay_id, int)
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
    assert isinstance(assay_id, int)
    return self._get_measurements_by_type_group(assay_id,
      group_flag=MeasurementGroup.METABOLITE,
      sort_by_name=sort_by_name)

  def _get_gene_measurements (self, assay_id, sort_by_name=False) :
    assert isinstance(assay_id, int)
    return self._get_measurements_by_type_group(assay_id,
      group_flag=MeasurementGroup.GENEID,
      sort_by_name=sort_by_name)

  def _get_protein_measurements (self, assay_id, sort_by_name=False) :
    assert isinstance(assay_id, int)
    return self._get_measurements_by_type_group(assay_id,
      group_flag=MeasurementGroup.PROTEINID,
      sort_by_name=sort_by_name)

extensions_to_icons = {
    '.zip' : 'icon-zip.png',
    '.gzip' :  'icon-zip.png',
    '.bzip' :  'icon-zip.png',
    '.gz' :  'icon-zip.png',
    '.dmg' : 'icon-zip.png',
    '.rar' : 'icon-zip.png',

    '.ico' : 'icon-image.gif',
    '.gif' : 'icon-image.gif',
    '.jpg' : 'icon-image.gif',
    '.jpeg' :  'icon-image.gif',
    '.png' : 'icon-image.gif',
    '.tif' : 'icon-image.gif',
    '.tiff' :  'icon-image.gif',
    '.psd' : 'icon-image.gif',
    '.svg' : 'icon-image.gif',

    '.mov' : 'icon-video.png',
    '.avi' : 'icon-video.png',
    '.mkv' : 'icon-video.png',

    '.txt' : 'icon-text.png',
    '.rtf' : 'icon-text.png',
    '.wri' : 'icon-text.png',
    '.htm' : 'icon-text.png',
    '.html' :  'icon-text.png',

    '.pdf' : 'icon-pdf.gif',
    '.ps' :  'icon-pdf.gif',

    '.key' : 'icon-keynote.gif',
    '.mdb' : 'icon-mdb.png',
    '.doc' : 'icon-word.png',
    '.ppt' : 'icon-ppt.gif',
    '.xls' : 'icon-excel.png',
    '.xlsx' :  'icon-excel.png',
}
