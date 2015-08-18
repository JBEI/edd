# coding: utf-8

import collections
import csv
import json
import logging
import main.models
import main.sbml_export
import main.data_import
import operator
import pprint

from django.conf import settings
from django.contrib import messages
from django.core import serializers
from django.core.exceptions import ObjectDoesNotExist, PermissionDenied, ValidationError
from django.core.urlresolvers import reverse
from django.db.models import Count, Q
from django.http import Http404, HttpResponse, HttpResponseRedirect, JsonResponse, QueryDict
from django.http.response import HttpResponseForbidden, HttpResponseBadRequest
from django.shortcuts import render, get_object_or_404, redirect, render_to_response
from django.template import RequestContext
from django.template.defaulttags import register
from django.utils.safestring import mark_safe
from django.utils.translation import ugettext_lazy as _
from django.views import generic
from django.views.decorators.csrf import ensure_csrf_cookie
from io import BytesIO

from .export import table
from .forms import *
from .ice import IceApi
from .models import *
from .signals import study_modified
from .solr import StudySearch, UserSearch
from .utilities import *


logger = logging.getLogger(__name__)


@register.filter(name='lookup')
def lookup(dictionary, key):
    """
    Utility template filter, as Django forbids argument passing in templates. Used for filtering
    out values, e.g. for metadata, of list has EDDObject items and type is a MetadataType:
    {% for obj in list %}
    {{ obj.metadata|lookup:type }}
    {% endfor %}
    """
    return dictionary.get(key, settings.TEMPLATE_STRING_IF_INVALID)

@register.filter(name='formula')
def formula (molecular_formula) :
    """ Convert the molecular formula to a list of dictionaries giving each element and its count.
        This is used in HTML views with <sub> tags. """
    elements = re.findall("([A-Z][a-z]{0,2})([1-9][0-9]*)?", molecular_formula)
    return mark_safe(
        "".join([ '%s%s' % (e, '<sub>%s</sub>' % c if c != '' else c) for e,c in elements ])
        )


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
        return reverse('main:detail', kwargs={'pk':self.object.pk})


class StudyDetailView(generic.DetailView):
    """ Study details page, displays line/assay data. """
    model = Study
    template_name = 'main/detail.html'
    
    def get_context_data(self, **kwargs):
        context = super(StudyDetailView, self).get_context_data(**kwargs)
        context['new_assay'] = AssayForm(prefix='assay')
        context['new_attach'] = CreateAttachmentForm()
        context['new_comment'] = CreateCommentForm()
        context['new_line'] = LineForm(prefix='line')
        context['new_measurement'] = MeasurementForm(prefix='measurement')
        context['writable'] = self.get_object().user_can_write(self.request.user)
        return context

    def handle_assay(self, request, context):
        assay_id = request.POST.get('assay-assay_id', None)
        assay = self._get_assay(assay_id) if assay_id else None
        if assay:
            form = AssayForm(request.POST, instance=assay, lines=[ assay.line_id ], prefix='assay')
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

    def handle_assay_mark(self, request, context):
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

    def handle_clone(self, request, context):
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

    def handle_disable(self, request, context):
        ids = request.POST.getlist('lineId', [])
        study = self.get_object()
        disable = request.POST.get('disable', 'true')
        active = disable == 'false'
        count = Line.objects.filter(study=self.object, id__in=ids).update(active=active)
        messages.success(request, '%s %s Lines' % ('Enabled' if active else 'Disabled', count))
        return True

    def handle_group(self, request, context):
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
        ids = [ v for v in request.POST.get('line-ids', '').split(',') if v.strip() != '' ]
        if len(ids) == 0:
            return self.handle_line_new(request, context)
        elif len(ids) == 1:
            return self.handle_line_edit(request, context, ids[0])
        else:
            return self.handle_line_bulk(request, context, ids)
        return False

    def handle_line_bulk(self, request, context, ids):
        study = self.get_object()
        total = len(ids)
        saved = 0
        for value in ids:
            line = self._get_line(value)
            if line:
                form = LineForm(request.POST, instance=line, prefix='line', study=study)
                form.check_bulk_edit() # removes fields having disabled bulk edit checkbox
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
                messages.success(request, "Saved Line '%(name)s'" % { 'name': form['name'].value() })
                return True
        else:
            messages.error(request, 'Failed to load line for editing.')
        return False

    def handle_line_new(self, request, context):
        form = LineForm(request.POST, prefix='line', study=self.get_object())
        if form.is_valid():
            form.save()
            messages.success(request, "Added Line '%(name)s" % { 'name': form['name'].value() })
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

    def post(self, request, *args, **kwargs):
        self.object = self.get_object()
        action = request.POST.get('action', None)
        context = self.get_context_data(object=self.object, action=action, request=request)
        form_valid = False
        if action == 'comment':
            form_valid = self.handle_comment(request, context)
        elif action == 'attach':
            form_valid = self.handle_attach(request, context)
        elif action == 'line':
            form_valid = self.handle_line(request, context)
        elif action == 'clone':
            form_valid = self.handle_clone(request, context)
        elif action == 'group':
            form_valid = self.handle_group(request, context)
        elif action == 'line_action':
            line_action = request.POST.get('line_action', None)
            if line_action == 'edit':
                form_valid = self.handle_disable(request, context)
            elif line_action == 'export':
                return ExportView.as_view()(request, *args, **kwargs)
            else:
                messages.error(request, 'Unknown line action %s' % (line_action))
        elif action == 'assay':
            form_valid = self.handle_assay(request, context)
        elif action == 'assay_action':
            assay_action = request.POST.get('assay_action', None)
            if assay_action == 'mark':
                form_valid = self.handle_assay_mark(request, context)
            elif assay_action == 'delete':
                form_valid = self.handle_measurement_delete(request, context)
            elif assay_action == 'edit':
                form_valid = self.handle_measurement_edit(request, context)
            elif assay_action == 'export':
                return ExportView.as_view()(request, *args, **kwargs)
            else:
                messages.error(request, 'Unknown assay action %s' % (assay_action))
        if form_valid:
            study_modified.send(sender=self.__class__, study=self.object)
            return HttpResponseRedirect(reverse('main:detail', kwargs={'pk':self.object.pk}))
        return self.render_to_response(context)

    def _get_assay(self, assay_id):
        study = self.get_object()
        try:
            return Assay.objects.get(pk=assay_id, line__study=study)
        except Assay.DoesNotExist, e:
            logger.warning('Failed to load assay,study combo %s,%s' % (assay_id, study.pk))
        return None

    def _get_line(self, line_id):
        study = self.get_object()
        try:
            return Line.objects.get(pk=line_id, study=study)
        except Line.DoesNotExist, e:
            logger.warning('Failed to load line,study combo %s,%s' % (line_id, study.pk))
        return None


