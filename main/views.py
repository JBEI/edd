from django.core.urlresolvers import reverse
from django.http import HttpResponse, HttpResponseRedirect
from django.shortcuts import render, get_object_or_404
from django.views import generic
from main.models import Study


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

