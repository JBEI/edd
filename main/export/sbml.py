
# FIXME need to track intracellular and extracellular measurements separately
# (and assign to SBML species differently)
# TODO clean this up, get rid of unnecessary code and make it internally
# consistent
# TODO Garrett says we can get rid of the input checkboxes

# NOTE the structure of this module is more complicated than really necessary -
# basically I am using a class hierarchy to separate out three different areas
# of functionality:
#   1. processing the SBML model and determining what reactants/fluxes to use,
#      independently of the line(s) and assay(s) of interest (sbml_info)
#   2. processing the raw assay data and calculating fluxes (line_assay_data)
#   3. combining the assay data with the SBML model to export a new SBML file
#      (line_sbml_export)
# and technically, actually pulling down the relevant database records is
# handled by yet another class in utilities.py.
#
# Note that some "private" method names imply an ordering of steps which
# matches the layout export HTML view, but broken up among two classes.  These
# may be refactored in the future.
#
# There is no reason why this hierarchy can't be merged into a single class,
# but given the complexity of the module and the more-or-less discrete sets
# of functions, I find it more convenient to break them up.  This also
# facilitates later re-use, e.g. the analyses done by the sbml_info class are
# also used in the view for administration of metabolic maps, independently
# of assay data.  (To that extent, the structure mimics that of the old EDD,
# where this functionality and HTML output resided in UtilitiesSBML.pm.)
#
# -Nat 2015-03-27

# NOTE 2: a lot of Garrett's comments have been ported from the Perl code.
# some of these may need updating or removing.

# NOTE 3: I apologize for my reliance on underscores to indicate
# pseudo-"private" attributes and methods; it looks gross but it helps
# clarify the intent (at least in my own mind).

""" Backend for exporting SBML files. """

from __future__ import division, unicode_literals

import json
import logging
import math
import re
import sys
import time

from collections import defaultdict, OrderedDict
from django import forms
from django.db.models import Max, Min
from django.template.defaulttags import register
from django.utils.translation import ugettext as _
from six import string_types

from ..models import (
    Attachment, Measurement, MeasurementType, MeasurementUnit, Metabolite, MetaboliteExchange,
    MetaboliteSpecies, Protocol, SBMLTemplate,
)
from ..utilities import interpolate_at, line_export_base


logger = logging.getLogger(__name__)


class SbmlForm(forms.Form):
    def __init__(self, *args, **kwargs):
        kwargs.setdefault('label_suffix', '')
        super(SbmlForm, self).__init__(*args, **kwargs)
        self.sbml_warnings = []


class SbmlExportSettingsForm(SbmlForm):
    """ Form used for selecting settings on SBML exports. """
    sbml_template = forms.ModelChoiceField(
        SBMLTemplate.objects.all(),  # TODO: potentially narrow options based on current user?
        empty_label=None,
        label=_('SBML Template'),
    )


@register.filter(name='scaled_x')
def scaled_x(point, x_range):
    """ Template filter calculates the relative X value for SVG sparklines. """
    return ((point.x[0] / x_range[1]) * 450) + 10


class MeasurementChoiceField(forms.ModelMultipleChoiceField):
    """ Custom ModelMultipleChoiceField that changes the display of measurement labels. """
    def label_from_instance(self, obj):
        return obj.full_name


class SbmlExportMeasurementsForm(SbmlForm):
    """ Form used for selecting measurements to include in SBML exports. """
    measurementId = MeasurementChoiceField(
        queryset=Measurement.objects.filter(active=True),
        required=False,
        widget=forms.CheckboxSelectMultiple,
    )

    def __init__(self, *args, **kwargs):
        """
        Required:
            selection = a main.export.ExportSelection object defining the items for export
        Optional:
            types = a queryset or collection used to filter types of measurements to include
            protocols = a queryset or collection used to filter protocols to include
            baseline = another SbmlExportMeasurementsForm used to find timepoints where values
                should be interpolated
        """
        self._selection = kwargs.pop('selection', None)
        self._types = kwargs.pop('types', None)
        self._protocols = kwargs.pop('protocols', None)
        self._baseline = kwargs.pop('baseline', None)
        super(SbmlExportMeasurementsForm, self).__init__(*args, **kwargs)
        f = self.fields['measurementId']
        f.queryset = self._selection.measurements.order_by(
            'assay__protocol__name', 'assay__name',
        ).prefetch_related(
            'measurementvalue_set',
        )
        if self._types is not None:
            f.queryset = f.queryset.filter(measurement_type__in=self._types)
        if self._protocols is not None:
            f.queryset = f.queryset.filter(assay__protocol_id__in=self._protocols)
        if f.queryset.count() == 0:
            self.sbml_warnings.append(_('No protocols have usable data.'))
        else:
            f.initial = f.queryset

    def clean(self):
        """ Upon validation, also inserts interpolated value points matching points available in
            baseline measurements for the same line. """
        data = super(SbmlExportMeasurementsForm, self).clean()
        # TODO
        return data

    def measurement_split(self):
        """ Generator which yields a Measurement object and the widget used to select the same. """
        for index, measurement in enumerate(self.measurement_list):
            yield (measurement, self.measurement_widgets[index])

    def protocol_split(self):
        """ Generator which yields a Protocol name and a list of
            (Measurement object, Measurement select widget) tuples. """
        prev_protocol = None
        items = []
        # loop over all the choices in the queryset
        for index, measurement in enumerate(self.measurement_list):
            protocol = measurement.assay.protocol
            # when the protocol changes, yield the protocol and the choices using it
            if protocol != prev_protocol:
                if prev_protocol is not None:
                    yield (prev_protocol, items)
                prev_protocol = protocol
                items = []
            items.append((measurement, self.measurement_widgets[index]))
        # at the end, yield the final choices
        yield (prev_protocol, items)

    def x_range(self):
        """ Returns the bounding range of X-values used for all Measurements in the form. """
        f = self.fields['measurementId']
        x_range = f.queryset.aggregate(
            max=Max('measurementvalue__x'), min=Min('measurementvalue__x')
        )
        # can potentially get None if there are no values; use __getitem__ default AND `or [0]`
        x_max = x_range.get('max', [0]) or [0]
        x_min = x_range.get('min', [0]) or [0]
        # max and min are both still arrays, grab the first element
        return (x_min[0], x_max[0])

    def _get_measurements(self):
        # lazy eval and try not to query more than once
        # NOTE: still gets evaled at least three times: populating choices, here, and validation
        if not hasattr(self, '_measures'):
            field = self.fields['measurementId']
            self._measures = list(field.queryset)
        return self._measures
    measurement_list = property(_get_measurements,
                                doc='A list of Measurements included in the form')

    def _get_measurement_widgets(self):
        # lazy eval and try not to query more than once
        if not hasattr(self, '_measure_widgets'):
            widgets = self['measurementId']
            self._measure_widgets = list(widgets)
        return self._measure_widgets
    measurement_widgets = property(_get_measurement_widgets,
                                   doc='A list of widgets used to select Measurements')


class SbmlExportOdForm(SbmlExportMeasurementsForm):
    def clean(self):
        data = super(SbmlExportOdForm, self).clean()
        # TODO: check for gCDW/L/OD600 metadata on selected assays/lines
        return data


class SbmlExport(object):
    def __init__(self, *args, **kwargs):
        # get selected measurements, do processing
        pass


########################################################################
#
# LAYER 1: SBML MODEL PROCESSING
#
########################################################################
class SpeciesInfo(object):
    """ Simple class to store species information extracted from SBML model. """
    def __init__(self, species, parent_info):
        self.species = species
        self.id = species.getId()
        self.name = species.getName()
        self.is_duplicate = self.id in parent_info._species_by_id
        self.notes = {}
        if not self.is_duplicate:
            parent_info._species_by_id[self.id] = self
            if species.isSetNotes():
                self.notes = parse_sbml_notes_to_dict(species.getNotes())

    @property
    def n_notes(self):
        return len(self.notes)

    def __hash__(self):
        return self.id.__hash__()

    def __str__(self):
        return self.id

    def assign_concentration(self, minimum, maximum, values):
        assert(len(values) > 0)
        value = sum(values) / len(values)
        self.notes["CONCENTRATION_CURRENT"] = [str(value)]
        if minimum is not None:
            self.notes["CONCENTRATION_LOWEST"] = [str(minimum)]
        if maximum is not None:
            self.notes['CONCENTRATION_HIGHEST'] = [str(maximum)]
        self.species.setNotes(create_sbml_notes_object(self.notes))


class ReactionInfo(object):
    """ Simple class to store reaction information extracted from SBML model. """
    def __init__(self, reaction, parent_info):
        self.reaction = reaction
        self.id = reaction.getId()
        self.is_duplicate = self.id in parent_info._reactions_by_id
        self.parent_info = parent_info
        self.notes = {}
        self.gene_ids = []
        self.protein_ids = []
        if not self.is_duplicate:
            parent_info._reactions_by_id[self.id] = self
            if reaction.isSetNotes():
                self.notes = parse_sbml_notes_to_dict(reaction.getNotes())
                self.extract_gene_association()
                self.extract_protein_association()

    @property
    def n_notes(self):
        return len(self.notes)

    def __hash__(self):
        return self.id.__hash__()

    def __str__(self):
        return self.id

    def extract_gene_association(self):
        """ NOTE, TODO: We are currently treating an association with a gene name as an additional
            association with a protein of the same name, and vice-versa. This is not necessarily
            correct, but it helps us deal with naming scheme conflicts.
            However, the display in the old EDD does not appear to reflect this convention! """
        for assoc_string in self.notes.get("GENE_ASSOCIATION", []):
            for genes in parse_note_string_boolean_logic(assoc_string):
                for gene in genes:
                    self.gene_ids.append(gene)
                    self.parent_info._gene_reactions[gene].append(self)
                    self.protein_ids.append(gene)
                    self.parent_info._protein_reactions[gene].append(self)

    def extract_protein_association(self):
        """ See docstring on extract_gene_association. """
        for assoc_string in self.notes.get("PROTEIN_ASSOCIATION", []):
            for proteins in parse_note_string_boolean_logic(assoc_string):
                for protein in proteins:
                    self.protein_ids.append(protein)
                    self.parent_info._protein_reactions[protein].append(self)
                    self.gene_ids.append(protein)
                    self.parent_info._gene_reactions[protein].append(self)

    def update_notes(self, transcripts, proteins):
        # note that using "%g" in the format strings will convert integral
        # doubles to integer format - this isn't really necessary but it is
        # consistent with the old EDD and thus makes testing easier
        if (len(transcripts) > 0):
            gene_tr_str = " ".join(["%s=%g" % (gid, v) for gid, v in transcripts.iteritems()])
            self.notes["GENE_TRANSCRIPTION_VALUES"] = [gene_tr_str]
        if (len(proteins) > 0):
            prot_str = " ".join(["%s=%g" % (pid, v) for pid, v in proteins.iteritems()])
            self.notes["PROTEIN_COPY_VALUES"] = [prot_str]
        self.reaction.setNotes(create_sbml_notes_object(self.notes))


