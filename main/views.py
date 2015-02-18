from django.core import serializers
from django.core.urlresolvers import reverse
from django.db.models import Q
from django.http import HttpResponse, HttpResponseRedirect, JsonResponse
from django.http.response import HttpResponseForbidden
from django.shortcuts import render, get_object_or_404
from django.views import generic
from main.forms import CreateStudyForm
from main.models import Study, Update, MetadataType, MeasurementUnit, \
  Metabolite, Protocol
from main.solr import StudySearch
import json


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


def study_lines(request, study):
    """
    Request information on lines in a study.
    """
    model = Study.objects.get(pk=study)
    lines = json.dumps(map(lambda l: l.to_json(), model.line_set.all()))
    return HttpResponse(lines, content_type='application/json; charset=utf-8')


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

def study_assays (request, study) :
    """
    Request information on assays associated with a study.
    """
    model = Study.objects.get(pk=study)
    return JsonResponse({ a.id : a.to_json() for a in model.get_assays() })

def globals_metadata_types (request) :
    """
    Request information on metadata types stored globally.
    """
    mdtypes = MetadataType.objects.all()
    return JsonResponse({ m.id : m.to_json() for m in mdtypes })

def globals_unit_types (request) :
    """
    Request information on measurement unit types stored globally.
    """
    unit_types = MeasurementUnit.objects.all()
    return JsonResponse({ ut.id : ut.to_json() for ut in unit_types })

def globals_metabolite_types (request) :
    """
    Request information on metabolite types stored globally.
    """
    metab_types = Metabolite.objects.all()
    return JsonResponse({ mt.id : mt.to_json() for mt in metab_types })

# XXX this is a little inconsistent...
def globals_measurement_compartments (request) :
    return JsonResponse({ i : comp for i, comp in enumerate([
      # XXX should these be stored elsewhere (postgres, other module)?
      { "name" : "", "sn" : "" },
      { "name" : "Intracellular/Cytosol (Cy)", "sn" : "IC" },
      { "name" : "Extracellular", "sn" : "EC" },
    ]) })

def globals_protocols (request) :
    return JsonResponse({ p.id : p.name for p in Protocol.objects.all() })
