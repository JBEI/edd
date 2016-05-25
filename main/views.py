# coding: utf-8
from __future__ import unicode_literals

import collections
import json
import logging
import re

from builtins import str
from django.conf import settings
from django.contrib import messages
from django.core.exceptions import ValidationError
from django.core.urlresolvers import reverse
from django.db.models import Count, Prefetch, Q
from django.http import (
    Http404, HttpResponse, HttpResponseNotAllowed, HttpResponseRedirect, JsonResponse,
)
from django.http.response import HttpResponseForbidden, HttpResponseBadRequest
from django.shortcuts import render, get_object_or_404, redirect
from django.template import RequestContext
from django.template.defaulttags import register
from django.utils.safestring import mark_safe
from django.utils.translation import ugettext_lazy as _
from django.views import generic
from django.views.decorators.csrf import ensure_csrf_cookie
from io import BytesIO
from itertools import chain

from . import autocomplete
from .importer import (
    TableImport, import_rna_seq, import_rnaseq_edgepro, interpret_edgepro_data,
    interpret_raw_rna_seq_data,
)
from .export.forms import (ExportOptionForm, ExportSelectionForm,  WorklistForm,)
from .export.sbml import (
    SbmlExportMeasurementsForm, SbmlExport, SbmlExportOdForm, SbmlExportSettingsForm,
)
from .export.table import ExportSelection, TableExport, WorklistExport
from .forms import (
    AssayForm, CreateAttachmentForm, CreateCommentForm, CreateStudyForm, LineForm, MeasurementForm,
    MeasurementValueFormSet,
)
from .models import (
    Assay, Attachment, Line, Measurement, MeasurementType, MeasurementValue, Metabolite,
    MetaboliteSpecies, MetadataType, Protocol, SBMLTemplate, Study, StudyPermission, Update,
)
from .signals import study_modified
from .solr import StudySearch
from .utilities import (
    JSONDecimalEncoder, get_edddata_carbon_sources, get_edddata_measurement, get_edddata_misc,
    get_edddata_strains, get_edddata_study, get_edddata_users,
)

logger = logging.getLogger(__name__)


@register.filter(name='lookup')
def lookup(dictionary, key):
    """
    Utility template filter, as Django forbids argument passing in templates. Used for filtering
    out values, e.g. for metadata, of list has EDDObject items and type is a MetadataType:
    {%% for obj in list %%}
    {{ obj.metadata|lookup:type }}
    {%% endfor %%}
    """
    return dictionary.get(key, settings.TEMPLATE_STRING_IF_INVALID)


@register.filter(name='formula')
def formula(molecular_formula):
    """ Convert the molecular formula to a list of dictionaries giving each element and its count.
        This is used in HTML views with <sub> tags. """
    elements = re.findall("([A-Z][a-z]{0,2})([1-9][0-9]*)?", molecular_formula)
    return mark_safe(
        "".join(['%s%s' % (e, '<sub>%s</sub>' % c if c != '' else c) for e, c in elements])
        )


def load_study(request, study_id, permission_type=['R', 'W', ]):
    """ Loads a study as a request user; throws a 404 if the study does not exist OR if no valid
        permissions are set for the user on the study. """
    if request.user.is_superuser:
        return get_object_or_404(Study, pk=study_id)
    return get_object_or_404(
        Study.objects.distinct(),
        Q(userpermission__user=request.user,
          userpermission__permission_type__in=permission_type) |
        Q(grouppermission__group__user=request.user,
          grouppermission__permission_type__in=permission_type),
        pk=study_id)


class StudyCreateView(generic.edit.CreateView):
    """
    View for request to create a study, and the index page.
    """
    form_class = CreateStudyForm
    template_name = 'main/index.html'

    def form_valid(self, form):
        update = Update.load_request_update(self.request)
        study = form.instance
        study.active = True     # defaults to True, but being explicit
        study.created = update
        study.updated = update
        return generic.edit.CreateView.form_valid(self, form)

    def get_context_data(self, **kwargs):
        context = super(StudyCreateView, self).get_context_data(**kwargs)
        context['can_create'] = Study.user_can_create(self.request.user)
        return context

    def get_success_url(self):
        return reverse('main:detail', kwargs={'pk': self.object.pk})