class ExchangeInfo(object):
    """ Simple class to store exchange information extracted from SBML model.
        TODO: refactor with ReactionInfo; both are used to store info about reactions, but one is
        specific to gene and protein values, the other to metabolite fluxes. It might make more
        sense to consolidate into a single class. """
    def __init__(self, reaction, parent_info, is_biomass_rxn=False):
        self.reaction = reaction
        self.name = reaction.getName()
        reactants = reaction.getListOfReactants()
        self.n_reactants = len(reactants)
        self.ex_id = reaction.getId()
        self.re_id = None
        self.reject = True
        # The reaction must have a kinetic law declared inside it
        self.kin_law = reaction.getKineticLaw()
        self.stoichiometry = self.lb_value = self.ub_value = None
        self.ub_param = self.lb_param = None

        def format_list(l):
            return " + ".join(["%s * %s" % (r.getStoichiometry(), r.getSpecies()) for r in l])

        self.reaction_desc = "%(id)s: %(react)s%(sep)s%(prod)s" % {
            'id': self.ex_id,
            'react': format_list(self.reaction.getListOfReactants()),
            'sep': " <=> " if self.reaction.getReversible() else " -> ",
            'prod': format_list(self.reaction.getListOfProducts()),
        }
        # There must be one, and only one, reactant
        if is_biomass_rxn or self.n_reactants == 1:
            if not is_biomass_rxn:
                self.re_id = reactants[0].getSpecies()  # returns ID not object
                self.stoichiometry = reactants[0].getStoichiometry()
            # The single reactant must be exactly 1 unit of the given metabolite
            # (no fractional exchange)
            if is_biomass_rxn or (self.stoichiometry == 1 and self.kin_law is not None):
                self.ub_param = self.kin_law.getParameter("UPPER_BOUND")
                self.lb_param = self.kin_law.getParameter("LOWER_BOUND")
                if self.lb_param is not None and self.lb_param.isSetValue():
                    self.lb_value = self.lb_param.getValue()
                    if self.ub_param is not None and self.ub_param.isSetValue():
                        self.ub_value = self.ub_param.getValue()
                        self.reject = False
                        if not is_biomass_rxn:
                            parent_info._exchanges_by_id[self.ex_id] = self
                            parent_info._reactant_to_exchange[self.re_id].append(self)

    def upper_bound(self):
        return str(self.ub_value)

    def lower_bound(self):
        return str(self.lb_value)

    def bad_status_symbol(self):
        if self.n_reactants != 1:
            return "%dRs" % self.n_reactants
        elif self.stoichiometry != 1:
            return "%dSt" % self.stoichiometry
        elif self.kin_law is None:
            return "!KN"
        elif self.lb_param is None:
            return "!LB"
        elif self.lb_value is None:
            return "!LB#"
        elif self.ub_param is None:
            return "!UB"
        elif self.ub_value is None:
            return "!UB#"
        return None

    def __str__(self):
        return self.reaction_desc

    def assign_flux_value(self, values):
        assert(len(values) > 0)
        value = sum(values) / len(values)
        if (self.kin_law is None):
            raise ValueError("no kinetic law found")
        if (self.ub_param is None):
            raise ValueError("No UPPER_BOUND parameter found")
        if (self.lb_param is None):
            raise ValueError("No LOWER_BOUND parameter found")
        self.ub_param.setValue(value)
        self.lb_param.setValue(value)
        return len(values)


# adapted from UtilitiesSBML.pm:parseSBML
class sbml_info(object):
    """ Base class for processing an SBML template and extracting information for display in a
        view and/or further processing w.r.t. assay data. In the production environment (e.g. as
        used within line_sbml_data) this would normally be instantiated without arguments, but
        optional keywords are allowed to facilitate testing.

        :param i_template: index of SBMLTemplate to select (starting at 0) - TESTING ONLY
        :param template_id: database key for SBMLTemplate to select - TESTING ONLY
        :param sbml_file: SBML file to parse directly instead of pulling this from
            the SBMLTemplate object - TESTING ONLY
    """
    def __init__(self, i_template=None, template_id=None, sbml_file=None):
        self._sbml_templates = list(SBMLTemplate.objects.all())
        self._chosen_template = None
        self._sbml_doc = None
        self._sbml_model = None
        self._sbml_species = []
        self._sbml_reactions = []
        self._sbml_exchanges = []
        self._species_by_id = {}   # indexed by species_id
        self._reactions_by_id = {}
        self._exchanges_by_id = {}
        self._species_to_metabolites = {}
        self._exchanges_to_metabolites = {}
        self._gene_reactions = defaultdict(list)   # indexed by gene ID
        self._protein_reactions = defaultdict(list)   # indexed by protein ID
        self._reactant_to_exchange = defaultdict(list)
        self._resolved_species = OrderedDict()
        self._resolved_exchanges = OrderedDict()
        self.biomass_exchange = None  # XXX accessed directly by HTML template
        self._all_metabolites = Metabolite.objects.order_by('short_name')
        self._metabolites_by_id = {m.id: m for m in self._all_metabolites}
        # TODO: there must be a better way; short_name is not guaranteed to be unique
        self._biomass_metab = MeasurementType.objects.get(short_name="OD")
        self._modified = set()  # track altered DB records - mostly for testing
        # these are populated later from assay data
        self._gene_transcription_values = {}
        self._protein_values = {}
        self._reactions_requiring_notes_update = set()
        # XXX the processing can optionally be done at the time of initialization
        # to facilitate JSON data export independent of assay data
        if (i_template is not None) or (template_id is not None):
            self._select_template(i_template=i_template, template_id=template_id)
            self._process_sbml(sbml_file=sbml_file)

    def _select_template(self, i_template=None, template_id=None):
        assert ([i_template, template_id].count(None) == 1)
        if (i_template is not None):
            self._chosen_template = self._sbml_templates[i_template]
        else:
            self._chosen_template = SBMLTemplate.objects.get(id=template_id)

    def _process_sbml(self, sbml_file=None):
        sbml = None
        if (sbml_file is not None):
            import libsbml
            sbml = libsbml.readSBML(sbml_file.encode('utf-8'))
        else:
            if (self._chosen_template is None):
                raise RuntimeError("You must call self._select_template(i) before "
                                   "self._process_sbml()!")
            sbml = self._chosen_template.parseSBML()
        model = sbml.getModel()
        self._sbml_doc = sbml
        self._sbml_model = model
        self._build_info_objects(model)

        # In this loop we're attempting to munge the name of a metabolite type so
        # that it matches the name of any one species, and any one reactant in the
        # detected exchanges
        known_exchanges = MetaboliteExchange.objects.filter(
            sbml_template_id=self._chosen_template.id)
        known_species = MetaboliteSpecies.objects.filter(
            sbml_template_id=self._chosen_template.id)
        exchanges_by_metab_id = {
            e.measurement_type_id: self._exchanges_by_id.get(e.exchange_name, None)
            for e in known_exchanges
        }
        species_by_metab_id = {
            s.measurement_type_id: self._species_by_id[s.species]
            for s in known_species
        }
        for met in self._all_metabolites:
            self._process_metabolite(met, exchanges_by_metab_id, species_by_metab_id)
        # finally, biomass reaction
        if (self.biomass_reaction_id() != ""):
            try:
                biomass_rxn = model.getReaction(self.biomass_reaction_id())
                assert (biomass_rxn is not None)
            except Exception as e:
                raise ValueError("Can't find biomass exchange reaction '%s' in "
                                 "selected SBML template: %s" % self.biomass_reaction_id(), e)
                # TODO if this fails should it be an error?
            self.biomass_exchange = ExchangeInfo(biomass_rxn, self, is_biomass_rxn=True)
            # self._resolved_exchanges[biomass_metab.id] = self.biomass_exchange

    def _build_info_objects(self, model):
        for species in model.getListOfSpecies():
            self._sbml_species.append(SpeciesInfo(species, self))
        for reaction in model.getListOfReactions():
            self._sbml_reactions.append(ReactionInfo(reaction, self))
        for reaction in model.getListOfReactions():
            self._sbml_exchanges.append(ExchangeInfo(reaction, self))

    def _process_metabolite(self, met, exchanges_by_metab_id, species_by_metab_id):
        mname = met.short_name  # first we grab the unaltered name
        # Then we create a version using the standard symbol substitutions.
        mname_transcoded = generate_transcoded_metabolite_name(mname)
        # The first thing we check for is the presence of a pre-defined pairing,
        # of this metabolite type to an ID string.
        ex_resolved = exchanges_by_metab_id.get(met.id, None)
        # If that doesn't resolve, we then begin a trial-and-error process of
        # matching, running through a list of potential names in search of
        # something that resolves.
        if (ex_resolved is None):
            reactant_names_to_try = [
                mname,
                mname_transcoded,
                "M_" + mname + "_e",
                "M_" + mname_transcoded + "_e",
                "M_" + mname_transcoded + "_e_",
            ]
            for name in reactant_names_to_try:
                ex_resolved = self._reactant_to_exchange.get(name, [None])[0]
                if (ex_resolved is not None):
                    break
        if (ex_resolved is not None):
            self._resolved_exchanges[met.id] = ex_resolved
            self._exchanges_to_metabolites[ex_resolved.ex_id] = met
        # Do the same run for species ID matchups.
        sp_resolved = species_by_metab_id.get(met.id, None)
        if (sp_resolved is None):
            names = generate_species_name_guesses_from_metabolite_name(mname)
            for name in names:
                sp_resolved = self._species_by_id.get(name, None)
                if (sp_resolved is not None):
                    break
        if (sp_resolved is not None):
            self._resolved_species[met.id] = sp_resolved
            self._species_to_metabolites[sp_resolved.id] = met

    def _unique_resolved_exchanges(self):
        return set([ex.ex_id for ex in self._resolved_exchanges.values() if ex is not None])

    def _have_gene_in_model(self, gene_id):
        return len(self._gene_reactions.get(gene_id, [])) > 0

    def _have_protein_in_model(self, protein_id):
        return len(self._protein_reactions.get(protein_id, [])) > 0

    # ---------------------------------------------------------------------
    # EXPORT-SPECIFIC FUNCTIONS
    #
    # This subroutine is passed a Metabolite Type ID and a species ID (likely
    # drawn from a form element).  It checks to see if the type matches a species
    # parsed from the current SBML model.  If it does, the Metabolite Type is
    # reassigned to the species and the species ID is returned.  If it doesn't,
    # the function returns the species that is currently assigned, or an empty
    # string if None.
    # TODO this needs testing for sure!
    def _reassign_metabolite_to_species(self, metabolite, species_id):
        if (species_id is not None):
            # If the value is defined as an empty string, we should take that as a
            # signal to delete any 'custom' connections between the given measurement
            # and any reactant, and then return the default.
            if (str(species_id) == ""):
                logger.debug("DELETING RECORD: %d:%d" % (self._chosen_template.id, metabolite.id))
                MetaboliteSpecies.objects.filter(
                    sbml_template_id=self._chosen_template.id,
                    measurement_type_id=metabolite.id
                ).delete()
                self._modified.add(str(species_id))
        else:
            species_id = ""
        logger.debug("\treassign 1: %s : %s" % (metabolite.id, species_id))
        # If the given species ID doesn't resolve to anything, it's got to be an
        # erroneous value entered by a user, and we should return the current
        # association with the measurement type if there is one.
        temp_species = self._species_by_id.get(species_id, None)
        if (temp_species is None):
            sp = self._resolved_species.get(metabolite.id, None)
            logger.debug('\tresolved %s to %s' % (metabolite.id, sp))
            if (sp is None):
                return ""
            return sp.id
        # If the pairing is the same as the current one, return the given ID with
        # no effect.
        old_met = self._species_to_metabolites.get(species_id, None)
        if (old_met is not None) and (old_met.id == metabolite.id):
            return species_id
        # Since the pairing is different, or doesn't exist, we need to
        # update/create it.  (We know the species ID is valid by now.)
        # First, clear out the old record:
        try:
            logger.debug("DELETING RECORD 2: %d:%d" % (self._chosen_template.id, metabolite.id))
            MetaboliteSpecies.objects.filter(
                sbml_template_id=self._chosen_template.id,
                measurement_type_id=metabolite.id
            ).delete()
            self._modified.add(species_id)
        except Exception as e:
            logger.exception('Failed to delete metabolite species record: %s', e)
        # insert the new record
        logger.debug("CREATING RECORD %s:%s" % (metabolite.short_name, species_id))
        MetaboliteSpecies.objects.create(
            sbml_template=self._chosen_template,
            measurement_type=metabolite,
            species=species_id
        )
        # Alter the internal hashes to reflect the change
        self._resolved_species[metabolite.id] = self._species_by_id[species_id]
        self._species_to_metabolites[species_id] = metabolite
        self._modified.add(species_id)

    # XXX this works exactly like the previous method
    # TODO also testing
    def _reassign_metabolite_to_reactant(self, metabolite, exchange_id):
        exchange_id = str(exchange_id)
        if (exchange_id is not None):
            if (exchange_id == ""):
                logger.debug("DELETING EXCHANGE RECORD")
                MetaboliteExchange.objects.filter(
                    sbml_template_id=self._chosen_template.id,
                    measurement_type_id=metabolite.id
                ).delete()
                self._modified.add(exchange_id)
        else:
            exchange_id = ""
        if (self._exchanges_by_id.get(exchange_id, None) is None):
            ex = self._resolved_exchanges.get(metabolite.id, None)
            if (ex is None):
                return ""
            return ex.ex_id
        old_met = self._exchanges_to_metabolites.get(exchange_id, None)
        if (old_met is not None) and (old_met.id == metabolite.id):
            return exchange_id
        try:
            logger.debug("DELETING EXCHANGE RECORD 2")
            MetaboliteExchange.objects.filter(
                sbml_template_id=self._chosen_template.id,
                measurement_type_id=metabolite.id
            ).delete()
        except Exception as e:
            logger.exception('Failed to delete metabolite exchange record: %s', e)
        logger.debug("CREATING RECORD %s:%s" % (metabolite.short_name, exchange_id))
        MetaboliteExchange.objects.create(
            sbml_template=self._chosen_template,
            measurement_type=metabolite,
            reactant_name=self._exchanges_by_id[exchange_id].re_id,
            exchange_name=exchange_id
        )
        self._resolved_exchanges[metabolite.id] = self._exchanges_by_id[exchange_id]
        self._exchanges_to_metabolites[exchange_id] = metabolite
        self._modified.add(exchange_id)

    def _assign_concentration_to_species(self, mid, minimum, maximum, values):
        species = self._resolved_species.get(mid, None)
        if species is None:
            raise ValueError("no matching species")
        species.assign_concentration(minimum, maximum, values)

    def _assign_value_to_flux(self, mid, values):
        exchange = None
        if (mid == self._biomass_metab.id):
            exchange = self.biomass_exchange
        else:
            exchange = self._resolved_exchanges.get(mid, None)
        if exchange is None:
            raise ValueError("No exchange reaction matching metabolite %s" % mid)
        return exchange.assign_flux_value(values)

    def _assign_transcription_value_to_gene(self, gene_name, values):
        assert (len(values) >= 1)
        value = sum(values) / len(values)
        gene_reactions = self._gene_reactions.get(gene_name, [])
        if (len(gene_reactions) == 0):
            return None
        self._gene_transcription_values[gene_name] = value
        for rxn in gene_reactions:
            self._reactions_requiring_notes_update.add(rxn)
        return [rxn.id for rxn in gene_reactions]

    def _assign_value_to_protein(self, protein_name, values):
        assert (len(values) >= 1)
        value = sum(values) / len(values)
        protein_reactions = self._protein_reactions.get(protein_name, [])
        if (len(protein_reactions) == 0):
            return None
        self._protein_values[protein_name] = value
        for rxn in protein_reactions:
            self._reactions_requiring_notes_update.add(rxn)
        return [rxn.id for rxn in protein_reactions]

    # If we didn't do this en-masse after updating all the individual
    # transcription counts and protein values above, we would be doing a LOT of
    # extra work mucking around with XML structures with every call to
    # assignTranscriptionValueToGene, etc.
    def _update_all_gene_protein_notes(self):
        # We need to remake the notes piece for all reactions that are associated
        # with a gene, and to do that, we need to consolidate all the other
        # transcription values for each of those reactions as well.
        for rxn in self._reactions_requiring_notes_update:
            tr = {}  # all transcription values
            # It's possible to have stale gene info, but no protein info at all, and
            # vice versa... hence this if statement.
            if (len(rxn.gene_ids) > 0):
                for gene_id in rxn.gene_ids:
                    if (gene_id in self._gene_transcription_values):
                        tr[gene_id] = self._gene_transcription_values[gene_id]
            pr = {}  # all protein values
            if (len(rxn.protein_ids) > 0):
                for protein_id in rxn.protein_ids:
                    if (protein_id in self._protein_values):
                        pr[protein_id] = self._protein_values[protein_id]
            rxn.update_notes(tr, pr)
        return len(self._reactions_requiring_notes_update)

    def _add_notes(self, notes_dict):
        current_notes = {}
        if self._sbml_model.isSetNotes():
            current_notes = parse_sbml_notes_to_dict(self._sbml_model.getNotes())
        current_notes.update(notes_dict)
        sbml_notes = create_sbml_notes_object(current_notes)
        self._sbml_model.setNotes(sbml_notes)
        return len(current_notes), len(notes_dict)

    # ---------------------------------------------------------------------
    # "public" methods
    def selected_template_info(self):
        """
        Returns a dict summarizing the currently selected SBML template.
        """
        return {
            "id": self._chosen_template.id,
            "filename": self._chosen_template.xml_file.filename,
            "description": self._chosen_template.xml_file.description,
            "owner": self._chosen_template.xml_file.created.mod_by.get_full_name(),
            "biomass_ex_name": self._chosen_template.biomass_exchange_name,
        }

    @property
    def n_modified(self):
        return len(self._modified)

    def biomass_reaction_id(self):
        # XXX important - must be str, not unicode!
        return str(self._chosen_template.biomass_exchange_name)

    def template_info(self):
        """
        Returns a list of SBML template files and associated info as dicts.
        """
        return [{
            "file_name": m.xml_file.filename,
            "id": i,
            "template_id": m.id,
            "is_selected": m is self._chosen_template,
        } for i, m in enumerate(self._sbml_templates)]

    # SPECIES
    @property
    def n_sbml_species(self):
        return len([s for s in self._sbml_species if not s.is_duplicate])

    @property
    def n_sbml_species_notes(self):
        return len([s for s in self._sbml_species if s.n_notes > 0])

    def sbml_species(self):
        return self._sbml_species

    def species_note_counts(self):
        detected_notes = defaultdict(int)
        for sp in self._sbml_species:
            for key in sp.notes.keys():
                detected_notes[key] += 1
        return [{"key": k, "count": v} for k, v in detected_notes.iteritems()]

    # REACTIONS
    @property
    def n_sbml_reactions(self):
        return len([r for r in self._sbml_reactions if not r.is_duplicate])

    @property
    def n_sbml_reaction_notes(self):
        return len([r for r in self._sbml_reactions if r.n_notes > 0])

    def sbml_reactions(self):
        return self._sbml_reactions

    def reaction_note_counts(self):
        detected_notes = defaultdict(int)
        for rxn in self._sbml_reactions:
            for key in rxn.notes.keys():
                detected_notes[key] += 1
        return [{"key": k, "count": v} for k, v in detected_notes.iteritems()]

    # GENES AND PROTEINS
    @property
    def n_gene_associations(self):
        return len(self._gene_reactions.keys())

    @property
    def n_gene_assoc_reactions(self):
        reactions = set()
        for gr in self._gene_reactions.values():
            for rx in gr:
                reactions.add(rx.id)
        return len(reactions)

    @property
    def n_protein_associations(self):
        return len(self._protein_reactions.keys())

    @property
    def n_protein_assoc_reactions(self):
        reactions = set()
        for pr in self._protein_reactions.values():
            for rx in pr:
                reactions.add(rx.id)
        return len(reactions)

    # MORE REACTIONS
    @property
    def n_exchanges(self):
        # XXX actually, only the okay ones
        return len([ex for ex in self._sbml_exchanges if not ex.reject])

    def exchanges(self):
        return self._sbml_exchanges

    # MEASUREMENT TYPE RESOLUTION
    @property
    def n_meas_types_resolved_to_species(self):
        return len([s for s in self._resolved_species.values() if s is not None])

    @property
    def n_meas_types_unresolved_to_species(self):
        return self._resolved_species.values().count(None)

    @property
    def n_meas_types_resolved_to_exchanges(self):
        return len([e for e in self._resolved_exchanges.values() if e is not None])

    @property
    def n_meas_types_unresolved_to_exchanges(self):
        return self._resolved_exchanges.values().count(None)

    @property
    def n_measurement_types(self):  # XXX actually number of Metabolites
        return len(self._all_metabolites)

    def measurement_type_resolution(self):
        result = []
        for metabolite in self._all_metabolites:
            if metabolite.id not in self._resolved_species:
                continue
            result.append({
                'name': metabolite.short_name,
                'species': self._resolved_species.get(metabolite.id, None),
                'exchange': self._resolved_exchanges.get(metabolite.id, None),
            })
        return result

    @property
    def n_exchanges_resolved(self):
        return len(self._unique_resolved_exchanges())

    @property
    def n_exchanges_not_resolved(self):
        return self.n_exchanges - self.n_exchanges_resolved

    def unresolved_exchanges(self):
        result = []
        resolved = self._unique_resolved_exchanges()
        for ex in self._sbml_exchanges:
            if (ex.re_id is not None) and (ex.ex_id not in resolved):
                result.append({
                    'reactant': ex.re_id,
                    'exchange': ex.ex_id,
                })
        return result

    # FIXME this is really gross, but the mappings to metabolites depend on any
    # modifications made up to this point, so AJAX won't work...
    def export_JSON(self):
        """
        Generate a dictionary that will be embedded in the template as part of a
        JavaScript block.
        """
        exchanges = []
        for exchange_id in self._exchanges_by_id.keys():
            exchange_info = self._exchanges_by_id[exchange_id]
            paired_metabolite = None
            if (exchange_id in self._exchanges_to_metabolites):
                m = self._exchanges_to_metabolites[exchange_id]
                paired_metabolite = m.short_name
            exchanges.append({
                "rid": str(exchange_info.re_id),
                "exid": str(exchange_id),
                "exn": str(exchange_info.name),
                "cp": str(paired_metabolite),
            })
        species = []
        for species_id in self._species_by_id.keys():
            species_info = self._species_by_id[species_id]
            paired_metabolite = ""
            if (species_id in self._species_to_metabolites):
                paired_metabolite = self._species_to_metabolites[species_id].short_name
            species.append({
                "sid": str(species_id),
                "spn": str(species_info.name),
                "cp": str(paired_metabolite),
            })
        return json.dumps({
            "ExchangeIDs": range(len(exchanges)),
            "Exchanges": {str(i+1): e for i, e in enumerate(exchanges)},
            "SpeciesIDs": range(len(species)),
            "Species": {str(i+1): s for i, s in enumerate(species)},
        })


