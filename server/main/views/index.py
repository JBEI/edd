"""Views for the main Study index entry page of EDD."""

import logging

from django.urls import reverse
from django.views import generic

from .. import forms, models, redis

logger = logging.getLogger(__name__)


class StudyCreateView(generic.edit.CreateView):
    """View for request to create a Study."""

    form_class = forms.CreateStudyForm
    model = models.Study
    template_name = "main/create_study.html"

    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)
        context.update(can_create=models.Study.user_can_create(self.request.user))
        return context

    def get_form_kwargs(self):
        kwargs = super().get_form_kwargs()
        kwargs.update(user=self.request.user)
        return kwargs

    def get_success_url(self):
        return reverse("main:overview", kwargs={"slug": self.object.slug})


class StudyIndexView(StudyCreateView):
    """View for the the index page."""

    template_name = "main/index.html"

    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)
        lvs = redis.LatestViewedStudies(self.request.user)
        # just doing filter will lose the order
        latest_qs = self.get_queryset().filter(pk__in=lvs)
        # so create a dict of string-casted pk to study
        latest_by_pk = {str(s.pk): s for s in latest_qs}
        # and a mapping of lvs to retain order
        latest = map(lambda pk: latest_by_pk.get(pk, None), lvs)
        # filter out the Nones
        context.update(latest_viewed_studies=list(filter(bool, latest)))
        return context
