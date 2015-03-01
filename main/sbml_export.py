
"""
Backend for exporting SBML files.
"""

from main.models import MetabolicMap, Protocol
from collections import defaultdict
import sys

class sbml_data (object) :
  def __init__ (self, study, lines, form) :
    self.study = study
    self.lines = lines
    self.form = form
    self.assays = []
    for line in lines :
      self.assays.extend(list(line.assay_set.all()))
    self.protocol_assays = defaultdict(list)
    self.protocols = Protocol.objects.all()
    for assay in self.assays :
      self.protocol_assays[assay.protocol.name].append(assay)
    self.primary_line_name = lines[0].name
    self.metabolic_maps = list(MetabolicMap.objects.all())
    # Get a master set of all timestamps that contain data, separated according
    # to Line ID.
    self.odtimes_by_line = {}
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
    self.metabolite_is_input = {}
    # This is a hash by Assay number, since all Transcriptomics measurements in
    # an Assay are grouped
    self.transcriptions_checked = {}
    self.have_transcriptomics_to_embed = False
    self.consolidated_transcription_ms = {}
    # This is also a hash by Assay number, since all Proteomics measurements in
    # an Assay are grouped
    self.proteins_checked = {}
    self.have_proteomics_to_embed = False
    self.consolidated_protein_ms = {}
    self.comprehensive_valid_OD_mtimes = {}
    self.metabolite_stats = {}
    # Initializing these for use later
    self.metabolic_maps = 
    self.chosen_map = None

  def get_protocol_by_category (self, category_name) :
    protocols = []
    for p in self.protocols :
      if (p.categorization == category_name) :
        protocols.append(p)
    return protocols

  def step_1_select_template_file (self) :
    """
    Step 1: Select the SBML template file to use for export
    """
    if (len(self.metabolic_maps) == 0) :
      raise RuntimeError("No SBML templates have been uploaded!")
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
    return -sys.maxint

  @property
  def n_protein_notes (self) :
    return -sys.maxint

  @property
  def n_gene_notes (self) :
    return -sys.maxint

  @property
  def n_protein_class_notes (self) :
    return -sys.maxint

  @property
  def n_gene_associations (self) :
    return -sys.maxint

  @property
  def n_gene_assoc_reactions (self) :
    return -sys.maxint

  @property
  def n_protein_associations (self) :
    return -sys.maxint

  @property
  def n_protein_assoc_reactions (self) :
    return -sys.maxint

  @property
  def n_exchanges (self) :
    return -sys.maxint

  def exchanges (self) :
    raise NotImplementedError()

  @property
  def n_measurement_types (self) :
    return -sys.maxint

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
    return -sys.maxint

  @property
  def n_exchanges_not_resolved (self) :
    return -sys.maxint

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
