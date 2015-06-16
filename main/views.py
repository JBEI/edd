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
from django.utils.safestring import mark_safe
from django.views import generic
from django.views.decorators.csrf import ensure_csrf_cookie
from main.forms import *
from main.models import *
from main.solr import StudySearch, UserSearch
from main.utilities import *
import main.models
import main.sbml_export
import main.data_export
import main.data_import
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

@register.filter(name='formula')
def formula (molecular_formula) :
    """
    Convert the molecular formula to a list of dictionaries giving each
    element and its count.  This is used in HTML views with <sub> tags.
    """
    elements = re.findall("([A-Z]{1,2})([1-9]{1}[0-9]*)",
        molecular_formula)
    if (len(elements) == 0) :
        return ""
    return mark_safe("".join(["%s<sub>%s</sub>" % (e,c) for e,c in elements]))


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
        context['new_line'] = CreateLineForm()
        context['strain'] = self.object.get_strains_used()
        context['protocol'] = self.object.get_protocols_used()
        return context

# /study/<study_id>/attach
# FIXME should have trailing slash?
def study_attach (request, study) :
    """Attach a file to a study."""
    model = Study.objects.get(pk=study)
    update = Update.load_request_update(request)
    att = Attachment.from_upload(
        edd_object=model,
        form=request.POST,
        uploaded_file=request.FILES['newAttachmentContent'],
        update=update)
    return redirect("/study/%s" % study)

# /study/<study_id>/lines/
def study_lines(request, study):
    """ Request information on lines in a study. """
    model = Study.objects.get(pk=study)
    # FIXME use JsonResponse
    lines = json.dumps(map(lambda l: l.to_json(), model.line_set.all()))
    return HttpResponse(lines, content_type='application/json; charset=utf-8')

# /study/<study_id>/measurements
# FIXME should have trailing slash?
def study_measurements(request, study):
    """ Request measurement data in a study. """
    model = Study.objects.get(pk=study)
    measure_types = MeasurementType.objects.filter(measurement__assay__line__study=model).distinct()
    measurements = Measurement.objects.filter(assay__line__study=model, active=True)
    payload = {
        'types': { t.pk: t.to_json() for t in measure_types },
        'data': map(lambda m: m.to_json(), measurements),
    }
    # FIXME use JsonResponse
    measure_json = json.dumps(payload, cls=JSONDecimalEncoder)
    return HttpResponse(measure_json, content_type='application/json; charset=utf-8')

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
    # FIXME use JsonResponse
    return HttpResponse(json.dumps(query_response), content_type='application/json; charset=utf-8')

# /study/<study_id>/edddata
# FIXME should have trailing slash?
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

# /study/<study_id>/assaydata
# FIXME should have trailing slash?
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
    })

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

# /study/<study_id>/export
# FIXME should have trailing slash?
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
        user=request.user, # FIXME
        form=form)
    column_info = list(main.data_export.column_info)
    column_flags = main.data_export.extract_column_flags(form)
    for col in column_info :
        if (col['label'] in column_flags) :
            col['checked'] = False
    error_message = None
    formatted_table = None
    if (len(exports['measurements']) == 0) :
        error_message = "No measurements selected for export!"
    else :
        formatted_table = main.data_export.table_view(export_data=exports,
            form=form,
            column_flags=column_flags)
    if (form.get("download", None) == "1") and (formatted_table is not None) :
        table_format = form.get("recordformat", "csv")
        file_name = "edd_export_%s.%s" % (study, table_format)
        response = HttpResponse(formatted_table,
            content_type="text/plain")
        response['Content-Disposition'] = 'attachment; filename="%s"'%file_name
        return response
    return render_to_response("main/export.html",
        dictionary={
            "study" : model,
            "line_id_str" : ",".join([ str(l.id) for l in exports['lines'] ]),
            "assay_id_str" : ",".join([ str(a.id) for a in exports['assays'] ]),
            "measurement_id_str" : ",".join([ str(m.id) for m in
                                              exports['measurements'] ]),
            "column_info" : column_info,
            "lines" : exports['lines'],
            "n_meas" : len(exports['measurements']),
            "n_assays" : len(exports['assays']),
            "n_lines" : len(exports['lines']),
            "error_message" : error_message,
            "formatted_table" : formatted_table,
            "assaylevel" : form.get("assaylevel", "0"),
        },
        context_instance=RequestContext(request))

# /study/<study_id>/export/data
# FIXME should have trailing slash?
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

# /admin
# FIXME fold into default admin site
def admin_home (request) :
    if (not request.user.is_staff) :
        return HttpResponseForbidden("You do not have administrative access.")
    return render(request, "main/admin.html")

