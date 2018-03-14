# -*- coding: utf-8 -*-
""" Backend for exporting SBML files. """
# FIXME need to track intracellular and extracellular measurements separately
# (and assign to SBML species differently)

import libsbml
import logging
import math
import re
import sys

from bisect import bisect
from collections import defaultdict, namedtuple, OrderedDict
from copy import copy
from decimal import Decimal
from django import forms
from django.core.exceptions import ValidationError
from django.db.models import Max, Min, Prefetch, Q
from django.http import QueryDict
from django.template.defaulttags import register
from django.utils.safestring import mark_safe
from django.utils.translation import ugettext as _
from functools import partial, reduce
from future.utils import viewitems, viewvalues
from itertools import chain
from six import string_types
from threadlocals.threadlocals import get_current_request

from .. import models
from ..forms import (
    MetadataTypeAutocompleteWidget, SbmlExchangeAutocompleteWidget, SbmlSpeciesAutocompleteWidget
)
from ..utilities import interpolate_at


logger = logging.getLogger(__name__)


Range = namedtuple('Range', ['min', 'max'])
Point = namedtuple('Point', ['x', 'y'])


class SbmlForm(forms.Form):
    def __init__(self, *args, **kwargs):
        kwargs.setdefault('label_suffix', '')
        super(SbmlForm, self).__init__(*args, **kwargs)
        self._sbml_warnings = []

    @property
    def sbml_warnings(self):
        self.is_valid()  # trigger validation if needed
        return self._sbml_warnings


