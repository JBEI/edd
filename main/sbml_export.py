
"""
Backend for exporting SBML files.
"""

from main.models import MetabolicMap, Protocol, MeasurementType
from collections import defaultdict
import sys

class sbml_data (object) :
  """
  'Manager' class for extracting data for export into SBML format and
  organizing it for presentation as an HTML form.  This object will be passed
  to the export page view.
  """

  def __init__ (self, study, lines, form, test_mode=False) :
    self.study = study
    self.lines = lines
    assert (len(lines) > 0)
    self.form = form
    self.submitted_from_export_page = form.get("formSubmittedFromSBMLExport",0)
    self.assays = []
    for line in lines :
      self.assays.extend(list(line.assay_set.all()))
    self.protocol_assays = defaultdict(list)
    self.protocols = Protocol.objects.all()
    self._protocols_by_category = {}
    for assay in self.assays :
      self.protocol_assays[assay.protocol.name].append(assay)
    self.primary_line_name = lines[0].name
    self.metabolic_maps = list(MetabolicMap.objects.all())
    # Get a master set of all timestamps that contain data, separated according
    # to Line ID.
    self.od_times_by_line = defaultdict(dict)
    # This is where we'll accumulate our processed flux data.
    # A multi-level hash, creating a hierarchy from Timestamps to Metabolites
    # to flux values.  When it comes time to embed this in the SBML, we'll
    # aggregate all the fluxes for each metabolite/timestamp and produce an
    # upper and lower bound with a sensible margin of error.
    self.flux_data_by_metabolite = {}
    self.flux_data_types_available = {}
    # Here's where we accumulate values to embed in "species" (generally
    # metabolites) in the SBML
    self.species_data_by_metabolite = {}
    self.species_data_types_available = {}
    # This is a hash where each key is the short_name of a Metabolite Type, and
    # the value is 1, indicating that the type has data available somewhere
    # along the full range of timestamps, and has been successfully paired with
    # a reactant ID (as a flux) or species ID in the currently selected SBML
    # model.
    self.metabolites_successfully_paired_with_species = {}
    self.metabolites_successfully_paired_with_fluxes = {}
    # Carbon marking data is not averaged.  Measurements are placed on a
    # first-seen basis.
    self.carbon_data_by_metabolite = {}
    # We will eventually use this 'checked' hash as a filter for all the
    # Measurements we intend to process and embed
    self.metabolites_checked = {}
    self.transcriptions_checked = {}
    self.proteins_checked = {}
    self.metabolite_is_input = {}
    self.metabolite_stats = {}
    self.usable_metabolites_by_assay = defaultdict(list)
    self.proteomics_by_assay = defaultdict(list)
    self.transcription_by_assay = defaultdict(list)
    self.assay_measurements = defaultdict(list)
    self.od_measurements = []
    self.measurement_ranges = {}
    # This is a hash by Assay number, since all Transcriptomics measurements in
    # an Assay are grouped
    self.have_transcriptomics_to_embed = False
    self.consolidated_transcription_ms = {}
    # This is also a hash by Assay number, since all Proteomics measurements in
    # an Assay are grouped
    self.have_proteomics_to_embed = False
    self.consolidated_protein_ms = {}
    self.comprehensive_valid_OD_mtimes = {}
    # Initializing these for use later
    self.metabolic_maps = []
    self.chosen_map = None
    # Okay, ready to extract data!
    self.step_1_select_template_file(test_mode=test_mode)
    self.step_2_get_od_data()
    self.step_3_get_hplc_data()
    self.step_4_get_lcms_data()

  def get_protocol_by_category (self, category_name) :
    protocols = []
    for p in self.protocols :
      if (p.categorization == category_name) :
        protocols.append(p)
    self._protocols_by_category[category_name] = protocols
    return protocols

  def step_1_select_template_file (self, test_mode=False) :
    """
    Step 1: Select the SBML template file to use for export
    """
    # TODO these aren't in the database yet
    # TODO figure out something sensible for unit testing
    if (len(self.metabolic_maps) == 0) :
      if (not test_mode) :
        raise RuntimeError("No SBML templates have been uploaded!")
      self.chosen_map = None
    else :
      self.chosen_map = self.metabolic_maps[int(self.form.get("chosenmap", 0))]

  def step_2_get_od_data (self) :
    """
    Step 2: Find and filter OD Data
    """
    od_protocols = self.get_protocol_by_category("OD")
    if (len(od_protocols) == 0) :
      raise RuntimeError("Cannot find the OD600 protocol by name!")
    mt_meas_type = MeasurementType.objects.get(short_name="OD")
    # TODO look for gCDW/L/OD600 metadata
    od_assays = self.protocol_assays.get(od_protocols[0].name, [])
    # XXX do we still need to cross-reference with selected lines? I think not
    if (len(od_assays) == 0) :
      raise RuntimeError("Line selection does not contain any OD600 Assays. "+
        "Biomass measurements are essential for FBA.")
    # Sort the Assays alphabetically by Line/Assay and take the first from the
    # list as the default.
    od_assays.sort(lambda a,b: cmp(a.name, b.name))
    od_assays.sort(lambda a,b: cmp(a.line.name, b.line.name))
    self.od_measurements = []
    for assay in od_assays :
      assay_meas = list(assay.measurement_set.filter(
        measurement_type__id=mt_meas_type.id))
      self.od_measurements.extend(assay_meas)
    if (len(self.od_measurements) == 0) :
      raise RuntimeError("Assay selection has no Optical Data measurements "+
        "entered.  Biomass measurements are essential for FBA.")
    # Use all OD Measurements we can by default
    selected_od_meas = self.od_measurements
    if self.submitted_from_export_page :
      selected_od_meas = []
      for m in od_measurements :
        form_key = "measurement%dinclude" % m.id
        if (form_key in self.form) :
          selected_od_meas.append(m)
    for od_meas in selected_od_meas :
      self.metabolites_checked[od_meas.id] = True
    # get X-value limits now and store for later
    min_od_x, max_od_x = find_min_max_x_in_measurements(self.od_measurements,
      defined_only=True)
    self.measurement_ranges["OD"] = (min_od_x, max_od_x)
    if (len(selected_od_meas) == 0) :
      raise RuntimeError("No Optical Data measurements were selected. "+
        "Biomass measurements are essential for FBA.")
    # We should only spew information about the utilization of GCDW calibration
    # metadata once, per occurrence of the metadata at the Line/Assay level, or
    # per lack of it at the Line level.
    logged_about_GCDW_in_assay = {}
    logged_about_GCDW_in_line = {}
    self.used_generic_GCDW_in_assays = len(selected_od_meas) #XXX should be 0
    gcdw_calibrations = { a.id : 0.65 for a in od_assays } #XXX should be empty
    # Here we verify that there is a GCDW calibration factor set for every
    # Assay, appropriating it from the enclosing Line, or choosing the default,
    # as necessary.
    # TODO
    # The next set of calculations is a bit difficult.  When we're trying to
    # compute reasonable intermediate values for sets of data that may not have     # the same number of measurements in the same places, we need to be careful.
    # Consider two sets of OD Measurements: one with timestamps of 1h, 2h, 6h,
    # and 8h, and the other with timestamps of 2h, 4h, 8h, and 16h.
    # You could merge these two sets at the 2h mark rather easily, since both
    # contain values for 2h.  But what about at the 4h mark?  You have a
    # measurement at exactly 4h for one set, but you'll have to come up with an
    # intermediate guess for the 4h mark in the other set - the average between
    # 2h and 6h for example.  Only then can you merge those values, to get a
    # sensible average at the 4h mark.
    # One way to do this is by converting each set into a polynomial function,
    # giving a certain measurement y for time values of x, and then doing some
    # computation to merge each y.  This would "smooth out" the curves, but it
    # would also introduce difficult-to-predict variations of the hard data,
    # especially on the outside edges of the data sets.  So we're going to take
    # a stiffer approach.
    # We're going to collect together a master set of all the timestamps in all
    # sets that we have any valid data for,
    # then run through each set of measurements and "fill in" all the
    # timestamps using intermediates calculated from only that set.  When we're
    # done, only then will we merge all those intermediates into averages at
    # each timestamp, for a master set of Measurements.  This has three
    # effects:
    # 1. Estimates in any one set are based entirely on the two closest
    # enclosing hard data points, and none of the others.
    # 2. The data points on the END of a set only affect averaging up to the
    # next nearest hard data point for ANY set. (As a consequence, they don't
    # drag up or down on values well outside their range.)
    # Want better averages?  Make more hard measurements!  Meanwhile, if you
    # see abrupt cliffs, that's because your data is actually questionable
    # and the system is making no effort to hide it.
    od_measurements_by_line = defaultdict(list)
    for m in selected_od_meas :
      od_measurements_by_line[m.assay.line.id].append(m)
    # Time to work on self.od_times_by_line, the set of all timestamps that
    # contain data
    for m in selected_od_meas :
      xvalues = m.extract_data_xvalues(defined_only=True)
      for h in xvalues :
        self.od_times_by_line[m.assay.line.id][h] = 1
    # For each Line, we take the full set of valid timstamps,
    # then walk through each set of OD Measurements and attempt to find a value
    # for that timestamp based on the data in that Measurement.
    # If we don't find an exact value, we calculate one based on a weighted
    # average of nearest neighbors.  [No curve fitting or anything fancy here,
    # just numpy.interp(...)]  Then we apply the calibration factor to our
    # result, and store it in a list.  Finally, we average everything on each
    # list, and declare that value to be the official calibrated OD at that
    # timestamp for that Line.
    for line_id in self.od_times_by_line.keys() :
      all_times = self.od_times_by_line[line_id].keys()
      for t in all_times :
        y_values = []
        for odm in od_measurements_by_line[line_id] :
          gcdw_cal = gcdw_calibrations[odm.assay.id]
          md = list(odm.measurementdatum_set.filter(x=t))
          # If a value is already defined at this timestamp for this
          # measurement, no need to attempt to calculate an average.
          if (len(md) > 0) :
            assert (len(md) == 1)
            y_values.append(md[0].fy * gcdw_cal)
            continue
          y_interp = odm.interpolate_at(t)
          if (y_interp is not None) :
            y_values.append(y_interp * gcdw_cal)
        assert (len(y_values) > 0)
        self.od_times_by_line[line_id][t] = sum(y_values) / len(y_values)
      # We have now created a master set of calibrated OD values for each Line,
      # using every available hard data point in the available Assays.  At this
      # point, self.od_times_by_line contains timestamps that cover all of the
      # points for which I want to generate fluxes.
    # Make a list of all the Line IDs that have at least two points of OD
    # data to work with.
    lines_with_useful_od = [ line_id for line_id in self.od_times_by_line if
      len(self.od_times_by_line[line_id]) > 1 ]
    if (len(lines_with_useful_od) == 0) :
      raise RuntimeError("Selected Optical Data contains less than two " +
        "defined data points!  Biomass measurements are essential for FBA, " +
        "and we need at least two to define a growth rate.")

  def step_3_get_hplc_data (self) :
    """
    Step 3: Select HPLC-like Measurements and mark the ones that are inputs
    """
    hplc_protocols = self.get_protocol_by_category("HPLC")
    # TODO warn somehow
    self.usable_hplc_protocols = []
    self.usable_hplc_assays = defaultdict(list)
    self.usable_hplc_measurements = []
    for protocol in hplc_protocols :
      hplc_assays = self.protocol_assays.get(protocol.name, [])
      if (len(hplc_assays) == 0) :
        continue
      # Sort by the Assay name, then re-sort by the Line name.
      hplc_assays.sort(lambda a,b: cmp(a.name, b.name))
      hplc_assays.sort(lambda a,b: cmp(a.line.name, b.line.name))
      for assay in hplc_assays :
        metabolites = list(assay.get_metabolite_measurements())
        metabolites.sort(lambda a,b: cmp(a.measurement_type.type_name,
                                          b.measurement_type.type_name))
        assay_has_usable_data = False
        for m in metabolites :
          if self._process_metabolite_measurement(m) :
            self.usable_hplc_measurements.append(m)
            self.usable_metabolites_by_assay[assay.id].append(m)
            self.assay_measurements[assay.id].append(m)
            assay_has_usable_data = True
        # All transcription data are usable - there are no units restrictions
        transcriptions = self._process_transcription_measurements(assay)
        if (transcriptions is not None) :
          self.usable_hplc_measurements.extend(transcriptions)
          self.transcription_by_assay[assay.id].extend(transcriptions)
          assay_has_usable_data = True
        # same with proteomics data
        proteomics = self._process_proteomics_measurements(assay)
        if (proteomics is not None) :
          self.usable_hplc_measurements.extend(proteomics)
          self.proteomics_by_assay[assay.id].extend(proteomics)
          assay_has_usable_data = True
        # If the Assay has any usable Measurements, add it to a hash sorted
        # by Protocol
        if assay_has_usable_data :
          self.usable_hplc_assays[protocol.name].append(assay)
      if (len(self.usable_hplc_assays[protocol.name]) > 0) :
        self.usable_hplc_protocols.append(protocol)
    min_x, max_x = find_min_max_x_in_measurements(self.usable_hplc_measurements,
      True)
    self.measurement_ranges["HPLC"] = (min_x, max_x)

  def _process_metabolite_measurement (self, m) :
    if (not m.is_concentration_measurement()) :
      return False
    m_selected = self.form.get("measurement%dinclude" % m.id, None)
    m_is_input = self.form.get("measurement%dinput" % m.id, None)
    if (not self.submitted_from_export_page) :
      m_selected = True
      m_is_input = False
    self.metabolites_checked[m.id] = m_selected
    self.metabolite_is_input[m.id] = m_is_input
    self.assay_measurements[m.assay.id].append(m)
    return True

  def _process_transcription_measurements (self, assay) :
    transcriptions = list(assay.get_gene_measurements())
    if (len(transcriptions) > 0) :
      transcription_selected = self.form.get("transcriptions%dinclude" %
        assay.id, None)
      if (not self.submitted_from_export_page) :
        transcription_selected = True
      if transcription_selected :
        self.have_transcriptomics_to_embed = True
      self.transcriptions_checked[assay.id] = transcription_selected
      self.assay_measurements[assay.id].extend(transcriptions)
      return transcriptions
    return None

  def _process_proteomics_measurements (self, assay) :
    proteomics = list(assay.get_protein_measurements())
    if (len(proteomics) > 0) :
      proteomics_selected = self.form.get("proteins%dinclude" % assay.id,
        None)
      if (not self.submitted_from_export_page) :
        proteomics_selected = True
      if proteomics_selected :
        self.have_proteomics_to_embed = True
      self.proteins_checked[assay.id] = proteomics_selected
      self.assay_measurements[assay.id].extend(proteomics)
      return proteomics
    return None

  def step_4_get_lcms_data (self) :
    """
    Step 4: select LCMS-like measurements - this is very similar to the
    handling of HPLC measurements, but with added support for carbon ratio
    measurements.
    """
    lcms_protocols = self.get_protocol_by_category("LCMS")
    if (len(lcms_protocols) == 0) :
      pass # TODO warn somehow
    self.usable_lcms_protocols = []
    self.usable_lcms_assays = defaultdict(list)
    self.usable_lcms_measurements = []
    # Carbon Ratio measurements are tracked for collision
    seen_lcms_cr_measurement_types = set()
    for protocol in lcms_protocols :
      assays = self.protocol_assays.get(protocol.name, [])
      if (len(assays) == 0) :
        continue
      assays.sort(lambda a,b: cmp(a.name, b.name))
      assays.sort(lambda a,b: cmp(a.line.name, b.line.name))
      for assay in assays :
        metabolites = list(assay.get_metabolite_measurements())
        metabolites.sort(lambda a,b: cmp(a.measurement_type.type_name,
                                          b.measurement_type.type_name))
        # Separate any carbon ratio measurements into a separate array
        cr_meas = [ m for m in metabolites if m.is_carbon_ratio() ]
        # Drop any carbon ratio measurements from the original array
        metabolites = [ m for m in metabolites if not m.is_carbon_ratio() ]
        assay_has_usable_data = False
        for m in metabolites :
          if self._process_metabolite_measurement(m) :
            self.usable_lcms_measurements.append(m)
            self.usable_metabolites_by_assay[assay.id].append(m)
            assay_has_usable_data = True
        transcriptions = self._process_transcription_measurements(assay)
        if (transcriptions is not None) :
          self.usable_lcms_measurements.extend(transcriptions)
          self.transcription_by_assay[assay.id].extend(transcriptions)
          assay_has_usable_data = True
        proteomics = self._process_proteomics_measurements(assay)
        if (proteomics is not None) :
          self.usable_lcms_measurements.extend(proteomics)
          self.proteomics_by_assay[assay.id].extend(proteomics)
          assay_has_usable_data = True
        # Carbon Ratio data is handled in a simpler manner.
        # It is a unitless construct, so we don't verify units, and there is
        # no notion of an 'input' versus an 'output', so we skip checking that.
        for m in cr_meas :
          m_selected = self.form.get("measurement%dinclude" % m.id, None)
          if (not self.submitted_from_export_page) :
            m_selected = False
            # By default, if there is more than one set of measurement data
            # for a given type, we only select the first one.
            meas_type = m.measurement_type
            if (not meas_type.id in seen_lcms_cr_measurement_types) :
              m_selected = True
              seen_lcms_cr_measurement_types.add(meas_type.id)
          self.metabolites_checked[m.id] = m_selected
          self.assay_measurements[assay.id].append(m)
          self.usable_lcms_measurements.append(m)
          self.usable_metabolites_by_assay[assay.id].append(m)
          assay_has_usable_data = True
        if assay_has_usable_data :
          self.usable_lcms_assays[protocol.name].append(assay)
      if (len(self.usable_lcms_assays[protocol.name]) > 0) :
        self.usable_lcms_protocols.append(protocol)
    min_x, max_x = find_min_max_x_in_measurements(self.usable_lcms_measurements,
      True)
    self.measurement_ranges["LCMS"] = (min_x, max_x)

  def template_info (self) :
    """
    Returns a list of SBML template files and associated info as dicts.
    """
    return [ {
      "file_name" : m.attachment.filename,
      "id" : m.id,
      "is_selected" : m is self.chosen_map,
    } for m in self.metabolic_maps ]

  @property
  def n_hplc_protocols (self) :
    return len(self._protocols_by_category.get("HPLC", []))

  @property
  def n_hplc_measurements (self) :
    return len(self.usable_hplc_measurements)

  def _export_assay_measurements (self, assays, max_x) :
    assay_list = []
    for assay in assays :
      measurements = []
      # TODO proteomics, transcriptomics
      for m in self.usable_metabolites_by_assay[assay.id] :
        meas_type = m.measurement_type.type_group
        is_checked = self.metabolites_checked[m.id]
        data_points = []
        for md in m.measurementdatum_set.all() :
          data_points.append({
            "rx" : ((md.fx / max_x) * 450) + 10,
            "title" : "%g at %gh" % (md.fy, md.fx)
          })
        measurement_data = {
          "name" : m.name,
          "units" : m.y_axis_units_name,
          "id" : m.id,
          "proteomics" : False,
          "transcription" : False,
          "format" : m.measurement_format,
          "data_points" : data_points,
          "n_points" : len(data_points),
          "include" : is_checked,
          # XXX this is irrelevant for carbon ratio measurements
          "input" : self.metabolite_is_input.get(m.id, False),
        }
        measurements.append(measurement_data)
      assay_data = {
        "name" : assay.name,
        "measurements" : measurements,
      }
      assay_list.append(assay_data)
    return assay_list

  def export_hplc_measurements (self) :
    data = []
    min_x, max_x = self.measurement_ranges["HPLC"]
    for protocol in self.usable_hplc_protocols :
      assay_list = self._export_assay_measurements(
        assays=self.usable_hplc_assays[protocol.name],
        max_x=max_x)
      protocol_data = {
        "name" : protocol.name,
        "assays" : assay_list,
      }
      data.append(protocol_data)
    return data

  @property
  def n_lcms_protocols (self) :
    return len(self._protocols_by_category.get("LCMS", []))

  @property
  def n_lcms_measurements (self) :
    return len(self.usable_lcms_measurements)

  def export_lcms_measurements (self) :
    data = []
    min_x, max_x = self.measurement_ranges["LCMS"]
    for protocol in self.usable_lcms_protocols :
      assays = []
      assay_list = self._export_assay_measurements(
        assays=self.usable_lcms_assays[protocol.name],
        max_x=max_x)
      protocol_data = {
        "name" : protocol.name,
        "assays" : assay_list,
      }
      data.append(protocol_data)
    return data

  @property
  def n_ramos_measurements (self) :
    return 0

  @property
  def n_trans_prot_measurements (self) :
    return 0

  def reaction_notes (self) :
    """
    {
      'status' : "good" or "bad",
      'species_id' : ???,
      'entity' : str,
    }
    """
    raise NotImplementedError()

  @property
  def n_subsystem_notes (self) :
    return 0

  @property
  def n_protein_notes (self) :
    return 0

  @property
  def n_gene_notes (self) :
    return 0

  @property
  def n_protein_class_notes (self) :
    return 0

  @property
  def n_gene_associations (self) :
    return 0

  @property
  def n_gene_assoc_reactions (self) :
    return 0

  @property
  def n_protein_associations (self) :
    return 0

  @property
  def n_protein_assoc_reactions (self) :
    return 0

  @property
  def n_exchanges (self) :
    return 0

  def exchanges (self) :
    raise NotImplementedError()

  @property
  def n_measurement_types (self) :
    return 0

  def measurement_type_resolution (self) :
    """
    {
      'name' : str,
      'species' : str,
      'exchange' : str,
      'ex_resolving_name' : str,
    }
    """
    raise NotImplementedError()

  @property
  def n_exchanges_resolved (self) :
    return 0

  @property
  def n_exchanges_not_resolved (self) :
    return 0

  def unresolved_exchanges (self) :
    """
    {
      'reactant' : str,
      'exchange' : str,
    }
    """
    raise NotImplementedError()

  def metabolite_species (self) :
    """
    {
      'name' : str,
      'short_name' : str,
      'id' : int,
      'species' : str,
    }
    """
    raise NotImplementedError()

  def metabolite_fluxes (self) :
    """
    {
      'name' : str,
      'short_name' : str,
      'id' : int,
      'rex' : str,
    }
    """
    raise NotImplementedError()

  def flux_match_elements (self) :
    """
    Returns a comma-separated list of IDs that becomes the value of the
    'fluxmatchelements' form parameter.
    """
    raise NotImplementedError()
    return ",".join([ str(fme_id) for fme_id in match_elements ])

  def sbml_files (self) :
    raise NotImplementedError()

def find_min_max_x_in_measurements (measurements, defined_only=None) :
  """
  Find the minimum and maximum X values across all data in all given
  Measurement IDs.  If definedOnly is set, filter out all the data points that
  have unset Y values before determining range.
  """
  xvalues = []
  for m in measurements :
    xvalues.extend(m.extract_data_xvalues(defined_only=defined_only))
  return min(xvalues), max(xvalues)