class ExportView(generic.TemplateView):
    """ Encapsulates functionality for exports. """
    template_name = 'main/export.html'

    def __init__(self, *args, **kwargs):
        super(ExportView, self).__init__(*args, **kwargs)
        self._export = None

    def get(self, request, *args, **kwargs):
        """ Populates ExportSelectionForm from query/URL parameters and uses a default
            ExportOptionForm. """
        data = QueryDict(mutable=True)
        data.update(kwargs)
        data.update(request.GET)
        initial = ExportOptionForm.initial_from_user_settings(request.user)
        opt_data = QueryDict(mutable=True)
        print('$$$ ExportView get has $$$')
        pprint.pprint(data)
        pprint.pprint(initial)
        pprint.pprint(opt_data)
        return self.handle_export(request, data, initial, opt_data)

    def post(self, request, *args, **kwargs):
        """ Populates both ExportSelectionForm and ExportOptionForm from POST parameters. """
        initial = ExportOptionForm.initial_from_user_settings(request.user)
        print('$$$ ExportView post has $$$')
        pprint.pprint(request.POST)
        pprint.pprint(initial)
        return self.handle_export(request, request.POST, initial, request.POST)

    def handle_export(self, request, select_data, option_initial, option_data):
        select_form = ExportSelectionForm(data=select_data, user=request.user)
        option_form = None
        try:
            self._select = select_form.get_selection()
            option_form = ExportOptionForm(
                data=option_data,
                initial=option_initial,
                selection=self._select)
            if option_form.is_valid():
                self._export = table.TableExport(self._select, option_form.get_options())
                print('$$$ valid handle_export has $$$')
                pprint.pprint(self._select)
                return self.render_to_response(self.get_context_data(
                    selection=self._select,
                    select_form=select_form,
                    option_form=option_form,
                    ))
        except Exception, e:
            logger.error("Failed to validate forms for export")
            raise
        print('$$$ invalid handle_export has $$$')
        pprint.pprint(self._select)
        return self.render_to_response(self.get_context_data(
            selection=self._select,
            select_form=select_form,
            option_form=option_form,
            error_message='Could not parse export request',
            ))

    def export_output(self):
        if self._export is not None:
            return self._export.output()
        return ''