class StudyDetailView(generic.DetailView):
    """ Study details page, displays line/assay data. """
    model = Study
    template_name = 'main/detail.html'

    def get_context_data(self, **kwargs):
        context = super(StudyDetailView, self).get_context_data(**kwargs)
        context['edit_study'] = CreateStudyForm(instance=self.get_object(), prefix='study')
        context['new_assay'] = AssayForm(prefix='assay')
        context['new_attach'] = CreateAttachmentForm()
        context['new_comment'] = CreateCommentForm()
        context['new_line'] = LineForm(prefix='line')
        context['new_measurement'] = MeasurementForm(prefix='measurement')
        context['writable'] = self.get_object().user_can_write(self.request.user)
        return context

    def get_object(self, queryset=None):
        """ Overrides the base method to curry if there is no filtering queryset. """
        # already looked up object and no filter needed, return previous object
        if hasattr(self, '_detail_object') and queryset is None:
            return self._detail_object
        # call parents
        obj = super(StudyDetailView, self).get_object(queryset)
        # save parents result if no filtering queryset
        if queryset is None:
            self._detail_object = obj
        return obj

    def get_queryset(self):
        qs = super(StudyDetailView, self).get_queryset()
        if self.request.user.is_superuser:
            return qs
        return qs.filter(
            Q(userpermission__user=self.request.user,
              userpermission__permission_type__in=['R', 'W', ]) |
            Q(grouppermission__group__user=self.request.user,
              grouppermission__permission_type__in=['R', 'W', ])).distinct()

    def handle_assay(self, request, context, *args, **kwargs):
        assay_id = request.POST.get('assay-assay_id', None)
        assay = self._get_assay(assay_id) if assay_id else None
        if assay:
            form = AssayForm(request.POST, instance=assay, lines=[assay.line_id], prefix='assay')
        else:
            ids = request.POST.getlist('lineId', [])
            form = AssayForm(request.POST, lines=ids, prefix='assay')
            if len(ids) == 0:
                form.add_error(None, ValidationError(
                    _('Must select at least one line to add Assay'),
                    code='no-lines-selected'
                    ))
        context['new_assay'] = form
        if form.is_valid():
            form.save()
            return True
        return False

    def handle_assay_action(self, request, context, *args, **kwargs):
        assay_action = request.POST.get('assay_action', None)
        can_write = self.object.user_can_write(request.user)
        form_valid = False
        # allow any who can view to export
        if assay_action == 'export':
            export_type = request.POST.get('export', 'csv')
            if export_type == 'sbml':
                return SbmlView.as_view()
            else:
                return ExportView.as_view()
        # but not edit
        elif not can_write:
            messages.error(request, 'You do not have permission to modify this study.')
        elif assay_action == 'mark':
            form_valid = self.handle_assay_mark(request)
        elif assay_action == 'delete':
            form_valid = self.handle_measurement_delete(request)
        elif assay_action == 'edit':
            return self.handle_measurement_edit(request)
        elif assay_action == 'update':
            return self.handle_measurement_update(request, context)
        else:
            messages.error(request, 'Unknown assay action %s' % (assay_action))
        return form_valid

    def handle_assay_mark(self, request):
        ids = request.POST.getlist('assayId', [])
        study = self.get_object()
        disable = request.POST.get('disable', None)
        if disable == 'true':
            active = False
        elif disable == 'false':
            active = True
        else:
            messages.error(request, 'Invalid action specified, doing nothing')
            return True
        count = Assay.objects.filter(pk__in=ids, line__study=study).update(active=active)
        messages.success(request, 'Updated %(count)s Assays' % {
            'count': count,
            })
        return True

    def handle_attach(self, request, context, *args, **kwargs):
        form = CreateAttachmentForm(request.POST, request.FILES, edd_object=self.get_object())
        if form.is_valid():
            form.save()
            return True
        else:
            context['new_attach'] = form
        return False

    def handle_clone(self, request, context, *args, **kwargs):
        ids = request.POST.getlist('lineId', [])
        study = self.get_object()
        cloned = 0
        for line_id in ids:
            line = self._get_line(line_id)
            if line:
                # easy way to clone is just pretend to fill out add line form
                initial = LineForm.initial_from_model(line)
                # update name to indicate which is the clone
                initial['name'] = initial['name'] + ' clone'
                clone = LineForm(initial, study=study)
                if clone.is_valid():
                    clone.save()
                    cloned += 1
        messages.success(request, 'Cloned %(cloned)s of %(total)s Lines' % {
            'cloned': cloned,
            'total': len(ids),
            })
        return True

    def handle_comment(self, request, context, *args, **kwargs):
        form = CreateCommentForm(request.POST, edd_object=self.get_object())
        if form.is_valid():
            form.save()
            return True
        else:
            context['new_comment'] = form
        return False

    def handle_disable(self, request):
        ids = request.POST.getlist('lineId', [])
        study = self.get_object()
        disable = request.POST.get('disable', 'true')
        active = disable == 'false'
        count = Line.objects.filter(study=study, id__in=ids).update(active=active)
        messages.success(request, '%s %s Lines' % ('Enabled' if active else 'Disabled', count))
        return True

    def handle_group(self, request, context, *args, **kwargs):
        ids = request.POST.getlist('lineId', [])
        study = self.get_object()
        if len(ids) > 1:
            first = ids[0]
            count = Line.objects.filter(study=study, pk__in=ids).update(replicate_id=first)
            messages.success(request, 'Grouped %s Lines' % count)
            return True
        messages.error(request, 'Must select more than one Line to group.')
        return False

    def handle_line(self, request, context, *args, **kwargs):
        ids = [v for v in request.POST.get('line-ids', '').split(',') if v.strip() != '']
        if len(ids) == 0:
            return self.handle_line_new(request, context)
        elif len(ids) == 1:
            return self.handle_line_edit(request, context, ids[0])
        else:
            return self.handle_line_bulk(request, ids)
        return False

    def handle_line_action(self, request, context, *args, **kwargs):
        can_write = self.object.user_can_write(request.user)
        line_action = request.POST.get('line_action', None)
        form_valid = False
        # allow any who can view to export
        if line_action == 'export':
            export_type = request.POST.get('export', 'csv')
            if export_type == 'sbml':
                return SbmlView.as_view()
            else:
                return ExportView.as_view()
        elif line_action == 'worklist':
            return WorklistView.as_view()
        # but not edit
        elif not can_write:
            messages.error(request, 'You do not have permission to modify this study.')
        elif line_action == 'edit':
            form_valid = self.handle_disable(request)
        else:
            messages.error(request, 'Unknown line action %s' % (line_action))
        return form_valid

    def handle_line_bulk(self, request, ids):
        study = self.get_object()
        total = len(ids)
        saved = 0
        for value in ids:
            logger.info('\tprocessing line bulk edit for %s', value)
            line = self._get_line(value)
            if line:
                form = LineForm(request.POST, instance=line, prefix='line', study=study)
                form.check_bulk_edit()  # removes fields having disabled bulk edit checkbox
                if form.is_valid():
                    form.save()
                    saved += 1
                else:
                    for error in form.errors.values():
                        messages.warning(request, error)
                    logger.info('Errors: %s', form.errors)
        messages.success(request, 'Saved %(saved)s of %(total)s Lines' % {
            'saved': saved,
            'total': total,
            })
        return True

    def handle_line_edit(self, request, context, pk):
        study = self.get_object()
        line = self._get_line(pk)
        if line:
            form = LineForm(request.POST, instance=line, prefix='line', study=study)
            context['new_line'] = form
            if form.is_valid():
                form.save()
                messages.success(request, "Saved Line '%(name)s'" % {'name': form['name'].value()})
                return True
        else:
            messages.error(request, 'Failed to load line for editing.')
        return False

    def handle_line_new(self, request, context):
        form = LineForm(request.POST, prefix='line', study=self.get_object())
        if form.is_valid():
            form.save()
            messages.success(request, "Added Line '%(name)s" % {'name': form['name'].value()})
            return True
        else:
            context['new_line'] = form
        return False

    def handle_measurement(self, request, context, *args, **kwargs):
        ids = request.POST.getlist('assayId', [])
        form = MeasurementForm(request.POST, assays=ids, prefix='measurement')
        if len(ids) == 0:
            form.add_error(None, ValidationError(
                _('Must select at least one assay to add Measurement'),
                code='no-assays-selected'
                ))
        context['new_measurement'] = form
        if form.is_valid():
            form.save()
            return True
        return False

    def handle_measurement_delete(self, request):
        assay_ids = request.POST.getlist('assayId', [])
        measure_ids = request.POST.getlist('meaurementId', [])
        # "deleting" by setting active to False
        Measurement.objects.filter(
            Q(assay_id__in=assay_ids) | Q(pk__in=measure_ids)
        ).update(
            active=False
        )
        return True

    def handle_measurement_edit(self, request):
        assay_ids = request.POST.getlist('assayId', [])
        measure_ids = request.POST.getlist('measurementId', [])
        measures = Measurement.objects.filter(
            Q(assay_id__in=assay_ids) | Q(id__in=measure_ids),
        ).select_related(
            'assay__line', 'assay__protocol__name', 'measurement_type',
        ).order_by(
            'assay__line_id', 'assay_id',
        ).prefetch_related(
            Prefetch('measurementvalue_set', queryset=MeasurementValue.objects.order_by('x'))
        )
        # map sequence of measurements to structure of unique lines/assays
        lines = {}
        for m in measures:
            a = m.assay
            l = a.line
            line_dict = lines.setdefault(l.id, {'line': l, 'assays': {}, })
            assay_dict = line_dict['assays'].setdefault(a.id, {
                'assay': a,
                'measures': collections.OrderedDict(),
                })
            assay_dict['measures'][m.id] = {
                'measure': m,
                'form': MeasurementValueFormSet(
                    instance=m, prefix=str(m.id), queryset=m.measurementvalue_set.order_by('x')),
                }
        return self.handle_measurement_edit_response(request, lines, measures)

    def handle_measurement_edit_response(self, request, lines, measures):
        return render(
            request,
            'main/edit_measurement.html',
            context={
                'lines': lines,
                'measures': ','.join(['%s' % m.pk for m in measures]),
                'study': self.object,
            },
            context_instance=RequestContext(request),
            )

    def handle_measurement_update(self, request, context):
        measure_ids = request.POST.get('measureId', '')
        measures = Measurement.objects.filter(
            id__in=measure_ids.split(',')
        ).select_related(
            'assay__line', 'assay__protocol__name', 'measurement_type',
        ).order_by(
            'assay__line_id', 'assay_id',
        ).prefetch_related(
            Prefetch('measurementvalue_set', queryset=MeasurementValue.objects.order_by('x'))
        )
        is_valid = True
        # map sequence of measurements to structure of unique lines/assays
        lines = {}
        for m in measures:
            a = m.assay
            l = a.line
            line_dict = lines.setdefault(l.id, {'line': l, 'assays': {}, })
            assay_dict = line_dict['assays'].setdefault(a.id, {
                'assay': a,
                'measures': collections.OrderedDict(),
                })
            aform = MeasurementValueFormSet(
                request.POST or None,
                instance=m,
                prefix=str(m.id),
                queryset=m.measurementvalue_set.order_by('x'),
                )
            if aform.is_valid():
                aform.save()
            else:
                is_valid = False
            assay_dict['measures'][m.id] = {
                'measure': m,
                'form': aform,
                }
        if not is_valid:
            return self.handle_measurement_edit_response(request, lines, measures)
        return self.post_response(request, context, True)

    def handle_unknown(self, request, context, *args, **kwargs):
        messages.error(
            request, 'Unknown action, or you do not have permission to modify this study.'
        )
        return False

    def handle_update(self, request, context, *args, **kwargs):
        study = self.get_object()
        form = CreateStudyForm(request.POST or None, instance=study, prefix='study')
        if form.is_valid():
            self.object = form.save()  # make sure we're updating the view object
            return True
        return False

    def post(self, request, *args, **kwargs):
        self.object = self.get_object()
        action = request.POST.get('action', None)
        context = self.get_context_data(object=self.object, action=action, request=request)
        can_write = self.object.user_can_write(request.user)
        # actions that may not require write permissions
        action_lookup = {
            'assay_action': self.handle_assay_action,
            'comment': self.handle_comment,
            'line_action': self.handle_line_action,
        }
        # actions that require write permissions
        writable_lookup = {
            'assay': self.handle_assay,
            'attach': self.handle_attach,
            'clone': self.handle_clone,
            'group': self.handle_group,
            'line': self.handle_line,
            'measurement': self.handle_measurement,
            'update': self.handle_update,
        }
        if can_write:
            action_lookup.update(writable_lookup)
        # find appropriate handler function for the submitted action
        view_or_valid = action_lookup.get(action, self.handle_unknown)(
            request, context, *args, **kwargs
        )
        if type(view_or_valid) == bool:
            # boolean means a response to same page, with flag noting whether form was valid
            return self.post_response(request, context, view_or_valid)
        else:
            # otherwise got a view function, call it
            return view_or_valid(request, *args, **kwargs)

    def post_response(self, request, context, form_valid):
        if form_valid:
            study_modified.send(sender=self.__class__, study=self.object)
            return HttpResponseRedirect(reverse('main:detail', kwargs={'pk': self.object.pk}))
        return self.render_to_response(context)

    def _get_assay(self, assay_id):
        study = self.get_object()
        try:
            return Assay.objects.get(pk=assay_id, line__study=study)
        except Assay.DoesNotExist:
            logger.warning('Failed to load assay,study combo %s,%s' % (assay_id, study.pk))
        return None

    def _get_line(self, line_id):
        study = self.get_object()
        try:
            return Line.objects.get(pk=line_id, study=study)
        except Line.DoesNotExist:
            logger.warning('Failed to load (line, study) combo (%s,%s)' % (line_id, study.pk))
        return None