class SbmlExport(object):
    """ Controller class handling the data coming from SbmlForm objects, creating further SbmlForm
        objects based on previous input, and exporting an SBML file based on the inputs. """
    def __init__(self, selection, *args, **kwargs):
        self._sbml_template = None
        self._selection = selection
        self._from_study_page = False
        self._forms = {}
        self._match_fields = {}
        self._match_sbml_warnings = []
        self._export_errors = []
        self._max = self._min = None
        self._points = None
        self._density = []
        self._measures = defaultdict(list)
        self._omics = defaultdict(list)
        self._values_by_type = defaultdict(list)

    def add_density(self, density_measurements):
        """ Collect biomass density measurements to calculate final SBML values.

            :param density_measurements: an initialized SbmlExportOdForm """
        measurements = density_measurements.cleaned_data.get('measurement', [])
        interpolate = density_measurements.cleaned_data.get('interpolate', [])
        default_factor = density_measurements.cleaned_data.get('gcdw_default', 0.65)
        factor_meta = density_measurements.cleaned_data.get('gcdw_conversion', None)
        measurement_qs = self.load_measurement_queryset(density_measurements)
        # try to load factor metadata for each assay
        for m in measurement_qs:
            if factor_meta is None:
                factor = default_factor
            else:
                # check for factor on line first
                factor = m.assay.line.metadata_get(factor_meta, default_factor)
                # allow for factor on assay to override the one on line
                factor = m.assay.metadata_get(factor_meta, factor)
            for v in m.values:
                # storing as arrays to keep compatibility with interpolate_at
                self._density.append(Point([v.x[0]], [v.y[0] * factor]))
        # make sure it's sorted; potentially out-of-order from multiple measurements
        sorted(self._density, key=lambda p: p.x[0])
        # capture lower/upper bounds of t values for all measurements
        self._update_range_bounds(measurements, interpolate)

    def add_measurements(self, sbml_measurements):
        """ Add measurements to the export from a SbmlExportMeasurementsForm.

            :param sbml_measurements: an initialized SbmlExportMeasurementsForm """
        measurements = sbml_measurements.cleaned_data.get('measurement', [])
        interpolate = sbml_measurements.cleaned_data.get('interpolate', [])
        # process all the scalar measurements
        types_qs = models.MeasurementType.objects.filter(
            measurement__in=measurements,
            measurement__measurement_format=models.Measurement.Format.SCALAR,
        ).distinct()
        types_list = list(types_qs)
        # add fields matching species/exchange for every scalar measurement type
        self._build_match_fields(types_list)
        # store measurements keyed off type
        for m in measurements:
            self._measures['%s' % m.measurement_type_id].append(m)
        # capture lower/upper bounds of t values for all measurements
        self._update_range_bounds(measurements, interpolate)

    def add_omics(self, sbml_measurements):
        """ Collect omics measurements to calculate final SBML values.

            :param sbml_measurements: an initialized SbmlExportOmicsForm """
        measurements = sbml_measurements.cleaned_data.get('measurement', [])
        interpolate = sbml_measurements.cleaned_data.get('interpolate', [])
        # store measurements keyed off type_name
        # TODO: should probably link off another identifier mapping types to SBML names
        for m in measurements:
            self._omics[m.measurement_type.type_name].append(m)
        # capture lower/upper bounds of t values for all measurements
        self._update_range_bounds(measurements, interpolate)

    def create_export_form(self, payload, **kwargs):
        """ Constructs an SbmlExportSettingsForm based on data contained in a POST.

            :param payload: the QueryDict from POST attribute of a request
            :param kwargs: any additional kwargs to pass to the form; see Django Forms
                documentation.
            :return: a SbmlExportSettingsForm """
        export_settings_form = SbmlExportSettingsForm(
            data=payload,
            initial={'sbml_template': self._selection.studies[0].metabolic_map, },
            **kwargs
        )
        self._from_study_page = export_settings_form.add_prefix('sbml_template') not in payload
        if self._from_study_page:  # coming from study page, make sure bound data has default value
            export_settings_form.update_bound_data_with_defaults()
        self._forms.update(export_settings_form=export_settings_form)
        if export_settings_form.is_valid():
            self._sbml_template = export_settings_form.cleaned_data['sbml_template']
            self._sbml_obj = self._sbml_template.parseSBML()
            self._sbml_model = self._sbml_obj.getModel()
        return export_settings_form

    def create_match_form(self, payload, **kwargs):
        """ Constructs an SbmlMatchReactions form, linking SBML reaction elements to specific
            measurements.

            :param payload: the QueryDict from POST attribute of a request
            :param kwargs: any additional kwargs to pass to the form; see Django Forms
                documentation.
            :return: a SbmlMatchReactions form """
        # create the form
        match = SbmlMatchReactions(
            data=payload,
            sbml_template=self._sbml_template,
            match_fields=self._match_fields,
            **kwargs
        )
        # if payload does not have keys for some fields, make sure form uses default initial
        replace_data = QueryDict(mutable=True)
        # loop the fields
        for key, field in self._match_fields.items():
            base_name = match.add_prefix(key)
            # then loop the values in the field
            for i0, value in enumerate(field.initial):
                # finally, loop the decompressed parts of the value
                for i1, part in enumerate(field.widget.widgets[i0].decompress(value)):
                    part_key = '%s_%d_%d' % (base_name, i0, i1)
                    if part_key not in payload:
                        replace_data[part_key] = part
        replace_data.update(payload)
        match.data = replace_data
        match.sbml_warnings.extend(self._match_sbml_warnings)
        return match

    def create_measurement_forms(self, payload, **kwargs):
        """ Constructs a series of forms used to select which measurements to include in an SBML
            export.

            :param payload: the QueryDict from POST attribute of a request
            :param kwargs: any additional kwargs to pass to ALL forms; see Django Forms
                documentation. """
        line = self._selection.lines[0]
        m_forms = {
            'od_select_form': SbmlExportOdForm(
                data=payload, prefix='od', line=line,
                qfilter=(Q(measurement_type__short_name='OD') &
                         Q(assay__protocol__categorization=models.Protocol.CATEGORY_OD)),
                **kwargs
            ),
            'hplc_select_form': SbmlExportMeasurementsForm(
                data=payload, prefix='hplc', line=line,
                qfilter=Q(assay__protocol__categorization=models.Protocol.CATEGORY_HPLC),
                **kwargs
            ),
            'ms_select_form': SbmlExportMeasurementsForm(
                data=payload, prefix='ms', line=line,
                qfilter=Q(assay__protocol__categorization=models.Protocol.CATEGORY_LCMS),
                **kwargs
            ),
            'ramos_select_form': SbmlExportMeasurementsForm(
                data=payload, prefix='ramos', line=line,
                qfilter=Q(assay__protocol__categorization=models.Protocol.CATEGORY_RAMOS),
                **kwargs
            ),
            'omics_select_form': SbmlExportOmicsForm(
                data=payload, prefix='omics', line=line,
                qfilter=Q(assay__protocol__categorization=models.Protocol.CATEGORY_TPOMICS),
                **kwargs
            ),
        }
        for m_form in m_forms.values():
            if self._from_study_page:
                m_form.update_bound_data_with_defaults()
            if m_form.is_valid() and self._sbml_template:
                is_density = isinstance(m_form, SbmlExportOdForm)
                is_omics = isinstance(m_form, SbmlExportOmicsForm)
                if is_density:
                    self.add_density(m_form)
                elif is_omics:
                    self.add_omics(m_form)
                else:
                    self.add_measurements(m_form)
        self._forms.update(m_forms)

    def create_output_forms(self, payload, **kwargs):
        """ Create forms altering output of SBML; depends on measurement forms already existing.

            :param payload: the QueryDict from POST attribute of a request
            :param kwargs: any additional kwargs to pass to ALL forms; see Django Forms
                documentation. """
        if all(map(lambda f: f.is_valid(), self._forms.values())):
            match_form = self.create_match_form(payload, prefix='match', **kwargs)
            time_form = self.create_time_select_form(payload, prefix='time', **kwargs)
            self._forms.update({
                'match_form': match_form,
                'time_form': time_form,
            })

    def create_time_select_form(self, payload, **kwargs):
        """ Constructs a form to select the timepoint of data to export to SBML and the output
            filename. Depends on measurement forms already existing.

            :param payload: the QueryDict from POST attribute of a request
            :param kwargs: any additional kwargs to pass to ALL forms; see Django Forms
                documentation.
            :return: a SbmlExportSelectionForm """
        # error if no range or if max < min
        if self._min is None or self._max is None or self._max < self._min:
            return None
        points = self._points
        t_range = Range(min=self._min, max=self._max)
        if points is not None:
            points = sorted(points)
        time_form = SbmlExportSelectionForm(
            t_range=t_range, points=points, line=self._selection.lines[0], data=payload, **kwargs
        )
        time_form.sbml_warnings.extend(self._export_errors)
        return time_form

    def init_forms(self, payload, context):
        """ Constructs all the forms used in an SBML export based on data from a POST request.

            :param payload: the QueryDict from POST attribute of a request
            :param context: the view context object, for passing information to templates
            :return: an updated context """
        self.create_export_form(payload)
        self.create_measurement_forms(payload)
        self.create_output_forms(payload)
        return self.update_view_context(context)

    def load_measurement_queryset(self, m_form):
        """ Creates a queryset from the IDs in the measurements parameter, prefetching values to a
            values attr on each measurement.

            :param m_form: an SbmlExportMeasurementsForm
            :return: a QuerySet of measurements referenced in the form """
        # TODO: change to .order_by('x__0') once Django supports ordering on transform
        # https://code.djangoproject.com/ticket/24747
        values_qs = models.MeasurementValue.objects.filter(x__len=1, y__len=1).order_by('x')
        return m_form.measurement_qs.filter(
                measurement_format=models.Measurement.Format.SCALAR
            ).select_related(
                'assay__line',
            ).prefetch_related(
                Prefetch('measurementvalue_set', queryset=values_qs, to_attr='values'),
            )

    def output(self, time, matches):
        """ Writes the output SBML as a string.

            :param time: the selected time from a SbmlExportSelectionForm
            :param matches: the selected reaction<->measurement maches from a SbmlMatchReactions
                form
            :return: a SBML document serialized to a string """
        # TODO: make matches param match_form instead of match_form.cleaned_data
        # map species / reaction IDs to measurement IDs
        our_species = {}
        our_reactions = {}
        for mtype, match in matches.items():
            if match:  # when not None, match[0] == species and match[1] == reaction
                if match[0] and match[0] not in our_species:
                    our_species[match[0]] = mtype
                if match[1] and match[1] not in our_reactions:
                    our_reactions[match[1]] = mtype
        builder = SbmlBuilder()
        self._update_biomass(builder, time)
        self._update_species(builder, our_species, time)
        self._update_reaction(builder, our_reactions, time)
        self._update_carbon_ratio(builder, time)
        return builder.write_to_string(self._sbml_obj)

    def update_view_context(self, context):
        """ Adds additional display information to the view context, to be used by the template
            processor.

            :param context: the view context object, for passing information to templates
            :return: an updated context """
        # collect all the warnings together for counting
        forms = [f for f in self._forms.values() if isinstance(f, SbmlForm)]
        sbml_warnings = chain(*[f.sbml_warnings if f else [] for f in forms])
        context.update(self._forms)
        context.update(sbml_warnings=list(sbml_warnings))
        return context

    def _build_match_fields(self, types_list):
        species_qs = models.MetaboliteSpecies.objects.filter(
            measurement_type__in=types_list,
            sbml_template=self._sbml_template,
        )
        species_match = {s.measurement_type_id: s for s in species_qs}
        exchange_qs = models.MetaboliteExchange.objects.filter(
            measurement_type__in=types_list,
            sbml_template=self._sbml_template,
        )
        exchange_match = {x.measurement_type_id: x for x in exchange_qs}
        for t in types_list:
            key = '%s' % t.pk
            if key not in self._match_fields:
                i_species = species_match.get(t.pk, self._guess_species(t))
                i_exchange = exchange_match.get(t.pk, self._guess_exchange(t))
                self._match_fields[key] = SbmlMatchReactionField(
                    initial=(i_species, i_exchange),
                    label=t.type_name,
                    required=False,
                    template=self._sbml_template,
                )

    def _guess_exchange(self, measurement_type):
        mname = measurement_type.short_name
        mname_transcoded = generate_transcoded_metabolite_name(mname)
        guesses = [
            mname,
            mname_transcoded,
            "M_" + mname + "_e",
            "M_" + mname_transcoded + "_e",
            "M_" + mname_transcoded + "_e_",
        ]
        lookup = defaultdict(list)
        exchanges = models.MetaboliteExchange.objects.filter(
            reactant_name__in=guesses,
            sbml_template=self._sbml_template,
        )
        for x in exchanges:
            lookup[x.reactant_name].append(x)
        for guess in guesses:
            match = lookup.get(guess, None)
            if match:
                if len(match) > 1:
                    self._match_sbml_warnings.append(
                        _('Multiple exchanges found for %(type)s using %(guess)s. Selected '
                          'exchange %(match)s') % {
                            'guess': guess,
                            'match': match[0],
                            'type': measurement_type.type_name,
                        }
                    )
                return match[0]
        return None

    def _guess_species(self, measurement_type):
        guesses = generate_species_name_guesses_from_metabolite_name(measurement_type.short_name)
        lookup = {
            s.species: s
            for s in models.MetaboliteSpecies.objects.filter(
                sbml_template=self._sbml_template,
                species__in=guesses,
            )
        }
        for guess in guesses:
            if guess in lookup:
                return lookup[guess]
        return None

    def _update_biomass(self, builder, time):
        biomass = self._sbml_template.biomass_exchange_name
        reaction = self._sbml_model.getReaction(biomass)
        flux = 0
        try:
            times = [p.x[0] for p in self._density]
            next_index = bisect(times, time)
            # already converted with gCDW in SbmlExport#addDensity()
            if next_index == len(times) and time == times[-1]:
                # calculate flux based on second-to-last for last element
                y_0 = self._density[-2].y[0]
                y_next = self._density[-1].y[0]
                time_delta = float(time - times[-2])
            elif next_index == len(times):
                logger.warning('tried to calculate biomass flux beyond upper range of data')
                return
            elif next_index == 0 and times[0] != time:
                logger.warning('tried to calculate biomass flux beyond lower range of data')
                return
            else:
                # calculate flux to next value for all but last value
                y_0 = interpolate_at(self._density, time)
                y_next = float(self._density[next_index].y[0])
                time_delta = float(times[next_index] - time)
            flux = math.log(y_next / y_0) / time_delta
            kinetic_law = reaction.getKineticLaw()
            # NOTE: libsbml calls require use of 'bytes' CStrings
            upper_bound = kinetic_law.getParameter("UPPER_BOUND")
            lower_bound = kinetic_law.getParameter("LOWER_BOUND")
            upper_bound.setValue(flux)
            lower_bound.setValue(flux)
        except Exception as e:
            logger.exception('hit an error calculating biomass flux: %s', e)

    def _update_carbon_ratio(self, builder, time):
        notes = defaultdict(list)
        for mlist in viewvalues(self._measures):
            for m in mlist:
                if m.is_carbon_ratio():
                    points = models.MeasurementValue.objects.filter(measurement=m, x__0=time)
                    if points.exists():
                        # only get first value object, unwrap values_list tuple to get y-array
                        magnitudes = points.values_list('y')[0][0]
                        combined = ['%s(0.02)' % v for v in magnitudes]
                        # pad out to 13 elements
                        combined += ['-'] * (13 - len(magnitudes))
                        name = m.measurement_type.short_name
                        value = '\t'.join(combined)
                        # TODO: find a better way to store/update this magic string
                        notes['LCMSLabelData'].append(' %s\tM-0\t%s' % (name, value))
                    else:
                        logger.warning(
                            "No vector data found for %(measurement)s at %(time)s",
                            {'measurement': m, 'time': time}
                        )
        if self._sbml_model.isSetNotes():
            notes_obj = self._sbml_model.getNotes()
        else:
            notes_obj = builder.create_note_body()
        notes_obj = builder.update_note_body(notes_obj, **notes)
        self._sbml_model.setNotes(notes_obj)

    def _update_omics(self, builder, reaction, time):
        transcripts = []
        p_copies = []
        if reaction.isSetNotes():
            reaction_note_body = reaction.getNotes()
        else:
            reaction_note_body = builder.create_note_body()
        notes = builder.parse_note_body(reaction_note_body)
        for name in builder.read_note_associations(notes):
            values = models.MeasurementValue.objects.filter(
                measurement__in=self._omics.get(name, []),
                x__0=time,
            ).select_related('measurement__measurement_type')
            for v in values:
                text = '%s=%d' % (name, v.y[0])
                if v.measurement.measurement_type.is_gene():
                    transcripts.append(text)
                elif v.measurement.measurement_type.is_protein():
                    p_copies.append(text)
        reaction_note_body = builder.update_note_body(
            reaction_note_body,
            GENE_TRANSCRIPTION_VALUES=' '.join(transcripts),
            PROTEIN_COPY_VALUES=' '.join(p_copies),
        )
        reaction.setNotes(reaction_note_body)

    def _update_range_bounds(self, measurements, interpolate):
        measurement_qs = models.Measurement.objects.filter(pk__in=measurements)
        values_qs = models.MeasurementValue.objects.filter(x__len=1).order_by('x')
        # capture lower/upper bounds of t values for all measurements
        trange = measurement_qs.aggregate(
            max_t=Max('measurementvalue__x'), min_t=Min('measurementvalue__x'),
        )
        if trange['max_t']:
            self._max = min(trange['max_t'][0], self._max or sys.maxsize)
        if trange['min_t']:
            self._min = max(trange['min_t'][0], self._min or -sys.maxsize)
        # iff no interpolation, capture intersection of t values bounded by max & min
        m_inter = measurement_qs.exclude(assay__protocol__in=interpolate).prefetch_related(
            Prefetch('measurementvalue_set', queryset=values_qs, to_attr='values'),
        )
        for m in m_inter:
            points = {p.x[0] for p in m.values if self._min <= p.x[0] <= self._max}
            if self._points is None:
                self._points = points
            elif self._points:
                self._points.intersection_update(points)
                if not self._points:
                    # Adding warning as soon as no valid timepoints found
                    self._export_errors.append(
                        _('Including measurement %(type_name)s results in no valid export '
                          'timepoints; consider excluding this measurement, or enable '
                          'interpolation for the %(protocol)s protocol.') % {
                            'type_name': m.measurement_type.type_name,
                            'protocol': m.assay.protocol.name,
                        }
                    )

    def _update_reaction(self, builder, our_reactions, time):
        # loop over all template reactions, if in our_reactions set bounds, notes, etc
        for reaction_sid, mtype in viewitems(our_reactions):
            type_key = '%s' % mtype
            reaction = self._sbml_model.getReaction(reaction_sid)
            if reaction is None:
                logger.warning(
                    'No reaction found in %(template)s with ID %(id)s' % {
                        'template': self._sbml_template,
                        'id': reaction_sid,
                    }
                )
                continue
            else:
                logger.info("working on reaction %s", reaction_sid)
            self._update_omics(builder, reaction, time)
            try:
                values = self._values_by_type[type_key]
                times = [v.x[0] for v in values]
                next_index = bisect(times, time)
                if time > times[-1]:
                    logger.warning('tried to calculate reaction flux beyond upper range of data')
                    continue
                elif time < times[0]:
                    logger.warning('tried to calculate reaction flux beyond lower range of data')
                    continue
                elif next_index == len(times):
                    # calculate flux based on second-to-last for last element
                    y_0 = float(values[-1].y[0])
                    y_prev = float(values[-2].y[0])
                    y_delta = y_0 - y_prev
                    time_delta = float(time - times[-2])
                else:
                    # calculate flux to next value for all but last value
                    y_0 = interpolate_at(values, time)       # interpolate_at returns a float
                    y_next = float(values[next_index].y[0])
                    y_delta = y_next - y_0
                    time_delta = float(times[next_index] - time)
                # NOTE: arithmetic operators do not work between float and Decimal
                density = interpolate_at(self._density, time)
                start_density = interpolate_at(self._density, time - time_delta)
                # TODO: find better way to detect ratio units
                if values[0].measurement.y_units.unit_name.endswith('/hr'):
                    flux_end = y_0 / density
                    flux_start = flux_end
                else:
                    flux_start = (y_delta / time_delta) / start_density
                    flux_end = (y_delta / time_delta) / density
                kinetic_law = reaction.getKineticLaw()
                # NOTE: libsbml calls require use of 'bytes' CStrings
                upper_bound = kinetic_law.getParameter("UPPER_BOUND")
                lower_bound = kinetic_law.getParameter("LOWER_BOUND")
                upper_bound.setValue(max(flux_start, flux_end))
                lower_bound.setValue(min(flux_start, flux_end))
            except Exception as e:
                logger.exception('hit an error calculating reaction values: %s', type(e))

    def _update_species(self, builder, our_species, time):
        # loop over all template species, if in our_species set the notes section
        # TODO: keep MeasurementType in match_form, remove need to re-query Metabolite
        for species_sid, mtype in viewitems(our_species):
            type_key = '%s' % mtype
            metabolite = None
            try:
                metabolite = models.Metabolite.objects.get(pk=type_key)
            except models.Metabolite.DoesNotExist:
                logger.warning('Type %s is not a Metabolite', type_key)
            species = self._sbml_model.getSpecies(species_sid)
            if species is None:
                logger.warning(
                    'No species found in %(template)s with ID %(id)s' % {
                        'template': self._sbml_template,
                        'id': species_sid,
                    }
                )
                continue
            # collected all measurement_id matching type in add_measurements()
            measurements = self._measures.get(type_key, [])
            current = minimum = maximum = ''
            try:
                # TODO: change to .order_by('x__0') once Django supports ordering on transform
                # https://code.djangoproject.com/ticket/24747
                values = list(models.MeasurementValue.objects.filter(
                    measurement__in=measurements
                ).select_related('measurement__y_units').order_by('x'))
                # convert units
                for v in values:
                    units = v.measurement.y_units
                    f = models.MeasurementUnit.conversion_dict.get(units.unit_name, None)
                    if f is not None:
                        v.y = [f(y, metabolite) for y in v.y]
                    else:
                        logger.warning('unrecognized unit %s', units)
                # save here so _update_reaction does not need to re-query
                self._values_by_type[type_key] = values
                minimum = float(min(values, key=lambda v: v.y[0]).y[0])
                maximum = float(max(values, key=lambda v: v.y[0]).y[0])
                current = interpolate_at(values, time)
            except Exception as e:
                logger.exception('hit an error calculating species values: %s', type(e))
            else:
                if species.isSetNotes():
                    species_notes = species.getNotes()
                else:
                    species_notes = builder.create_note_body()
                species_notes = builder.update_note_body(
                    species_notes,
                    CONCENTRATION_CURRENT='%s' % current,
                    CONCENTRATION_HIGHEST='%s' % maximum,
                    CONCENTRATION_LOWEST='%s' % minimum,
                )
                species.setNotes(species_notes)