# /study/<study_id>/lines/
def study_lines(request, study):
    """ Request information on lines in a study. """
    return JsonResponse(Line.objects.filter(study=study), encoder=JSONDecimalEncoder)

# /study/<study_id>/measurements/<protocol_id>/
def study_measurements(request, study, protocol):
    """ Request measurement data in a study. """
    measure_types = MeasurementType.objects.filter(
        measurement__assay__line__study_id=study,
        measurement__assay__protocol_id=protocol,
        ).distinct()
    # stash QuerySet to use in both measurements and total_measures below
    qmeasurements = Measurement.objects.filter(
        assay__line__study_id=study,
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
            measurement__assay__line__study_id=study,
            measurement__assay__protocol_id=protocol,
            measurement__active=True,
            measurement__assay__active=True,
            measurement__assay__line__active=True,
            measurement__range=(measure_list[0].id, measure_list[-1].id),
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
        'types': { t.pk: t.to_json() for t in measure_types },
        'measures': [ m.to_json() for m in measure_list ],
        'data': value_dict,
    }
    return JsonResponse(payload, encoder=JSONDecimalEncoder)

# /study/<study_id>/measurements/<protocol_id>/<assay_id>/
def study_assay_measurements(request, study, protocol, assay):
    """ Request measurement data in a study, for a single assay. """
    measure_types = MeasurementType.objects.filter(
        measurement__assay__line__study_id=study,
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
        measurement__range=(measure_list[0].id, measure_list[-1].id),
        )
    value_dict = collections.defaultdict(list)
    for v in values:
        value_dict[v.measurement_id].append((v.x, v.y))
    payload = {
        'total_measures': {
            x['assay_id']: x.get('count', 0) for x in total_measures if 'assay_id' in x
        },
        'types': { t.pk: t.to_json() for t in measure_types },
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
        doc['url'] = reverse('main:detail', kwargs={'pk':doc['id']})
    return JsonResponse(query_response, encoder=JSONDecimalEncoder)

# /study/<study_id>/edddata/
def study_edddata (request, study) :
    """
    Various information (both global and study-specific) that populates the
    EDDData JS object on the client.
    """
    model = Study.objects.get(pk=study)
    data_misc = get_edddata_misc()
    data_study = get_edddata_study(model)
    data_study.update(data_misc)
    return JsonResponse(data_study, encoder=JSONDecimalEncoder)

# /study/<study_id>/assaydata/
def study_assay_table_data (request, study) :
    """ Request information on assays associated with a study. """
    model = Study.objects.get(pk=study)
    # FIXME filter protocols?
    protocols = Protocol.objects.all()
    lines = model.line_set.all()
    return JsonResponse({
            "ATData" : {
                "existingProtocols" : { p.id : p.name for p in protocols },
                "existingLines" : [ {"n":l.name,"id":l.id} for l in lines ],
                "existingAssays" : model.get_assays_by_protocol(),
            },
            "EDDData" : get_edddata_study(model),
        }, encoder=JSONDecimalEncoder)

# /study/<study_id>/map/
def study_map(request, study):
    """ Request information on metabolic map associated with a study. """
    try:
        mmap = SBMLTemplate.objects.get(study=study)
        return JsonResponse({
                "name": mmap.name,
                "id": mmap.pk,
                "biomassCalculation": mmap.biomass_calculation,
                },
            encoder=JSONDecimalEncoder
            )
    except SBMLTemplate.DoesNotExist, e:
        return JsonResponse({ "name": "", "biomassCalculation": -1, }, encoder=JSONDecimalEncoder)
    except Exception, e:
        raise e

# /study/<study_id>/import
# FIXME should have trailing slash?
@ensure_csrf_cookie
def study_import_table (request, study) :
    """
    View for importing tabular assay data (replaces AssayTableData.cgi).
    """
    model = Study.objects.get(pk=study)
    # FIXME filter protocols?
    protocols = Protocol.objects.all()
    messages = {}
    post_contents = []
    if (request.method == "POST") :
        for key in sorted(request.POST) :
            if (not key in "jsondebugarea") :
                print key, ":", request.POST[key]
                post_contents.append("%s : %s" % (key, request.POST[key]))
    return render_to_response("main/table_import.html",
        dictionary={
            "study" : model,
            "protocols" : protocols,
            "message" : messages,
            "post_contents" : "\n".join(post_contents), # XXX DEBUG
        },
        context_instance=RequestContext(request))

# /study/<study_id>/import/rnaseq
# FIXME should have trailing slash?
@ensure_csrf_cookie
def study_import_rnaseq (request, study) :
    """
    View for importing multiple sets of RNA-seq measurements in various simple
    tabular formats defined by us.  Handles both GET and POST.
    """
    messages = {}
    model = Study.objects.get(pk=study)
    lines = model.line_set.all()
    if (request.method == "POST") :
        try :
            result = main.data_import.import_rna_seq.from_form(request, model)
            messages["success"] = "Added %d measurements in %d assays." %\
                (result.n_assay, result.n_meas)
        except ValueError as e :
            messages["error"] = str(e)
        #else :
        #    return redirect("/study/%s" % study)
    return render_to_response("main/import_rnaseq.html",
        dictionary={
            "messages" : messages,
            "study" : model,
            "lines" : lines,
        },
        context_instance=RequestContext(request))

# /study/<study_id>/import/rnaseq/edgepro
# FIXME should have trailing slash?
@ensure_csrf_cookie
def study_import_rnaseq_edgepro (request, study) :
    """
    View for importing a single set of RNA-seq measurements from the EDGE-pro
    pipeline, attached to an existing Assay.  Handles both GET and POST.
    """
    messages = {}
    model = Study.objects.get(pk=study)
    assay_id = None
    if (request.method == "GET") :
        assay_id = request.POST.get("assay", None)
    elif (request.method == "POST") :
        assay_id = request.POST.get("assay", None)
        try :
            if (assay_id is None) or (assay_id == "") :
                raise ValueError("Assay ID required for form submission.")
            result = main.data_import.import_rnaseq_edgepro.from_form(
                request=request,
                study=model)
            messages["success"] = result.format_message()
        except ValueError as e :
            messages["error"] = str(e)
        #else :
        #    return redirect("/study/%s" % study)
    protocol = Protocol.objects.get(name="Transcriptomics")
    assays_ = Assay.objects.filter(protocol=protocol,
        line__study=study).prefetch_related(
        "measurement_set").select_related("line").select_related("protocol")
    assay_info = []
    for assay in assays_ :
        assay_info.append({
            "id" : assay.id,
            "long_name" : assay.long_name,
            "n_meas" : assay.measurement_set.count(),
        })
    return render_to_response("main/import_rnaseq_edgepro.html",
        dictionary={
            "selected_assay_id" : assay_id,
            "assays" : assay_info,
            "messages" : messages,
            "study" : model,
        },
        context_instance=RequestContext(request))

# /study/<study_id>/import/rnaseq/parse
# FIXME should have trailing slash?
def study_import_rnaseq_parse (request, study) :
    """
    Parse raw data from an uploaded text file, and return JSON object of
    processed result.  Result is identical to study_import_rnaseq_process,
    but this method is invoked by drag-and-drop of a file (via filedrop.js).
    """
    model = Study.objects.get(pk=study)
    referrer = request.META['HTTP_REFERER']
    result = None
    # XXX slightly gross: using HTTP_REFERER to dictate choice of parsing
    # functions
    try :
        if ("edgepro" in referrer) :
            result = main.data_import.interpret_edgepro_data(
                raw_data=request.read())
            result['format'] = "edgepro"
        else :
            result = main.data_import.interpret_raw_rna_seq_data(
                raw_data=request.read(),
                study=model)
            result['format'] = "generic"
    except ValueError as e :
        return JsonResponse({ "python_error" : str(e) })
    else :
        return JsonResponse(result)

# /study/<study_id>/import/rnaseq/process
# FIXME should have trailing slash?
def study_import_rnaseq_process (request, study) :
    """
    Process form submission containing either a file or text field, and
    return JSON object of processed result.
    """
    model = Study.objects.get(pk=study)
    assert (request.method == "POST")
    try :
        data = request.POST.get("data", "").strip()
        file_name = None
        if (data == "") :
            data_file = request.FILES.get("file_name", None)
            if (data_file is None) :
                raise ValueError("Either a text file or pasted table is "+
                    "required as input.")
            data = data_file.read()
            file_name = data_file.name
        result = None
        if (request.POST.get("format") == "htseq-combined") :
            result = main.data_import.interpret_raw_rna_seq_data(
                raw_data=data,
                study=model,
                file_name=file_name)
        elif (request.POST.get("format") == "edgepro") :
            result = main.data_import.interpret_edgepro_data(
                raw_data=data,
                study=model,
                file_name=file_name)
        else :
            raise ValueError("Format needs to be specified!")
    except ValueError as e :
        return JsonResponse({ "python_error" : str(e) })
    except Exception as e :
        print e
    else :
        return JsonResponse(result)


# /study/<study_id>/sbml
# FIXME should have trailing slash?
def study_export_sbml (request, study) :
    model = Study.objects.get(pk=study)
    if (request.method == "POST") :
        form = request.POST
    else :
        form = request.GET
    try :
        lines = get_selected_lines(form, model)
        manager = main.sbml_export.line_sbml_export(
            study=model,
            lines=lines,
            form=form,
            debug=True)
    except ValueError as e :
        return render(request, "main/error.html", {
          "error_source" : "SBML export for %s" % model.name,
          "error_message" : str(e),
        })
    else :
        # two levels of exception handling allow us to view whatever steps
        # were completed successfully even if a later step fails
        error_message = None
        try :
            manager.run()
        except ValueError as e :
            error_message = str(e)
        else :
            if form.get("download", None) :
                timestamp_str = form["timestamp"]
                if (timestamp_str != "") :
                    timestamp = float(timestamp_str)
                    sbml = manager.as_sbml(timestamp)
                    response = HttpResponse(sbml,
                    content_type="application/sbml+xml")
                    file_name = manager.output_file_name(timestamp)
                    response['Content-Disposition'] = \
                        'attachment; filename="%s"' % file_name
                    return response
        return render_to_response("main/sbml_export.html",
            dictionary={
                "data" : manager,
                "study" : model,
                "lines" : lines,
                "error_message" : error_message,
            },
            context_instance=RequestContext(request))

# /data/users
def data_users (request) :
    return JsonResponse({ "EDDData" : get_edddata_users() }, encoder=JSONDecimalEncoder)

# /data/misc
def data_misc (request) :
    return JsonResponse({ "EDDData" : get_edddata_misc() }, encoder=JSONDecimalEncoder)

# /data/measurements
def data_measurements (request) :
    data_meas = get_edddata_measurement()
    data_misc = get_edddata_misc()
    data_meas.update(data_misc)
    return JsonResponse({ "EDDData" : data_meas }, encoder=JSONDecimalEncoder)

# /data/sbml/
def data_sbml(request):
    all_sbml = SBMLTemplate.objects.all()
    return JsonResponse(
        [ sbml.to_json() for sbml in all_sbml ],
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
        } for r in rlist if 'biomass' in r.getId() ],
        encoder=JSONDecimalEncoder,
        safe=False,
        )