class EDDExportView(generic.TemplateView):
    """ Base view for exporting EDD information. """
    def __init__(self, *args, **kwargs):
        super(EDDExportView, self).__init__(*args, **kwargs)
        self._export = None
        self._selection = ExportSelection(None)

    def get(self, request, *args, **kwargs):
        context = self.get_context_data(**kwargs)
        context.update(self.init_forms(request, request.GET))
        return self.render_to_response(context)

    def get_context_data(self, **kwargs):
        context = super(EDDExportView, self).get_context_data(**kwargs)
        return context

    def get_selection(self):
        return self._selection
    selection = property(get_selection)

    def get_template_names(self):
        """ Override in child classes to specify alternate templates. """
        return ['main/export.html', ]

    def init_forms(self, request, payload):
        select_form = ExportSelectionForm(data=payload, user=request.user)
        try:
            self._selection = select_form.get_selection()
        except Exception as e:
            logger.exception("Failed to validate forms for export: %s", e)
        return {
            'download': payload.get('action', None) == 'download',
            'select_form': select_form,
            'selection': self.selection,
        }

    def post(self, request, *args, **kwargs):
        context = self.get_context_data(**kwargs)
        context.update(self.init_forms(request, request.POST))
        return self.render_to_response(context)

    def render_to_response(self, context, **kwargs):
        if context.get('download', False) and self._export:
            response = HttpResponse(self._export.output(), content_type='text/csv')
            # set download filename as the first name in the exported studies
            study = self._export.selection.studies.values()[0]
            response['Content-Disposition'] = 'attachment; filename="%s.csv"' % study.name
            return response
        return super(EDDExportView, self).render_to_response(context, **kwargs)


