from django.conf import settings
from django.core import serializers
from django.core.urlresolvers import reverse
from django.db.models import Q
from django.http import HttpResponse, HttpResponseRedirect, JsonResponse
from django.http.response import HttpResponseForbidden
from django.shortcuts import render, get_object_or_404, redirect, \
  render_to_response
from django.template import RequestContext
from django.template.defaulttags import register
from django.views import generic
from main.forms import CreateStudyForm
from main.models import Study, Update, Protocol, Measurement
from main.solr import StudySearch
from main.utilities import get_edddata_study, get_edddata_misc, JSONDecimalEncoder
import json


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
    measurements = Measurement.objects.filter(assay__line__study=model, active=True)
    measure_json = json.dumps(map(lambda m: m.to_json(), measurements), cls=JSONDecimalEncoder)
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
    if (request.method == "POST") :
        for key in request.POST :
            if (not key in "jsondebugarea") :
                print key, ":", request.POST[key]
                print ""
    return render_to_response("main/table_import.html",
        dictionary={
            "study" : model,
            "protocols" : protocols,
            "pageMessage" : pageMessage,
            "pageError" : pageError,
        },
        context_instance=RequestContext(request))
      #return redirect("/study/%s" % study)