class SbmlExportSettingsForm(SbmlForm):
    """ Form used for selecting settings on SBML exports. """
    sbml_template = forms.ModelChoiceField(
        # TODO: potentially narrow options based on current user?
        models.SBMLTemplate.objects.exclude(biomass_exchange_name=''),
        label=_('SBML Template'),
    )

    def update_bound_data_with_defaults(self):
        """ Forces data bound to the form to update to default values. """
        if self.is_bound:
            # create mutable copy of QueryDict
            replace_data = QueryDict(mutable=True)
            replace_data.update(self.data)
            # set initial measurementId values
            field = self.fields['sbml_template']
            if field.initial:
                replace_data[self.add_prefix('sbml_template')] = '%s' % field.initial
            else:
                self._sbml_warnings.append(
                    _('No SBML template set for this study; a template must be selected to '
                      'export data as SBML.')
                )
            self.data = replace_data


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
    measurement = MeasurementChoiceField(
        queryset=models.Measurement.objects.none(),  # this is overridden in __init__()
        required=False,
        widget=forms.CheckboxSelectMultiple,
    )
    interpolate = forms.ModelMultipleChoiceField(
        label=_('Allow interpolation for'),
        queryset=models.Protocol.objects.none(),  # this is overridden in __init__()
        required=False,
        widget=forms.CheckboxSelectMultiple,
    )

    def __init__(self, line, *args, **kwargs):
        """
        Required:
            line = a main.models.Line object defining the items for export
        Optional:
            qfilter = arguments to filter a measurement queryset from
                main.export.table.ExportSelection
        """
        qfilter = kwargs.pop('qfilter', None)
        super(SbmlExportMeasurementsForm, self).__init__(*args, **kwargs)
        self._line = line
        self._init_fields(qfilter)

    def _init_fields(self, qfilter):
        f = self.fields['measurement']
        f.queryset = models.Measurement.objects.filter(
            assay__line=self._line,
        ).order_by(
            'assay__protocol__name', 'assay__name',
        ).select_related(
            # including these to cut down on additional queries later
            'assay',
            'assay__protocol',
            'y_units',
            'measurement_type',
        ).prefetch_related(
            'measurementvalue_set',
        )
        if qfilter is not None:
            f.queryset = f.queryset.filter(qfilter)
        if f.queryset.count() == 0:
            self._sbml_warnings.append(_('No protocols have usable data.'))
            f.initial = []
            del self.fields['interpolate']
        else:
            f.initial = f.queryset
            # Add in warnings for any Metabolite measurements that have no defined molar_mass
            missing_mass = models.Metabolite.objects.filter(
                Q(measurement__in=f.queryset),
                Q(molar_mass__isnull=True) | Q(molar_mass=0),
            ).order_by('type_name')
            for metabolite in missing_mass:
                self._sbml_warnings.append(
                    _('Measurement type %(type_name)s has no defined molar mass.') % {
                        'type_name': metabolite.type_name,
                    }
                )
            self.fields['interpolate'].queryset = models.Protocol.objects.filter(
                assay__measurement__in=f.queryset
            ).distinct()
        return f.queryset

    def form_without_measurements(self):
        """ Returns a copy of the form without the measurement field; this allows rendering in
            templates as, e.g. `form_var.form_without_measurements.as_p`. """
        fles = copy(self)
        fles.fields = OrderedDict(self.fields)
        del fles.fields['measurement']
        return fles

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
        if prev_protocol is not None:
            yield (prev_protocol, items)

    def x_range(self):
        """ Returns the bounding range of X-values used for all Measurements in the form. """
        f = self.fields['measurement']
        x_range = f.queryset.aggregate(
            max=Max('measurementvalue__x'), min=Min('measurementvalue__x')
        )
        # can potentially get None if there are no values; use __getitem__ default AND `or [0]`
        x_max = x_range.get('max', [0]) or [0]
        x_min = x_range.get('min', [0]) or [0]
        # max and min are both still arrays, grab the first element
        return (x_min[0], x_max[0])

    def update_bound_data_with_defaults(self):
        """ Forces data bound to the form to update to default values. """
        if self.is_bound:
            # create mutable copy of QueryDict
            replace_data = QueryDict(mutable=True)
            replace_data.update(self.data)
            # set initial measurement values
            mfield = self.fields['measurement']
            replace_data.setlist(
                self.add_prefix('measurement'),
                ['%s' % v.pk for v in mfield.initial]
            )
            self.data = replace_data

    def _get_measurements(self):
        # lazy eval and try not to query more than once
        # NOTE: still gets evaled at least three times: populating choices, here, and validation
        if not hasattr(self, '_measures'):
            field = self.fields['measurement']
            self._measures = list(field.queryset)
        return self._measures
    measurement_list = property(_get_measurements,
                                doc='A list of Measurements included in the form')

    def _get_measurement_qs(self):
        field = self.fields.get('measurement', None)
        return field.queryset if field else models.Measurement.objects.none()
    measurement_qs = property(_get_measurement_qs,
                              doc='A queryset of the Measurements included in the form')

    def _get_measurement_widgets(self):
        # lazy eval and try not to query more than once
        if not hasattr(self, '_measure_widgets'):
            widgets = self['measurement']
            self._measure_widgets = list(widgets)
        return self._measure_widgets
    measurement_widgets = property(_get_measurement_widgets,
                                   doc='A list of widgets used to select Measurements')