class ExportView(EDDExportView):
    """ View to export EDD information in a table/CSV format. """
    def init_forms(self, request, payload):
        context = super(ExportView, self).init_forms(request, payload)
        context.update(
            option_form=None,
            output='',
        )
        try:
            initial = ExportOptionForm.initial_from_user_settings(request.user)
            option_form = ExportOptionForm(data=payload, initial=initial, selection=self.selection)
            context.update(option_form=option_form)
            if option_form.is_valid():
                self._export = TableExport(self.selection, option_form.options, None)
                context.update(output=self._export.output())
        except Exception as e:
            logger.exception("Failed to validate forms for export: %s", e)
        return context


class WorklistView(EDDExportView):
    """ View to export lines in a worklist template. """
    def get_template_names(self):
        """ Override in child classes to specify alternate templates. """
        return ['main/worklist.html', ]

    def init_forms(self, request, payload):
        context = super(WorklistView, self).init_forms(request, payload)
        worklist_form = WorklistForm()
        context.update(
            defaults_form=worklist_form.defaults_form,
            flush_form=worklist_form.flush_form,
            output='',
            worklist_form=worklist_form,
        )
        try:
            worklist_form = WorklistForm(data=payload)
            context.update(
                defaults_form=worklist_form.defaults_form,
                flush_form=worklist_form.flush_form,
                worklist_form=worklist_form,
            )
            if worklist_form.is_valid():
                self._export = WorklistExport(
                    self.selection,
                    worklist_form.options,
                    worklist_form.worklist,
                )
                context.update(output=self._export.output())
        except Exception as e:
            logger.exception("Failed to validate forms for export: %s", e)
        return context


class SbmlView(EDDExportView):
    def __init__(self, *args, **kwargs):
        super(SbmlView, self).__init__(*args, **kwargs)
        self.sbml_export = None

    def get_template_names(self):
        """ Override in child classes to specify alternate templates. """
        return ['main/sbml_export.html', ]

    def init_forms(self, request, payload):
        context = super(SbmlView, self).init_forms(request, payload)
        form_dict = {}
        # want to bind export_settings always to allow validation
        export_settings = SbmlExportSettingsForm(
            data=payload,
            initial={'sbml_template': self.selection.studies[0].metabolic_map, },
        )
        # want to bind od_select always to allow validation
        od_select = SbmlExportOdForm(
            data=payload, prefix='od', selection=self.selection,
            qfilter=(Q(measurement_type__short_name='OD') &
                     Q(assay__protocol__categorization=Protocol.CATEGORY_OD)),
        )
        # detect if we're coming from a form submit on study page or a re-submit from export page
        form_data = None
        if export_settings.add_prefix('sbml_template') in payload:
            # bind POST to following forms
            form_data = payload
        else:
            # update previous forms to use defaults instead of triggering validation errors
            export_settings.update_bound_data_with_defaults()
            od_select.update_bound_data_with_defaults()
        form_dict.update({
            'hplc_select_form': SbmlExportMeasurementsForm(
                data=form_data, prefix='hplc', selection=self.selection,
                qfilter=Q(assay__protocol__categorization=Protocol.CATEGORY_HPLC),
            ),
            'ms_select_form': SbmlExportMeasurementsForm(
                data=form_data, prefix='ms', selection=self.selection,
                qfilter=Q(assay__protocol__categorization=Protocol.CATEGORY_LCMS),
            ),
            'ramos_select_form': SbmlExportMeasurementsForm(
                data=form_data, prefix='ramos', selection=self.selection,
                qfilter=Q(assay__protocol__categorization=Protocol.CATEGORY_RAMOS),
            ),
            'omics_select_form': SbmlExportMeasurementsForm(
                data=form_data, prefix='ramos', selection=self.selection,
                qfilter=Q(assay__protocol__categorization=Protocol.CATEGORY_TPOMICS),
            ),
        })
        # only makes sense to include the matching and timepoint sections when a valid template
        # is selected in the export_settings form
        match_form = None
        time_form = None
        if export_settings.is_valid():
            template = export_settings.cleaned_data.get('sbml_template', None)
            self.sbml_export = SbmlExport(template, self.selection)
            if od_select.is_valid():
                self.sbml_export.add_density(od_select)
                for sbml_measurements in [f for f in form_dict.itervalues() if f.is_valid()]:
                    self.sbml_export.add_measurements(sbml_measurements)
                match_form = self.sbml_export.create_match_form(payload, prefix='match')
                time_form = self.sbml_export.create_time_select_form(payload, prefix='time')
        # collect all the warnings together for counting
        sbml_warnings = chain(
            export_settings.sbml_warnings,
            od_select.sbml_warnings,
            match_form.sbml_warnings if match_form else [],
            *map(lambda f: f.sbml_warnings, form_dict.itervalues())
        )
        try:
            context.update(form_dict)
            context.update(
                export_settings_form=export_settings,
                od_select_form=od_select,
                match_form=match_form,
                time_form=time_form,
                sbml_warnings=list(sbml_warnings),
            )
        except Exception as e:
            logger.exception("Failed to validate forms for export: %s", e)
        return context

    def render_to_response(self, context, **kwargs):
        download = context.get('download', False)
        if download and self.sbml_export:
            match_form = context.get('match_form', None)
            time_form = context.get('time_form', None)
            if match_form and time_form and match_form.is_valid() and time_form.is_valid():
                time = time_form.cleaned_data['time_select']
                response = HttpResponse(
                    self.sbml_export.output(time, match_form.cleaned_data),
                    content_type='application/sbml+xml'
                )
                # set download filename
                filename = time_form.cleaned_data['filename']
                response['Content-Disposition'] = 'attachment; filename="%s"' % filename
                return response
        return super(SbmlView, self).render_to_response(context, **kwargs)


