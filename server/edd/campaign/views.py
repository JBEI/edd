# coding: utf-8

import logging

from django.core.exceptions import PermissionDenied
from django.http import Http404
from django.template.defaulttags import register
from django.urls import reverse
from django.utils.translation import ugettext as _
from django.views import View, generic
from requests import codes

from main import models as edd_models
from main import views as edd_views

from . import forms, models

logger = logging.getLogger(__name__)


@register.filter(name="getitem")
def getitem(value, key):
    """
    Does a getitem lookup on a value. Items that don't exist resolve to empty string.
    This should be a default filter, but it isn't, so now it is.
    """
    try:
        return value[key]
    except Exception:
        return ""


class CampaignCreateView(generic.edit.CreateView):

    form_class = forms.CreateCampaignForm
    model = models.Campaign
    template_name = "edd/campaign/create.html"

    def form_invalid(self, form):
        # base class defaults to returning 200 OK response instead of 400 BAD REQUEST
        return self.render_to_response(
            self.get_context_data(form=form), status=codes.bad_request
        )

    def get_success_url(self):
        return reverse("campaign:detail", kwargs={"slug": self.object.slug})


class CampaignListView(generic.ListView):

    model = models.Campaign
    paginate_by = 25
    template_name = "edd/campaign/index.html"

    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)
        context.update(
            can_create=self.request.user.has_perm("campaign.add_campaign"),
            form=forms.CreateCampaignForm(),
        )
        return context

    def get_queryset(self):
        qs = super().get_queryset().order_by("pk")
        if self.request.user.is_superuser:
            return qs
        return qs.filter(models.Campaign.filter_for(self.request.user)).distinct()


class CampaignIndexView(View):
    """Index view doubles as creation view for Campaigns, similar to Study."""

    def get(self, request, *args, **kwargs):
        view = CampaignListView.as_view()
        return view(request, *args, **kwargs)

    def post(self, request, *args, **kwargs):
        view = CampaignCreateView.as_view()
        return view(request, *args, **kwargs)


class CampaignDetailView(generic.edit.FormMixin, generic.DetailView):
    """View for creating a new Study within a Campaign."""

    form_class = edd_views.StudyCreateView.form_class
    model = models.Campaign
    template_name = "edd/campaign/detail.html"

    def form_invalid(self, form):
        # base class defaults to returning 200 OK response instead of 400 BAD REQUEST
        return self.render_to_response(
            self.get_context_data(), status=codes.bad_request
        )

    def form_valid(self, form):
        # save valid study form
        self.study = form.save()
        # add to this campaign
        models.CampaignMembership.objects.create(
            campaign=self.campaign, study=self.study
        )
        # follow parent class logic
        return super().form_valid(form)

    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)
        # define some keys to check specific flags on a permission
        permission_keys = {
            "study_add": models.CampaignPermission.convert_link_type(
                edd_models.Study, models.CampaignPermission.ADD
            ),
            "study_remove": models.CampaignPermission.convert_link_type(
                edd_models.Study, models.CampaignPermission.REMOVE
            ),
        }
        # check if user can create studies at all
        study_create = edd_models.Study.user_can_create(self.request.user)
        # check if user can add studies to this specific campaign
        can_add_study = self.object.check_permissions(
            edd_models.Study, models.CampaignPermission.ADD, self.request.user
        )
        # if both, include modal to directly create study in campaign
        can_create_study = study_create and can_add_study
        context.update(
            can_add_study=can_add_study,
            can_create_study=can_create_study,
            can_write=self.object.user_can_write(self.request.user),
            create_study=self.get_form(),
            permission_keys=permission_keys,
        )
        return context

    def get_queryset(self):
        qs = super().get_queryset().order_by("pk")
        if self.request.user.is_superuser:
            return qs
        return qs.filter(models.Campaign.filter_for(self.request.user)).distinct()

    def get_success_url(self):
        return reverse("main:overview", kwargs={"slug": self.study.slug})

    def post(self, request, *args, **kwargs):
        # some base class methods expect self.object to be set
        self.campaign = self.object = self.get_object()
        if not self.campaign.check_permissions(
            edd_models.Study, models.CampaignPermission.ADD, request.user
        ):
            raise PermissionDenied(
                _("You do not have permission to add a Study to this Campaign")
            )
        form = self.get_form()
        if form.is_valid():
            return self.form_valid(form)
        else:
            return self.form_invalid(form)


class CampaignStudyListView(generic.detail.SingleObjectMixin, generic.ListView):

    paginate_by = 25
    template_name = "edd/campaign/study_list.html"

    def get(self, request, *args, **kwargs):
        self.object = self.get_object(queryset=models.Campaign.objects.all())
        if self.object.user_can_read(request.user):
            return super().get(request, *args, **kwargs)
        raise Http404()

    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)
        # check if user can add studies to this specific campaign
        can_remove_study = self.object.check_permissions(
            edd_models.Study, models.CampaignPermission.REMOVE, self.request.user
        )
        context.update(campaign=self.object, can_remove_study=can_remove_study)
        return context

    def get_queryset(self):
        qs = self.object.studies.order_by("pk")
        if self.request.user.is_superuser:
            return qs
        return qs.filter(edd_models.Study.access_filter(self.request.user)).distinct()