class SbmlExportOmicsForm(SbmlExportMeasurementsForm):
    """ Specific named class for selection of Omics measurements. """
    pass


class SbmlExportOdForm(SbmlExportMeasurementsForm):
    """ Specific class for selection of density measurements. """
    DEFAULT_GCDW_FACTOR = Decimal('0.65')
    PREF_GCDW_META = 'export.sbml.gcdw_metadata'
    gcdw_conversion = forms.ModelChoiceField(
        empty_label=None,
        help_text=_('Select the metadata containing the conversion factor for Optical Density '
                    'to grams carbon dry-weight per liter.'),
        label=_('gCDW/L/OD factor metadata'),
        queryset=models.MetadataType.objects.filter(),
        required=False,
        widget=MetadataTypeAutocompleteWidget,
    )
    gcdw_default = forms.DecimalField(
        help_text=_('Override the default conversion factor used if no metadata value is found.'),
        initial=DEFAULT_GCDW_FACTOR,
        label=_('Default gCDW/L/OD factor'),
        min_value=Decimal(0),
        required=True,
    )
    field_order = ['gcdw_default', 'gcdw_conversion', 'interpolate', ]

    def clean(self):
        data = super(SbmlExportOdForm, self).clean()
        gcdw_default = data.get('gcdw_default', self.DEFAULT_GCDW_FACTOR)
        conversion_meta = data.get('gcdw_conversion', None)
        if conversion_meta is None:
            self._sbml_warnings.append(mark_safe(
                _('No gCDW/L/OD metadata selected, all measurements will be converted with the '
                  'default factor of <b>%(factor)f</b>.') % {'factor': gcdw_default}
            ))
        else:
            self._clean_check_for_gcdw(data, gcdw_default, conversion_meta)
        # make sure that at least some OD measurements are selected
        if len(data.get('measurement', [])) == 0:
            raise ValidationError(
                _('No Optical Data measurements were selected. Biomass measurements are essential '
                  'for flux balance analysis.'),
                code='OD-required-for-FBA'
            )
        return data

    def _clean_check_for_curve(self, data):
        """ Ensures that each unique selected line has at least two points to calculate a
            growth curve. """
        for line in viewvalues(self._clean_collect_data_lines(data)):
            count = 0
            for m in self._measures_by_line[line.pk]:
                count += len(m.measurementvalue_set.all())
                if count > 1:
                    break
            if count < 2:
                raise ValidationError(
                    _('Optical Data for %(line)s contains less than two data points. Biomass '
                      'measurements are essential for FBA, and at least two are needed to define '
                      'a growth rate.') % {'line': line.name},
                    code='growth-rate-required-for-FBA'
                )

    def _clean_check_for_gcdw(self, data, gcdw_default, conversion_meta):
        """ Ensures that each unique selected line has a gCDW/L/OD factor. """
        # warn for any lines missing the selected metadata type
        for line in viewvalues(self._clean_collect_data_lines(data)):
            factor = line.metadata_get(conversion_meta)
            # TODO: also check that the factor in metadata is a valid value
            if factor is None:
                self._sbml_warnings.append(
                    _('Could not find metadata %(meta)s on %(line)s; using default factor '
                      'of <b>%(factor)f</b>.') % {
                        'factor': gcdw_default,
                        'line': line.name,
                        'meta': conversion_meta.type_name,
                      }
                )

    def _clean_collect_data_lines(self, data):
        """ Collects all the lines included in a data selection. """
        if not hasattr(self, '_lines'):
            self._lines = {}
            self._measures_by_line = defaultdict(list)
            # get unique lines first
            for m in data.get('measurement', []):
                self._lines[m.assay.line.pk] = m.assay.line
                self._measures_by_line[m.assay.line.pk].append(m)
        return self._lines

    def _init_conversion(self):
        """ Attempt to load a default initial value for gcdw_conversion based on user. """
        request = get_current_request()
        if request and request.user:
            prefs = request.user.profile.prefs
            try:
                return models.MetadataType.objects.get(pk=prefs[self.PREF_GCDW_META])
            except models.MetadataType.DoesNotExist:
                return None
        # TODO: load preferences from the system user if no request user
        return None

    def update_bound_data_with_defaults(self):
        """ Forces data bound to the form to update to default values. """
        super(SbmlExportOdForm, self).update_bound_data_with_defaults()
        if self.is_bound:
            # create mutable copy of QueryDict
            replace_data = QueryDict(mutable=True)
            replace_data.update(self.data)
            # set initial gcdw_conversion values
            cfield = self.fields['gcdw_conversion']
            if cfield.initial:
                name = self.add_prefix('gcdw_conversion')
                for i, part in enumerate(cfield.widget.decompress(cfield.initial)):
                    replace_data['%s_%s' % (name, i)] = part
            # set initial gcdw_default value
            dfield = self.fields['gcdw_default']
            replace_data[self.add_prefix('gcdw_default')] = '%s' % dfield.initial
            self.data = replace_data