# /study/<study_id>/lines/
def study_lines(request, study):
    """ Request information on lines in a study. """
    obj = load_study(request, study)
    return JsonResponse(Line.objects.filter(study=obj), encoder=JSONDecimalEncoder)


# /study/<study_id>/measurements/<protocol_id>/
def study_measurements(request, study, protocol):
    """ Request measurement data in a study. """
    obj = load_study(request, study)
    measure_types = MeasurementType.objects.filter(
        measurement__assay__line__study=obj,
        measurement__assay__protocol_id=protocol,
        ).distinct()
    # stash QuerySet to use in both measurements and total_measures below
    qmeasurements = Measurement.objects.filter(
        assay__line__study=obj,
        assay__protocol_id=protocol,
        active=True,
        assay__active=True,
        assay__line__active=True,
        )
    # Limit the measurements returned to keep browser performant
    measurements = qmeasurements.order_by('id')[:5000]
    total_measures = qmeasurements.values('assay_id').annotate(count=Count('assay_id'))
    measure_list = list(measurements)
    if len(measure_list):
        # only try to pull values when we have measurement objects
        values = MeasurementValue.objects.filter(
            measurement__assay__line__study=obj,
            measurement__assay__protocol_id=protocol,
            measurement__active=True,
            measurement__assay__active=True,
            measurement__assay__line__active=True,
            measurement__pk__range=(measure_list[0].id, measure_list[-1].id),
        )
    else:
        values = []
    value_dict = collections.defaultdict(list)
    for v in values:
        value_dict[v.measurement_id].append((v.x, v.y))
    payload = {
        'total_measures': {
            x['assay_id']: x.get('count', 0) for x in total_measures if 'assay_id' in x
        },
        'types': {t.pk: t.to_json() for t in measure_types},
        'measures': [m.to_json() for m in measure_list],
        'data': value_dict,
    }
    return JsonResponse(payload, encoder=JSONDecimalEncoder)


# /study/<study_id>/measurements/<protocol_id>/<assay_id>/
def study_assay_measurements(request, study, protocol, assay):
    """ Request measurement data in a study, for a single assay. """
    obj = load_study(request, study)
    measure_types = MeasurementType.objects.filter(
        measurement__assay__line__study=obj,
        measurement__assay__protocol_id=protocol,
        measurement__assay=assay,
        ).distinct()
    # stash QuerySet to use in both measurements and total_measures below
    qmeasurements = Measurement.objects.filter(
        assay__line__study_id=study,
        assay__protocol_id=protocol,
        assay=assay,
        active=True,
        assay__active=True,
        assay__line__active=True,
        )
    # Limit the measurements returned to keep browser performant
    measurements = qmeasurements.order_by('id')[:5000]
    total_measures = qmeasurements.values('assay_id').annotate(count=Count('assay_id'))
    measure_list = list(measurements)
    values = MeasurementValue.objects.filter(
        measurement__assay__line__study_id=study,
        measurement__assay__protocol_id=protocol,
        measurement__assay=assay,
        measurement__active=True,
        measurement__assay__active=True,
        measurement__assay__line__active=True,
        measurement__id__range=(measure_list[0].id, measure_list[-1].id),
        )
    value_dict = collections.defaultdict(list)
    for v in values:
        value_dict[v.measurement_id].append((v.x, v.y))
    payload = {
        'total_measures': {
            x['assay_id']: x.get('count', 0) for x in total_measures if 'assay_id' in x
        },
        'types': {t.pk: t.to_json() for t in measure_types},
        'measures': map(lambda m: m.to_json(), measure_list),
        'data': value_dict,
    }
    return JsonResponse(payload, encoder=JSONDecimalEncoder)


# /study/search/
def study_search(request):
    """ View function handles incoming requests to search solr """
    solr = StudySearch(ident=request.user)
    query = request.GET.get('q', 'active:true')
    opt = request.GET.copy()
    opt['edismax'] = True
    data = solr.query(query=query, options=opt)
    # loop through results and attach URL to each
    query_response = data['response']
    for doc in query_response['docs']:
        doc['url'] = reverse('main:detail', kwargs={'pk': doc['id']})
    return JsonResponse(query_response, encoder=JSONDecimalEncoder)


# /study/<study_id>/edddata/
def study_edddata(request, study):
    """
    Various information (both global and study-specific) that populates the
    EDDData JS object on the client.
    """
    model = load_study(request, study)
    data_misc = get_edddata_misc()
    data_study = get_edddata_study(model)
    data_study.update(data_misc)
    return JsonResponse(data_study, encoder=JSONDecimalEncoder)


# /study/<study_id>/assaydata/
def study_assay_table_data(request, study):
    """ Request information on assays associated with a study. """
    model = load_study(request, study)
    # FIXME filter protocols?
    protocols = Protocol.objects.all()
    lines = model.line_set.all()
    return JsonResponse({
        "ATData": {
            "existingProtocols": {p.id: p.name for p in protocols},
            "existingLines": [{"n": l.name, "id": l.id} for l in lines],
            "existingAssays": model.get_assays_by_protocol(),
        },
        "EDDData": get_edddata_study(model),
    }, encoder=JSONDecimalEncoder)


# /study/<study_id>/map/
def study_map(request, study):
    """ Request information on metabolic map associated with a study. """
    obj = load_study(request, study)
    try:
        mmap = SBMLTemplate.objects.get(study=obj)
        return JsonResponse(
            {
                "name": mmap.name,
                "id": mmap.pk,
                "biomassCalculation": mmap.biomass_calculation,
            },
            encoder=JSONDecimalEncoder,
        )
    except SBMLTemplate.DoesNotExist as e:
        return JsonResponse({"name": "", "biomassCalculation": -1, }, encoder=JSONDecimalEncoder)
    except Exception as e:
        raise e


