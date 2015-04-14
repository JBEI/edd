from django.conf import settings
from django.core import serializers
from django.core.urlresolvers import reverse
from django.db.models import Q
from django.core.exceptions import ObjectDoesNotExist, PermissionDenied
from django.http import HttpResponse, HttpResponseRedirect, JsonResponse
from django.http.response import HttpResponseForbidden, HttpResponseBadRequest
from django.shortcuts import render, get_object_or_404, redirect, \
    render_to_response
from django.template import RequestContext
from django.template.defaulttags import register
from django.views import generic
from django.views.decorators.csrf import csrf_exempt
from main.forms import CreateStudyForm
from main.models import *
from main.solr import StudySearch
from main.utilities import get_edddata_study, get_edddata_misc, \
    get_edddata_users, get_selected_lines, JSONDecimalEncoder
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
                timestamp = float(form["timestamp"])
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

# /admin/sbml
def admin_sbml (request) :
    return render_to_response("main/admin_sbml.html",
        dictionary={
            "sbml_templates" : main.sbml_export.sbml_template_info(),
        },
        context_instance=RequestContext(request))

# /admin/sbml/upload
def admin_sbml_upload (request) :
    if (request.method != "POST") :
        return HttpResponseBadRequest("POST data not found.")
    else :
        form = request.POST
        update = Update.load_request_update(request)
        try :
            template = main.sbml_export.create_sbml_template_from_form(
                description=form["newAttachmentDescription"],
                uploaded_file=request.FILES['newAttachmentContent'],
                update=update)
        except ValueError as e :
            return render(request, "main/error.html", {
                "error_source" : "SBML template upload",
                "error_message" : str(e),
            })
        else :
            return redirect("/admin/sbml/%d/edit" % template.pk)

# /admin/sbml/<map_id>/edit
def admin_sbml_edit (request, template_id) :
    messages = {}
    if (request.method == "POST") :
        error = None
        try :
            # TODO handle owner assignment
            update = Update.load_request_update(request)
            model = SBMLTemplate.objects.get(pk=template_id)
            main.sbml_export.update_template_from_form(
                self = model,
                filename = request.POST.get("mname", ""),
                biomass_ex_id = request.POST.get("exchangename", ""),
                description = request.POST.get("description", ""),
                update=update,
                uploaded_file=request.FILES.get("newAttachmentContent"))
        except ObjectDoesNotExist as e :
            return render(request, "main/error.html", {
                "error_source" : "SBML template edit",
                "error_message" : str(e),
            })
        except ValueError as e :
            messages['error'] = str(e)
        else :
            messages['success'] = "Template updated."
    sbml_info = main.sbml_export.sbml_info(template_id=template_id)
    return render_to_response("main/admin_sbml_edit.html",
        dictionary={
            "data" : sbml_info,
            "messages" : messages,
        },
        context_instance=RequestContext(request))

# /data/users
def data_users (request) :
    return JsonResponse({ "EDDData" : get_edddata_users() })

# /download/<file_id>
def download (request, file_id) :
    model = Attachment.objects.get(pk=file_id)
    # FIXME this seems clumsy - is there a better way to detect what model an
    # Attachment is linked to?
    try :
        study = Study.objects.get(pk=model.object_ref_id)
    except ObjectDoesNotExist :
        pass
    else :
        if (not study.user_can_read(request.user)) :
            return HttpResponseForbidden("You do not have access to data "+
                "associated with this study.")
    response = HttpResponse(model.file.read(),
        content_type=model.mime_type)
    response['Content-Disposition'] = 'attachment; filename="%s"' % \
        model.filename
    return response

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