# /data/sbml/<sbml_id>/reactions/<rxn_id>/
def data_sbml_reaction_species(request, sbml_id, rxn_id):
    sbml = get_object_or_404(SBMLTemplate, pk=sbml_id)
    rlist = sbml.load_reactions()
    found = [ r for r in rlist if rxn_id == r.getId() ]
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
        matched_json = { m.species: m.measurement_type.to_json() for m in matched }
        unmatched = [ s for s in all_species if s not in matched_json ]
        # old EDD tries to generate SBML species names for all metabolites and match
        # below is the inverse; take a species name, try to extract short_name, and search
        guessed_json = { }
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
                candidate_names = [ match.group(1), sub_symbol(match.group(1)), ]
                guessed = Metabolite.objects.filter(short_name__in=candidate_names)
                guessed_json.update({ s: m.to_json() for m in guessed })
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
    found = [ r for r in rlist if rxn_id == r.getId() ]
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
                    info.push({
                            "metaboliteName": sp.getSpecies(),
                            "stoichiometry": sp.getStoichiometry(),
                            "carbonCount": m.measurement_type.metabolite.carbon_count,
                        })
                except Exception, e:
                    pass
            return total
        reactants = [ r for r in found[0].getListOfReactants() if r.getSpecies() in spp ]
        products = [ r for r in found[0].getListOfProducts() if r.getSpecies() in spp ]
        reactant_info = []
        product_info = []
        biomass = sumMetaboliteStoichiometries(reactants, reactant_info)
        biomass -= sumMetaboliteStoichiometries(products, product_info)
        info = json.dumps({
                "reaction_id": rxn_id,
                "reactants": reactant_info,
                "products": product_info,
            }, cls=JSONDecimalEncoder)
        sbml.biomass_calculation = biomass
        sbml.biomass_calculation_info = info
        sbml.save()
        return JsonResponse(biomass, encoder=JSONDecimalEncoder, safe=False)
    raise Http404("Could not find reaction")

