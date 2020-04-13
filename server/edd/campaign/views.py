import json
import logging

from django.core.exceptions import PermissionDenied
from django.db import transaction
from django.http import HttpResponse, JsonResponse
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


class PagingHelperMixin:
    """
    When a view has paging, pulls the page object out and generates paging links.
    """

    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)
        page_obj = context.get("page_obj", None)
        if page_obj:
            context.update(
                **self._build_preceding_links(page_obj),
                **self._build_following_links(page_obj),
            )
        return context

    def get_page_pattern_name(self):
        # default implementation looks for page_pattern_name on class
        return getattr(self, "page_pattern_name", None)

    def get_page_pattern_kwargs(self):
        # default implementation looks for page_pattern_kwargs on class
        return getattr(self, "page_pattern_kwargs", {})

    def _build_page_link(self, page_number):
        pattern = self.get_page_pattern_name()
        kwargs = {getattr(self, "page_kwarg", "page"): page_number}
        kwargs.update(self.get_page_pattern_kwargs())
        return reverse(pattern, kwargs=kwargs)

    def _build_preceding_links(self, page_obj):
        links = {}
        if page_obj.has_previous():
            first = 1
            links.update(page_first=self._build_page_link(first))
            prev_page = page_obj.previous_page_number()
            if prev_page != first:
                # only adding prev when it differs from first
                links.update(page_previous=self._build_page_link(prev_page))
        return links

    def _build_following_links(self, page_obj):
        links = {}
        if page_obj.has_next():
            last = page_obj.paginator.num_pages
            links.update(page_last=self._build_page_link(last))
            next_page = page_obj.next_page_number()
            if next_page != last:
                # only adding next when it differs from last
                links.update(page_next=self._build_page_link(next_page))
        return links


class CampaignCreateView(generic.edit.CreateView):
    """
    View to create a Campaign.

    This view is not accessed directly. CampaignIndexView uses it as a
    delegate, handling POST requests, so implementations of SingleObjectMixin
    (CreateView) and MultipleObjectMixin (ListView) do not get mixed.
    """

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


class CampaignListView(PagingHelperMixin, generic.ListView):
    """
    View to show all Campaigns.

    This view is not accessed directly. CampaignIndexView uses it as a
    delegate, handling GET requests, so implementations of SingleObjectMixin
    (CreateView) and MultipleObjectMixin (ListView) do not get mixed.
    """

    model = models.Campaign
    page_pattern_name = "campaign:index-paged"
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
        access = models.Campaign.filter_for(self.request.user)
        return qs.filter(access).distinct()


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
        # check if user can remove studies
        can_remove_study = self.object.check_permissions(
            edd_models.Study, models.CampaignPermission.REMOVE, self.request.user
        )
        # create paging object from CampaignStudyListView
        subview = CampaignStudyListView(campaign=self.object)
        subview.setup(self.request, *self.args, **self.kwargs)
        context.update(
            subview.get_context_data(),
            campaign=self.object,
            can_add_study=can_add_study,
            can_create_study=can_create_study,
            can_remove_study=can_remove_study,
            can_write=self.object.user_can_write(self.request.user),
            create_study=self.get_form(),
            permission_keys=permission_keys,
        )
        return context

    def get_queryset(self):
        qs = super().get_queryset().order_by("pk")
        if self.request.user.is_superuser:
            return qs
        access = models.Campaign.filter_for(self.request.user)
        return qs.filter(access).distinct()

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


class CampaignStudyListView(PagingHelperMixin, generic.ListView):
    """
    View to list Studies available in a Campaign.

    This view is not accessed directly. CampaignDetailView uses it to include
    Study lists, without dealing with complications around mixing
    SingleObjectMixin and MultipleObjectMixin.
    """

    # Django attributes
    model = edd_models.Study
    page_pattern_name = "campaign:detail-paged"
    paginate_by = 25

    # custom attributes
    campaign = None

    def get_queryset(self):
        qs = edd_models.Study.objects.none()
        if self.campaign:
            qs = self.campaign.studies.order_by("pk")
        if self.request.user.is_superuser:
            return qs
        access = edd_models.Study.access_filter(self.request.user)
        return qs.filter(access).distinct()

    def get_context_data(self, **kwargs):
        self.object_list = self.get_queryset()
        return super().get_context_data(**kwargs)

    def get_page_pattern_kwargs(self):
        return {"slug": self.campaign.slug}


class CampaignPermissionView(generic.DetailView):

    model = models.Campaign

    def get_queryset(self):
        qs = super().get_queryset().order_by("pk")
        if self.request.user.is_superuser:
            return qs
        access = models.Campaign.filter_for(self.request.user)
        return qs.filter(access).distinct()

    def get(self, request, *args, **kwargs):
        self.object = self.get_object()
        permissions = [p.to_json() for p in self.object.get_all_permissions()]
        return JsonResponse(permissions, safe=False)

    def head(self, request, *args, **kwargs):
        self.object = self.get_object()
        return HttpResponse(status=codes.ok)

    def post(self, request, *args, **kwargs):
        self.object = self.get_object()
        self._check_write(request)
        try:
            payload = json.loads(request.POST.get("data", "[]"))
            # make requested changes as a group, or not at all
            with transaction.atomic():
                success = all(
                    self._set_permission(definition) for definition in payload
                )
                if not success:
                    raise PermissionDenied()
        except PermissionDenied:
            raise
        except Exception as e:
            logger.exception(
                f"Error modifying campaign ({self.object}) permissions: {e}"
            )
            return HttpResponse(status=codes.server_error)
        return HttpResponse(status=codes.no_content)

    # treat PUT same as POST
    put = post

    # not bothering with DELETE for now

    def _check_write(self, request):
        if not self.object.user_can_write(request.user):
            raise PermissionDenied(
                _("You do not have permission to modify this Campaign.")
            )

    def _set_permission(self, definition):
        ptype = definition.get("type", None)
        kwargs = dict(campaign=self.object)
        defaults = dict(permission_type=ptype)
        manager = None
        if "group" in definition:
            kwargs.update(group_id=definition["group"].get("id", 0))
            manager = self.object.grouppermission_set
        elif "user" in definition:
            kwargs.update(user_id=definition["user"].get("id", 0))
            manager = self.object.userpermission_set
        elif "public" in definition and self.request.user.is_superuser:
            manager = self.object.everyonepermission_set

        if manager is None or ptype is None:
            return False
        elif ptype == models.CampaignPermission.NONE:
            manager.filter(**kwargs).delete()
            return True
        else:
            kwargs.update(defaults=defaults)
            manager.update_or_create(**kwargs)
            return True


__all__ = ["CampaignIndexView", "CampaignDetailView"]