def parse_sbml_notes_to_dict(notes):
    if (notes is None):
        return {}
    notes_dict = defaultdict(list)
    # Properly formated notes sections contain a body element.  If one exists,
    # we will descend into it.  Otherwise we will pretend we are already in one,
    # and proceed.
    notes_body = notes
    if notes_body.hasChild("body"):
        notes_body = notes_body.getChild(0)
    for i in range(notes_body.getNumChildren()):
        # The body element should contain a sequence of direct children, of
        # arbitrary type (<p>, <div>, <span>, etc) (<p> is the official standard.)
        node = notes_body.getChild(i)
        # If it contains no text, or is itself a text node, it will have no
        # children.  We should skip it in either case.
        if (node.getNumChildren() == 0):
            continue
        as_str = node.getChild(0).toXMLString()
        # Each line of the notes is text in the format "NAME:content",
        # or possibly a name followed by arbitrary XML under one child:
        # "NAME:<ul><li>Thing1</li><li>stuff3</li></ul>"
        key, content = as_str.split(":")
        key = re.sub("^\s+|\s+$", "", key)
        if (key == ""):
            continue
        if (node.getNumChildren() > 1):
            content = node.getChild(1)
        else:
            content = re.sub("^\s+|\s+$", "", content)
        notes_dict[key].append(content)
    return notes_dict


# TODO it would be much better to use a proper lexer capable of handling
# arbitrary nesting
def parse_note_string_boolean_logic(note):
    """
    This code is designed to parse various ugly badly-formed strings that contain
    boolean logic,  returning the detected entities in an array-of-arrays
    structure that mirrors the logic and order observed.

    For example, each of the following lines:
        ((CysA  and  CysU  and  CysW  and  b3917) or (b2422  and  CysP  and  CysU  and  b2423))
        (CysA and CysU and CysW and b3917) or (b2422 and CysP and CysU and b2423)
    Will become:
        [['CysA', 'CysU', 'CysW', 'b3917'], ['b2422', 'CysP', 'CysU', 'b2423']]

    And, each of the following lines:
        <p>: (b2221 and b2222)</p>
        (b2221  and  b2222)
        b2221 and b2222
    Will become:
        [['b2221', 'b2222']]

    Furthermore, each of the following strings, regardless of whitespace:
        None
        N.A.
    Will become:
        []
    """
    aa = []
    # If this is a reference to an object, then the following command will return
    # an integer address of the object referenced.  If it's a scalar, the command
    # will return undefined.  We're using this fact as a boolean test for whether
    # we should treat this item as a scalar or as a LibSBML::XMLNode object that
    # needs traversing.
    if not isinstance(note, string_types):
        if note.getNumChildren():
            note = note.getChild(0)
        note = note.toXMLString()
    # Why did we do the above? Because sometimes Hector's code lists gene
    # associations like so:
    # <html:p> GENE_ASSOCIATION :<p>: (b2221 and b2222)</p></html:p>
    # I have no idea why.
    # Hector's code sometimes prepends a spurious colon for no reason
    note = re.sub("^[\s]*:[\s]*", "", note)
    if (note == ""):  # Sometimes Hector's code embeds ": " followed by NOTHING.
        return aa
    # We don't (yet) care about the logic embedded in the association of genes,
    # so we split it without regard to nesting parentheses.
    for major_part in note.split(" or "):
        a = []
        for name in major_part.split(" and "):
            name = re.sub("[\(\)\s]", "", name)  # Remove all parenthesis and spaces
            # Hector's code embeds this about 1/10th of the time.  Dunno why
            if (name == "None") or (name == "N.A."):
                continue
            a.append(name)
        if (len(a) > 0):
            aa.append(a)
    return aa


