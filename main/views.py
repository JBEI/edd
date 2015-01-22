from django.core.urlresolvers import reverse
from django.db.models import Q
from django.http import HttpResponse, HttpResponseRedirect
from django.http.response import HttpResponseForbidden
from django.shortcuts import render, get_object_or_404
from django.views import generic
from main.forms import CreateStudyForm
from main.models import Study, Update
from main.solr import StudySearch
import json


class IndexView(generic.ListView):
    """
    Main index/search page, contains a form to add new study.
    """
    model = Study
    template_name = 'main/index.html'
    context_object_name = 'study_list'
    
    def get_context_data(self, **kwargs):
        context = super(IndexView, self).get_context_data(**kwargs)
        context['form'] = CreateStudyForm()
        return context


class StudyCreateView(generic.edit.CreateView):
    """
    View for request to create a study.
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