# /admin/measurements
# TODO this view is probably at the top of my list of things we should refactor
# once the port is more or less complete
def admin_measurements (request) :
    if (not request.user.is_staff) :
        return HttpResponseForbidden("You do not have administrative access.")
    messages = {}
    if (request.method == "POST") :
        action = request.POST.get("action", None)
        # multiple forms on one page
        try :
            # FIXME this is inelegant...
            if (action == "addKeyword") :
                kw = MetaboliteKeyword.objects.create(
                    name=request.POST["keywordname"],
                    mod_by=request.user)
                messages['success'] = "Keyword '%s' added." % kw.name
            elif (action == "addUnit") :
                unit = MeasurementUnit.objects.create(
                    unit_name=request.POST["unit_name"],
                    type_group=request.POST["type_group"],
                    alternate_names=request.POST["alternate_names"])
                messages['success'] = "Measurement unit '%s' added." % \
                    unit.unit_name
            else : # TODO
                pass
        except ValueError as e :
            messages['error'] = str(e)
    metabolites = Metabolite.all_sorted_by_short_name()#.prefetch_related(
        #"keywords")
    return render_to_response("main/admin_measurements.html",
        dictionary={
            "messages" : messages,
            "metabolites" : metabolites,
            "keywords" : MetaboliteKeyword.all_with_metabolite_ids,
            "units" : MeasurementUnit.all_sorted,
            "mtype_groups" : MeasurementGroup.GROUP_CHOICE,
        },
        context_instance=RequestContext(request))

# /admin/metadata
def admin_metadata (request) :
    if (not request.user.is_staff) :
        return HttpResponseForbidden("You do not have administrative access.")
    messages = {}
    if (request.method == "POST") :
        # FIXME can we do better than this mess?
        form = request.POST
        try :
            old_id = request.POST.get("typeidtoedit", None)
            new_group_name = form.get("newgroupname", "").strip()
            group = None
            if (new_group_name != "") :
                group = MetadataGroup.objects.create(group_name=new_group_name)
            if (old_id is not None) :
                mdtype = MetadataType.objects.get(pk=old_id)
                type_name = form.get("typename", "").strip()
                if (type_name == "") :
                    raise ValueError("Name field must not be blank.")
                if (group is None) :
                    group_id = form.get("typegroup")
                    mdtype.group = MetadataGroup.objects.get(pk=group_id)
                mdtype.type_name = type_name
                mdtype.input_size = int(form.get("typeinputsize", "6"))
                mdtype.default_value = form.get("typedefaultvalue")
                mdtype.prefix = form.get("typeprefix")
                mdtype.postfix = form.get("typepostfix")
                mdtype.for_context = form.get("typecontext")
                mdtype.save()
                messages['success'] = "Metadata type updated."
            else :
                type_name = form.get("newtypename", "").strip()
                if (type_name == "") :
                    raise ValueError("Name field must not be blank.")
                if (group is None) :
                    group_id = form.get("newtypegroup")
                    group = MetadataGroup.objects.get(pk=group_id)
                new_type = MetadataType.objects.create(
                    type_name=type_name,
                    group=group,
                    input_size=form.get("newtypeinputsize", None),
                    default_value=form.get("newtypedefaultvalue"),
                    prefix=form.get("newtypeprefix"),
                    postfix=form.get("newtypepostfix"),
                    for_context=form.get("newtypecontext"))
                messages['success'] = """Metadata type "%s" created.""" % \
                    new_type.type_name
        except ValueError as e :
            messages['error'] = str(e)
    metadata_types = MetadataType.all_with_groups()
    return render_to_response("main/admin_metadata.html",
        dictionary={
            "messages" : messages,
            "metadata_types" : metadata_types,
            "metadata_context" : MetadataType.CONTEXT_SET,
            "line_frequencies" : Line.metadata_type_frequencies(),
            "assay_frequencies" : Assay.metadata_type_frequencies(),
            "metadata_groups" : MetadataGroup.objects.all(),
        },
        context_instance=RequestContext(request))

# /data/users
def data_users (request) :
    return JsonResponse({ "EDDData" : get_edddata_users() })

# /data/misc
def data_misc (request) :
    return JsonResponse({ "EDDData" : get_edddata_misc() })

# /data/measurements
def data_measurements (request) :
    data_meas = get_edddata_measurement()
    data_misc = get_edddata_misc()
    data_meas.update(data_misc)
    return JsonResponse({ "EDDData" : data_meas })

# /data/strains
def data_strains (request) :
    return JsonResponse({ "EDDData" : get_edddata_strains() })

# /data/metadata
def data_metadata (request) :
    return JsonResponse({
        "EDDData" : {
            "MetadataTypes" :
                { m.id:m.to_json() for m in MetadataType.objects.all() },
        }
    })

# /data/carbonsources
def data_carbonsources (request) :
    return JsonResponse({ "EDDData" : get_edddata_carbon_sources() })

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
    else:
        # if desired, limit to specific search keys
        valid_keys = request.GET.get("keys", "all").split(",")
        use_all_keys = (valid_keys == ["all"])
        models = getattr(main.models, model_name).objects.all()
        terms = term.split()
        for item in models :
            json_dict = item.to_json()
            keys = valid_keys
            if (use_all_keys) :
                keys = json_dict.keys()
            for key in keys :
                value = json_dict[key]
                if (not isinstance(value, basestring)) :
                    continue
                for term in terms :
                    if (term in value) :
                        results.append(json_dict)
                        break
                else :
                    continue
                break
    return JsonResponse({ "rows": results })