# "Transcoded" means that we make it friendlier for SBML species names,
# which means we translate symbols that are allowed in EDD metabolite names
# like "-" to things like "_DASH_".
def generate_transcoded_metabolite_name(mname):
    # This is a hack to adapt two specific metabolites from their
    # "-produced" and "-consumed" variants to their ordinary names.
    # It's needed here because the original variants are considered
    # "rates", while the metabolites we're matching to are not.
    if (mname == "CO2p"):
        mname = "co2"
    elif (mname == "O2c"):
        mname = "o2"
    return re.sub("-", "_DASH_", re.sub(
        "\(", "_LPAREN_", re.sub(
            "\)", "_RPAREN_", re.sub(
                "\[", "_LSQBKT_", re.sub(
                    "\]", "_RSQBKT_", mname)))))


# This returns an array of possible SBML species names from a metabolite name.
# FIXME should this distinguish between compartments?
def generate_species_name_guesses_from_metabolite_name(mname):
    mname_transcoded = generate_transcoded_metabolite_name(mname)
    return [
        mname,
        mname_transcoded,
        "M_" + mname + "_c",
        "M_" + mname_transcoded + "_c",
        "M_" + mname_transcoded + "_c_",
    ]


def create_sbml_notes_object(notes):
    """
    Convert a Python dictionary or equivalent to native SBML objects.
    """
    import libsbml
    notes_dict = dict(notes)
    notes = libsbml.XMLNode()
    triple = libsbml.XMLTriple("body", "", "")
    att = libsbml.XMLAttributes()
    ns = libsbml.XMLNamespaces()
    ns.add("http://www.w3.org/1999/xhtml", "")
    token = libsbml.XMLToken(triple, att, ns)
    body_node = libsbml.XMLNode(token)
    ns.clear()
    triple2 = libsbml.XMLTriple("p", "", "")
    token2 = libsbml.XMLToken(triple2, att, ns)
    for header in notes_dict.keys():
        for line in notes_dict[header]:
            tt = libsbml.XMLToken(('%s:%s' % (header, line)).encode('utf-8'))
            n = libsbml.XMLNode(tt)
            node = libsbml.XMLNode(token2)
            node.addChild(n)
            body_node.addChild(node)
    notes.addChild(body_node)
    return notes