# /study/<study_id>/permissions/
def permissions(request, study):
    obj = load_study(request, study)
    if request.method == 'HEAD':
        return HttpResponse(status=200)
    elif request.method == 'GET':
        return JsonResponse([p.to_json() for p in obj.get_combined_permission()])
    elif request.method == 'PUT' or request.method == 'POST':
        if not obj.user_can_write(request.user):
            return HttpResponseForbidden("You do not have permission to modify this study.")
        try:
            perms = json.loads(request.POST['data'])
            for perm in perms:
                user = perm.get('user', None)
                group = perm.get('group', None)
                ptype = perm.get('type', StudyPermission.NONE)
                manager = None
                lookup = {}
                if group is not None:
                    lookup = {'group_id': group.get('id', 0), 'study_id': study}
                    manager = obj.grouppermission_set.filter(**lookup)
                elif user is not None:
                    lookup = {'user_id': user.get('id', 0), 'study_id': study}
                    manager = obj.userpermission_set.filter(**lookup)
                if manager is None:
                    logger.warning('Invalid permission type for add')
                elif ptype == StudyPermission.NONE:
                    manager.delete()
                else:
                    lookup['permission_type'] = ptype
                    manager.update_or_create(**lookup)
        except Exception as e:
            logger.error('Error modifying study (%s) permissions: %s' % (study, str(e)))
            return HttpResponse(status=500)
        return HttpResponse(status=204)
    elif request.method == 'DELETE':
        if not obj.user_can_write(request.user):
            return HttpResponseForbidden("You do not have permission to modify this study.")
        try:
            obj.grouppermission_set.all().delete()
            obj.userpermission_set.all().delete()
        except Exception as e:
            logger.error('Error deleting study (%s) permissions: %s' % (study, str(e)))
            return HttpResponse(status=500)
        return HttpResponse(status=204)
    else:
        return HttpResponseNotAllowed(['HEAD', 'GET', 'PUT', 'POST', 'DELETE', ])


# /study/<study_id>/import
# FIXME should have trailing slash?
@ensure_csrf_cookie
def study_import_table(request, study):
    """ View for importing tabular assay data (replaces AssayTableData.cgi). """
    model = load_study(request, study, permission_type=['W', ])
    # FIXME filter protocols?
    protocols = Protocol.objects.order_by('name')
    if (request.method == "POST"):
        if logger.isEnabledFor(logging.DEBUG):
            logger.debug('\n'.join([
                '%(key)s : %(value)s' % {'key': key, 'value': request.POST[key]}
                for key in sorted(request.POST)
            ]))
        try:
            table = TableImport(model, request.user, request=request)
            added = table.import_data(request.POST)
            messages.success(request, 'Imported %s measurement values.' % added)
        except ValueError as e:
            logger.exception('Import failed: %s', e)
            messages.error(request, e)
    return render(
        request,
        "main/import.html",
        context={
            "study": model,
            "protocols": protocols,
        },
    )


# /utilities/parsefile
# To reach this function, files are sent from the client by the Utl.FileDropZone class (in Utl.ts).
def utilities_parse_import_file(request):
    """ Attempt to process posted data as either a TSV or CSV file or Excel spreadsheet and
        extract a table of data automatically. """
    # These are embedded by the filedrop.js class. Here for reference.
    # file_name = request.META.get('HTTP_X_FILE_NAME')
    # file_size = request.META.get('HTTP_X_FILE_SIZE')
    # file_type = request.META.get('HTTP_X_FILE_TYPE')
    # file_date = request.META.get('HTTP_X_FILE_DATE')

    # In requests from OS X clients, we can use the file_type value. For example, a modern Excel
    # document is reported as "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    # and it's consistent across Safari, Firefox, and Chrome. However, on Windows XP, file_type is
    # always blank, so we need to fall back to file name extensions like ".xlsx" and ".xls".

    # The Utl.JS.guessFileType() function in Utl.ts applies logic like this to guess the type, and
    # that guess is sent along in a custom header:
    edd_file_type = request.META.get('HTTP_X_EDD_FILE_TYPE')
    edd_import_mode = request.META.get('HTTP_X_EDD_IMPORT_MODE')

    if edd_import_mode == "biolector":
        try:
            from edd_utils.parsers import biolector
            # We pass the request directly along, so it can be read as a stream by the parser
            result = biolector.getRawImportRecordsAsJSON(request, 0)
            return JsonResponse({
                "file_type": "xml",
                "file_data": result,
            })
        except ImportError as e:
            return JsonResponse({
                "python_error": "jbei_tools module required to handle XML table input."
            })
    if edd_file_type == "excel":
        try:
            from edd_utils.parsers import excel
            data = request.read()
            result = excel.import_xlsx_tables(file=BytesIO(data))
            return JsonResponse({
                "file_type": "xlsx",
                "file_data": result,
            })
        except ImportError as e:
            return JsonResponse({
                "python_error": "jbei_tools module required to handle Excel table input."
            })
        except ValueError as e:
            return JsonResponse({"python_error": str(e)})
        except Exception as e:
            return JsonResponse({
                "file_type": "csv",
                "file_data": data,
            })
    if edd_import_mode == "hplc":
        try:
            from edd_utils.parsers.hplc import (
                getRawImportRecordsAsJSON, HPLC_Parse_Missing_Argument_Exception,
                HPLC_Parse_No_Header_Exception, HPLC_Parse_Misaligned_Blocks_Exception
                )
            try:
                result = getRawImportRecordsAsJSON(request)
                return JsonResponse({
                    "file_type": "hplc",
                    "file_data": result,
                })
                # TODO: better exception messages.
            except HPLC_Parse_Missing_Argument_Exception as e:
                return JsonResponse({
                    "python_exception": "HPLC parsing failed: input stream None"
                })
            except HPLC_Parse_No_Header_Exception as e:
                return JsonResponse({
                    "python_exception": "HPLC parsing failed: unable to find header!"
                })
            except HPLC_Parse_Misaligned_Blocks_Exception as e:
                return JsonResponse({
                    "python_exception": "HPLC parsing failed: mismatched row count amoung blocks!"
                })
        except ImportError as e:
            logger.exception('Failed to load module %s', e)
            return JsonResponse({
                "python_error": "jbei_tools module required to handle HPLC file input."
            })

    return JsonResponse({
        "python_error": "The uploaded file could not be interpreted as either an Excel "
                        "spreadsheet or an XML file.  Please check that the contents are "
                        "formatted correctly. (Word documents are not allowed!)"})