class SbmlMatchReactionWidget(forms.widgets.MultiWidget):
    """ Widget combining both SBML species selection and SBML reaction selection for a particular
        MeasurementType. """
    def __init__(self, template, attrs=None):
        widgets = (
            SbmlSpeciesAutocompleteWidget(template),
            SbmlExchangeAutocompleteWidget(template),
        )
        super(SbmlMatchReactionWidget, self).__init__(widgets, attrs)

    def decompress(self, value):
        if value is None:
            return ['', '']
        return value  # value is a tuple anyway

    def format_output(self, rendered_widgets):
        return '</td><td>'.join(rendered_widgets)


class SbmlMatchReactionField(forms.MultiValueField):
    """ A form Field combining the selected values of SBML species and SBML reaction. """
    def __init__(self, template, *args, **kwargs):
        fields = (forms.CharField(), forms.CharField())  # these are only placeholders
        self.widget = SbmlMatchReactionWidget(template)
        super(SbmlMatchReactionField, self).__init__(fields, *args, **kwargs)

    def compress(self, data_list):
        if data_list:
            # TODO validation
            return (data_list[0], data_list[1])
        return None


class SbmlMatchReactions(SbmlForm):
    """ A form to match selected MeasurementTypes to species and reactions contained in an
        SBMLTemplate. """
    def __init__(self, sbml_template, match_fields, *args, **kwargs):
        super(SbmlMatchReactions, self).__init__(*args, **kwargs)
        self._sbml_template = sbml_template
        self.fields.update(match_fields)

    def clean(self):
        # TODO validate the choices
        return super(SbmlMatchReactions, self).clean()


