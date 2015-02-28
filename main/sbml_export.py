
"""
Backend for exporting SBML files.
"""

import sys

class sbml_data (object) :

  def template_info (self) :
    """
    Returns a list of template files and associated info as dicts.
    {
      'file_name' : str,
      'id' : int,
      'is_selected' : bool,
    }
    """
    raise NotImplementedError()

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
