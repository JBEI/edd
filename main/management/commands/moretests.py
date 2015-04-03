
# NOTE tests may need updating if and when we add measurement types or do
# anything that might change unique IDs!

"""
Additional tests that require real data in the EDD.  It is better to rely on
simpler unit tests if possible but this module helps us ensure consistency
with the old EDD (to the extent that it's behaving correctly).
"""

from main.models import Study, Line
from main import sbml_export
from django.core.management.base import BaseCommand, CommandError
import unittest

class SBMLTests (unittest.TestCase) :
  def test_sbml_setup (self) :
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
    assert (sd.n_meas_types_resolved_to_species == 586)
    assert (sd.n_meas_types_unresolved_to_species == 102)
    assert (sd.n_exchanges_resolved == 205)
    assert (sd.n_exchanges_not_resolved == 648)
    assert (sd.biomass_exchange.ex_id == "R_Ec_biomass_iJO1366_WT_53p95M")

  def test_sbml_export (self) :
    sd = sbml_export.line_sbml_export(
      study=Study.objects.get(id=34),
      lines=[ Line.objects.get(name="arcA-1L") ],
      form={"chosenmap": 0}).run()
    assert (sd.n_lcms_measurements == 44)
    assert (sd.n_ramos_measurements == 2)
    assert (sd.n_conversion_warnings == 3)
    assert (sd.species_match_element_ids == sd.flux_match_element_ids ==
            "4,5,6,11,13,84,309,528")
    assert (sd.available_timepoints == [0.0, 7.5, 9.5, 11.0, 13.0, 15.0, 17.0])
    assert (sd.n_modified == 0)
    # make sure RAMOS measurements are handled correctly!
    assert (sd.species_match_elements() ==  [
      {'species': 'M_ac_c', 'name': u'Acetate', 'short_name': u'ac', 'id': 4},
      {'species': 'M_co2_c', 'name': u'CO2', 'short_name': u'co2', 'id': 309},
      {'species': 'M_glc_DASH_D_c', 'name': u'D-Glucose', 'short_name': u'glc-D', 'id': 84},
      {'species': 'M_etoh_c', 'name': u'Ethanol', 'short_name': u'etoh', 'id': 5},
      {'species': 'M_for_c', 'name': u'Formate', 'short_name': u'for', 'id': 6},
      {'species': 'M_o2_c', 'name': u'O2', 'short_name': u'o2', 'id': 528},
      {'species': 'M_pyr_c', 'name': u'Pyruvate', 'short_name': u'pyr', 'id': 13},
      {'species': 'M_succ_c', 'name': u'Succinate', 'short_name': u'succ', 'id': 11}
    ])
    assert (sd.flux_match_elements() == [
      {'exchange': 'R_ACtex', 'name': u'Acetate', 'short_name': u'ac', 'id': 4},
      {'exchange': 'R_EX_co2_LPAREN_e_RPAREN_', 'name': u'CO2', 'short_name': u'co2', 'id': 309},
      {'exchange': 'R_EX_glc_LPAREN_e_RPAREN_', 'name': u'D-Glucose', 'short_name': u'glc-D', 'id': 84},
      {'exchange': 'R_EX_etoh_LPAREN_e_RPAREN_', 'name': u'Ethanol', 'short_name': u'etoh', 'id': 5},
      {'exchange': 'R_EX_for_LPAREN_e_RPAREN_', 'name': u'Formate', 'short_name': u'for', 'id': 6},
      {'exchange': 'R_EX_o2_LPAREN_e_RPAREN_', 'name': u'O2', 'short_name': u'o2', 'id': 528},
      {'exchange': 'R_EX_pyr_LPAREN_e_RPAREN_', 'name': u'Pyruvate', 'short_name': u'pyr', 'id': 13},
      {'exchange': 'R_EX_succ_LPAREN_e_RPAREN_', 'name': u'Succinate', 'short_name': u'succ', 'id': 11}
    ])
    # TODO lots more
    out = sd.as_sbml(9.5)
    #open("tmp.xml", "w").write(out)

class Command (BaseCommand) :
  def handle (self, *args, **kwds) :
    # we can't call unittest.main() here
    suite = unittest.TestLoader().loadTestsFromTestCase(SBMLTests)
    unittest.TextTestRunner(verbosity=2).run(suite)
