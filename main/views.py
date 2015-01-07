from django.core.urlresolvers import reverse
from django.http import HttpResponse, HttpResponseRedirect
from django.shortcuts import render, get_object_or_404
from django.views import generic
from main.models import Study


class IndexView(generic.ListView):
    """
    """
    template_name = 'main/index.html'
    context_object_name = 'study_list'
    
    def get_queryset(self):
        return Study.objects.all()


class StudyDetailView(generic.DetailView):
    """
    """
    model = Study
    template_name = 'main/detail.html'


def index(request):
    return render(request, 'main/index.html', { 'study_list': Study.objects.all() })

def detail(request, study_id):
    return render(request, 'main/detail.html', { 'study': get_object_or_404(Study, pk=study_id) })
