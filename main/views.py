from django.core.urlresolvers import reverse
from django.http import HttpResponse, HttpResponseRedirect
from django.shortcuts import render, get_object_or_404
from django.views import generic
from main.models import Study
from main.solr import StudySearch
import json


class IndexView(generic.ListView):
    """
    """
    model = Study
    template_name = 'main/index.html'
    context_object_name = 'study_list'


class StudyDetailView(generic.DetailView):
    """
    """
    model = Study
    template_name = 'main/detail.html'


def study_search(request):
    """
    View function handles incoming requests to search solr
    """
    solr = StudySearch(ident=request.user)
    query = request.GET.get('q', 'active:true')
    opt = request.GET.copy()
    opt['edismax'] = True
    data = solr.query(query=query, options=opt)
    return HttpResponse(json.dumps(data['response']), content_type='application/json; charset=utf-8')
