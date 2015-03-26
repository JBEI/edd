from django.conf import settings
from django.core import serializers
from django.core.urlresolvers import reverse
from django.db.models import Q
from django.views.decorators.csrf import csrf_exempt
from django.http import HttpResponse, HttpResponseRedirect, JsonResponse
from django.http.response import HttpResponseForbidden
from django.shortcuts import render, get_object_or_404, redirect, \
    render_to_response
from django.template import RequestContext
from django.template.defaulttags import register
from django.views import generic
from main.forms import CreateStudyForm
from main.models import Study, Update, Protocol, Measurement, MeasurementType
from main.solr import StudySearch
from main.utilities import get_edddata_study, get_edddata_misc, \
    get_selected_lines, JSONDecimalEncoder
import main.sbml_export
import main.data_export
from io import BytesIO
import json
import csv


@register.filter(name='lookup')
def lookup(dictionary, key):
    """
    Utility template filter, as Django forbids argument passing in templates. Used for filtering
    out values, e.g. for metadata, of list has EDDObject items and type is a MetadataType:
    {% for obj in list %}
    {{ obj.metadata|lookup:type }}
    {% endfor %}
    """
    try:
        return dictionary[key]
    except:
        return settings.TEMPLATE_STRING_IF_INVALID


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
    """
    Study details page, displays line/assay data.
    """
    model = Study
    template_name = 'main/detail.html'
    
    def get_context_data(self, **kwargs):
        context = super(StudyDetailView, self).get_context_data(**kwargs)
        context['lines'] = self.object.line_set.order_by('replicate', 'name').all()
        context['line_meta'] = self.object.get_line_metadata_types()
        context['strain'] = self.object.get_strains_used()
        context['protocol'] = self.object.get_protocols_used()
        return context


def study_lines(request, study):
    """
    Request information on lines in a study.
    """
    model = Study.objects.get(pk=study)
    lines = json.dumps(map(lambda l: l.to_json(), model.line_set.all()))
    return HttpResponse(lines, content_type='application/json; charset=utf-8')


def study_measurements(request, study):
    """
    Request measurement data in a study.
    """
    model = Study.objects.get(pk=study)
    measure_types = MeasurementType.objects.filter(measurement__assay__line__study=model).distinct()
    measurements = Measurement.objects.filter(assay__line__study=model, active=True)
    payload = {
        'types': { t.pk: t.to_json() for t in measure_types },
        'data': map(lambda m: m.to_json(), measurements),
    }
    measure_json = json.dumps(payload, cls=JSONDecimalEncoder)
    return HttpResponse(measure_json, content_type='application/json; charset=utf-8')


def study_search(request):
    """
    View function handles incoming requests to search solr
    """
    solr = StudySearch(ident=request.user)
    query = request.GET.get('q', 'active:true')
    opt = request.GET.copy()
    opt['edismax'] = True
    data = solr.query(query=query, options=opt)
    # loop through results and attach URL to each
    query_response = data['response']
    for doc in query_response['docs']:
        doc['url'] = reverse('main:detail', kwargs={'pk':doc['id']})
    return HttpResponse(json.dumps(query_response), content_type='application/json; charset=utf-8')


def study_edddata (request, study) :
    """
    Various information (both global and study-specific) that populates the
    EDDData JS object on the client.
    """
    model = Study.objects.get(pk=study)
    data_misc = get_edddata_misc()
    data_study = get_edddata_study(model)
    data_study.update(data_misc)
    return JsonResponse(data_study)


def study_assay_table_data (request, study) :
    """
    Request information on assays associated with a study.
    """
    model = Study.objects.get(pk=study)
    protocols = Protocol.objects.all()
    lines = model.line_set.all()
    return JsonResponse({
      "ATData" : {
        "existingProtocols" : { p.id : p.name for p in protocols },
        "existingLines" : [ {"n":l.name,"id":l.id} for l in lines ],
        "existingAssays" : model.get_assays_by_protocol(),
      },
      "EDDData" : get_edddata_study(model),
    })


def study_import_table (request, study) :
    """
    View for importing tabular assay data (replaces AssayTableData.cgi).
    """
    model = Study.objects.get(pk=study)
    protocols = Protocol.objects.all()
    pageMessage = pageError = None
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
            "pageMessage" : pageMessage,
            "pageError" : pageError,
            "post_contents" : "\n".join(post_contents), # XXX DEBUG
        },
        context_instance=RequestContext(request))

def study_export_table (request, study) :
    """
    HTML view for exporting measurement data in table format (replaces
    StudyExport.cgi).
    """
    model = Study.objects.get(pk=study)
    form = None
    if (request.method == "POST") :
        form = request.POST
    else :
        form = request.GET
    exports = main.data_export.select_objects_for_export(
        study=model,
        user=None, # FIXME
        form=form)
    error_message = None
    formatted_table = None
    if (len(exports['measurements']) == 0) :
        error_message = "No measurements selected for export!"
    else :
        formatted_table = main.data_export.table_view(exports, form)
    return render_to_response("main/export.html",
        dictionary={
            "study" : model,
            "line_id_str" : ",".join([ str(l.id) for l in exports['lines'] ]),
            "assay_id_str" : ",".join([ str(a.id) for a in exports['assays'] ]),
            "measurement_id_str" : ",".join([ str(l.id) for m in
                                              exports['measurements'] ]),
            "column_info" : main.data_export.column_info,
            "lines" : exports['lines'],
            "n_meas" : len(exports['measurements']),
            "n_assays" : len(exports['assays']),
            "n_lines" : len(exports['lines']),
            "error_message" : error_message,
            "formatted_table" : formatted_table,
        },
        context_instance=RequestContext(request))

def study_export_table_data (request, study) :
    model = Study.objects.get(pk=study)
    form = None
    if (request.method == "POST") :
        form = request.POST
    else :
        form = request.GET
    exports = main.data_export.select_objects_for_export(
        study=model,
        user=None, # FIXME
        form=form)
    if (len(exports['measurements']) == 0) :
        raise RuntimeError("No measurements selected for export!")
    else :
        return main.data_export.export_table(exports, form)

def study_export_sbml (request, study) :
    model = Study.objects.get(pk=study)
    if (request.method == "POST") :
        form = request.POST
    else :
        form = request.GET
    lines = []
    lines = get_selected_lines(form, model)
    try :
        if (len(lines) == 0) :
            raise ValueError("No lines found for export.")
        exports = main.sbml_export.line_sbml_data(
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
        return render_to_response("main/sbml_export.html",
            dictionary={
                "data" : exports,
                "study" : model,
                "lines" : lines,
            },
            context_instance=RequestContext(request))

# FIXME it would be much better to avoid csrf_exempt...
@csrf_exempt
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
                from jbei_tools.parsers import excel
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
