
"""
Additional tests that require real data in the EDD.  It is better to rely on
simpler unit tests if possible but this module helps us ensure consistency
with the old EDD (to the extent that it's behaving correctly).
"""

from main.models import Study, Line
from main import sbml_export
from django.core.management.base import BaseCommand, CommandError

def exercise_sbml_setup () :
  sd = sbml_export.sbml_info()
  sd._select_map(0)
  sd._process_sbml()
  # part 1: pure SBML extraction, independent of study
  assert (sd.n_sbml_species_notes == 1805)
  assert (sd.n_sbml_reaction_notes == 2583)
  assert (sd.n_gene_associations == 1367)
  assert (sd.n_gene_assoc_reactions == 2123)
  # XXX note that the current output is NOT consistent with the old EDD!
  assert (sd.n_protein_associations == 1367)
  assert (sd.n_exchanges == 853)
  assert (sd.n_measurement_types == 691)
  assert (sd.n_meas_types_resolved_to_species == 588)
  assert (sd.n_meas_types_unresolved_to_species == 102)
  assert (sd.n_exchanges_resolved == 205)
  assert (sd.n_exchanges_not_resolved == 648)
  assert (sd.biomass_exchange.ex_id == "R_Ec_biomass_iJO1366_WT_53p95M")

def exercise_sbml_export () :
  sd = sbml_export.line_sbml_export(
    study=Study.objects.get(id=34),
    lines=[ Line.objects.get(name="arcA-1L") ], # XXX unique ID may change
    form={"chosenmap": 0}).run()
  assert (sd.n_lcms_measurements == 44)
  assert (sd.n_ramos_measurements == 2)
  assert (sd.n_conversion_warnings == 3)
  assert (sd.species_match_element_ids == sd.flux_match_element_ids ==
          "36,35,4,5,6,84,13,11")
  assert (sorted(list(sd._comprehensive_valid_OD_times)) ==
          [0.0, 7.5, 9.5, 11.0, 13.0, 15.0, 17.0])
  # TODO lots more

class Command (BaseCommand) :
  def handle (self, *args, **kwds) :
    print "testing SBML setup..."
    exercise_sbml_setup()
    print "   passed."
    print "testing SBML export..."
    exercise_sbml_export()
    print "   passed."