class SbmlExportSelectionForm(SbmlForm):
    """ Form determining output timepoint and filename for an SBML download. """
    time_select = forms.DecimalField(
        help_text=_('Select the time to compute fluxes for embedding in SBML template'),
        label=_('Time for export'),
    )
    filename = forms.CharField(
        help_text=_('Choose the filename for the downloaded SBML file'),
        initial=_('changeme.sbml'),
        label=_('SBML Filename'),
        max_length=255,
        required=False,
    )

    def __init__(self, t_range, points=None, line=None, *args, **kwargs):
        super(SbmlExportSelectionForm, self).__init__(*args, **kwargs)
        time_field = self.fields['time_select']
        if points is not None:
            initial = points[0] if points else None
            self.fields['time_select'] = forms.TypedChoiceField(
                choices=[('%s' % t, '%s hr' % t) for t in points],
                coerce=Decimal,
                empty_value=None,
                help_text=time_field.help_text,
                initial=initial,
                label=time_field.label,
            )
        else:
            time_field.max_value = t_range.max
            time_field.min_value = t_range.min
            time_field.initial = t_range.min
            time_field.help_text = _(
                'Select the time to compute fluxes for embedding in SBML template (in the range '
                '%(min)s to %(max)s)'
            ) % t_range._asdict()
        if line is not None:
            self.fields['filename'].initial = '%s.sbml' % line.name
        # update self.data with defaults for fields
        replace_data = QueryDict(mutable=True)
        for fn in ['time_select', 'filename']:
            fk = self.add_prefix(fn)
            if fk not in self.data:
                replace_data[fk] = self.fields[fn].initial
        replace_data.update(self.data)
        self.data = replace_data