########################################################################
#
# LAYER 2: ASSAY DATA PROCESSING
#
########################################################################
class line_assay_data(line_export_base):
    """ Manager for processing assay measurements and calculating metabolite fluxes, which merges
        all functionality of parent classes. """

    def __init__(self, study, lines, form, debug=False):
        if (len(lines) == 0):
            raise ValueError("No lines found for export.")
        line_export_base.__init__(self, study, lines)
        self.form = form
        self.debug = debug
        self.submitted_from_export_page = form.get("formSubmittedFromSBMLExport", 0)
        self.protocols = Protocol.objects.all()
        self._protocols_by_category = {}
        self.primary_line_name = lines[0].name
        # Initializing these for use later
        # Get a master set of all timestamps that contain data, separated according
        # to Line ID.
        self._od_times_by_line = defaultdict(dict)
        self.have_gcdw_metadata = False
        self._od_measurements = []
        # We will eventually use this 'checked' hash as a filter for all the
        # Measurements we intend to process and embed
        self._metabolites_checked = {}
        self._transcriptions_checked = set()
        self._proteins_checked = set()
        self._metabolite_is_input = {}
        self._usable_metabolites_by_assay = defaultdict(list)
        self._proteomics_by_assay = defaultdict(list)
        self._transcription_by_assay = defaultdict(list)
        self._measurement_ranges = {}
        self._usable_protocols = defaultdict(list)  # keyed by protocol category
        self._usable_assays = defaultdict(list)  # keyed by protocol name
        # this one isn't currently used for anything other than counting - we
        # could just as easily replace 'list' with 'int'
        self._usable_measurements = defaultdict(list)  # keyed by protocol category
        # this tracks what measurement values are the result of interpolation
        self.interpolated_measurement_timestamps = defaultdict(set)
        # RAMOS stuff
        self.need_ramos_units_warning = False
        #
        self.have_transcriptomics_to_embed = False
        self.have_proteomics_to_embed = False
        # this tracks processed measurement data (possibly interpolated)
        self._processed_metabolite_data = []
        self._processed_carbon_ratio_data = []
        self._comprehensive_valid_OD_mtimes = []
        self._metabolite_minima = {}
        self._metabolite_maxima = {}
        # This is where we'll accumulate our processed concentration and flux data.
        # A multi-level hash, creating a hierarchy from Timestamps to Metabolites
        # to values.  When it comes time to embed this in the SBML, we'll
        # aggregate all the  datafor each metabolite/timestamp and produce an
        # upper and lower bound with a sensible margin of error.
        self._flux_data_by_metabolite = defaultdict(dict)
        self._species_data_by_metabolite = defaultdict(dict)
        self._carbon_data_by_metabolite = defaultdict(dict)
        self._species_data_types_available = set()
        self._flux_data_types_available = set()
        # biomass gets its own
        self._biomass_data = defaultdict(list)
        self._ramos_conversion = {}

    def run(self):
        """ Run the series of processing steps. """
        # Okay, ready to extract data!
        t1 = time.time()
        self._step_0_pre_fetch_data()
        t2 = time.time()
        self._step_2_get_od_data()
        self._step_3_get_hplc_data()
        self._step_4_get_lcms_data()
        self._step_5_get_ramos_data()
        self._step_6_get_transcriptomics_proteomics()
        self._step_7_calculate_fluxes()
        t3 = time.time()
        self._fetch_time = (t2 - t1)
        self._setup_time = (t3 - t1)
        return self

    def _get_protocols_by_category(self, category_name):
        protocols = [p for p in self.protocols if p.categorization == category_name]
        self._protocols_by_category[category_name] = protocols
        return protocols

    # XXX CACHING STUFF (see utilities.py)
    def _step_0_pre_fetch_data(self):
        if self.debug:
            logger.debug("STEP 0: pre-fetching measurement data")
        self._fetch_cache_data()

    def _find_min_max_x_in_measurements(self, measurements, defined_only=None):
        """
        Find the minimum and maximum X values across all data in all given
        that have unset Y values before determining range.
        """
        xvalues = set()
        for m in measurements:
            mdata = self._get_measurement_data(m.id)
            for md in mdata:
                if (md.y is not None and len(md.y)):
                    xvalues.add(md.fx)
        xvalues = list(xvalues)
        return min(xvalues), max(xvalues)

    def _is_concentration_measurement(self, measurement):
        units = self._get_y_axis_units_name(measurement.id)
        return (units in ["mg/L", "g/L", "mol/L", "mM", "uM", "Cmol/L"])

    def _step_2_get_od_data(self):
        """
        Step 2: Find and filter OD Data
        """
        if self.debug:
            logger.debug("STEP 2: filter OD data")
        od_protocols = self._get_protocols_by_category(Protocol.CATEGORY_OD)
        if (len(od_protocols) == 0):
            raise ValueError("Cannot find the OD600 protocol by name!")
        assert (len(od_protocols) == 1)
        mt_meas_type = MeasurementType.objects.get(short_name="OD")
        # TODO look for gCDW/L/OD600 metadata
        self._usable_protocols["OD"] = od_protocols
        protocol_name = od_protocols[0].name
        od_assays = self._assays.get(od_protocols[0].id, [])
        # XXX do we still need to cross-reference with selected lines? I think not
        if (len(od_assays) == 0):
            raise ValueError("Line selection does not contain any OD600 Assays. "
                             "Biomass measurements are essential for FBA.")
        # Sort the Assays alphabetically by Line/Assay and take the first from the
        # list as the default.
        od_assays.sort(key=lambda a: a.name)
        od_assays.sort(key=lambda a: a.line.name)
        for assay in od_assays:
            all_meas = self._get_measurements(assay.id)
            assay_meas = [m for m in all_meas if m.measurement_type_id == mt_meas_type.id]
            self._od_measurements.extend(assay_meas)
            if (len(assay_meas) > 0):
                self._usable_assays[protocol_name].append(assay)
        if (len(self._od_measurements) == 0):
            raise ValueError("Assay selection has no Optical Data measurements "
                             "entered.  Biomass measurements are essential for FBA.")
        # Use all OD Measurements we can by default
        selected_od_meas = self._od_measurements
        if self.submitted_from_export_page:
            selected_od_meas = []
            for m in self._od_measurements:
                form_key = "measurement%dinclude" % m.id
                if (form_key in self.form):
                    selected_od_meas.append(m)
        for od_meas in selected_od_meas:
            self._metabolites_checked[od_meas.id] = True
        # get X-value limits now and store for later
        min_od_x, max_od_x = self._find_min_max_x_in_measurements(
            self._od_measurements,
            defined_only=True)
        self._measurement_ranges["OD"] = (min_od_x, max_od_x)
        if (len(selected_od_meas) == 0):
            raise ValueError("No Optical Data measurements were selected. "
                             "Biomass measurements are essential for FBA.")
        # We should only spew information about the utilization of GCDW calibration
        # metadata once, per occurrence of the metadata at the Line/Assay level, or
        # per lack of it at the Line level.
        # logged_about_GCDW_in_assay = {}
        # logged_about_GCDW_in_line = {}
        self.used_generic_GCDW_in_assays = len(selected_od_meas)  # XXX should be 0
        gcdw_calibrations = {a.id: 0.65 for a in od_assays}  # XXX should be empty
        # Here we verify that there is a GCDW calibration factor set for every
        # Assay, appropriating it from the enclosing Line, or choosing the default,
        # as necessary.
        # TODO
        # The next set of calculations is a bit difficult.  When we're trying to
        # compute reasonable intermediate values for sets of data that may not have
        # the same number of measurements in the same places, we need to be careful.
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
        for m in selected_od_meas:
            od_measurements_by_line[m.assay.line_id].append(m)
        # Time to work on self.od_times_by_line, the set of all timestamps that
        # contain data
        for m in selected_od_meas:
            mdata = self._get_measurement_data(m.id)
            xvalues = [md.fx for md in mdata if md.fy is not None]
            for h in xvalues:
                self._od_times_by_line[m.assay.line_id][h] = 0
        # For each Line, we take the full set of valid timstamps,
        # then walk through each set of OD Measurements and attempt to find a value
        # for that timestamp based on the data in that Measurement.
        # If we don't find an exact value, we calculate one based on a weighted
        # average of nearest neighbors.  [No curve fitting or anything fancy here,
        # just numpy.interp(...)]  Then we apply the calibration factor to our
        # result, and store it in a list.  Finally, we average everything on each
        # list, and declare that value to be the official calibrated OD at that
        # timestamp for that Line.
        for line_id in self._od_times_by_line.keys():
            all_times = self._od_times_by_line[line_id].keys()
            for t in all_times:
                y_values = []
                for odm in od_measurements_by_line[line_id]:
                    gcdw_cal = gcdw_calibrations[odm.assay_id]
                    md = [md for md in self._get_measurement_data(odm.id) if md.fx == t]
                    # If a value is already defined at this timestamp for this
                    # measurement, no need to attempt to calculate an average.
                    if len(md) > 0:
                        assert (len(md) == 1)
                        y_values.append(md[0].fy * gcdw_cal)
                        continue
                    y_interp = interpolate_at(md, t)
                    if (y_interp is not None):
                        y_values.append(y_interp * gcdw_cal)
                assert (len(y_values) > 0)
                self._od_times_by_line[line_id][t] = sum(y_values) / len(y_values)
            # We have now created a master set of calibrated OD values for each Line,
            # using every available hard data point in the available Assays.  At this
            # point, self._od_times_by_line contains timestamps that cover all of the
            # points for which I want to generate fluxes.
        # Make a list of all the Line IDs that have at least two points of OD
        # data to work with.
        lines_with_useful_od = [
            line_id for line_id in self._od_times_by_line
            if len(self._od_times_by_line[line_id]) > 1]
        if (len(lines_with_useful_od) == 0):
            raise ValueError("Selected Optical Data contains less than two defined data points! "
                             "Biomass measurements are essential for FBA, and we need at least "
                             "two to define a growth rate.")
        # FIXME are lines taken into account later?

    # Step 3: Select HPLC-like Measurements and mark the ones that are inputs
    def _step_3_get_hplc_data(self):
        """private method"""
        if self.debug:
            logger.debug("STEP 3: get HPLC data")
        self._process_multi_purpose_protocol(Protocol.CATEGORY_HPLC)

    # this function is used to extract data for HPLC, LC-MS, and transcriptomics
    # or proteomics protocols.  most of these are handled identically, except
    # that the LC-MS category handles carbon ratio measurements separately.
    def _process_multi_purpose_protocol(
            self, protocol_category, process_carbon_ratios_separately=False):
        """private method"""
        protocols = self._get_protocols_by_category(protocol_category)
        if (len(protocols) == 0):
            return
        seen_cr_measurement_types = set()
        for protocol in protocols:
            assays = self._assays.get(protocol.id, [])
            if (len(assays) == 0):
                continue
            # Sort by the Assay name, then re-sort by the Line name.
            assays.sort(key=lambda a: a.name)
            assays.sort(key=lambda a: a.line.name)
            for assay in assays:
                metabolites = self._get_metabolite_measurements(
                    assay.id,
                    sort_by_name=True)
                cr_meas = []
                if process_carbon_ratios_separately:
                    # Separate any carbon ratio measurements into a separate array
                    cr_meas = [m for m in metabolites if m.is_carbon_ratio()]
                    # Drop any carbon ratio measurements from the original array
                    metabolites = [m for m in metabolites if not m.is_carbon_ratio()]
                assay_has_usable_data = False
                for m in metabolites:
                    if self._process_metabolite_measurement(m):
                        self._usable_measurements[protocol_category].append(m)
                        self._usable_metabolites_by_assay[assay.id].append(m)
                        assay_has_usable_data = True
                # All transcription data are usable - there are no units restrictions
                transcriptions = self._process_transcription_measurements(assay)
                if (transcriptions is not None):
                    self._usable_measurements[protocol_category].extend(transcriptions)
                    self._transcription_by_assay[assay.id].extend(transcriptions)
                    assay_has_usable_data = True
                # same with proteomics data
                proteomics = self._process_proteomics_measurements(assay)
                if (proteomics is not None):
                    self._usable_measurements[protocol_category].extend(proteomics)
                    self._proteomics_by_assay[assay.id].extend(proteomics)
                    assay_has_usable_data = True
                # Carbon Ratio data is handled in a simpler manner.
                # It is a unitless construct, so we don't verify units, and there is
                # no notion of an 'input' versus an 'output', so we skip checking that.
                for m in cr_meas:
                    m_selected = self.form.get("measurement%dinclude" % m.id, None)
                    if not self.submitted_from_export_page:
                        m_selected = False
                        # By default, if there is more than one set of measurement data
                        # for a given type, we only select the first one.
                        meas_type = self._get_measurement_type(m.id)
                        if meas_type.id not in seen_cr_measurement_types:
                            m_selected = True
                            seen_cr_measurement_types.add(meas_type.id)
                    self._metabolites_checked[m.id] = m_selected
                    self._usable_measurements["LCMS"].append(m)
                    self._usable_metabolites_by_assay[assay.id].append(m)
                    assay_has_usable_data = True
                # If the Assay has any usable Measurements, add it to a hash sorted
                # by Protocol
                if assay_has_usable_data:
                    self._usable_assays[protocol.name].append(assay)
            usable_assays = self._usable_assays.get(protocol.name, [])
            if (len(usable_assays) > 0):
                self._usable_protocols[protocol_category].append(protocol)
        if (len(self._usable_protocols.get(protocol_category, [])) > 0):
            min_x, max_x = self._find_min_max_x_in_measurements(
                self._usable_measurements[protocol_category], True)
            self._measurement_ranges[protocol_category] = (min_x, max_x)
        else:
            self._measurement_ranges[protocol_category] = (None, None)

    def _process_metabolite_measurement(self, m):
        """private method"""
        if (not self._is_concentration_measurement(m)):
            return False
        # mdata = self._get_measurement_data(m.id)
        # XXX should we check for actual data?
        m_selected = self.form.get("measurement%dinclude" % m.id, None)
        m_is_input = self.form.get("measurement%dinput" % m.id, None)
        if (not self.submitted_from_export_page):
            m_selected = True
            m_is_input = False
        self._metabolites_checked[m.id] = m_selected
        self._metabolite_is_input[m.id] = m_is_input
        return True

    def _get_counts_unit_id(self):
        if not hasattr(self, '_counts_unit'):
            try:
                self._counts_unit = MeasurementUnit.objects.filter(
                    unit_name='counts'
                ).values_list('pk')[:1][0][0]
            except MeasurementUnit.DoesNotExist:
                self._counts_unit = None
        return self._counts_unit

    def _process_transcription_measurements(self, assay):
        """private method"""
        counts_id = self._get_counts_unit_id()
        transcriptions = self._get_gene_measurements(assay.id)
        # filter out measurements that are read counts (not F/RPKM)
        transcriptions = [t for t in transcriptions if t.y_units_id != counts_id]
        if (len(transcriptions) > 0):
            transcription_selected = self.form.get("transcriptions%dinclude" % assay.id, None)
            if (not self.submitted_from_export_page):
                transcription_selected = True
            if transcription_selected:
                self.have_transcriptomics_to_embed = True
                self._transcriptions_checked.add(assay.id)
            return transcriptions
        return None

    def _process_proteomics_measurements(self, assay):
        """private method"""
        proteomics = self._get_protein_measurements(assay.id)
        if (len(proteomics) > 0):
            proteomics_selected = self.form.get("proteins%dinclude" % assay.id, None)
            if (not self.submitted_from_export_page):
                proteomics_selected = True
            if proteomics_selected:
                self.have_proteomics_to_embed = True
                self._proteins_checked.add(assay.id)
            return proteomics
        return None

    # Step 4: select LCMS-like measurements - this is very similar to the
    # handling of HPLC measurements, but with added steps for carbon ratio
    # measurements.
    def _step_4_get_lcms_data(self):
        """private method"""
        if self.debug:
            logger.debug("STEP 4: get LCMS data")
        self._process_multi_purpose_protocol(
            Protocol.CATEGORY_LCMS,
            process_carbon_ratios_separately=True,
        )

    def _step_5_get_ramos_data(self):
        """private method"""
        if self.debug:
            logger.debug("STEP 5: get RAMOS data")
        ramos_protocols = self._get_protocols_by_category(Protocol.CATEGORY_RAMOS)
        if (len(ramos_protocols) == 0):
            return
        for protocol in ramos_protocols:
            assays = self._assays.get(protocol.id, [])
            if (len(assays) == 0):
                continue
            assays.sort(key=lambda a: a.name)
            assays.sort(key=lambda a: a.line.name)
            for assay in assays:
                metabolites = self._get_metabolite_measurements(assay.id)
                metabolites.sort(key=lambda a: a.name)
                assay_has_usable_data = False
                for m in metabolites:
                    units = self._get_y_axis_units_name(m.id)
                    if (units is None) or (units == ""):
                        self.need_ramos_units_warning = True
                    elif (units != "mol/L/hr"):
                        continue
                    is_selected = self.form.get("measurement%dinclude" % m.id, None)
                    is_input = self.form.get("measurement%dinput" % m.id, None)
                    if (not self.submitted_from_export_page):
                        is_selected = True
                        is_input = False
                        if re.match("O2|\WO2", m.name):
                            is_input = True
                    self._metabolites_checked[m.id] = is_selected
                    self._metabolite_is_input[m.id] = is_input
                    self._usable_metabolites_by_assay[assay.id].append(m)
                    self._usable_measurements["RAMOS"].append(m)
                    assay_has_usable_data = True
                # If the Assay has any usable Measurements, add it to a hash sorted
                # by Protocol
                if assay_has_usable_data:
                    self._usable_assays[protocol.name].append(assay)
            if (len(self._usable_assays.get(protocol.name, [])) > 0):
                self._usable_protocols["RAMOS"].append(protocol)
        if (self.n_ramos_measurements > 0):
            min_x, max_x = self._find_min_max_x_in_measurements(
                self._usable_measurements["RAMOS"], True)
            self._measurement_ranges["RAMOS"] = (min_x, max_x)
        else:
            self._measurement_ranges["RAMOS"] = (None, None)

    def _step_6_get_transcriptomics_proteomics(self):
        """private method"""
        if self.debug:
            logger.debug("STEP 6: get transcriptomics/proteomics data")
        self._process_multi_purpose_protocol(Protocol.CATEGORY_TPOMICS)

    def _get_ramos_conversion(self, short_name):
        metabolite = self._ramos_conversion.get(short_name, None)
        if metabolite is None:
            metabolite = self._ramos_conversion[short_name] = Metabolite.objects.get(
                short_name=short_name
            )
        return metabolite

    # FIXME too spaghetti-like; refactor?
    def _step_7_calculate_fluxes(self):
        """private method"""
        if self.debug:
            logger.debug("STEP 7: calculate fluxes")
        all_checked_measurements = []
        # measurement_ids = []
        measurement_protocol_categories = {}
        measurement_assays = {}
        for category in self._usable_protocols:
            if (category == "TPOMICS"):
                continue
            for protocol in self._usable_protocols[category]:
                for assay in self._usable_assays[protocol.name]:
                    for m in self._get_measurements(assay.id):
                        is_checked = self._metabolites_checked.get(m.id, None)
                        if is_checked:
                            all_checked_measurements.append(m)
                            measurement_protocol_categories[m.id] = category
                            measurement_assays[m.id] = assay
                        elif (is_checked is None) and self.debug:
                            logger.debug(
                                "  warning: skipping measurement %d for assay '%s'" %
                                (m.id, m.assay.name)
                            )
        # FIXME not sure this should be necessary...
        for m in self._od_measurements:
            if self._metabolites_checked.get(m.id, None):
                if m.id not in measurement_assays:
                    all_checked_measurements.append(m)
        all_checked_measurements.sort(key=lambda a: a.short_name.lower())
        if self.debug:
            logger.debug("  data fetched")
        od_mtype = MeasurementType.objects.get(short_name="OD")
        for m in all_checked_measurements:
            # mtype = m.measurement_type
            assay = measurement_assays[m.id]
            protocol_category = measurement_protocol_categories[m.id]
            line_id = assay.line_id
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
            # result = None
            if m.is_carbon_ratio():
                crm = carbon_ratio_measurement(
                    measurement=m,
                    measurement_data=self._measurement_data[m.id],
                    measurement_type=self._measurement_types[m.id],
                    assay_name=self._assay_names[assay.id],
                )
                self._processed_carbon_ratio_data.append(crm)
                for t in crm.mtimes:
                    if crm.metabolite_name not in self._carbon_data_by_metabolite[t]:
                        value = crm.value_at_time(t)
                        # TODO track whether a duplicate measurement gets skipped
                        if (value is not None):
                            self._carbon_data_by_metabolite[t][crm.metabolite_id] = value
            else:
                metabolite = m.measurement_type
                metabolite = self._metabolites.get(m.id, metabolite)
                # XXX This is a hack to adapt two RAMOS-specific metabolites from their
                # "produced" and "-consumed" variants to their ordinary names.  It's
                # needed here because the original variants are considered "rates",
                # while the metabolites we're matching to are not.
                if (metabolite.short_name == "CO2p"):
                    metabolite = self._get_ramos_conversion(short_name="co2")
                elif (metabolite.short_name == "O2c"):
                    metabolite = self._get_ramos_conversion(short_name="o2")
                pm = processed_measurement(
                    measurement=m,
                    measurement_data=self._measurement_data[m.id],
                    metabolite=metabolite,
                    assay_name=self._assay_names[assay.id],
                    y_units=self._get_y_axis_units_name(m.id),
                    protocol_category=protocol_category,
                    line_od_values=self._od_times_by_line[line_id],
                    is_input=self._metabolite_is_input.get(m.id, False),
                    is_od_measurement=(m.measurement_type_id == od_mtype.id),
                    use_interpolation=(protocol_category != "OD"))
                self._processed_metabolite_data.append(pm)
                if (pm.n_errors == 0):
                    if (protocol_category != "OD"):
                        mid = pm.metabolite_id
                        for t in pm.mtimes:
                            if mid not in self._species_data_by_metabolite[t]:
                                self._species_data_by_metabolite[t][mid] = []
                            if pm.have_flux:
                                if mid not in self._flux_data_by_metabolite[t]:
                                    self._flux_data_by_metabolite[t][mid] = []
                            tp_data = pm.flux_at_time_point(t)
                            if (tp_data is not None):
                                self._species_data_by_metabolite[t][mid].append(tp_data)
                                self._species_data_types_available.add(mid)
                                if (pm.have_flux):
                                    assert (m.is_extracellular() or protocol_category == "RAMOS")
                                    self._flux_data_by_metabolite[t][mid].append(tp_data)
                                    self._flux_data_types_available.add(mid)
                        m_min, m_max = pm.min_max()
                        self._metabolite_minima[mid] = min(
                            m_min,
                            self._metabolite_minima.get(mid, sys.maxint))
                        self._metabolite_maxima[mid] = max(
                            m_max,
                            self._metabolite_maxima.get(mid, -sys.maxint))
                if pm.is_od_measurement:
                    for t in pm.mtimes:
                        flux = pm.flux_at_time_point(t)
                        if (flux is not None):
                            self._biomass_data[t].append(flux)
        # At this point we know exactly which timestamps have valid flux
        # measurements (these have already been filtered for valid OD).
        # We'll note the time as one of the columns we will want to offer in the
        # comprehensive export table on the webpage, even if we subsequently
        # reject this Measurement based on problems with unit conversion or lack
        # of an exchange element in the SBML document.  (The zero in the table
        # will be informative to the user.)
        mtimes = self._species_data_by_metabolite.keys()
        self._comprehensive_valid_OD_times = sorted(mtimes)

    # Used for extracting HPLC/LCMS/RAMOS assays for display.  Metabolites are
    # listed individually, proteomics and transcriptomics measurements are
    # grouped per assay.  The 'data_points' lists are used to draw SVG objects
    # representing the measurements as time series.
    def _export_assay_measurements(self, assays, max_x):
        """private method"""
        assay_list = []
        for assay in assays:
            measurements = []
            transcriptions = self._transcription_by_assay.get(assay.id, ())
            if (len(transcriptions) > 0):
                gene_xvalue_counts = defaultdict(int)
                n_points = 0
                for t in transcriptions:
                    for md in self._get_measurement_data(t.id):
                        gene_xvalue_counts[md.fx] += 1
                        n_points += 1
                gene_xvalues = sorted(gene_xvalue_counts.keys())
                data_points = []
                for x in gene_xvalues:
                    if (x > max_x):
                        continue
                    data_points.append({
                        "rx": ((x / max_x) * 450) + 10,
                        "y": gene_xvalue_counts[x],
                        "title": "%d transcription counts at %gh" % (gene_xvalue_counts[x], x),
                    })
                measurements.append({
                    "name": "Gene Transcription Values",
                    "units": "RPKM",
                    "id": assay.id,
                    "type": "transcriptions",
                    "format": 2,
                    "data_points": data_points,
                    "n_points": n_points,
                    "include": (assay.id in self._transcriptions_checked),
                    "input": None,
                })
            # FIXME some unnecessary duplication here
            proteomics = self._proteomics_by_assay.get(assay.id, ())
            if (len(proteomics) > 0):
                protein_xvalue_counts = defaultdict(int)
                n_points = 0
                for p in proteomics:
                    for md in self._get_measurement_data(p.id):
                        protein_xvalue_counts[md.fx] += 1
                        n_points += 1
                protein_xvalues = sorted(protein_xvalue_counts.keys())
                data_points = []
                for x in protein_xvalues:
                    if (x > max_x):
                        continue
                    data_points.append({
                        "rx": ((x / max_x) * 450) + 10,
                        "y": protein_xvalue_counts[x],
                        "title": "%d protein measurements at %gh" % (protein_xvalue_counts[x], x),
                    })
                measurements.append({
                    "name": "Proteomics Measurements",
                    "units": "Copies",
                    "id": assay.id,
                    "type": "proteins",
                    "format": 2,
                    "data_points": data_points,
                    "n_points": n_points,
                    "include": (assay.id in self._proteins_checked),
                    "input": None,
                })
            for m in self._usable_metabolites_by_assay.get(assay.id, ()):
                # meas_type = self._get_measurement_type(m.id).type_group
                is_checked = self._metabolites_checked[m.id]
                data_points = []
                mdata = self._get_measurement_data(m.id)
                for md in sorted(mdata, key=lambda a: a.fx):
                    x = md.fx
                    if (x > max_x):
                        continue
                    data_points.append({
                        "rx": ((x / max_x) * 450) + 10,
                        "y": md.fy,
                        "title": "%s at %gh" % (md.fy, x)
                    })
                measurements.append({
                    "name": m.full_name,
                    "units": self._get_y_axis_units_name(m.id),
                    "id": m.id,
                    "type": "measurement",
                    "format": m.measurement_format,
                    "data_points": data_points,
                    "n_points": len(data_points),
                    "include": is_checked,
                    # XXX this is irrelevant for carbon ratio measurements
                    "input": self._metabolite_is_input.get(m.id, False),
                })
            assay_list.append({
                "name": self._assay_names[assay.id],
                "measurements": measurements,
            })
        return assay_list

    def _export_protocol_measurements(self, category):
        if (len(self._usable_protocols[category]) == 0):
            raise RuntimeError("No usable measurements in this category!")
        data = []
        min_x, max_x = self._measurement_ranges[category]
        for protocol in self._usable_protocols[category]:
            assay_list = self._export_assay_measurements(
                assays=self._usable_assays[protocol.name],
                max_x=max_x)
            protocol_data = {
                "name": protocol.name,
                "assays": assay_list,
            }
            data.append(protocol_data)
        return data

    # ---------------------------------------------------------------------
    # "public" methods - referenced by HTML template (and unit tests)
    #
    def selected_line_ids(self):
        return ",".join([str(line.id) for line in self.lines])

    def export_od_measurements(self):
        """
        Provide data structure for display of OD600 measurements in HTML template.
        """
        meas_list = []
        min_x, max_x = self._measurement_ranges.get("OD", (0, 0))
        for m in self._od_measurements:
            data_points = []
            mdata = self._get_measurement_data(m.id)
            for md in sorted(mdata, key=lambda a: a.fx):
                x = md.fx
                if (x > max_x):
                    continue
                data_points.append({
                    "rx": ((x / max_x) * 450) + 10,
                    "y": md.fy,
                    "title": "%g at %gh" % (md.fy, x)
                })
            meas_list.append({
                "id": m.id,
                "assay_name": m.assay.name,
                "data_points": data_points,
                "n_points": len(data_points),
                "include": self._metabolites_checked[m.id],
            })
        return meas_list

    @property
    def n_od_warnings(self):
        n = 0
        if not self.have_gcdw_metadata:
            n += 1
        # TODO this could be called before "step 2"?
        if hasattr(self, 'used_generic_GCDW_in_assays') and self.used_generic_GCDW_in_assays:
            n += 1
        return n

    # HPLC
    @property
    def n_hplc_protocols(self):
        return len(self._protocols_by_category.get("HPLC", []))

    @property
    def n_hplc_measurements(self):
        return len(self._usable_measurements["HPLC"])

    def export_hplc_measurements(self):
        return self._export_protocol_measurements("HPLC")

    # LCMS
    def export_lcms_measurements(self):
        return self._export_protocol_measurements("LCMS")

    @property
    def n_lcms_protocols(self):
        return len(self._protocols_by_category.get("LCMS", []))

    @property
    def n_lcms_measurements(self):
        return len(self._usable_measurements["LCMS"])

    # RAMOS
    @property
    def n_ramos_protocols(self):
        return len(self._protocols_by_category.get("RAMOS", []))

    @property
    def n_ramos_measurements(self):
        return len(self._usable_measurements["RAMOS"])

    def export_ramos_measurements(self):
        return self._export_protocol_measurements("RAMOS")

    # transcriptomics and proteomics
    @property
    def n_trans_prot_protocols(self):
        return len(self._protocols_by_category.get("TPOMICS", []))

    @property
    def n_trans_prot_measurements(self):
        return len(self._usable_measurements["TPOMICS"])

    def export_trans_prot_measurements(self):
        return self._export_protocol_measurements("TPOMICS")

    @property
    def n_conversion_warnings(self):
        n = 0
        for m in self._processed_metabolite_data:
            if m.n_errors:
                n += 1
        return n

    def processed_measurements(self):
        return self._processed_metabolite_data

    @property
    def available_timepoints(self):
        if hasattr(self, '_comprehensive_valid_OD_times'):
            return self._comprehensive_valid_OD_times
        return []

    @property
    def n_warnings(self):
        """Total count of warnings resulting from processing"""
        n = self.n_od_warnings
        n += self.n_conversion_warnings
        return n