# /study/<study_id>/import/rnaseq
# FIXME should have trailing slash?
@ensure_csrf_cookie
def study_import_rnaseq(request, study):
    """ View for importing multiple sets of RNA-seq measurements in various simple tabular formats
        defined by us.  Handles both GET and POST. """
    messages = {}
    model = load_study(request, study, permission_type=['W', ])
    lines = model.line_set.all()
    if request.method == "POST":
        try:
            result = import_rna_seq.from_form(request, model)
            messages["success"] = "Added %d measurements in %d assays." % (
                result.n_assay, result.n_meas)
        except ValueError as e:
            messages["error"] = str(e)
    return render(
        request,
        "main/import_rnaseq.html",
        context={
            "messages": messages,
            "study": model,
            "lines": lines,
        },
    )


# /study/<study_id>/import/rnaseq/edgepro
# FIXME should have trailing slash?
@ensure_csrf_cookie
def study_import_rnaseq_edgepro(request, study):
    """ View for importing a single set of RNA-seq measurements from the EDGE-pro pipeline,
        attached to an existing Assay.  Handles both GET and POST. """
    messages = {}
    model = load_study(request, study, permission_type=['W', ])
    assay_id = None
    if request.method == "GET":
        assay_id = request.POST.get("assay", None)
    elif request.method == "POST":
        assay_id = request.POST.get("assay", None)
        try:
            if assay_id is None or assay_id == "":
                raise ValueError("Assay ID required for form submission.")
            result = import_rnaseq_edgepro.from_form(request=request, study=model)
            messages["success"] = result.format_message()
        except ValueError as e:
            messages["error"] = str(e)
    protocol = Protocol.objects.get(name="Transcriptomics")
    assays_ = Assay.objects.filter(
        protocol=protocol,
        line__study=study,
    ).prefetch_related(
        "measurement_set",
    ).select_related(
        "line",
        "protocol",
    )
    assay_info = []
    for assay in assays_:
        assay_info.append({
            "id": assay.id,
            "long_name": assay.long_name,
            "n_meas": assay.measurement_set.count(),
        })
    return render(
        request,
        "main/import_rnaseq_edgepro.html",
        context={
            "selected_assay_id": assay_id,
            "assays": assay_info,
            "messages": messages,
            "study": model,
        },
    )


# /study/<study_id>/import/rnaseq/parse
# FIXME should have trailing slash?
def study_import_rnaseq_parse(request, study):
    """ Parse raw data from an uploaded text file, and return JSON object of processed result.
        Result is identical to study_import_rnaseq_process, but this method is invoked by
        drag-and-drop of a file (via filedrop.js). """
    model = load_study(request, study, permission_type=['W', ])
    referrer = request.META['HTTP_REFERER']
    result = None
    # XXX slightly gross: using HTTP_REFERER to dictate choice of parsing
    # functions
    try:
        if "edgepro" in referrer:
            result = interpret_edgepro_data(raw_data=request.read())
            result['format'] = "edgepro"
        else:
            result = interpret_raw_rna_seq_data(raw_data=request.read(), study=model)
            result['format'] = "generic"
    except ValueError as e:
        return JsonResponse({"python_error": str(e)})
    else:
        return JsonResponse(result)


# /study/<study_id>/import/rnaseq/process
# FIXME should have trailing slash?
def study_import_rnaseq_process(request, study):
    """ Process form submission containing either a file or text field, and return JSON object of
        processed result. """
    model = load_study(request, study, permission_type=['W', ])
    assert(request.method == "POST")
    try:
        data = request.POST.get("data", "").strip()
        file_name = None
        if data == "":
            data_file = request.FILES.get("file_name", None)
            if (data_file is None):
                raise ValueError("Either a text file or pasted table is "
                                 "required as input.")
            data = data_file.read()
            file_name = data_file.name
        result = None
        if request.POST.get("format") == "htseq-combined":
            result = interpret_raw_rna_seq_data(raw_data=data, study=model, file_name=file_name)
        elif request.POST.get("format") == "edgepro":
            result = interpret_edgepro_data(raw_data=data, study=model, file_name=file_name)
        else:
            raise ValueError("Format needs to be specified!")
    except ValueError as e:
        return JsonResponse({"python_error": str(e)})
    except Exception as e:
        logger.error('Exception in RNASeq import process: %s', e)
    else:
        return JsonResponse(result)


# /data/users
def data_users(request):
    return JsonResponse({"EDDData": get_edddata_users()}, encoder=JSONDecimalEncoder)


# /data/misc
def data_misc(request):
    return JsonResponse({"EDDData": get_edddata_misc()}, encoder=JSONDecimalEncoder)


# /data/measurements
def data_measurements(request):
    data_meas = get_edddata_measurement()
    data_misc = get_edddata_misc()
    data_meas.update(data_misc)
    return JsonResponse({"EDDData": data_meas}, encoder=JSONDecimalEncoder)


# /data/sbml/
def data_sbml(request):
    all_sbml = SBMLTemplate.objects.all()
    return JsonResponse(
        [sbml.to_json() for sbml in all_sbml],
        encoder=JSONDecimalEncoder,
        safe=False,
        )


# /data/sbml/<sbml_id>/
def data_sbml_info(request, sbml_id):
    sbml = get_object_or_404(SBMLTemplate, pk=sbml_id)
    return JsonResponse(sbml.to_json(), encoder=JSONDecimalEncoder)


# /data/sbml/<sbml_id>/reactions/
def data_sbml_reactions(request, sbml_id):
    sbml = get_object_or_404(SBMLTemplate, pk=sbml_id)
    rlist = sbml.load_reactions()
    return JsonResponse(
        [{
            "metabolicMapID": sbml_id,
            "reactionName": r.getName(),
            "reactionID": r.getId(),
        } for r in rlist if 'biomass' in r.getId()],
        encoder=JSONDecimalEncoder,
        safe=False,
        )