class SbmlBuilder(object):
    """ A little facade class to provide better interface to libsbml and some higher-level
        utilities to work with SBML files. """
    def create_note_body(self):
        """ Creates an empty notes element.

            :return: an empty notes XMLNode """
        notes_node = libsbml.XMLNode()
        body_tag = libsbml.XMLTriple("body", "", "")
        attributes = libsbml.XMLAttributes()
        namespace = libsbml.XMLNamespaces()
        namespace.add("http://www.w3.org/1999/xhtml", "")
        body_token = libsbml.XMLToken(body_tag, attributes, namespace)
        body_node = libsbml.XMLNode(body_token)
        notes_node.addChild(body_node)
        return notes_node

    def parse_note_body(self, node):
        """ Reads a notes element into an OrderedDict (keys will iterate in order read).

            :param node: the notes SBML node
            :return: an OrderedDict of contents of the notes element """
        notes = OrderedDict()
        if node is None:
            return notes
        note_body = node
        if note_body.hasChild('body'):
            note_body = note_body.getChild(0)
        # API not very pythonic, cannot just iterate over children
        for index in range(note_body.getNumChildren()):
            p = note_body.getChild(index)
            if p.getNumChildren() > 1:
                text = p.getChild(0).toXMLString()
                key, value = text.split(':')
                key = key.strip()
                notes[key] = p.getChild(1)
            elif p.getNumChildren() == 1:
                text = p.getChild(0).toXMLString()
                key, value = text.split(':')
                notes[key.strip()] = value.strip()
        return notes

    def read_note_associations(self, notes):
        """ Parses gene and protein associations from SBML notes.

            :param notes: a dict parsed from SbmlBuilder#parse_note_body
            :return: an iterable of names (strings) associated with a reaction """
        # previous code tried to parse out based on boolean operators, but that info was never
        #   used; now using simpler method of finding 'word' tokens, discarding matches to:
        #   'and', 'or', 'None', and 'N.A.'
        ignore = {'and', 'or', 'None', 'N.A.'}
        pattern = re.compile(r'\b\w+\b')
        g_assoc = notes.get('GENE_ASSOCIATION', '')
        p_assoc = notes.get('PROTEIN_ASSOCIATION', '')
        return chain(
            [name for name in pattern.findall(g_assoc) if name not in ignore],
            [name for name in pattern.findall(p_assoc) if name not in ignore],
        )

    def update_note_body(self, _note_node, **kwargs):
        """ Writes keys to a notes element.

            :param _note_node: a notes XMLNode
            :param kwargs: arbitrary key-values to add to the notes
            :return: the notes element passed in """
        # ensure adding to the <body> node
        body = _note_node
        if _note_node.hasChild('body'):
            body = _note_node.getChild(0)
        notes = self.parse_note_body(body)
        notes.update(**kwargs)
        body.removeChildren()
        for key, value in viewitems(notes):
            if isinstance(value, string_types):
                self._add_p_tag(body, '%s: %s' % (key, value))
            else:
                try:
                    # add a p-tag for every element in list
                    for line in value:
                        self._add_p_tag(body, '%s:%s' % (key, line))
                except TypeError:
                    # add p-tag and append any XML contained in value
                    p_node = self._add_p_tag(body, '%s: ' % (key, ))
                    if isinstance(value, libsbml.XMLNode):
                        p_node.addChild(value)
        return _note_node

    def write_to_string(self, document):
        """ Writes an in-memory SBML document to a string.

            :return: a string serialization of an SBML document """
        return libsbml.writeSBMLToString(document)

    def _add_p_tag(self, body, text):
        attributes = libsbml.XMLAttributes()
        namespace = libsbml.XMLNamespaces()
        p_tag = libsbml.XMLTriple("p", "", "")
        p_token = libsbml.XMLToken(p_tag, attributes, namespace)
        text_token = libsbml.XMLToken(text)
        text_node = libsbml.XMLNode(text_token)
        p_node = libsbml.XMLNode(p_token)
        p_node.addChild(text_node)
        body.addChild(p_node)
        return p_node


def compose(*args):
    """ Composes argument functions and returns resulting function;
        e.g. compose(f, g)(x) == f(g(x)) """
    return reduce(lambda f, g: lambda x: f(g(x)), args, lambda x: x)


# functions to substitute character sequences in a string
dash_sub = partial(re.compile(r'-').sub, '_DASH_')
lparen_sub = partial(re.compile(r'\(').sub, '_LPAREN_')
rparen_sub = partial(re.compile(r'\)').sub, '_RPAREN_')
lsqbkt_sub = partial(re.compile(r'\[').sub, '_LSQBKT_')
rsqbkt_sub = partial(re.compile(r'\]').sub, '_RSQBKT_')
transcode = compose(dash_sub, lparen_sub, rparen_sub, lsqbkt_sub, rsqbkt_sub)


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
    return transcode(mname)


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


########################################################################
# ADMIN FEATURES
#
def validate_sbml_attachment(file_data):
    sbml = libsbml.readSBMLFromString(file_data)
    errors = sbml.getErrorLog()
    if (errors.getNumErrors() > 0):
        raise ValueError(errors.getError(1).getMessage())
    model = sbml.getModel()
    assert (model is not None)
    return sbml