# -----------------------------------------------------------------------
# Data container classes
#
class measurement_datum_converted_units (object):
    """
    Wrapper class for measurement unit conversions.  This structure facilitates
    tracking information about what conversions were performed without adding
    even more dictionary structures to the manager class(es).
    """
    def __init__(self, x, y, units, metabolite, interpolated, protocol_category):
        y = float(y)
        self.x = x
        self.initial_value = y
        self.y = y
        self.initial_units = units
        self.interpolated = interpolated
        self.conversion_equation = None
        if (protocol_category == "RAMOS"):
            if (units == ""):
                units = "mol/L/hr"
            if (units != "mol/L/hr"):
                raise ValueError("Units can't be converted to mM/hr. Skipping all intervals.")
        self.units = units
        if (metabolite.short_name == "OD"):
            pass
        elif (units in ["mg/L", "g/L"]):
            if not hasattr(metabolite, 'molar_mass') or metabolite.molar_mass == 0:
                raise ValueError("Cannot convert units from mg/L without knowing the molar mass "
                                 "of this metabolite. Skipping all intervals.")
            mm = float(metabolite.molar_mass)
            if (units == "g/L"):
                self.y = 1000 * y / mm
                self.units = "mM"
                self.conversion_equation = "(%g * 1000) / %g" % (self.initial_value, mm)
            else:
                self.y = y / mm
                self.units = "mM"
                self.conversion_equation = "%g / %g" % (self.initial_value, mm)
        elif (units == "Cmol/L"):
            if (metabolite.carbon_count == 0):
                raise ValueError("Cannot convert units from Cmol/L without knowing the carbon "
                                 "count of this metabolite. Skipping all intervals.")
            cc = float(metabolite.carbon_count)
            self.y = 1000 * y / cc
            self.conversion_equation = "(%g * 1000) / %g " % (self.initial_value, cc)
        elif (units == "mol/L"):
            self.y = y * 1000
            self.units = "mM"
            self.conversion_equation = "%g * 1000" % self.initial_value
        elif (units == "uM"):
            self.y = y / 1000
            self.units = "mM"
            self.conversion_equation = "%g / 1000" % self.initial_value
        elif (units == "mol/L/hr"):  # RAMOS only
            self.y = 1000 * y
            self.units = "mM/hr"
            self.conversion_equation = "%g * 1000" % self.initial_value
        elif (units != "mM"):
            raise ValueError("Units '%s' can't be converted to mM.  Skipping..." % units)

    def as_tuple(self):
        return (self.x, self.y)

    def __float__(self):
        return self.y

    @property
    def time(self):
        return self.x

    @property
    def value(self):
        return self.y

    def __str__(self):
        fields = ["%g %s" % (self.value, self.units)]
        if (self.initial_units != self.units):
            fields += ["(was: %g %s)" % (self.initial_value, self.initial_units)]
        if (self.interpolated):
            fields += ["[interpolated]"]
        return " ".join(fields)