# /data/strains
def data_strains (request) :
    return JsonResponse({ "EDDData" : get_edddata_strains() }, encoder=JSONDecimalEncoder)

# /data/metadata
def data_metadata (request) :
    return JsonResponse({
            "EDDData" : {
                "MetadataTypes" :
                    { m.id:m.to_json() for m in MetadataType.objects.all() },
            }
        }, encoder=JSONDecimalEncoder)

# /data/carbonsources
def data_carbonsources (request) :
    return JsonResponse({ "EDDData" : get_edddata_carbon_sources() }, encoder=JSONDecimalEncoder)

# /download/<file_id>
def download (request, file_id) :
    model = Attachment.objects.get(pk=file_id)
    if (not model.user_can_read(request.user)) :
        return HttpResponseForbidden("You do not have access to data "+
            "associated with this study.")
    response = HttpResponse(model.file.read(),
        content_type=model.mime_type)
    response['Content-Disposition'] = 'attachment; filename="%s"' % \
        model.filename
    return response

def delete_file (request, file_id) :
    redirect_url = request.GET.get("redirect", None)
    if (redirect_url is None) :
        return HttpResponseBadRequest("Missing redirect URL.")
    model = Attachment.objects.get(pk=file_id)
    if (not model.user_can_delete(request.user)) :
        return HttpResponseForbidden("You do not have permission to remove "+
            "files associated with this study.")
    model.delete()
    return redirect(redirect_url)

