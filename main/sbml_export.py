
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
  to the export page view.  If any steps fail due to lack of approprioate data,
  a ValueError will be raised (and displayed in the browser).
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
    self.chosen_map = None
    # Initializing these for use later
    # Get a master set of all timestamps that contain data, separated according
    # to Line ID.
    self.od_times_by_line = defaultdict(dict)
    self.have_gcdw_metadata = False
    self.od_measurements = []
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
    self.measurement_ranges = {}
    self.usable_protocols = defaultdict(list) # keyed by protocol category
    self.usable_assays = defaultdict(dict) # keyed by P.category, P.name
    self.usable_measurements = defaultdict(list) # keyed by protocol category
    # this tracks what measurement values are the result of interpolation
    self.interpolated_measurement_timestamps = defaultdict(set)
    # this tracks processed measurement data (possibly interpolated)
    self.measurement_data = defaultdict(list)
    # RAMOS stuff
    self.need_ramos_units_warning = False
    # This is a hash by Assay number, since all Transcriptomics measurements in
    # an Assay are grouped
    self.have_transcriptomics_to_embed = False
    self.consolidated_transcription_ms = {}
    # This is also a hash by Assay number, since all Proteomics measurements in
    # an Assay are grouped
    self.have_proteomics_to_embed = False
    self.consolidated_protein_ms = {}
    self.comprehensive_valid_OD_mtimes = {}
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
    self.metabolite_errors = {}
    # Okay, ready to extract data!
    self._step_1_select_template_file(test_mode=test_mode)
    self._step_2_get_od_data()
    self._step_3_get_hplc_data()
    self._step_4_get_lcms_data()
    self._step_5_get_ramos_data()
    self._step_6_get_transcriptomics_proteomics()
    self._step_7_calculate_fluxes()
    self._step_8_pre_parse_and_match()

  def _get_protocols_by_category (self, category_name) :
    protocols = []
    for p in self.protocols :
      if (p.categorization == category_name) :
        protocols.append(p)
    self._protocols_by_category[category_name] = protocols
    return protocols

  # Step 1: Select the SBML template file to use for export
  def _step_1_select_template_file (self, test_mode=False) :
    """
    Private method
    """
    # TODO these aren't in the database yet
    # TODO figure out something sensible for unit testing
    if (len(self.metabolic_maps) == 0) :
      if (not test_mode) :
        raise ValueError("No SBML templates have been uploaded!")
      self.chosen_map = None
    else :
      self.chosen_map = self.metabolic_maps[int(self.form.get("chosenmap", 0))]

  def _step_2_get_od_data (self) :
    """
    Step 2: Find and filter OD Data
    """
    od_protocols = self._get_protocols_by_category("OD")
    if (len(od_protocols) == 0) :
      raise ValueError("Cannot find the OD600 protocol by name!")
    mt_meas_type = MeasurementType.objects.get(short_name="OD")
    # TODO look for gCDW/L/OD600 metadata
    od_assays = self.protocol_assays.get(od_protocols[0].name, [])
    # XXX do we still need to cross-reference with selected lines? I think not
    if (len(od_assays) == 0) :
      raise ValueError("Line selection does not contain any OD600 Assays. "+
        "Biomass measurements are essential for FBA.")
    # Sort the Assays alphabetically by Line/Assay and take the first from the
    # list as the default.
    od_assays.sort(lambda a,b: cmp(a.name, b.name))
    od_assays.sort(lambda a,b: cmp(a.line.name, b.line.name))
    for assay in od_assays :
      assay_meas = list(assay.measurement_set.filter(
        measurement_type__id=mt_meas_type.id))
      self.od_measurements.extend(assay_meas)
    if (len(self.od_measurements) == 0) :
      raise ValueError("Assay selection has no Optical Data measurements "+
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
      raise ValueError("No Optical Data measurements were selected. "+
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
      raise ValueError("Selected Optical Data contains less than two " +
        "defined data points!  Biomass measurements are essential for FBA, " +
        "and we need at least two to define a growth rate.")

  # Step 3: Select HPLC-like Measurements and mark the ones that are inputs
  def _step_3_get_hplc_data (self) :
    """private method"""
    self._process_multi_purpose_protocol("HPLC")

  # this function is used to extract data for HPLC, LC-MS, and transcriptomics
  # or proteomics protocols.  most of these are handled identically, except
  # that the LC-MS category handles carbon ratio measurements separately.
  def _process_multi_purpose_protocol (self,
      protocol_category,
      process_carbon_ratios_separately=False) :
    """private method"""
    protocols = self._get_protocols_by_category(protocol_category)
    if (len(protocols) == 0) :
      return
    seen_cr_measurement_types = set()
    for protocol in protocols :
      assays = self.protocol_assays.get(protocol.name, [])
      if (len(assays) == 0) :
        continue
      self.usable_assays[protocol_category] = defaultdict(list)
      # Sort by the Assay name, then re-sort by the Line name.
      assays.sort(lambda a,b: cmp(a.name, b.name))
      assays.sort(lambda a,b: cmp(a.line.name, b.line.name))
      for assay in assays :
        metabolites = list(assay.get_metabolite_measurements())
        metabolites.sort(lambda a,b: cmp(a.name, b.name))
        cr_meas = []
        if process_carbon_ratios_separately :
          # Separate any carbon ratio measurements into a separate array
          cr_meas = [ m for m in metabolites if m.is_carbon_ratio() ]
          # Drop any carbon ratio measurements from the original array
          metabolites = [ m for m in metabolites if not m.is_carbon_ratio() ]
        assay_has_usable_data = False
        for m in metabolites :
          if self._process_metabolite_measurement(m) :
            self.usable_measurements[protocol_category].append(m)
            self.usable_metabolites_by_assay[assay.id].append(m)
            self.assay_measurements[assay.id].append(m)
            assay_has_usable_data = True
        # All transcription data are usable - there are no units restrictions
        transcriptions = self._process_transcription_measurements(assay)
        if (transcriptions is not None) :
          self.usable_measurements[protocol_category].extend(transcriptions)
          self.transcription_by_assay[assay.id].extend(transcriptions)
          assay_has_usable_data = True
        # same with proteomics data
        proteomics = self._process_proteomics_measurements(assay)
        if (proteomics is not None) :
          self.usable_measurements[protocol_category].extend(proteomics)
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
            if (not meas_type.id in seen_cr_measurement_types) :
              m_selected = True
              seen_cr_measurement_types.add(meas_type.id)
          self.metabolites_checked[m.id] = m_selected
          self.assay_measurements[assay.id].append(m)
          self.usable_measurements["LCMS"].append(m)
          self.usable_metabolites_by_assay[assay.id].append(m)
          assay_has_usable_data = True
        # If the Assay has any usable Measurements, add it to a hash sorted
        # by Protocol
        if assay_has_usable_data :
          self.usable_assays[protocol_category][protocol.name].append(assay)
      usable_assays = self.usable_assays[protocol_category][protocol.name]
      if (len(usable_assays) > 0) :
        self.usable_protocols[protocol_category].append(protocol)
    min_x, max_x = find_min_max_x_in_measurements(
      self.usable_measurements[protocol_category], True)
    self.measurement_ranges[protocol_category] = (min_x, max_x)

  def _process_metabolite_measurement (self, m) :
    """private method"""
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
    """private method"""
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
    """private method"""
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

  # Step 4: select LCMS-like measurements - this is very similar to the
  # handling of HPLC measurements, but with added steps for carbon ratio
  # measurements.
  def _step_4_get_lcms_data (self) :
    """private method"""
    self._process_multi_purpose_protocol("LCMS",
      process_carbon_ratios_separately=True)

  def _step_5_get_ramos_data (self) :
    """private method"""
    ramos_protocols = self._get_protocols_by_category("RAMOS")
    if (len(ramos_protocols) == 0) :
      return
    for protocol in ramos_protocols :
      assays = self.protocol_assays.get(protocol.name, [])
      if (len(assays) == 0) :
        continue
      self.usable_assays["RAMOS"] = defaultdict(list)
      assays.sort(lambda a,b: cmp(a.name, b.name))
      assays.sort(lambda a,b: cmp(a.line.name, b.line.name))
      for assay in assays :
        metabolites = list(assay.get_metabolite_measurements())
        metabolites.sort(lambda a,b: cmp(a.name, b.name))
        for m in metabolites :
          units = m.y_axis_units_name
          if (units is None) or (units == "") :
            self.need_ramos_units_warning = True
          elif (units != "mol/L/hr") :
            continue
          is_selected = self.form.get("measurement%dinclude" % m.id, None)
          is_input = self.form.get("measurement%dinput" % m.id, None)
          if (not self.submitted_from_export_page) :
            is_selected = True
            is_input = False
            if re.match("O2|\WO2", m.name) :
              is_input = True
          self.metabolites_checked[m.id] = is_selected
          self.metabolite_is_input[m.id] = is_input
          self.assay_measurements[assay.id].append(m)
          self.usable_metabolites_by_assay[assay.id].append(m)
          self.usable_measurements["RAMOS"].append(m)
        if (len(self.assay_measurements[assay.id]) > 0) :
          self.usable_assays["RAMOS"][protocol.name].append(assay)
      if (len(self.usable_assays["RAMOS"].get(protocol.name, [])) > 0) :
        self.usable_protocols["RAMOS"].append(protocol)
    min_x, max_x = find_min_max_x_in_measurements(
      self.usable_measurements["RAMOS"], True)
    self.measurement_ranges["RAMOS"] = (min_x, max_x)

  def _step_6_get_transcriptomics_proteomics (self) :
    """private method"""
    self._process_multi_purpose_protocol("TPOMICS")

  def _step_7_calculate_fluxes (self) :
    """private method"""
    all_checked_measurements = []
    for assay_id, measurements in self.assay_measurements.iteritems() :
      for m in measurements :
        if self.metabolites_checked[m.id] :
          all_checked_measurements.append(m)
    all_checked_measurements.sort(lambda a,b: cmp(a.short_name, b.short_name))
    for m in all_checked_measurements :
      assay = m.assay
      protocol = assay.protocol
      protocol_category = protocol.categorization
      line = assay.line
      mdata_times = m.extract_data_xvalues(defined_only=True)
      od_times = self.od_times_by_line[line.id]
      use_interpolation = True # always on for now
      # Right now we are allowing linear interpolation between two measurement
      # values, but only if there is a valid OD measurement at that exact spot.
      # So, the current implementation essentially just creates extra
      # measurement data in all the timeslots where we have an OD value.
      # For interpolation to be allowed, we must:
      # * Have the $use_interpolation flag set
      # * Be working with a protocol that is not in the OD category
      # * Be working with a measurement type format that is just a single
      #   floating point number
      # * Have at LEAST two measurement values for this measurement
      if (use_interpolation and (protocol_category != "OD") and
          (not m.is_carbon_ratio()) and (len(mdata_times) > 1)) :
        # Find all the timestamps with defined measurements.
        # Note that we're doing this outside the interpolation loops below,
        # so we don't pollute that set with values created via interpolation.
        # Also note that we will have to remake this array after attempting
        # interpolation.
        valid_mdata = list(m.valid_data())
        valid_mdata.sort(lambda a,b: cmp(a.x, b.x))
        mdata_tuples = [ (md.fx, md.fx) for md in valid_mdata ]
        valid_mtimes = set([ md.fx for md in valid_mdata ])
        # Get the set of all OD measurement timestamps that do NOT have a
        # defined value in this measurement's data.  These are the candidate
        # spots for interpolation.
        for t in od_times :
          if (not t in valid_mtimes) :
            y = m.interpolate_at(t)
            if (y is not None) :
              mdata_tuples.append((t, y))
              self.interpolated_measurement_timestamps[m.id].add(t)
        mdata_tuples.sort(lambda a,b: cmp(a[0], b[0]))
        is_input = self.metabolite_is_input[m.id]
        skipped_due_to_lack_of_od = []
        def process_md () :
          if m.is_carbon_ratio() : # TODO
            return
          met = Metabolite.objects.get(id=m.measurement_type.id)
          mdata_converted = []
          # attempt unit conversions.  for convenience we use a simple class
          # with 'x' and 'y' attributes, capable of handling any measurement
          # type.
          for (x, y) in mdata_tuples :
            md = measurement_datum_converted_units(x=x, y=y,
              units=m.y_axis_units_name,
              metabolite=met,
              is_ramos_protocol=(protocol_category=="RAMOS"))
            mdata_converted.append(md)
          # Now that we've done our unit conversions (or attempted them),
          # we're going to calculate some statistics.
          hi = max([ md.y for md in mdata_converted ])
          lo = min([ md.y for md in mdata_converted ])
          met_lo, met_hi = self.metabolite_stats.get(met.id, (None, None))
          if (met_hi is None) or (met_hi < hi) : met_hi = hi
          if (met_lo is None) or (met_lo > lo) : met_lo = low
          self.metabolite_stats[met.id] = (met_lo, met_hi)
          # Now, finally, we calculate fluxes and other embeddable values
          for i_time, md in enumerate(mdata_converted) :
            t, y = md.x, md.y
            interpolated = t in self.interpolated_measurement_timestamps[m.id]
            od = self.od_times_by_line[line.id].get(t, None)
            # Got to have an OD measurements at exactly the start, currently.
            # It's certainly possible to do fancier stuff, but we'll implement
            # that later.
            if (od is None) :
              skipped_due_to_lack_of_od.append(t)
            elif (od == 0) :
              # TODO error message?
              continue
            # At this point we know we have valid OD and valid Measurements for
            # the interval.  (Remember, we pre-filtered valid meas. times.)
            # We'll note the time as one of the columns we will want to offer
            # in the comprehensive export table on the webpage, even if we
            # subsequently reject this Measurement based on problems with
            # unit conversion or lack of an exchange element in the SBML
            # document. (The zero in the table will be informative to the user.)
            self.comprehensive_valid_od_mtimes[t] = 1
            # At this point, the next higher timestamp in the list becomes
            # necessary.  If there isn't one, we're at the end of the loop, so
            # we silently move on.
            if ((i_time + 1) == len(mdata_converted)) :
              continue
            md_next = mdata_converted[i_time+1]
            t_next = md_next.x
            delta_t = t_next - t
            # This is kind of logically impossible, but, we ARE just drawing
            # from an array, so...
            if (delta_t == 0) :
              continue # TODO error logging
            # Get the OD and Measurement value for this next timestamp
            od_next = self.od_times_by_line[line.id].get(t_next, None)
            y_next = mdata_converted[i_time+1].y
            units = md.units
            # We know it's not a carbon ratio at this point, so a delta is a
            # meaningful value to calculate.
            # TODO
            if (protocol_category == "OD") :
              pass
            elif (protocol_category in ["HPLC","LCMS","TPOMICS"]) :
              pass
            elif (protocol_category == "RAMOS") :
              pass 

  def _step_8_pre_parse_and_match (self) :
    """private method"""
    pass

  # Used for extracting HPLC/LCMS/RAMOS assays for display.  Metabolites are
  # listed individually, proteomics and transcriptomics measurements are
  # grouped per assay.  The 'data_points' lists are used to draw SVG objects
  # representing the measurements as time series.
  def _export_assay_measurements (self, assays, max_x) :
    """private method"""
    assay_list = []
    for assay in assays :
      measurements = []
      transcriptions = self.transcription_by_assay.get(assay.id, ())
      if (len(transcriptions) > 0) :
        gene_xvalue_counts = defaultdict(int)
        n_points = 0
        for t in transcriptions :
          for md in t.measurementdatum_set.all() :
            gene_xvalue_counts[md.fx] += 1
            n_points += 1
        gene_xvalues = sorted(gene_xvalue_counts.keys())
        data_points = []
        for x in gene_xvalues :
          if (x > max_x) : continue
          data_points.append({
            "rx" : ((x / max_x) * 450) + 10,
            "ay" : gene_xvalue_counts[x],
            "title" : "%d transcription counts at %gh" % (gene_xvalue_counts[x],
              x),
          })
        measurements.append({
          "name" : "Gene Transcription Values",
          "units" : "RPKM",
          "id" : assay.id,
          "type" : "transcriptions",
          "format" : 2,
          "data_points" : data_points,
          "n_points" : n_points,
          "include" : self.transcriptions_checked[assay.id],
          "input" : None,
        })
      # FIXME some unnecessary duplication here
      proteomics = self.proteomics_by_assay.get(assay.id, ())
      if (len(proteomics) > 0) :
        protein_xvalue_counts = {}
        n_points = 0
        for p in proteomics :
          for md in p.measurementdatum_set.all() :
            protein_xvalue_counts[md.fx] += 1
            n_points += 1
        protein_xvalues = sorted(protein_xvalue_counts.keys())
        data_points = []
        for x in protein_xvalues :
          if (x > max_x) : continue
          data_points.append({
            "rx" : ((x / max_x) * 450) + 10,
            "ay" : protein_xvalue_counts[x],
            "title" : "%d protein measurements at %gh" %
              (protein_xvalue_counts[x], x),
          })
        measurements.append({
          "name" : "Proteomics Measurements",
          "units" : "Copies",
          "id" : assay.id,
          "type" : "proteins",
          "format" : 2,
          "data_points" : data_points,
          "n_points" : n_points,
          "include" : self.proteomics_checked[assay.id],
          "input" : None,
        })
      for m in self.usable_metabolites_by_assay.get(assay.id, ()) :
        meas_type = m.measurement_type.type_group
        is_checked = self.metabolites_checked[m.id]
        data_points = []
        for md in m.measurementdatum_set.all() :
          x = md.fx
          if (x > max_x) : continue
          data_points.append({
            "rx" : ((x / max_x) * 450) + 10,
            "ay" : md.fy,
            "title" : "%g at %gh" % (md.fy, x)
          })
        measurements.append({
          "name" : m.full_name,
          "units" : m.y_axis_units_name,
          "id" : m.id,
          "type" : "measurement",
          "format" : m.measurement_format,
          "data_points" : data_points,
          "n_points" : len(data_points),
          "include" : is_checked,
          # XXX this is irrelevant for carbon ratio measurements
          "input" : self.metabolite_is_input.get(m.id, False),
        })
      assay_list.append({
        "name" : assay.name,
        "measurements" : measurements,
      })
    return assay_list

  def _export_protocol_measurements (self, category) :
    if (len(self.usable_protocols[category]) == 0) :
      raise RuntimeError("No usable measurements in this category!")
    data = []
    min_x, max_x = self.measurement_ranges[category]
    for protocol in self.usable_protocols[category] :
      assay_list = self._export_assay_measurements(
        assays=self.usable_assays[category][protocol.name],
        max_x=max_x)
      protocol_data = {
        "name" : protocol.name,
        "assays" : assay_list,
      }
      data.append(protocol_data)
    return data

  #---------------------------------------------------------------------
  # "public" methods - referenced by HTML template (and unit tests)
  #
  def template_info (self) :
    """
    Returns a list of SBML template files and associated info as dicts.
    """
    return [ {
      "file_name" : m.attachment.filename,
      "id" : m.id,
      "is_selected" : m is self.chosen_map,
    } for m in self.metabolic_maps ]

  def export_od_measurements (self) :
    """
    Provide data structure for display of OD600 measurements in HTML template.
    """
    meas_list = []
    min_x, max_x = self.measurement_ranges["OD"]
    for m in self.od_measurements :
      data_points = []
      for md in m.measurementdatum_set.all() :
        x = md.fx
        if (x > max_x) : continue
        data_points.append({
          "rx" : ((x / max_x) * 450) + 10,
          "ay" : md.fy,
          "title" : "%g at %gh" % (md.fy, x)
        })
      meas_list.append({
        "id" : m.id,
        "assay_name" : m.assay.name,
        "data_points" : data_points,
        "n_points" : len(data_points),
        "include" : self.metabolites_checked[m.id],
      })
    return meas_list

  # HPLC
  @property
  def n_hplc_protocols (self) :
    return len(self._protocols_by_category.get("HPLC", []))

  @property
  def n_hplc_measurements (self) :
    return len(self.usable_measurements["HPLC"])

  def export_hplc_measurements (self) :
    return self._export_protocol_measurements("HPLC")

  # LCMS
  def export_lcms_measurements (self) :
    return self._export_protocol_measurements("LCMS")

  @property
  def n_lcms_protocols (self) :
    return len(self._protocols_by_category.get("LCMS", []))

  @property
  def n_lcms_measurements (self) :
    return len(self.usable_measurements["LCMS"])

  # RAMOS
  @property
  def n_ramos_protocols (self) :
    return len(self._protocols_by_category.get("RAMOS", []))

  @property
  def n_ramos_measurements (self) :
    return len(self.usable_measurements["RAMOS"])

  def export_ramos_measurements (self) :
    return self._export_protocol_measurements("RAMOS")

  # transcriptomics and proteomics
  @property
  def n_trans_prot_protocols (self) :
    return len(self._protocols_by_category.get("TPOMICS", []))

  @property
  def n_trans_prot_measurements (self) :
    return len(self.usable_measurements["TPOMICS"])

  def export_trans_prot_measurements (self) :
    return self._export_protocol_measurements("TPOMICS")

  def all_checked_measurements (self) :
    return []

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

#-----------------------------------------------------------------------
# Utility functions
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

class measurement_datum_converted_units (object) :
  """
  Wrapper class for measurement unit conversions.  This structure facilitates
  tracking information about what conversions were performed without adding
  even more dictionary structures to the sbml_data class.
  """
  def __init__ (self, x, y, units, metabolite, is_ramos_measurement=False) :
    self.x = x
    self.initial_value = y
    self.y = y
    self.initial_units = units
    if is_ramos_measurement :
      if (units == "") :
        units = "mol/L/hr"
      if (units != "mol/L/hr") :
        raise ValueError("Units can't be converted to mM/hr.  "+
           "Skipping all intervals.")
    self.units = units
    if (metabolite.short_name == "OD") :
      pass
    elif (units in ["mg/L", "g/L"]) :
      if (metabolite.molar_mass == 0) :
        raise ValueError("Cannot convert units from <b>mg/L<b> without "+
          "knowing the molar mass of this metabolite.  Skipping all "+
          "intervals.")
      if (units == "g/L") :
        self.y = 1000 * value / metabolite.molar_mass
      else :
        self.y = value / metabolite.molar_mass
        self.units = "mM"
    elif (units == "Cmol/L") :
      if (metabolite.carbon_count == 0) :
        raise ValueError("Cannot convert units from <b>Cmol/L</b> without "+
          "knowing the carbon count of this metabolite.  Skipping all "+
          "intervals.")
      self.y = 1000 * y / metabolite.carbon_count
    elif (units == "mol/L") :
      self.y = y * 1000
      self.units = "mM"
    elif (units == "uM") :
      self.y = y / 1000
      self.units = "mM"
    elif (units == "mol/L/hr") : # RAMOS only
      self.y = 1000 * y
      self.units = "mM/hr"
    elif (units != "mM") :
      raise ValueError("Units '%s' can't be converted to mM.  Skipping..." %
        units)

  def as_tuple (self) :
    return (self.x, self.y)

  def __float__ (self) :
    return self.y

  def show_conversion (self) :
    pass