# FIXME this could use some refactoring - maybe move the logic back to the
# step_7 method above, keep flux_calculation or something like it as the
# primary result?
class processed_measurement(object):
    is_carbon_ratio = False

    def __init__(
            self,
            measurement,
            measurement_data,
            metabolite,  # XXX possibly substituted (for RAMOS measurements)
            assay_name,
            y_units,
            protocol_category,
            line_od_values,
            is_input,
            is_od_measurement,
            use_interpolation):
        m = measurement
        assert (not m.is_carbon_ratio())
        self.protocol_category = protocol_category
        self.measurement_id = m.id
        self.metabolite_id = metabolite.id
        self.metabolite_name = metabolite.short_name
        self.assay_name = assay_name
        self.interpolated_measurement_timestamps = set()
        self.skipped_due_to_lack_of_od = []
        self.is_od_measurement = is_od_measurement
        self.data = []
        self.intervals = []
        self._timepoint_data = []
        self.errors = []
        self.warnings = []
        self.valid_od_mtimes = set()
        # Find all the timestamps with defined measurements.
        # Note that we're doing this outside the interpolation loops below,
        # so we don't pollute that set with values created via interpolation.
        # Also note that we will have to remake this array after attempting
        # interpolation.
        valid_mdata = [md for md in measurement_data if md.y]
        valid_mdata.sort(key=lambda a: a.x)
        mdata_tuples = [(md.fx, md.fy) for md in valid_mdata]
        valid_mtimes = set([md.fx for md in valid_mdata])
        # Get the set of all OD measurement timestamps that do NOT have a
        # defined value in this measurement's data.  These are the candidate
        # spots for interpolation.
        od_times = sorted(line_od_values.keys())
        for t in od_times:
            if t not in valid_mtimes and use_interpolation:
                y = interpolate_at(valid_mdata, t)
                if y is not None:
                    mdata_tuples.append((t, y))
                    self.interpolated_measurement_timestamps.add(t)
        mdata_tuples.sort(key=lambda a: a[0])

        # Container for a computed metabolite flux at a given time interval.
        class timepoint(object):
            def __init__(O, mname, start, end, y, delta, units, flux, interpolated):
                O.mname = mname
                O.start = start
                O.end = end
                O.y = y
                O.delta = delta
                O.units = units
                O.flux = flux
                O.interpolated = interpolated

            @property
            def elapsed(O):
                return O.end - O.start

            @property
            def conc(O):
                return O.y

            def __float__(O):
                return O.flux

            @property
            def y_start(O):
                return O.y - O.delta

            def __str__(O):
                base = "time: %8g - %8gh; delta = %8g, flux = %8g" % (
                    O.start, O.end, O.delta, O.flux)
                if (O.interpolated):
                    return base + " [interpolated]"
                return base

        def process_md():
            if m.is_carbon_ratio():  # TODO
                return
            # mdata_converted = []
            # attempt unit conversions.  for convenience we use a simple class
            # with 'x' and 'y' attributes, capable of handling any measurement
            # type.
            for (x, y) in mdata_tuples:
                md = measurement_datum_converted_units(
                    x=x, y=y,
                    units=y_units,
                    metabolite=metabolite,
                    interpolated=(x in self.interpolated_measurement_timestamps),
                    protocol_category=protocol_category)
                self.data.append(md)
            # Now, finally, we calculate fluxes and other embeddable values
            for i_time, md in enumerate(self.data[:-1]):
                t, y = md.x, md.y
                od = line_od_values.get(t, None)
                # Got to have an OD measurements at exactly the start, currently.
                # It's certainly possible to do fancier stuff, but we'll implement
                # that later.
                if (od is None):
                    self.skipped_due_to_lack_of_od.append(t)
                    continue
                elif (od == 0):
                    # TODO error message?
                    self.warnings.append("Start OD of 0 means nothing physically present (and "
                                         "a potential division-by-zero error). Skipping...")
                    continue
                # At this point we know we have valid OD and valid Measurements for
                # the interval.  (Remember, we pre-filtered valid meas. times.)
                # We'll note the time as one of the columns we will want to offer
                # in the comprehensive export table on the webpage, even if we
                # subsequently reject this Measurement based on problems with
                # unit conversion or lack of an exchange element in the SBML
                # document. (The zero in the table will be informative to the user.)
                self.valid_od_mtimes.add(t)
                # At this point, the next higher timestamp in the list becomes
                # necessary.  (The loop will only iterate up to the second-to-last.)
                md_next = self.data[i_time+1]
                t_end = md_next.x
                delta_t = t_end - t
                # This is kind of logically impossible, but, we ARE just drawing
                # from an array, so...
                if (delta_t == 0):
                    self.warnings.append("No zero-width intervals due to duplicate "
                                         "measurements, please!  Skipping...")
                    continue
                # Get the OD and Measurement value for this next timestamp
                od_next = line_od_values.get(t_end, None)
                # y_next = self.data[i_time+1].y
                units = md.units
                # We know it's not a carbon ratio at this point, so a delta is a
                # meaningful value to calculate.
                # TODO
                delta_y = md_next.y - md.y
                delta = delta_y
                flux = None
                mname = self.metabolite_name
                if (protocol_category == "OD"):
                    if (od_next is None):
                        self.warnings.append("No OD measurement was found at the next interval, "
                                             "timestamp <b>%g</b>.  Can't calculate a growth rate "
                                             "at time <b>%g</b>!" % (t_end, t))
                        continue
                    # Here we're going to ignore the values we've pulled via the
                    # Measurement, and use the values we already prepared in the OD
                    # dict
                    if self.is_od_measurement:
                        # OD is converted into exponential growth rate (units
                        # gCDW/gCDW/hr or 1/hr) by placing successive growth
                        # observations within the exponential growth formula,
                        # A1 = A0 * exp(mu * delta-t) where delta-t is the difference
                        # in time between the growth observations, A0 is the earlier
                        # OD600, and A1 is the later OD600.
                        # Rearranged, the formula looks like this:
                        flux = math.log(od_next / od) / delta_t
                        units = "OD"
                elif (protocol_category in ["HPLC", "LCMS", "TPOMICS"]):
                    # We can assume it's in the right units by now, because if it
                    # isn't, this code would have been skipped.
                    if is_input:
                        delta = 0 - delta_y
                    # This math was signed off by Dan Weaver, but I'm still not
                    # entirely sure I'm doing all the other steps right
                    flux = (delta_y / delta_t) / od
                elif (protocol_category == "RAMOS"):
                    # This is already a delta, so we're not using delta_y
                    if is_input:
                        md.y = 0 - md.y
                    flux = md.y / od
                    delta = md.y
                # FIXME Since OD and RAMOS "metabolites" are always considered to be
                # "extracellular", it might make more sense for the contents of the
                # database to reflect this
                if not (measurement.is_extracellular() or
                        self.is_od_measurement or
                        protocol_category == "RAMOS"):
                    flux = None
                self._timepoint_data.append(
                    timepoint(
                        mname=mname,
                        start=t,
                        end=t_end,
                        y=md.y,
                        delta=delta,
                        units=units,
                        flux=flux,
                        interpolated=md.interpolated
                    )
                )
        try:
            process_md()
        except ValueError as e:
            self.errors.append(str(e))
        self.have_flux = self.n_fluxes_computed > 0

    @property
    def n_errors(self):
        return len(self.errors)

    @property
    def n_warnings(self):
        return len(self.warnings)

    def min_max(self):
        hi = max([md.y for md in self.data])
        lo = min([md.y for md in self.data])
        return lo, hi

    @property
    def n_fluxes_computed(self):
        return len([t.flux for t in self._timepoint_data if t.flux is not None])

    @property
    def mtimes(self):
        return [fd.start for fd in self._timepoint_data]

    @property
    def n_skipped_measurements(self):
        return len(self.skipped_due_to_lack_of_od)

    def skipped_measurements(self):
        return ",".join([str(t) for t in sorted(self.skipped_due_to_lack_of_od)])

    @property
    def flux_data(self):
        return self._timepoint_data

    def flux_at_time_point(self, t):
        for fd in self._timepoint_data:
            if (fd.start == t):
                return fd
        return None

    def __repr__(self):
        return "<processed_measurement:%s>" % self.metabolite_name


class carbon_ratio_measurement (object):
    is_carbon_ratio = True

    def __init__(self, measurement, measurement_data, measurement_type, assay_name):
        self.measurement_id = measurement
        self.assay_name = assay_name
        self.metabolite_id = measurement_type.id
        self.metabolite_name = measurement_type.short_name
        self._cr_data = []
        for mv in measurement_data:
            self._cr_data.append(mv)
        self._cr_data.sort(key=lambda a: a.fx)
        self.n_errors = 0

    def cr_data(self):
        return self._cr_data

    @property
    def mtimes(self):
        return [md.fx for md in self._cr_data]

    def value_at_time(self, t):
        for md in self._cr_data:
            if (md.fx == t):
                return md.y
        return None


