# coding: utf-8
from __future__ import unicode_literals

import collections
import csv
import json
import logging
import operator
import re

from builtins import str
from django.conf import settings
from django.contrib import messages
from django.contrib.auth.models import Group
from django.core.exceptions import ValidationError
from django.core.urlresolvers import reverse
from django.db.models import Count, Prefetch, Q
from django.http import (
    Http404, HttpResponse, HttpResponseNotAllowed, HttpResponseRedirect, JsonResponse, QueryDict,
)
from django.http.response import HttpResponseForbidden, HttpResponseBadRequest
from django.shortcuts import render, get_object_or_404, redirect, render_to_response
from django.template import RequestContext
from django.template.defaulttags import register
from django.utils.safestring import mark_safe
from django.utils.translation import ugettext_lazy as _
from django.views import generic
from django.views.decorators.csrf import ensure_csrf_cookie
from functools import reduce
from io import BytesIO

from . import data_import, models, sbml_export
from .export import table
from .forms import (
    AssayForm, CreateAttachmentForm, CreateCommentForm, CreateStudyForm, ExportOptionForm,
    ExportSelectionForm, LineForm, MeasurementForm, MeasurementValueFormSet, WorklistForm
)
from .ice import IceApi
from .models import (
    Assay, Attachment, Line, Measurement, MeasurementCompartment, MeasurementGroup, MeasurementType,
    MeasurementValue, Metabolite, MetaboliteSpecies, MetadataType, Protocol, SBMLTemplate, Study,
    StudyPermission, Update,
)
from .signals import study_modified
from .solr import StudySearch, UserSearch
from .utilities import (
    JSONDecimalEncoder, get_edddata_carbon_sources, get_edddata_measurement, get_edddata_misc,
    get_edddata_strains, get_edddata_study, get_edddata_users, get_selected_lines,
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

    def get_queryset(self):
        qs = super(StudyDetailView, self).get_queryset()
        if self.request.user.is_superuser:
            return qs
        return qs.filter(
            Q(userpermission__user=self.request.user,
              userpermission__permission_type__in=['R', 'W', ]) |
            Q(grouppermission__group__user=self.request.user,
              grouppermission__permission_type__in=['R', 'W', ])).distinct()

    def handle_assay(self, request, context):
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

    def handle_attach(self, request, context):
        form = CreateAttachmentForm(request.POST, request.FILES, edd_object=self.get_object())
        if form.is_valid():
            form.save()
            return True
        else:
            context['new_attach'] = form
        return False

    def handle_clone(self, request):
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

    def handle_comment(self, request, context):
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

    def handle_group(self, request):
        ids = request.POST.getlist('lineId', [])
        study = self.get_object()
        if len(ids) > 1:
            first = ids[0]
            count = Line.objects.filter(study=study, pk__in=ids).update(replicate_id=first)
            messages.success(request, 'Grouped %s Lines' % count)
            return True
        messages.error(request, 'Must select more than one Line to group.')
        return False

    def handle_line(self, request, context):
        ids = [v for v in request.POST.get('line-ids', '').split(',') if v.strip() != '']
        if len(ids) == 0:
            return self.handle_line_new(request, context)
        elif len(ids) == 1:
            return self.handle_line_edit(request, context, ids[0])
        else:
            return self.handle_line_bulk(request, ids)
        return False

    def handle_line_bulk(self, request, ids):
        study = self.get_object()
        total = len(ids)
        saved = 0
        for value in ids:
            line = self._get_line(value)
            if line:
                form = LineForm(request.POST, instance=line, prefix='line', study=study)
                form.check_bulk_edit()  # removes fields having disabled bulk edit checkbox
                if form.is_valid():
                    form.save()
                    saved += 1
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

    def handle_measurement(self, request, context):
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
        return render_to_response(
            'main/edit_measurement.html',
            dictionary={
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

    def handle_update(self, request, context):
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
        form_valid = False
        can_write = self.object.user_can_write(request.user)
        # allow any who can view to comment
        if action == 'comment':
            form_valid = self.handle_comment(request, context)
        elif action == 'line_action':
            line_action = request.POST.get('line_action', None)
            # allow any who can view to export
            if line_action == 'export':
                export_type = request.POST.get('export', 'csv')
                if export_type == 'sbml':
                    return HttpResponseRedirect(
                        reverse('main:sbml_export', kwargs={'study': self.object.pk}))
                else:
                    return ExportView.as_view()(request, *args, **kwargs)
            elif line_action == 'worklist':
                return WorklistView.as_view()(request, *args, **kwargs)
            # but not edit
            elif not can_write:
                messages.error(request, 'You do not have permission to modify this study.')
            elif line_action == 'edit':
                form_valid = self.handle_disable(request)
            else:
                messages.error(request, 'Unknown line action %s' % (line_action))
        elif action == 'assay_action':
            assay_action = request.POST.get('assay_action', None)
            # allow any who can view to export
            if assay_action == 'export':
                export_type = request.POST.get('export', 'csv')
                if export_type == 'sbml':
                    return HttpResponseRedirect(
                        reverse('main:sbml_export', kwargs={'study': self.object.pk}))
                else:
                    return ExportView.as_view()(request, *args, **kwargs)
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
        # all following require write permissions
        elif not can_write:
            messages.error(request, 'You do not have permission to modify this study.')
        elif action == 'attach':
            form_valid = self.handle_attach(request, context)
        elif action == 'line':
            form_valid = self.handle_line(request, context)
        elif action == 'clone':
            form_valid = self.handle_clone(request)
        elif action == 'group':
            form_valid = self.handle_group(request)
        elif action == 'assay':
            form_valid = self.handle_assay(request, context)
        elif action == 'measurement':
            form_valid = self.handle_measurement(request, context)
        elif action == 'update':
            form_valid = self.handle_update(request, context)
        return self.post_response(request, context, form_valid)

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
        self._selection = table.ExportSelection(None)

    def get_context_data(self, **kwargs):
        context = super(EDDExportView, self).get_context_data(**kwargs)
        return context

    def get_template_names(self):
        """ Override in child classes to specify alternate templates. """
        return ['main/export.html', ]

    def get(self, request, *args, **kwargs):
        context = self.get_context_data(**kwargs)
        context.update(self.init_forms(request, request.GET))
        return self.render_to_response(context)

    def init_forms(self, request, payload):
        initial = ExportOptionForm.initial_from_user_settings(request.user)
        select_form = ExportSelectionForm(data=payload, user=request.user)
        try:
            self._selection = select_form.get_selection()
            option_form = ExportOptionForm(
                data=payload,
                initial=initial,
                selection=self._selection,
            )
            if option_form.is_valid():
                self._export = table.TableExport(
                    self._selection,
                    option_form.get_options(),
                    None,
                )
        except Exception as e:
            logger.error("Failed to validate forms for export: %s", e)
        return {
            'download': payload.get('action', None) == 'download',
            'output': self._export.output() if self._export else '',
            'option_form': option_form,
            'select_form': select_form,
            'selection': self._selection,
        }

    def post(self, request, *args, **kwargs):
        context = self.get_context_data(**kwargs)
        context.update(self.init_forms(request, request.POST))
        return self.render_to_response(context)

    def render_to_response(self, context, **kwargs):
        if context.get('download', False):
            response = HttpResponse(self._export.output(), content_type='text/csv')
            # set download filename as the first name in the exported studies
            study = self._export.selection.studies.values()[0]
            response['Content-Disposition'] = 'attachment; filename="%s.csv"' % study.name
            return response
        return super(EDDExportView, self).render_to_response(context, **kwargs)


class ExportView(EDDExportView):
    """ View to export EDD information in a table/CSV format. """
    pass


class WorklistView(EDDExportView):
    """ View to export lines in a worklist template. """
    def get_template_names(self):
        """ Override in child classes to specify alternate templates. """
        return ['main/worklist.html', ]

    def init_forms(self, request, payload):
        select_form = ExportSelectionForm(data=payload, user=request.user)
        worklist_form = WorklistForm()
        try:
            self._selection = select_form.get_selection()
            worklist_form = WorklistForm(
                data=payload,
            )
            if worklist_form.is_valid():
                self._export = table.WorklistExport(
                    self._selection,
                    worklist_form.options,
                    worklist_form.worklist,
                )
        except Exception as e:
            logger.exception("Failed to validate forms for export: %s", e)
        return {
            'defaults_form': worklist_form.defaults_form,
            'download': payload.get('action', None) == 'download',
            'flush_form': worklist_form.flush_form,
            'output': self._export.output() if self._export else '',
            'select_form': select_form,
            'selection': self._selection,
            'worklist_form': worklist_form,
        }


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
        # print stuff for debug
        for key in sorted(request.POST):
            print("%s : %s" % (key, request.POST[key]))
        try:
            table = data_import.TableImport(model, request.user)
            added = table.import_data(request.POST)
            messages.success(request, 'Imported %s measurements' % added)
        except ValueError as e:
            print("ERROR!!! %s" % e)
            messages.error(request, e)
    return render_to_response(
        "main/table_import.html",
        dictionary={
            "study": model,
            "protocols": protocols,
        },
        context_instance=RequestContext(request))


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
            result = data_import.import_rna_seq.from_form(request, model)
            messages["success"] = "Added %d measurements in %d assays." % (
                result.n_assay, result.n_meas)
        except ValueError as e:
            messages["error"] = str(e)
    return render_to_response(
        "main/import_rnaseq.html",
        dictionary={
            "messages": messages,
            "study": model,
            "lines": lines,
        },
        context_instance=RequestContext(request))


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
            result = data_import.import_rnaseq_edgepro.from_form(
                request=request,
                study=model)
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
    return render_to_response(
        "main/import_rnaseq_edgepro.html",
        dictionary={
            "selected_assay_id": assay_id,
            "assays": assay_info,
            "messages": messages,
            "study": model,
        },
        context_instance=RequestContext(request))


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
            result = data_import.interpret_edgepro_data(raw_data=request.read())
            result['format'] = "edgepro"
        else:
            result = data_import.interpret_raw_rna_seq_data(
                raw_data=request.read(), study=model)
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
            result = data_import.interpret_raw_rna_seq_data(
                raw_data=data,
                study=model,
                file_name=file_name)
        elif request.POST.get("format") == "edgepro":
            result = data_import.interpret_edgepro_data(
                raw_data=data,
                study=model,
                file_name=file_name)
        else:
            raise ValueError("Format needs to be specified!")
    except ValueError as e:
        return JsonResponse({"python_error": str(e)})
    except Exception as e:
        logger.error('Exception in RNASeq import process: %s', e)
    else:
        return JsonResponse(result)


# /study/<study_id>/sbml
# FIXME should have trailing slash?
def study_export_sbml(request, study):
    model = load_study(request, study)
    if request.method == "POST":
        form = request.POST
    else:
        form = request.GET
    try:
        lines = get_selected_lines(form, model)
        manager = sbml_export.line_sbml_export(
            study=model,
            lines=lines,
            form=form,
            debug=True)
    except ValueError as e:
        return render(request, "main/error.html", {
            "error_source": "SBML export for %s" % model.name,
            "error_message": str(e),
        })
    else:
        # two levels of exception handling allow us to view whatever steps
        # were completed successfully even if a later step fails
        error_message = None
        try:
            manager.run()
        except ValueError as e:
            error_message = str(e)
        else:
            if form.get("download", None):
                timestamp_str = form["timestamp"]
                if timestamp_str != "":
                    timestamp = float(timestamp_str)
                    sbml = manager.as_sbml(timestamp)
                    response = HttpResponse(
                        sbml, content_type="application/sbml+xml")
                    file_name = manager.output_file_name(timestamp)
                    response['Content-Disposition'] = 'attachment; filename="%s"' % file_name
                    return response
        return render_to_response(
            "main/sbml_export.html",
            dictionary={
                "data": manager,
                "study": model,
                "lines": lines,
                "error_message": error_message,
            },
            context_instance=RequestContext(request))


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


# /utilities/parsefile
def utilities_parse_table(request):
    """ Attempt to process posted data as either a TSV or CSV file or Excel spreadsheet and
        extract a table of data automatically. """
    default_error = JsonResponse({
        "python_error": "The uploaded file could not be interpreted as either an Excel "
                        "spreadsheet or a CSV/TSV file.  Please check that the contents are "
                        "formatted correctly. (Word documents are not allowed!)"})
    data = request.read()
    try:
        parsed = csv.reader(data, delimiter='\t')
        assert(len(parsed[0]) > 1)
        return JsonResponse({
            "file_type": "tab",
            "file_data": data,
        })
    except Exception as e:
        try:
            parsed = csv.reader(data, delimiter=',')
            assert(len(parsed[0]) > 1)
            return JsonResponse({
                "file_type": "csv",
                "file_data": data,
            })
        except Exception as e:
            try:
                from edd_utils.parsers import excel
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
                return default_error


meta_pattern = re.compile(r'(\w*)MetadataType$')


# /search
def search(request):
    """ Naive implementation of model-independent server-side autocomplete backend,
        paired with autocomplete2.js on the client side. Call out to Solr or ICE where
        needed. """
    term = request.GET["term"]
    re_term = re.escape(term)
    model_name = request.GET["model"]
    results = []
    if model_name == "User":
        solr = UserSearch()
        found = solr.query(query=term, options={'edismax': True})
        results = found['response']['docs']
    elif model_name == "Strain":
        ice = IceApi(user_email=request.user.email)
        found = ice.search_for_part(term, suppress_errors=True)
        if found is None:  # there were errors searching
            results = []
        else:
            results = [match.get('entryInfo', dict()) for match in found.get('results', [])]
    elif model_name == "Group":
        found = Group.objects.filter(name__iregex=re_term).order_by('name')[:20]
        results = [{'id': item.pk, 'name': item.name} for item in found]
    elif model_name == "StudyWrite":
        found = Study.objects.distinct().filter(
            Q(name__iregex=re_term) | Q(description__iregex=re_term),
            Q(userpermission__user=request.user, userpermission__permission_type='W') |
            Q(grouppermission__group__user=request.user, grouppermission__permission_type='W'))
        results = [item.to_json() for item in found]
    elif model_name == "MeasurementCompartment":
        # Always return the full set of options; no search needed
        results = [{'id': c[0], 'name': c[1]} for c in MeasurementCompartment.GROUP_CHOICE]
    elif model_name == "GenericOrMetabolite":
        # searching for EITHER a generic measurement OR a metabolite
        found = MeasurementType.objects.filter(
            Q(type_group__in=(MeasurementGroup.GENERIC, MeasurementGroup.METABOLITE, )) &
            (Q(type_name__iregex=re_term) | Q(short_name__iregex=re_term)),
        )[:20]
        results = [item.to_json() for item in found]
    elif meta_pattern.match(model_name):
        # add appropriate filters for Assay, AssayLine, Line, Study
        match = meta_pattern.match(model_name)
        type_filters = []
        if match.group(1) == 'Study':
            type_filters.append(Q(for_context='S'))
        elif match.group(1) == 'Line':
            type_filters.append(Q(for_context='L'))
        elif match.group(1) == 'Assay':
            type_filters.append(Q(for_context='A'))
        elif match.group(1) == 'AssayLine':
            type_filters.append(Q(for_context='L'))
            type_filters.append(Q(for_context='A'))
        # TODO: search core that will also search resolved i18n values
        term_filters = [Q(type_name__iregex=re_term), Q(group__group_name__iregex=re_term)]
        found = MetadataType.objects.filter(
            reduce(operator.or_, type_filters, Q())
            ).filter(
            reduce(operator.or_, term_filters, Q())
            )[:20]
        results = [item.to_json() for item in found]
    else:
        Model = getattr(models, model_name)
        # gets all the direct field names that can be filtered by terms
        ifields = [
            f.get_attname()
            for f in Model._meta.get_fields()
            if hasattr(f, 'get_attname') and (
                f.get_internal_type() == 'TextField' or
                f.get_internal_type() == 'CharField'
                )
            ]
        # term_filters = []
        term_filters = [Q(**{f+'__iregex': re_term}) for f in ifields]
        # construct a Q object for each term/field combination
        # for term in term.split():
        #     term_filters.extend([ Q(**{ f+'__iregex': term }) for f in ifields ])
        # run search with each Q object OR'd together; limit to 20
        found = Model.objects.filter(reduce(operator.or_, term_filters, Q()))[:20]
        results = [item.to_json() for item in found]
    return JsonResponse({"rows": results})