# /utilities/parsefile
def utilities_parse_table (request) :
    """
    Attempt to process posted data as either a TSV or CSV file or Excel
    spreadsheet and extract a table of data automatically.
    """
    default_error = JsonResponse({"python_error" : "The uploaded file "+
        "could not be interpreted as either an Excel spreadsheet or a "+
        "CSV/TSV file.  Please check that the contents are formatted "+
        "correctly.  (Word documents are not allowed!)" })
    data = request.read()
    try :
        parsed = csv.reader(data, delimiter='\t')
        assert (len(parsed[0]) > 1)
        return JsonResponse({
            "file_type" : "tab",
            "file_data" : data,
        })
    except Exception as e :
        try :
            parsed = csv.reader(data, delimiter=',')
            assert (len(parsed[0]) > 1)
            return JsonResponse({
                "file_type" : "csv",
                "file_data" : data,
            })
        except Exception as e :
            try :
                from edd_utils.parsers import excel
                result = excel.import_xlsx_tables(
                    file=BytesIO(data))
                return JsonResponse({
                    "file_type" : "xlsx",
                    "file_data" : result,
                })
            except ImportError as e :
                return JsonResponse({ "python_error" :
                    "jbei_tools module required to handle Excel table input."
                })
            except ValueError as e :
                return JsonResponse({ "python_error" : str(e) })
            except Exception as e :
                return default_error

# /search
def search (request) :
    """
    Naive implementation of model-independent server-side autocomplete backend,
    paired with autocomplete2.js on the client side.  This is probably too
    inefficient to be suitable for production use due to the overhead of
    pulling out all instances of a model and exporting dictionaries each time
    it is called, but it provides a template for something smarter (to be
    determined), and a proof-of-concept for the frontend.
    """
    # XXX actually, the overhead for searching User entries isn't awful,
    # maybe 150ms per query on average on my laptop.  it will probably scale
    # less well for metabolites.
    term = request.GET["term"]
    model_name = request.GET["model"]
    results = []
    if model_name == "User":
        solr = UserSearch()
        results = solr.query(query=term, options={'edismax':True})
        return JsonResponse({ "rows": results['response']['docs'] })
    elif model_name == "Strain":
        ice = IceApi(ident=request.user)
        results = ice.search_for_part(term)
        rows = [ match.get('entryInfo', dict()) for match in results.get('results', []) ]
        return JsonResponse({ "rows": rows })
    else:
        Model = getattr(main.models, model_name)
        # gets all the direct field names that can be filtered by terms
        ifields = [ f.get_attname() 
                    for f in Model._meta.get_fields()
                    if hasattr(f, 'get_attname') and (
                        f.get_internal_type() == 'TextField' or
                        f.get_internal_type() == 'CharField')
                    ]
        term_filters = []
        # construct a Q object for each term/field combination
        for term in term.split():
            term_filters.extend([ Q(**{ f+'__iregex': term }) for f in ifields ])
        # run search with each Q object OR'd together; limit to 20
        found = Model.objects.filter(reduce(operator.or_, term_filters, Q()))[:20]
        results = [ item.to_json() for item in found ]
    return JsonResponse({ "rows": results })