########################################################################
#
# LAYER 3: COMBINE MEASUREMENTS WITH SBML
#
########################################################################
class line_sbml_export (line_assay_data, sbml_info):
    """
    'Manager' class for extracting data for export into SBML format and
    organizing it for presentation as an HTML form.  This object will be passed
    to the export page view.  If any steps fail due to lack of approprioate data,
    a ValueError will be raised (and displayed in the browser).
    """
    def __init__(self, *args, **kwds):
        line_assay_data.__init__(self, *args, **kwds)
        sbml_info.__init__(self)
        # these are used for matching metabolites to species/fluxes
        self._species_match_elements = []
        self._flux_match_elements = []
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
        #
        self._transcriptions_in_sbml_model = {}
        self._proteomics_in_sbml_model = {}
        self._consolidated_transcription_ms = defaultdict(dict)
        self._consolidated_proteomics_ms = defaultdict(dict)

    def run(self, test_mode=False, sbml_file=None):
        """
        Execute all processing steps.  This is not done on initialization because
        we want to display as many steps as possible in the view even if a
        ValueError is raised.
        """
        # Okay, ready to extract data!
        t1 = time.time()
        self._step_0_pre_fetch_data()
        t2 = time.time()
        self._step_1_select_template_file(test_mode=test_mode)
        self._step_2_get_od_data()
        self._step_3_get_hplc_data()
        self._step_4_get_lcms_data()
        self._step_5_get_ramos_data()
        self._step_6_get_transcriptomics_proteomics()
        self._step_7_calculate_fluxes()
        if (not test_mode) or (sbml_file is not None):  # TODO something smart
            self._step_8_pre_parse_and_match(sbml_file)
        t3 = time.time()
        self._fetch_time = (t2 - t1)
        self._setup_time = (t3 - t1)
        return self

    # Step 1: Select the SBML template file to use for export
    def _step_1_select_template_file(self, test_mode=False):
        """
        Private method
        """
        if self.debug:
            logger.debug("STEP 1: get template files")
        # TODO figure out something sensible for unit testing
        if (len(self._sbml_templates) == 0):
            if (not test_mode):
                raise ValueError("No SBML templates have been uploaded!")
        else:
            template_id = self.form.get("chosenmap_id", None)
            if (template_id is not None):
                self._select_template(template_id=int(template_id))
            else:
                self._select_template(i_template=int(self.form.get("chosenmap", 0)))

    def _step_8_pre_parse_and_match(self, sbml_file=None):
        """private method"""
        if self.debug:
            logger.debug("STEP 8: match to species in SBML file")
        self._process_sbml(sbml_file=sbml_file)
        if (len(self._species_data_types_available) > 0):
            # First we attempt to locate the form element that describes the set of
            # exmatch# elements that were submitted with the last page.
            # We need to use an element like this because the standard behavior of a
            # browser doing a form submission is to drop elements whose value was
            # unset or set to the empty string.  Eventually we may avoid this problem
            # by doing our own AJAX/JSON-RPC call instead.
            elements = self.form.get("speciesmatchelements", "").split(",")
            elements = ["spmatch"+x for x in elements]
            # Then we'll convert it into a hash, one key for each element that
            # exists, so we can check for the presence of individual elements easily.
            # We set the value of each key to the value of the form element, or an
            # empty string if no element was passed.
            species_matches = {sp_id: self.form.get(sp_id, "") for sp_id in elements}
            # This way we can use the reassignMetaboliteToSpecies subroutine,
            # by passing a defined value, even if just an empty string, instead of
            # 'undef', for any spmatch# element that was on the previous incarnation
            # of the page.
            logger.debug("\tAll species matches: %s" % species_matches)
            for mid in sorted(list(self._species_data_types_available)):
                metabolite = self._metabolites_by_id[mid]
                form_element_id = "spmatch%d" % mid
                species_match = self._reassign_metabolite_to_species(
                    metabolite=metabolite,
                    species_id=species_matches.get(form_element_id, None)
                )
                logger.debug("\tAssigned %s to %s" % (mid, species_match))
                # We pass in the contents of the relevant form element here, and the
                # code in the sbml_info class checks to see if it matches a known
                # species.   If it does, the measurement type is reassigned to the
                # species and the species ID is returned.  If it doesn't, the function
                # returns the species that is currently assigned.  If an empty string
                # is submitted, we assume that the user intends to erase a previously
                # customized pairing.
                self._species_match_elements.append((metabolite, species_match))
        if (len(self._flux_data_types_available) > 0):  # XXX same as above
            elements = self.form.get("fluxmatchelements", "").split(",")
            elements = ["exmatch"+x for x in elements]
            exchange_matches = {ex_id: self.form.get(ex_id, "") for ex_id in elements}
            for mid in sorted(list(self._flux_data_types_available)):
                metabolite = self._metabolites_by_id[mid]
                form_element_id = "exmatch%d" % mid
                exchange_match = self._reassign_metabolite_to_reactant(
                    metabolite=metabolite,
                    exchange_id=exchange_matches.get(form_element_id, None))
                self._flux_match_elements.append((metabolite, exchange_match))
        if self.have_transcriptomics_to_embed:
            for assay_id in self._transcriptions_checked:
                transcription_measurements = self._transcription_by_assay[assay_id]
                for m in transcription_measurements:
                    mtype = self._get_measurement_type(m.id)
                    gene_name = mtype.type_name
                    mdata = self._get_measurement_data(m.id)
                    mdata_times = sorted([md.fx for md in mdata])
                    # XXX is this check necessary?
                    if (len(mdata_times) > 0):
                        self._transcriptions_in_sbml_model[gene_name] = False
                        if self._have_gene_in_model(gene_name):
                            self._transcriptions_in_sbml_model[gene_name] = True
                        for md in mdata:
                            t = md.fx
                            if gene_name not in self._consolidated_transcription_ms[t]:
                                self._consolidated_transcription_ms[t][gene_name] = []
                            self._consolidated_transcription_ms[t][gene_name].append(md.fy)
        if self.have_proteomics_to_embed:
            for assay_id in self._proteins_checked:
                protein_measurements = self._proteomics_by_assay[assay_id]
                for m in protein_measurements:
                    mtype = self._get_measurement_type(m.id)
                    protein_name = mtype.type_name
                    mdata = self._get_measurement_data(m.id)
                    mdata_times = sorted([md.fx for md in mdata])
                    # XXX is this check necessary?
                    if (len(mdata_times) > 0):
                        self._proteomics_in_sbml_model[protein_name] = False
                        if self._have_gene_in_model(protein_name):
                            self._proteomics_in_sbml_model[protein_name] = True
                        for md in mdata:
                            t = md.fx
                            if protein_name not in self._consolidated_proteomics_ms[t]:
                                self._consolidated_proteomics_ms[t][protein_name] = []
                            self._consolidated_proteomics_ms[t][protein_name].append(md.fy)

    # ---------------------------------------------------------------------
    # EXPORT functions
    def output_file_name(self, export_time):
        """
        Generate an SBML file name incorporating study and line IDs.
        """
        return "edd-s%dl%st%g-%s.sbml" % (
            self.study.id,
            "_".join([str(l.id) for l in self.lines]), export_time,
            self.primary_line_name)

    def as_sbml(self, export_time):
        """
        Export the SBML with our processed measurements incorporated.
        """
        assert (export_time in self._comprehensive_valid_OD_times)
        t = export_time
        species_data = self._species_data_by_metabolite[t]
        flux_data = self._flux_data_by_metabolite[t]
        for mid in species_data.keys():
            metabolite = self._metabolites_by_id[mid]
            m_hi = self._metabolite_maxima[mid]
            m_lo = self._metabolite_minima[mid]
            try:
                self._assign_concentration_to_species(
                    metabolite.id,
                    maximum=m_hi,
                    minimum=m_lo,
                    values=[d.conc for d in species_data[mid]])
            except ValueError as e:
                logger.exception('Failed to assign concentration: %s', e)
        for mid in flux_data.keys():
            metabolite = self._metabolites_by_id[mid]
            values = [d.flux for d in flux_data[mid] if d.flux is not None]
            try:
                self._assign_value_to_flux(metabolite.id, values)
            except ValueError as e:
                logger.exception('Failed to assign flux value: %s', e)
        # now biomass
        values = [d.flux for d in self._biomass_data[t]]
        self._assign_value_to_flux(self._biomass_metab.id, values)
        # transcriptomics
        gene_data = self._consolidated_transcription_ms.get(t, {})
        for gene_name in gene_data.keys():
            self._assign_transcription_value_to_gene(gene_name, gene_data[gene_name])
        # proteomics
        protein_data = self._consolidated_proteomics_ms.get(t, {})
        for protein_name in protein_data.keys():
            self._assign_value_to_protein(protein_name, protein_data[protein_name])
        # updates of the underlying XML notes are deferred until now
        self._update_all_gene_protein_notes()
        # carbon ratios - embedded in main model notes
        carbon_data = self._carbon_data_by_metabolite.get(t, {})
        if (len(carbon_data) > 0):
            carbon_notes = {"LCMS": []}
            for mid, values in carbon_data.iteritems():
                combined = []
                for c in range(13):
                    if (c < len(values)):
                        combined.append("%s(0.02)\t" % values[c])
                    else:
                        combined.append("-\t")
                mname = self._metabolites_by_id[mid].short_name
                carbon_notes["LCMS"].append("%s\tM-0\t%s" % (mname, "".join(combined), ))
            n_total, n_added = self._add_notes(carbon_notes)
        # TODO some kind of feedback?
        import libsbml
        return libsbml.writeSBMLToString(self._sbml_doc)

    # ---------------------------------------------------------------------
    # SBML NAME RESOLUTION
    def species_match_elements(self):
        """
        Export a list of dictionaries basically giving key-value pairs of
        metabolite and SMBL species ID.
        """
        self._species_match_elements.sort(key=lambda a: a[0].type_name)
        result = []
        for metabolite, species_id in self._species_match_elements:
            result.append({
                'name': metabolite.type_name,
                'short_name': metabolite.short_name,
                'id': metabolite.id,
                'species': species_id,
            })
        return result

    @property
    def species_match_element_ids(self):
        """
        Returns a comma-separated list of IDs that becomes the value of the
        'speciesmatchelements' form parameter.
        """
        return ",".join([str(m.id) for m, s in self._species_match_elements])

    def flux_match_elements(self):
        """
        Export a list of dictionaries basically giving key-value pairs of
        metabolite and SMBL exchange ID.
        """
        self._flux_match_elements.sort(key=lambda a: a[0].type_name)
        result = []
        for metabolite, exchange_id in self._flux_match_elements:
            result.append({
                'name': metabolite.type_name,
                'short_name': metabolite.short_name,
                'id': metabolite.id,
                'exchange': exchange_id,
            })
        return result

    @property
    def flux_match_element_ids(self):
        """
        Returns a comma-separated list of IDs that becomes the value of the
        'fluxmatchelements' form parameter.
        """
        return ",".join([str(m.id) for m, s in self._flux_match_elements])

    @property
    def n_gene_names_resolved(self):
        return self._transcriptions_in_sbml_model.values().count(True)

    @property
    def n_gene_names_not_resolved(self):
        return self._transcriptions_in_sbml_model.values().count(False)

    @property
    def n_protein_names_resolved(self):
        return self._proteomics_in_sbml_model.values().count(True)

    @property
    def n_protein_names_not_resolved(self):
        return self._proteomics_in_sbml_model.values().count(False)

    def summarize_data_by_timepoint(self):
        """
        Export lists of metabolites available for various analyses at each
        timepoint.
        """
        result = []
        for i, t in enumerate(self.available_timepoints):
            timepoint_data = {
                "metabolites": [],
                "fluxes": [],
                "genes": len(self._consolidated_transcription_ms.get(t, {})),
                "proteins": len(self._consolidated_proteomics_ms.get(t, {})),
            }
            species_data = self._species_data_by_metabolite[t]
            flux_data = self._flux_data_by_metabolite[t]
            carbon_data = self._carbon_data_by_metabolite[t]
            for mid in sorted(species_data.keys()):
                interp_flags = [m.interpolated for m in species_data[mid]]
                timepoint_data["metabolites"].append({
                    "name": str(self._metabolites_by_id[mid].short_name),
                    "interpolated": interp_flags.count(True),
                })
            for mid in sorted(flux_data.keys()):
                interp_flags = [f.interpolated for f in flux_data[mid]]
                timepoint_data["fluxes"].append({
                    "name": str(self._metabolites_by_id[mid].short_name),
                    "interpolated": interp_flags.count(True),
                })
            if (i < len(self.available_timepoints) - 1):
                timepoint_data["fluxes"].append("BIOMASS")
            timepoint_data["carbon_data"] = [str(s) for s in sorted(carbon_data.keys())]
            timepoint_data["usable_items"] = 0
            for value in timepoint_data.values():
                if isinstance(value, list):
                    timepoint_data["usable_items"] += len(value)
                elif (value > 0):
                    timepoint_data["usable_items"] += 1
            timepoint_data["timestamp"] = t
            result.append(timepoint_data)
        return result


########################################################################
# ADMIN FEATURES
#
def sbml_template_info():
    """
    Construct a dict summarizing the existing SBML templates for display on
    the /admin/sbml view.
    """
    templates = SBMLTemplate.objects.all()
    export = []
    for m in templates:
        attachment = m.xml_file
        export.append({
            "id": m.id,
            "name": str(attachment.filename),
            "attachment_id": attachment.id,
            "description": str(attachment.description),
            "biomass_calculation": float(m.biomass_calculation),
            "file_size": attachment.file_size,
            "user_initials": attachment.created.mod_by.userprofile.initials,
            "date_added": attachment.created.format_timestamp(),
        })
    return export


def validate_sbml_attachment(file_data):
        import libsbml
        sbml = libsbml.readSBMLFromString(file_data)
        errors = sbml.getErrorLog()
        if (errors.getNumErrors() > 0):
                raise ValueError(errors.getError(1).getMessage())
        model = sbml.getModel()
        assert (model is not None)
        return sbml


def create_sbml_template_from_form(description, uploaded_file, update):
        """
        Create a new SBMLTemplate object from the contents of the simple form
        in the /admin/sbml view.
        """
        sbml_data = validate_sbml_attachment(uploaded_file.read())
        sbml_model = sbml_data.getModel()
        possible_biomass_ex_ids = set()
        for rxn in sbml_model.getListOfReactions():
                if ("biomass" in rxn.getId()) and ("core" in rxn.getId()):
                        possible_biomass_ex_ids.add(rxn.getId())
        biomass_ex_id = ""
        if (len(possible_biomass_ex_ids) == 1):
                biomass_ex_id = list(possible_biomass_ex_ids)[0]
        model = SBMLTemplate.objects.create(
            name=uploaded_file.name,
            biomass_exchange_name=biomass_ex_id)
        model.save()
        model.updates.add(update)
        attachment = Attachment.objects.create(
            object_ref=model,
            file=uploaded_file,
            filename=uploaded_file.name,
            created=update,
            description=description,
            mime_type="application/sbml+xml",
            file_size=len(uploaded_file.read()))
        attachment.save()
        return model


def update_template_from_form(self, filename, biomass_ex_id, description, update, uploaded_file):
        if (filename == ""):
                raise ValueError("Filename must not be blank.")
        if (biomass_ex_id == ""):
                raise ValueError("Biomass exchange name must not be blank.")
        xml_file = self.xml_file
        if (uploaded_file is not None):
                validate_sbml_attachment(uploaded_file.read())
                attachment = Attachment.objects.create(
                    object_ref=self,
                    file=uploaded_file,
                    filename=filename,
                    description=description,
                    created=update,
                    mime_type="application/sbml+xml",
                    file_size=len(uploaded_file.read()))
                xml_file.delete()
                self.files.add(attachment)
        else:
                xml_file.filename = filename
                xml_file.description = description
                xml_file.save()
        self.biomass_exchange_name = biomass_ex_id
        self.updates.add(update)
        self.save()