# /data/sbml/<sbml_id>/reactions/<rxn_id>/
def data_sbml_reaction_species(request, sbml_id, rxn_id):
    sbml = get_object_or_404(SBMLTemplate, pk=sbml_id)
    rlist = sbml.load_reactions()
    found = [r for r in rlist if rxn_id == r.getId()]
    if len(found):
        all_species = [
            rxn.getSpecies() for rxn in found[0].getListOfReactants()
            ] + [
            rxn.getSpecies() for rxn in found[0].getListOfProducts()
            ]
        matched = MetaboliteSpecies.objects.filter(
            species__in=all_species,
            sbml_template_id=sbml_id,
        ).select_related(
            'measurement_type',
        )
        matched_json = {m.species: m.measurement_type.to_json() for m in matched}
        unmatched = [s for s in all_species if s not in matched_json]
        # old EDD tries to generate SBML species names for all metabolites and match
        # below is the inverse; take a species name, try to extract short_name, and search
        guessed_json = {}

        def sub_symbol(name):
            name = re.sub(r'_DASH_', '-', name)
            name = re.sub(r'_LPAREN_', '(', name)
            name = re.sub(r'_RPAREN_', ')', name)
            name = re.sub(r'_LSQBKT_', '[', name)
            name = re.sub(r'_RSQBKT_', ']', name)
            return name
        for s in unmatched:
            match = re.search(r'^(?:M_)?(\w+?)(?:_c_?)?$', s)
            if match:
                candidate_names = [match.group(1), sub_symbol(match.group(1)), ]
                guessed = Metabolite.objects.filter(short_name__in=candidate_names)
                guessed_json.update({s: m.to_json() for m in guessed})
        # make sure actual matches take precedence
        guessed_json.update(matched_json)
        return JsonResponse(
            guessed_json,
            encoder=JSONDecimalEncoder,
            safe=False,
            )
    raise Http404("Could not find reaction")


# /data/sbml/<sbml_id>/reactions/<rxn_id>/compute/ -- POST ONLY --
def data_sbml_compute(request, sbml_id, rxn_id):
    sbml = get_object_or_404(SBMLTemplate, pk=sbml_id)
    rlist = sbml.load_reactions()
    found = [r for r in rlist if rxn_id == r.getId()]
    spp = request.POST.getlist('species', [])
    if len(found):
        def sumMetaboliteStoichiometries(species, info):
            total = 0
            for sp in species:
                try:
                    m = MetaboliteSpecies.objects.get(
                        species=sp.getSpecies(),
                        sbml_template_id=sbml_id,
                    ).select_related('measurement_type__metabolite')
                    total += sp.getStoichiometry() * m.measurement_type.metabolite.carbon_count
                    info.push(
                        {
                            "metaboliteName": sp.getSpecies(),
                            "stoichiometry": sp.getStoichiometry(),
                            "carbonCount": m.measurement_type.metabolite.carbon_count,
                        })
                except Exception:
                    pass
            return total
        reactants = [r for r in found[0].getListOfReactants() if r.getSpecies() in spp]
        products = [r for r in found[0].getListOfProducts() if r.getSpecies() in spp]
        reactant_info = []
        product_info = []
        biomass = sumMetaboliteStoichiometries(reactants, reactant_info)
        biomass -= sumMetaboliteStoichiometries(products, product_info)
        info = json.dumps(
            {
                "reaction_id": rxn_id,
                "reactants": reactant_info,
                "products": product_info,
            },
            cls=JSONDecimalEncoder)
        sbml.biomass_calculation = biomass
        sbml.biomass_calculation_info = info
        sbml.save()
        return JsonResponse(biomass, encoder=JSONDecimalEncoder, safe=False)
    raise Http404("Could not find reaction")


# /data/strains
def data_strains(request):
    return JsonResponse({"EDDData": get_edddata_strains()}, encoder=JSONDecimalEncoder)


# /data/metadata
def data_metadata(request):
    return JsonResponse(
        {
            "EDDData": {
                "MetadataTypes":
                    {m.id: m.to_json() for m in MetadataType.objects.all()},
            }
        },
        encoder=JSONDecimalEncoder)


# /data/carbonsources
def data_carbonsources(request):
    return JsonResponse({"EDDData": get_edddata_carbon_sources()}, encoder=JSONDecimalEncoder)


# /download/<file_id>
def download(request, file_id):
    model = Attachment.objects.get(pk=file_id)
    if not model.user_can_read(request.user):
        return HttpResponseForbidden("You do not have access to data associated with this study.")
    response = HttpResponse(model.file.read(), content_type=model.mime_type)
    response['Content-Disposition'] = 'attachment; filename="%s"' % model.filename
    return response


# TODO should only delete on POST, write a confirm delete page with a form to resubmit as POST
def delete_file(request, file_id):
    redirect_url = request.GET.get("redirect", None)
    if redirect_url is None:
        return HttpResponseBadRequest("Missing redirect URL.")
    model = Attachment.objects.get(pk=file_id)
    if not model.user_can_delete(request.user):
        return HttpResponseForbidden(
            "You do not have permission to remove files associated with this study.")
    model.delete()
    return redirect(redirect_url)


meta_pattern = re.compile(r'(\w*)MetadataType$')


# /search
def search(request):
    """ Naive implementation of model-independent server-side autocomplete backend,
        paired with autocomplete2.js on the client side. Call out to Solr or ICE where
        needed. """
    return model_search(request, request.GET["model"])


AUTOCOMPLETE_VIEW_LOOKUP = {
    'GenericOrMetabolite': autocomplete.search_metaboliteish,
    'Group': autocomplete.search_group,
    'MeasurementCompartment': autocomplete.search_compartment,
    'MetaboliteExchange': autocomplete.search_sbml_exchange,
    'MetaboliteSpecies': autocomplete.search_sbml_species,
    'Strain': autocomplete.search_strain,
    'StudyWrite': autocomplete.search_study_writable,
    'User': autocomplete.search_user,
}


# /search/<model_name>/
def model_search(request, model_name):
    searcher = AUTOCOMPLETE_VIEW_LOOKUP.get(model_name, None)
    if searcher:
        return searcher(request)
    elif meta_pattern.match(model_name):
        match = meta_pattern.match(model_name)
        return autocomplete.search_metadata(request, match.group(1))
    else:
        return autocomplete.search_generic(request, model_name)
